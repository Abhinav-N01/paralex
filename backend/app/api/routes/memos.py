"""
ParaLex — Memos API Routes
Draft, manage, and export memos.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.case import Case, Document, Memo
from app.agents.memo_drafter import draft_source_of_funds_memo

router = APIRouter(prefix="/cases/{case_id}/memos", tags=["Memos"])


class MemoResponse(BaseModel):
    id: str
    case_id: str
    memo_type: Optional[str]
    title: Optional[str]
    content: Optional[str]
    citations: Optional[list]
    is_final: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MemoUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_final: Optional[bool] = None


@router.post("/source-of-funds", response_model=MemoResponse, status_code=201)
async def draft_sof_memo(
    case_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-draft a Source of Funds memorandum grounded in the case's documents.
    Every fact in the memo is cited to a specific document and page.
    """
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    doc_result = await db.execute(
        select(Document).where(
            Document.case_id == case_id,
            Document.status == "indexed",
        )
    )
    documents = doc_result.scalars().all()

    if not documents:
        raise HTTPException(
            status_code=422,
            detail="No indexed documents found. Upload and process documents first."
        )

    case_info = {
        "client_name": case.client_name,
        "investment_amount": case.investment_amount or 0,
        "is_tea": case.is_tea,
        "country_of_origin": case.country_of_origin,
        "regional_center": case.regional_center,
        "attorney_name": case.attorney_name,
    }

    doc_list = [
        {
            "id": d.id,
            "filename": d.original_filename,
            "category": d.category,
            "description": d.description,
            "document_date": d.document_date,
            "page_count": d.page_count,
        }
        for d in documents
    ]

    result = await draft_source_of_funds_memo(
        case_id=case_id,
        case_info=case_info,
        documents=doc_list,
    )

    memo = Memo(
        case_id=case_id,
        memo_type="source_of_funds",
        title=f"Source of Funds Memorandum — {case.client_name}",
        content=result["memo_content"],
        citations=result["citations"],
    )
    db.add(memo)
    await db.flush()
    await db.refresh(memo)

    return MemoResponse(**{c.name: getattr(memo, c.name) for c in Memo.__table__.columns})


@router.get("", response_model=list[MemoResponse])
async def list_memos(
    case_id: str,
    memo_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Memo).where(Memo.case_id == case_id).order_by(Memo.created_at.desc())
    if memo_type:
        stmt = stmt.where(Memo.memo_type == memo_type)
    result = await db.execute(stmt)
    memos = result.scalars().all()
    return [MemoResponse(**{c.name: getattr(m, c.name) for c in Memo.__table__.columns}) for m in memos]


@router.get("/{memo_id}", response_model=MemoResponse)
async def get_memo(case_id: str, memo_id: str, db: AsyncSession = Depends(get_db)):
    memo = await _get_memo_or_404(memo_id, case_id, db)
    return MemoResponse(**{c.name: getattr(memo, c.name) for c in Memo.__table__.columns})


@router.patch("/{memo_id}", response_model=MemoResponse)
async def update_memo(
    case_id: str,
    memo_id: str,
    payload: MemoUpdate,
    db: AsyncSession = Depends(get_db),
):
    memo = await _get_memo_or_404(memo_id, case_id, db)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(memo, key, value)
    memo.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(memo)
    return MemoResponse(**{c.name: getattr(memo, c.name) for c in Memo.__table__.columns})


@router.get("/{memo_id}/export/markdown")
async def export_memo_markdown(
    case_id: str,
    memo_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Export memo as a markdown file download."""
    memo = await _get_memo_or_404(memo_id, case_id, db)
    filename = f"{memo.title or 'memo'}.md".replace("/", "-").replace(" ", "_")
    return Response(
        content=memo.content or "",
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{memo_id}", status_code=204)
async def delete_memo(case_id: str, memo_id: str, db: AsyncSession = Depends(get_db)):
    memo = await _get_memo_or_404(memo_id, case_id, db)
    await db.delete(memo)


async def _get_memo_or_404(memo_id: str, case_id: str, db: AsyncSession) -> Memo:
    result = await db.execute(
        select(Memo).where(Memo.id == memo_id, Memo.case_id == case_id)
    )
    memo = result.scalar_one_or_none()
    if not memo:
        raise HTTPException(status_code=404, detail=f"Memo {memo_id} not found")
    return memo
