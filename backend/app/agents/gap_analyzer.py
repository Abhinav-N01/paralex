"""
ParaLex — Gap Analysis Agent

Compares the documents present in a case against the USCIS EB-5
documentation checklist and identifies:
  - What's present and verified
  - What's missing
  - What needs clarification or additional documentation
"""
import logging
from typing import Optional
import json

import anthropic

from app.config import settings
from app.models.case import DocumentCategory

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# EB-5 Document Checklist (USCIS requirements)
# ─────────────────────────────────────────────────────────────

EB5_CHECKLIST = {
    "biographical": {
        "label": "Biographical / Identity Documents",
        "required": [
            {"id": "passport", "label": "Valid Passport (biographic page)", "category": DocumentCategory.PASSPORT},
            {"id": "birth_cert", "label": "Birth Certificate (with translation if non-English)", "category": DocumentCategory.BIRTH_CERTIFICATE},
            {"id": "visa_stamps", "label": "Visa Stamps / Entry Records / I-94", "category": DocumentCategory.VISA_STAMPS},
        ],
        "conditional": [
            {"id": "marriage_cert", "label": "Marriage Certificate (if including spouse)", "condition": "if spouse included"},
            {"id": "dependents_passports", "label": "Dependents' Passports", "condition": "if including dependents"},
        ],
    },
    "source_of_funds": {
        "label": "Source of Funds (SOF) Documents",
        "required": [
            {"id": "tax_returns_5yr", "label": "5 Years of Personal Tax Returns (or foreign equivalent)", "category": DocumentCategory.TAX_RETURN},
            {"id": "bank_stmts_12mo", "label": "12 Months of Bank Statements (all accounts)", "category": DocumentCategory.BANK_STATEMENT},
            {"id": "investment_stmts", "label": "Investment / Brokerage Account Statements", "category": DocumentCategory.INVESTMENT_STATEMENT},
        ],
        "conditional": [
            {"id": "w2_or_paystubs", "label": "W-2s or Pay Stubs (employment income)", "category": DocumentCategory.W2, "condition": "if salaried employment"},
            {"id": "401k_rollover", "label": "401(k) / Retirement Account Rollover Documentation", "category": DocumentCategory.RETIREMENT_401K, "condition": "if using retirement funds"},
            {"id": "stock_sale", "label": "Stock Sale / Brokerage Records", "category": DocumentCategory.STOCK_STATEMENT, "condition": "if liquidating investments"},
            {"id": "property_sale", "label": "Property Sale Documents (deed, closing statement)", "category": DocumentCategory.PROPERTY_DOCUMENT, "condition": "if funds from real estate sale"},
            {"id": "business_sale", "label": "Business Sale / Valuation Documents", "category": DocumentCategory.BUSINESS_FINANCIALS, "condition": "if funds from business sale"},
            {"id": "gift_docs", "label": "Gift Letter + Donor SOF Documentation", "category": DocumentCategory.GIFT_LETTER, "condition": "if receiving a gift"},
            {"id": "loan_docs", "label": "Loan Agreement + Collateral Documentation", "category": DocumentCategory.LOAN_DOCUMENT, "condition": "if borrowing funds"},
        ],
    },
    "path_of_funds": {
        "label": "Path of Funds (POF) — Tracing Investment",
        "required": [
            {"id": "wire_transfers", "label": "Wire Transfer Records to RC Escrow / Project", "category": DocumentCategory.WIRE_TRANSFER},
            {"id": "escrow_confirmation", "label": "Escrow / Subscription Agreement Confirmation"},
        ],
    },
    "business_docs": {
        "label": "Business / Ownership Documents (if self-employed or business owner)",
        "conditional": [
            {"id": "biz_registration", "label": "Business Registration / Articles of Incorporation", "category": DocumentCategory.BUSINESS_OWNERSHIP},
            {"id": "biz_financials", "label": "Business Financial Statements (3 years)", "category": DocumentCategory.BUSINESS_FINANCIALS},
            {"id": "ownership_proof", "label": "Proof of Ownership Percentage"},
        ],
    },
}


GAP_ANALYSIS_SYSTEM_PROMPT = """You are an EB-5 immigration attorney assistant performing a document gap analysis.

You have been given:
1. A list of documents already uploaded for this case (with categories and descriptions)
2. The EB-5 USCIS documentation checklist
3. Case-specific context (investment amount, TEA status, etc.)

Your task:
- Map each uploaded document to the checklist items it covers
- Identify which required items are PRESENT, MISSING, or UNCERTAIN
- Identify which conditional items are PRESENT, MISSING, or NOT APPLICABLE
- Flag any documents that appear incomplete (e.g., only 3 months of bank statements instead of 12)
- Note any documents that need clarification (e.g., non-English documents without translations)

Rules:
- Base your analysis ONLY on the documents provided — do not assume documents exist if not listed
- Be specific: if 12 months of bank statements are needed but only 6 months are present, say so
- If you cannot determine coverage from the metadata alone, mark as UNCERTAIN and explain why

Output a structured JSON response following the exact schema provided."""


async def run_gap_analysis(
    case_id: str,
    case_info: dict,
    documents: list[dict],
) -> dict:
    """
    Run gap analysis for a case.

    Args:
        case_id: The case ID.
        case_info: {client_name, investment_amount, is_tea, country_of_origin, ...}
        documents: List of {id, filename, category, description, document_date, page_count}

    Returns:
        Gap analysis result dict.
    """
    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        # Format document inventory
        doc_inventory = "\n".join(
            f"- [{d['category']}] {d['filename']} "
            f"(date: {d.get('document_date', 'unknown')}, "
            f"pages: {d.get('page_count', '?')}): {d.get('description', '')}"
            for d in documents
        ) or "No documents uploaded yet."

        investment_amount = case_info.get("investment_amount", "unknown")
        is_tea = case_info.get("is_tea", True)
        minimum = settings.eb5_tea_minimum if is_tea else settings.eb5_standard_minimum

        user_prompt = f"""Case: {case_info.get('client_name', 'Unknown Client')}
Investment Amount: ${investment_amount:,.0f} (Minimum required: ${minimum:,.0f})
TEA Project: {"Yes" if is_tea else "No"}
Country of Origin: {case_info.get('country_of_origin', 'unknown')}

UPLOADED DOCUMENTS ({len(documents)} total):
{doc_inventory}

EB-5 CHECKLIST:
{json.dumps(EB5_CHECKLIST, indent=2, default=str)}

Perform a complete gap analysis. Return a JSON object with this exact structure:
{{
  "summary": {{
    "total_required": <int>,
    "present": <int>,
    "missing": <int>,
    "uncertain": <int>,
    "completeness_pct": <float 0-100>
  }},
  "sections": [
    {{
      "section_id": "<string>",
      "section_label": "<string>",
      "items": [
        {{
          "item_id": "<string>",
          "label": "<string>",
          "status": "present" | "missing" | "uncertain" | "not_applicable",
          "covered_by": ["<filename>", ...],
          "notes": "<string — specific issue or confirmation>"
        }}
      ]
    }}
  ],
  "priority_actions": [
    "<string — specific action the attorney should take>",
    ...
  ],
  "strengths": ["<string>", ...],
  "red_flags": ["<string — potential USCIS concern>", ...]
}}"""

        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=4096,
            system=GAP_ANALYSIS_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rsplit("```", 1)[0]

        return json.loads(text)

    except Exception as e:
        logger.error(f"Gap analysis failed for case {case_id}: {e}")
        raise
