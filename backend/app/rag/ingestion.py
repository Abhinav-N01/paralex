"""
ParaLex — Document Ingestion Pipeline

Flow:
  Upload → Parse → Classify → Chunk → Embed → Store in ChromaDB

Every chunk carries metadata: case_id, doc_id, filename, category, page_number.
This metadata is used at retrieval time for citations and filtering.
"""
import logging
import hashlib
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.rag.parsers.pdf_parser import parse_pdf, ParsedDocument
from app.rag.parsers.image_parser import parse_image
from app.rag.parsers.excel_parser import parse_excel, parse_csv
from app.rag.parsers.docx_parser import parse_docx
from app.models.case import DocumentCategory

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# ChromaDB client (persistent, local)
# ─────────────────────────────────────────────────────────────

def _get_chroma_client() -> chromadb.Client:
    return chromadb.PersistentClient(
        path=str(settings.chroma_dir),
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def get_or_create_collection(case_id: str) -> chromadb.Collection:
    """Each case gets its own ChromaDB collection for isolation."""
    client = _get_chroma_client()
    collection_name = f"case_{case_id.replace('-', '_')}"
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


# ─────────────────────────────────────────────────────────────
# Embedding (local, no API calls)
# ─────────────────────────────────────────────────────────────

_embedder = None


def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        _embedder = SentenceTransformer(settings.embedding_model)
    return _embedder


def embed_texts(texts: list[str]) -> list[list[float]]:
    embedder = get_embedder()
    return embedder.encode(texts, show_progress_bar=False).tolist()


# ─────────────────────────────────────────────────────────────
# Document dispatch
# ─────────────────────────────────────────────────────────────

MIME_TO_PARSER = {
    "application/pdf": parse_pdf,
    "image/jpeg": parse_image,
    "image/png": parse_image,
    "image/tiff": parse_image,
    "image/bmp": parse_image,
    "image/webp": parse_image,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": parse_docx,
    "application/msword": parse_docx,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": parse_excel,
    "application/vnd.ms-excel": parse_excel,
    "text/csv": parse_csv,
}


def parse_document(file_path: Path, mime_type: str) -> ParsedDocument:
    parser = MIME_TO_PARSER.get(mime_type)
    if parser is None:
        # Try by extension
        ext = file_path.suffix.lower()
        ext_map = {
            ".pdf": parse_pdf, ".jpg": parse_image, ".jpeg": parse_image,
            ".png": parse_image, ".tiff": parse_image, ".tif": parse_image,
            ".docx": parse_docx, ".doc": parse_docx,
            ".xlsx": parse_excel, ".xls": parse_excel, ".csv": parse_csv,
        }
        parser = ext_map.get(ext)

    if parser is None:
        raise ValueError(f"Unsupported file type: {mime_type} / {file_path.suffix}")

    return parser(file_path)


# ─────────────────────────────────────────────────────────────
# Chunking
# ─────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_size: int = settings.chunk_size,
    overlap: int = settings.chunk_overlap,
) -> list[str]:
    """
    Simple sliding-window chunker that respects paragraph boundaries.
    Splits on double newlines first, then falls back to character-level split.
    """
    if not text.strip():
        return []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    current_chunk = []
    current_len = 0

    for para in paragraphs:
        para_len = len(para)

        if current_len + para_len <= chunk_size:
            current_chunk.append(para)
            current_len += para_len + 2  # +2 for the \n\n
        else:
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
            # Start new chunk with overlap from previous
            if chunks and overlap > 0:
                overlap_text = chunks[-1][-overlap:]
                current_chunk = [overlap_text, para]
                current_len = len(overlap_text) + para_len
            else:
                current_chunk = [para]
                current_len = para_len

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    return chunks


# ─────────────────────────────────────────────────────────────
# Main ingestion entry point
# ─────────────────────────────────────────────────────────────

async def ingest_document(
    case_id: str,
    doc_id: str,
    file_path: Path,
    mime_type: str,
    filename: str,
    category: str,
) -> dict:
    """
    Parse, chunk, embed, and store a document in ChromaDB.
    Returns a dict with ingestion stats.
    """
    logger.info(f"Ingesting document {doc_id} ({filename}) for case {case_id}")

    # 1. Parse
    parsed = parse_document(file_path, mime_type)

    # 2. Chunk each page
    all_chunks = []
    all_metadatas = []
    all_ids = []

    for page in parsed.pages:
        page_chunks = chunk_text(page.text)

        for chunk_idx, chunk_text_content in enumerate(page_chunks):
            chunk_id = _chunk_id(doc_id, page.page_number, chunk_idx)
            all_chunks.append(chunk_text_content)
            all_metadatas.append({
                "case_id": case_id,
                "doc_id": doc_id,
                "filename": filename,
                "category": category,
                "page_number": page.page_number,
                "is_ocr": str(page.is_ocr),
                "chunk_index": chunk_idx,
            })
            all_ids.append(chunk_id)

    if not all_chunks:
        return {
            "page_count": parsed.total_pages,
            "chunk_count": 0,
            "ocr_applied": parsed.ocr_applied,
            "warnings": parsed.extraction_warnings,
        }

    # 3. Embed (batched)
    logger.info(f"Embedding {len(all_chunks)} chunks for {filename}")
    embeddings = embed_texts(all_chunks)

    # 4. Store in ChromaDB
    collection = get_or_create_collection(case_id)

    # Upsert in batches of 100 (ChromaDB limit)
    batch_size = 100
    for i in range(0, len(all_chunks), batch_size):
        collection.upsert(
            ids=all_ids[i : i + batch_size],
            documents=all_chunks[i : i + batch_size],
            embeddings=embeddings[i : i + batch_size],
            metadatas=all_metadatas[i : i + batch_size],
        )

    logger.info(f"Ingested {len(all_chunks)} chunks for doc {doc_id}")

    return {
        "page_count": parsed.total_pages,
        "chunk_count": len(all_chunks),
        "ocr_applied": parsed.ocr_applied,
        "warnings": parsed.extraction_warnings,
    }


def _chunk_id(doc_id: str, page_number: int, chunk_index: int) -> str:
    return hashlib.md5(f"{doc_id}:{page_number}:{chunk_index}".encode()).hexdigest()


# ─────────────────────────────────────────────────────────────
# Delete document from index
# ─────────────────────────────────────────────────────────────

def delete_document_from_index(case_id: str, doc_id: str):
    try:
        collection = get_or_create_collection(case_id)
        # ChromaDB supports filtering by metadata on delete
        collection.delete(where={"doc_id": doc_id})
        logger.info(f"Deleted doc {doc_id} from index for case {case_id}")
    except Exception as e:
        logger.warning(f"Failed to delete doc {doc_id} from index: {e}")
