"""
ParaLex — Documents API Routes
Upload, manage, and query case documents.
"""
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.db.database import get_db
from app.models.case import Case, Document, DocumentStatus, DocumentCategory
from app.rag.ingestion import ingest_document, delete_document_from_index
from app.agents.classifier import classify_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cases/{case_id}/documents", tags=["Documents"])


# ─────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: str
    case_id: str
    filename: str
    original_filename: str
    file_size: Optional[int]
    mime_type: Optional[str]
    category: str
    category_confidence: Optional[float]
    document_date: Optional[str]
    description: Optional[str]
    status: str
    page_count: Optional[int]
    ocr_applied: bool
    chunk_count: int
    extraction_notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentUpdate(BaseModel):
    category: Optional[str] = None
    document_date: Optional[str] = None
    description: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Upload endpoint
# ─────────────────────────────────────────────────────────────

ALLOWED_MIME_TYPES = set(
    "application/pdf image/jpeg image/png image/tiff image/bmp image/webp "
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document "
    "application/msword "
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet "
    "application/vnd.ms-excel text/csv".split()
)

MAX_FILE_SIZE_MB = 50


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    case_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    description: Optional[str] = None,
    category_override: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a document to a case.
    - Saves the file locally.
    - Classifies it automatically (or uses category_override).
    - Kicks off background ingestion (parse → chunk → embed → store).
    """
    # Validate case exists
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    # Validate file type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {content_type}. Allowed: PDF, images, Word, Excel, CSV."
        )

    # Read file content (validate size)
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {size_mb:.1f}MB (max {MAX_FILE_SIZE_MB}MB)"
        )

    # Save file to disk
    case_dir = settings.uploads_dir / case_id
    case_dir.mkdir(parents=True, exist_ok=True)

    # Sanitize filename
    safe_name = _sanitize_filename(file.filename or "upload")
    saved_path = case_dir / safe_name

    # Handle name conflicts
    counter = 1
    while saved_path.exists():
        stem = Path(safe_name).stem
        suffix = Path(safe_name).suffix
        saved_path = case_dir / f"{stem}_{counter}{suffix}"
        counter += 1

    saved_path.write_bytes(content)

    # Create DB record
    doc = Document(
        case_id=case_id,
        filename=saved_path.name,
        original_filename=file.filename or "upload",
        file_path=str(saved_path),
        file_size=len(content),
        mime_type=content_type,
        description=description,
        status=DocumentStatus.PENDING,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    # Background: classify + ingest
    background_tasks.add_task(
        _process_document,
        doc_id=doc.id,
        case_id=case_id,
        file_path=saved_path,
        mime_type=content_type,
        filename=saved_path.name,
        category_override=category_override,
    )

    return DocumentResponse(**{c.name: getattr(doc, c.name) for c in Document.__table__.columns})


# ─────────────────────────────────────────────────────────────
# List / get / update / delete
# ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    case_id: str,
    category: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document).where(Document.case_id == case_id).order_by(Document.created_at.desc())
    if category:
        stmt = stmt.where(Document.category == category)
    if status:
        stmt = stmt.where(Document.status == status)

    result = await db.execute(stmt)
    docs = result.scalars().all()
    return [DocumentResponse(**{c.name: getattr(d, c.name) for c in Document.__table__.columns}) for d in docs]


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(case_id: str, doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await _get_doc_or_404(doc_id, case_id, db)
    return DocumentResponse(**{c.name: getattr(doc, c.name) for c in Document.__table__.columns})


@router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    case_id: str,
    doc_id: str,
    payload: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_doc_or_404(doc_id, case_id, db)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(doc, key, value)
    await db.flush()
    await db.refresh(doc)
    return DocumentResponse(**{c.name: getattr(doc, c.name) for c in Document.__table__.columns})


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    case_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_doc_or_404(doc_id, case_id, db)

    # Remove from vector store
    delete_document_from_index(case_id, doc_id)

    # Remove file from disk
    try:
        Path(doc.file_path).unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"Could not delete file {doc.file_path}: {e}")

    await db.delete(doc)


@router.post("/{doc_id}/reindex", response_model=DocumentResponse)
async def reindex_document(
    case_id: str,
    doc_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Force re-parse and re-index a document."""
    doc = await _get_doc_or_404(doc_id, case_id, db)
    doc.status = DocumentStatus.PENDING
    doc.chunk_count = 0
    await db.flush()
    await db.refresh(doc)

    background_tasks.add_task(
        _process_document,
        doc_id=doc.id,
        case_id=case_id,
        file_path=Path(doc.file_path),
        mime_type=doc.mime_type or "application/pdf",
        filename=doc.filename,
        category_override=doc.category,
    )
    return DocumentResponse(**{c.name: getattr(doc, c.name) for c in Document.__table__.columns})


