"""
ParaLex — Cases API Routes
CRUD operations for case management.
"""
from datetime import datetime
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.database import get_db
from app.models.case import Case, CaseStatus, Document

router = APIRouter(prefix="/cases", tags=["Cases"])


# ─────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────

class CaseCreate(BaseModel):
    client_name: str
    client_email: Optional[str] = None
    attorney_name: Optional[str] = None
    case_reference: Optional[str] = None
    investment_amount: Optional[float] = None
    is_tea: bool = True
    regional_center: Optional[str] = None
    country_of_origin: Optional[str] = None
    notes: Optional[str] = None


class CaseUpdate(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    attorney_name: Optional[str] = None
    investment_amount: Optional[float] = None
    is_tea: Optional[bool] = None
    regional_center: Optional[str] = None
    country_of_origin: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class CaseResponse(BaseModel):
    id: str
    client_name: str
    client_email: Optional[str]
    attorney_name: Optional[str]
    case_reference: Optional[str]
    investment_amount: Optional[float]
    is_tea: bool
    regional_center: Optional[str]
    country_of_origin: Optional[str]
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    document_count: int = 0

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(payload: CaseCreate, db: AsyncSession = Depends(get_db)):
    # Auto-generate case reference if not provided
    ref = payload.case_reference or f"EB5-{datetime.now().year}-{str(uuid.uuid4())[:6].upper()}"

    case = Case(
        client_name=payload.client_name,
        client_email=payload.client_email,
        attorney_name=payload.attorney_name,
        case_reference=ref,
        investment_amount=payload.investment_amount,
        is_tea=payload.is_tea,
        regional_center=payload.regional_center,
        country_of_origin=payload.country_of_origin,
        notes=payload.notes,
    )
    db.add(case)
    await db.flush()
    await db.refresh(case)

    result = CaseResponse(
        **{c.name: getattr(case, c.name) for c in Case.__table__.columns},
        document_count=0,
    )
    return result


@router.get("", response_model=list[CaseResponse])
async def list_cases(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Case).order_by(Case.updated_at.desc())
    if status:
        stmt = stmt.where(Case.status == status)

    result = await db.execute(stmt)
    cases = result.scalars().all()

    # Get document counts
    responses = []
    for case in cases:
        count_stmt = select(func.count(Document.id)).where(Document.case_id == case.id)
        count_result = await db.execute(count_stmt)
        doc_count = count_result.scalar() or 0

        responses.append(CaseResponse(
            **{c.name: getattr(case, c.name) for c in Case.__table__.columns},
            document_count=doc_count,
        ))

    return responses


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: str, db: AsyncSession = Depends(get_db)):
    case = await _get_case_or_404(case_id, db)

    count_stmt = select(func.count(Document.id)).where(Document.case_id == case_id)
    count_result = await db.execute(count_stmt)
    doc_count = count_result.scalar() or 0

    return CaseResponse(
        **{c.name: getattr(case, c.name) for c in Case.__table__.columns},
        document_count=doc_count,
    )


@router.patch("/{case_id}", response_model=CaseResponse)
async def update_case(
    case_id: str,
    payload: CaseUpdate,
    db: AsyncSession = Depends(get_db),
):
    case = await _get_case_or_404(case_id, db)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(case, key, value)
    case.updated_at = datetime.utcnow()

    await db.flush()
    await db.refresh(case)

    count_stmt = select(func.count(Document.id)).where(Document.case_id == case_id)
    count_result = await db.execute(count_stmt)
    doc_count = count_result.scalar() or 0

    return CaseResponse(
        **{c.name: getattr(case, c.name) for c in Case.__table__.columns},
        document_count=doc_count,
    )


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(case_id: str, db: AsyncSession = Depends(get_db)):
    case = await _get_case_or_404(case_id, db)
    await db.delete(case)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

async def _get_case_or_404(case_id: str, db: AsyncSession) -> Case:
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    return case
