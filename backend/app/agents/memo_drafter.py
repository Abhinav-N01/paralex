"""
ParaLex — Source of Funds Memo Drafter

Generates a professional EB-5 Source of Funds memorandum grounded
entirely in the client's uploaded documents.

USCIS I-526E filing format:
  - Memorandum header
  - Biographical background (passport / I-94 / visa status)
  - Source of funds (employment, savings, investments, retirement)
  - Path of funds (how money reached the escrow)
  - Fund tracing table
  - EXHIBIT LIST (Exhibit A, Exhibit B, ...)
"""
import logging
from typing import Optional
from datetime import datetime

import anthropic

from app.config import settings
from app.rag.retrieval import retrieve, RetrievedChunk

logger = logging.getLogger(__name__)


MEMO_SYSTEM_PROMPT = """You are an experienced EB-5 immigration attorney drafting a Source of Funds (SOF) memorandum in support of a USCIS I-526E petition.

## ABSOLUTE RULE — NO HALLUCINATION
Draft ONLY from the document excerpts provided in the [CONTEXT] block.
- Every factual claim MUST be cited inline: [Exhibit X: Document Name, p.N]
- If required information is not in the provided excerpts, write: [MISSING: describe what document is needed]
- Never invent, estimate, assume, or extrapolate facts not found in the documents.

## WRITING STANDARDS
- Formal legal memorandum style
- Third person ("The Petitioner", "Mr. Kumar", "Ms. Sharma" — not "the client" or "you")
- Past tense for historical events, present tense for current status
- Full dates: "March 14, 2023" (not "3/14/23")
- Exact dollar amounts (never rounded unless the source document rounds them)
- For Indian investors: include INR amounts followed by USD equivalent if stated in the documents
- H-1B / immigration status must be precise — reference the I-797 approval notice dates exactly

## MANDATORY MEMO STRUCTURE
Follow this structure exactly — do not skip any section:

```
MEMORANDUM

TO:    [Attorney Name or "Immigration File"]
FROM:  ParaLex AI Paralegal System
DATE:  [Today's Date]
RE:    Source of Funds — [Client Full Name], EB-5 Petition (I-526E)

─────────────────────────────────────────────────────────────

I. INTRODUCTION
[1-2 paragraphs: purpose of memo, investment amount, project, TEA/non-TEA designation]

─────────────────────────────────────────────────────────────

II. BIOGRAPHICAL BACKGROUND
[Name, date of birth, nationality, passport details, current immigration status (H-1B/F-1/etc),
I-94 arrival record, visa stamp details, I-797 approval period]

─────────────────────────────────────────────────────────────

III. SOURCE OF FUNDS ANALYSIS

   A. Employment Income
   [Employer, position, salary, years of employment — from W-2s, pay stubs, tax returns]

   B. Savings Accumulation
   [US and foreign bank accounts, account history, major deposits/withdrawals explained]

   C. Investment Accounts
   [Brokerage, stock accounts, 401(k)/retirement — balance, any liquidations]

   D. Other Sources (if documented)
   [Gifts, property sales, inheritance, business proceeds — only if in documents]

─────────────────────────────────────────────────────────────

IV. PATH OF FUNDS
[Chronological narrative of how funds moved from source → US bank → wire to escrow]
[Include account numbers (last 4 digits only), dates, amounts, and wire confirmation numbers]

─────────────────────────────────────────────────────────────

V. FUND TRACING TABLE

| Source | Amount | Account | Date | Exhibit |
|--------|--------|---------|------|---------|
[One row per fund movement]

─────────────────────────────────────────────────────────────

VI. CONCLUSION
[Summary paragraph confirming lawful source and complete path of funds]

─────────────────────────────────────────────────────────────

VII. EXHIBIT LIST

Exhibit A: [Document name] — [brief description]
Exhibit B: [Document name] — [brief description]
[Continue for all referenced documents]
```

## CITATION FORMAT
Inline: [Exhibit A: Passport, p.1]
In exhibit list: Exhibit A: Rajesh_Passport.pdf — Indian Passport, valid [dates]"""


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
        # Biographical
        ("passport name date of birth nationality country citizenship", "passport"),
        ("i94 entry date arrival admission class", None),
        ("h1b visa stamp i797 approval notice employment authorization period", "visa_stamps"),
        ("i797 petition approval employment period validity", None),
        # Income / employment
        ("employment salary wages income employer position title", "w2"),
        ("pay stub paycheck gross pay net pay year to date", "pay_stub"),
        ("tax return income adjusted gross income AGI total income", "tax_return"),
        ("tax receipt india TDS form 16 income tax", "tax_receipt"),
        # Assets
        ("bank account balance statement deposits withdrawals", "bank_statement"),
        ("wire transfer international remittance sent received", "wire_transfer"),
        ("investment brokerage stock sale proceeds dividend", "investment_statement"),
        ("stock shares equity portfolio account value", "stock_statement"),
        ("401k retirement rollover distribution IRA", "retirement_401k"),
        ("property real estate sale closing statement proceeds", "property_document"),
        ("gift letter donor relationship source of gift", "gift_letter"),
        ("business ownership sale proceeds revenue income", "business_financials"),
    ]

    all_chunks: list[RetrievedChunk] = []
    seen_chunk_ids: set = set()

    for query_text, category in queries:
        result = retrieve(
            case_id=case_id,
            query=query_text,
            top_k=6,
            filter_category=category,
        )
        for chunk in result.chunks:
            if chunk.chunk_id not in seen_chunk_ids:
                seen_chunk_ids.add(chunk.chunk_id)
                all_chunks.append(chunk)

    # Sort by category priority (biographical first, then financial)
    CATEGORY_ORDER = {
        "passport": 0, "birth_certificate": 1, "national_id": 2,
        "visa_stamps": 3, "w2": 4, "pay_stub": 5, "tax_return": 6,
        "tax_receipt": 7, "bank_statement": 8, "investment_statement": 9,
        "stock_statement": 10, "retirement_401k": 11, "property_document": 12,
        "wire_transfer": 13, "gift_letter": 14, "loan_document": 15,
        "business_ownership": 16, "business_financials": 17, "other": 99,
    }
    all_chunks.sort(key=lambda c: (CATEGORY_ORDER.get(c.category, 50), c.filename, c.page_number))

    # ── Build context ────────────────────────────────────────────────────────
    context_parts = []
    for chunk in all_chunks:
        context_parts.append(
            f"[SOURCE] File: \"{chunk.filename}\" | Category: {chunk.category} | Page: {chunk.page_number}\n"
            f"{chunk.text}"
        )
    context = "\n\n---\n\n".join(context_parts)

    # ── Build exhibit list (assign letters in order) ─────────────────────────
    # Deduplicate by document, preserving order
    seen_docs: dict = {}
    for chunk in all_chunks:
        if chunk.doc_id not in seen_docs:
            seen_docs[chunk.doc_id] = {
                "filename": chunk.filename,
                "category": chunk.category,
            }

    exhibit_lines = []
    exhibit_map: dict[str, str] = {}  # doc_id -> exhibit letter
    for i, (doc_id, doc_info) in enumerate(seen_docs.items()):
        letter = chr(65 + i)  # A, B, C, ...
        exhibit_map[doc_id] = letter
        exhibit_lines.append(
            f"Exhibit {letter}: {doc_info['filename']} [{doc_info['category']}]"
        )

    # Also include ALL uploaded documents in inventory (even if not retrieved)
    for i, d in enumerate(documents):
        if d["id"] not in seen_docs:
            letter = chr(65 + len(seen_docs) + i)
            exhibit_lines.append(
                f"Exhibit {letter}: {d['filename']} [{d.get('category', 'other')}] — {d.get('description', 'uploaded but no relevant content retrieved')}"
            )

    exhibit_inventory = "\n".join(exhibit_lines)

    # ── Build the user prompt ─────────────────────────────────────────────────
    investment_amount = case_info.get("investment_amount", 0)
    is_tea = case_info.get("is_tea", True)
    minimum = settings.eb5_tea_minimum if is_tea else settings.eb5_standard_minimum
    country = case_info.get("country_of_origin", "India")

    user_prompt = f"""Please draft a complete Source of Funds Memorandum for this EB-5 I-526E case.

CLIENT INFORMATION:
- Full Name:           {case_info.get("client_name", "[MISSING — required]")}
- Country of Origin:   {country}
- Investment Amount:   ${investment_amount:,.0f}
- Minimum Required:    ${minimum:,.0f} ({'TEA designation' if is_tea else 'Non-TEA'})
- Regional Center:     {case_info.get("regional_center", "[MISSING]")}
- Handling Attorney:   {case_info.get("attorney_name", "[MISSING]")}
- Memo Date:           {datetime.now().strftime("%B %d, %Y")}

SPECIAL NOTES FOR {country.upper()} INVESTORS:
{"- Verify H-1B/L-1 visa status from I-797 approval notice and visa stamps" if country == "India" else ""}
{"- Check I-94 for current status and authorized stay period" if country == "India" else ""}
{"- Indian bank statements may show amounts in INR — include USD equivalent at time of transfer" if country == "India" else ""}
{"- PAN card is the Indian tax ID (like US SSN) — verify it matches tax receipts" if country == "India" else ""}
{"- Form 16 / ITR is the Indian equivalent of a W-2 / tax return" if country == "India" else ""}

EXHIBIT INVENTORY (use these exhibit letters in your citations):
{exhibit_inventory}

[CONTEXT — RETRIEVED DOCUMENT EXCERPTS]
{context}
[END CONTEXT]

Now draft the complete Source of Funds Memorandum in Markdown format following the required structure.
Use [Exhibit X: filename, p.N] for all citations.
Use [MISSING: description] for any required information not in the documents."""

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=8192,
        system=MEMO_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    memo_content = response.content[0].text

    # Build citation list from retrieved chunks
    citations = []
    seen = set()
    for chunk in all_chunks:
        key = (chunk.doc_id, chunk.page_number)
        if key not in seen:
            seen.add(key)
            c = chunk.to_citation()
            # Add exhibit letter
            c["exhibit_letter"] = exhibit_map.get(chunk.doc_id, "?")
            citations.append(c)

    return {
        "memo_content": memo_content,
        "citations": citations,
        "chunks_used": len(all_chunks),
        "documents_referenced": len(seen_docs),
        "exhibit_count": len(seen_docs),
    }
