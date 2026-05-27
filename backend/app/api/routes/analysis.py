"""
ParaLex — Analysis API Routes
Gap analysis and document review endpoints.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.case import Case, Document, Memo
from app.agents.gap_analyzer import run_gap_analysis

router = APIRouter(prefix="/cases/{case_id}/analysis", tags=["Analysis"])


@router.post("/gap-analysis")
async def perform_gap_analysis(
    case_id: str,
    save_as_memo: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """
    Run EB-5 document gap analysis for a case.
    Compares uploaded documents against USCIS checklist.
    """
    # Validate case
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    # Get all indexed documents
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
            detail="No indexed documents found. Please upload and wait for processing to complete."
        )

    # Prepare case info
    case_info = {
        "client_name": case.client_name,
        "investment_amount": case.investment_amount or 0,
        "is_tea": case.is_tea,
        "country_of_origin": case.country_of_origin,
        "regional_center": case.regional_center,
        "attorney_name": case.attorney_name,
    }

    # Prepare document list
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

    # Run analysis
    analysis_result = await run_gap_analysis(
        case_id=case_id,
        case_info=case_info,
        documents=doc_list,
    )

    # Optionally save as memo
    if save_as_memo:
        import json
        memo_content = _format_gap_analysis_as_markdown(analysis_result, case_info)
        memo = Memo(
            case_id=case_id,
            memo_type="gap_analysis",
            title=f"Document Gap Analysis — {case.client_name}",
            content=memo_content,
            citations=[],
        )
        db.add(memo)
        await db.commit()

    return {
        "case_id": case_id,
        "analysis": analysis_result,
        "documents_analyzed": len(documents),
        "generated_at": datetime.utcnow().isoformat(),
    }


def _format_gap_analysis_as_markdown(analysis: dict, case_info: dict) -> str:
    """Convert gap analysis JSON to readable markdown memo."""
    summary = analysis.get("summary", {})
    lines = [
        f"# EB-5 Document Gap Analysis",
        f"**Client:** {case_info.get('client_name', 'Unknown')}",
        f"**Generated:** {datetime.now().strftime('%B %d, %Y')}",
        "",
        "## Summary",
        f"- **Completeness:** {summary.get('completeness_pct', 0):.0f}%",
        f"- **Required items present:** {summary.get('present', 0)} / {summary.get('total_required', 0)}",
        f"- **Missing:** {summary.get('missing', 0)}",
        f"- **Uncertain:** {summary.get('uncertain', 0)}",
        "",
    ]

    # Sections
    for section in analysis.get("sections", []):
        lines.append(f"## {section['section_label']}")
        for item in section.get("items", []):
            status = item["status"]
            icon = {"present": "✅", "missing": "❌", "uncertain": "⚠️", "not_applicable": "—"}.get(status, "?")
            lines.append(f"\n{icon} **{item['label']}**")
            if item.get("covered_by"):
                lines.append(f"   - Covered by: {', '.join(item['covered_by'])}")
            if item.get("notes"):
                lines.append(f"   - Note: {item['notes']}")
        lines.append("")

    # Priority actions
    if analysis.get("priority_actions"):
        lines.append("## Priority Actions Required")
        for action in analysis["priority_actions"]:
            lines.append(f"1. {action}")
        lines.append("")

    # Red flags
    if analysis.get("red_flags"):
        lines.append("## ⚠️ Potential USCIS Concerns")
        for flag in analysis["red_flags"]:
            lines.append(f"- {flag}")
        lines.append("")

    # Strengths
    if analysis.get("strengths"):
        lines.append("## ✅ Strengths")
        for strength in analysis["strengths"]:
            lines.append(f"- {strength}")

    return "\n".join(lines)
