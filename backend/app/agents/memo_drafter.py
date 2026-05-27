"""
ParaLex — Source of Funds Memo Drafter

Generates a professional EB-5 Source of Funds memorandum grounded
entirely in the client's uploaded documents.

The memo follows USCIS filing conventions and includes:
  - Executive summary
  - Client biographical overview
  - Source of funds narrative (per source category)
  - Path of funds (how money reached the escrow)
  - Fund tracing table
  - Document exhibit list
"""
import logging
import json
from typing import Optional
from datetime import datetime

import anthropic

from app.config import settings
from app.rag.retrieval import retrieve, RetrievedChunk

logger = logging.getLogger(__name__)


MEMO_SYSTEM_PROMPT = """You are an experienced EB-5 immigration attorney drafting a Source of Funds (SOF) memorandum for a USCIS I-526E petition.

## CORE RULE
Draft the memo ONLY from the document excerpts provided. Do NOT invent, estimate, or extrapolate any facts.
- Every factual claim must be supported by a specific document (cite inline: "[Document Name, p.X]")
- If a fact would typically appear in the memo but is not in the provided documents, write: "[MISSING: <describe what is needed>]"
- Do not use placeholder text or make assumptions about undocumented facts.

## MEMO STANDARDS
- Professional, formal legal writing
- Third person ("The Petitioner..." not "You...")
- Present tense for current status, past tense for historical facts
- Precise dollar amounts (never rounded unless the source rounds them)
- Dates in full format (e.g., "March 14, 2023")
- All foreign currency amounts should include the USD equivalent at the time of conversion if stated in the documents

## STRUCTURE
The memo must follow this exact structure:
1. MEMORANDUM HEADER (To/From/Date/Re)
2. INTRODUCTION (1-2 paragraphs)
3. BIOGRAPHICAL BACKGROUND (from passport/ID documents)
4. SOURCE OF FUNDS ANALYSIS (major subsections per income/asset type)
5. PATH OF FUNDS (how money flowed to the investment)
6. CONCLUSION
7. EXHIBIT LIST

## CITATIONS
Use bracketed inline citations: [Document Name, p.X]
At the end of each section, list the exhibits cited in that section."""


async def draft_source_of_funds_memo(
    case_id: str,
    case_info: dict,
    documents: list[dict],
) -> dict:
    """
    Draft a Source of Funds memo for a case.

    Returns:
        {memo_content: str (markdown), citations: list, exhibit_list: list}
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # ── Retrieve relevant chunks for each SOF category ──────────────────────
    queries = [
        ("source of income employment salary wages", None),
        ("bank account balance deposits transfers wire", "bank_statement"),
        ("investment brokerage stock sale proceeds", "investment_statement"),
        ("tax return income adjusted gross income", "tax_return"),
        ("wire transfer escrow investment amount sent", "wire_transfer"),
        ("401k retirement rollover distribution", "retirement_401k"),
        ("property real estate sale proceeds closing", "property_document"),
        ("gift letter donor source of gift funds", "gift_letter"),
        ("business ownership sale proceeds income", "business_financials"),
        ("passport name date of birth nationality citizenship", "passport"),
    ]

    all_chunks: list[RetrievedChunk] = []
    seen_chunk_ids = set()

    for query_text, category in queries:
        result = retrieve(
            case_id=case_id,
            query=query_text,
            top_k=8,
            filter_category=category,
        )
        for chunk in result.chunks:
            if chunk.chunk_id not in seen_chunk_ids:
                seen_chunk_ids.add(chunk.chunk_id)
                all_chunks.append(chunk)

    # Sort by category then page for structured context
    all_chunks.sort(key=lambda c: (c.category, c.filename, c.page_number))

    # ── Build context ────────────────────────────────────────────────────────
    context_parts = []
    for chunk in all_chunks:
        context_parts.append(
            f"[SOURCE] File: \"{chunk.filename}\" | Category: {chunk.category} | Page: {chunk.page_number}\n"
            f"{chunk.text}"
        )
    context = "\n\n---\n\n".join(context_parts)

    # ── Document inventory for exhibit list ──────────────────────────────────
    doc_inventory = "\n".join(
        f"Exhibit {chr(65+i)}: {d['filename']} [{d['category']}] - {d.get('description', '')}"
        for i, d in enumerate(documents)
    )

    investment_amount = case_info.get("investment_amount", 0)
    is_tea = case_info.get("is_tea", True)
    minimum = settings.eb5_tea_minimum if is_tea else settings.eb5_standard_minimum

    user_prompt = f"""Please draft a complete Source of Funds Memorandum for this EB-5 case.

CLIENT INFORMATION:
- Name: {case_info.get('client_name', '[MISSING]')}
- Country of Origin: {case_info.get('country_of_origin', '[MISSING]')}
- Investment Amount: ${investment_amount:,.0f}
- Minimum Required: ${minimum:,.0f} ({'TEA' if is_tea else 'Non-TEA'})
- Regional Center: {case_info.get('regional_center', '[MISSING]')}
- Attorney: {case_info.get('attorney_name', '[MISSING]')}
- Today's Date: {datetime.now().strftime('%B %d, %Y')}

DOCUMENT INVENTORY (for exhibit references):
{doc_inventory}

RETRIEVED DOCUMENT CONTENT:
{context}

Now draft the complete Source of Funds Memorandum in Markdown format.
Remember: cite every fact inline with [Document Name, p.X].
Use [MISSING: description] for any required information not found in the documents."""

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=8192,
        system=MEMO_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    memo_content = response.content[0].text

    # Build citation list
    citations = []
    seen = set()
    for chunk in all_chunks:
        key = (chunk.doc_id, chunk.page_number)
        if key not in seen:
            seen.add(key)
            citations.append(chunk.to_citation())

    return {
        "memo_content": memo_content,
        "citations": citations,
        "chunks_used": len(all_chunks),
        "documents_referenced": len({c.doc_id for c in all_chunks}),
    }