# ─────────────────────────────────────────────────────────────
# Background processing
# ─────────────────────────────────────────────────────────────

async def _process_document(
    doc_id: str,
    case_id: str,
    file_path: Path,
    mime_type: str,
    filename: str,
    category_override: Optional[str] = None,
):
    """
    Background task: classify → ingest.
    Updates document status in DB throughout.
    """
    from app.db.database import AsyncSessionLocal
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        try:
            # Update status to processing
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if not doc:
                return

            doc.status = DocumentStatus.PROCESSING
            await db.commit()

            # 1. Parse and classify
            from app.rag.parsers.pdf_parser import parse_pdf, ParsedDocument

            parsed = None
            ext = file_path.suffix.lower()
            try:
                from app.rag.ingestion import parse_document
                parsed = parse_document(file_path, mime_type)
            except Exception as e:
                logger.error(f"Parse failed for doc {doc_id}: {e}")
                doc.status = DocumentStatus.FAILED
                doc.extraction_notes = str(e)
                await db.commit()
                return

            # Classify
            if category_override:
                category = category_override
                classification = {"confidence": 1.0, "document_date": None, "description": None}
            else:
                sample_text = parsed.full_text[:2000] if parsed else ""
                classification = await classify_document(filename, sample_text)
                category = classification.get("category", "other")

            # 2. Ingest into vector store
            ingest_stats = await ingest_document(
                case_id=case_id,
                doc_id=doc_id,
                file_path=file_path,
                mime_type=mime_type,
                filename=filename,
                category=category,
            )

            # 3. Update DB record
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = DocumentStatus.INDEXED
                doc.category = category
                doc.category_confidence = classification.get("confidence")
                doc.document_date = classification.get("document_date")
                if not doc.description:
                    doc.description = classification.get("description")
                doc.page_count = ingest_stats["page_count"]
                doc.chunk_count = ingest_stats["chunk_count"]
                doc.ocr_applied = ingest_stats["ocr_applied"]
                warnings = ingest_stats.get("warnings", [])
                if warnings:
                    doc.extraction_notes = "; ".join(warnings[:5])
                await db.commit()

        except Exception as e:
            logger.error(f"Document processing failed for {doc_id}: {e}", exc_info=True)
            try:
                result = await db.execute(select(Document).where(Document.id == doc_id))
                doc = result.scalar_one_or_none()
                if doc:
                    doc.status = DocumentStatus.FAILED
                    doc.extraction_notes = str(e)
                    await db.commit()
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

async def _get_doc_or_404(doc_id: str, case_id: str, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.case_id == case_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found in case {case_id}")
    return doc


def _sanitize_filename(name: str) -> str:
    """Remove unsafe characters from filenames."""
    import re
    # Keep alphanumeric, dots, hyphens, underscores, spaces
    safe = re.sub(r"[^\w\s\-.]", "_", name)
    # Replace multiple spaces/underscores
    safe = re.sub(r"[\s_]+", "_", safe)
    return safe[:200]  # cap length
