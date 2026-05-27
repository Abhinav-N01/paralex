"""
ParaLex — Document Classifier Agent

Automatically classifies uploaded documents into EB-5 categories
using Claude, based on the extracted text + filename.
"""
import logging
from typing import Optional

import anthropic

from app.config import settings
from app.models.case import DocumentCategory

logger = logging.getLogger(__name__)

_client: Optional[anthropic.Anthropic] = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


# Map model output strings to enum values
CATEGORY_MAP = {c.value: c for c in DocumentCategory}


CLASSIFICATION_SYSTEM_PROMPT = """You are a legal document classifier specializing in EB-5 investor visa cases.
You classify documents into specific categories based on filename and content.

Categories and their meanings:
- passport: Passport, travel document, national ID with photo
- birth_certificate: Birth certificate, registro de nacimiento
- visa_stamps: Visa stamps, I-94, entry/exit records
- national_id: National ID, cedula, driver's license
- tax_return: Personal or business tax return, Form 1040, foreign tax return
- w2: W-2 wage statement, Form W-2
- pay_stub: Paycheck stub, salary slip, payroll record
- tax_receipt: Tax payment receipt, proof of tax payment
- bank_statement: Bank account statement, savings account, checking account
- investment_statement: Brokerage/investment account statement
- stock_statement: Stock portfolio statement, equity statement
- retirement_401k: 401(k), IRA, pension, retirement account statement
- property_document: Real estate deed, property sale, mortgage, appraisal
- wire_transfer: Wire transfer receipt, SWIFT transfer, remittance record
- gift_letter: Gift letter, declaration of gift funds
- loan_document: Loan agreement, promissory note, mortgage
- business_ownership: Business registration, articles of incorporation, shareholder agreement
- business_financials: Business financial statements, P&L, balance sheet
- prior_memo: Attorney memo, legal memorandum, cover letter for filing
- legal_correspondence: USCIS notices, attorney correspondence
- other: Does not fit any category above

Respond ONLY with a JSON object:
{
  "category": "<category_value>",
  "confidence": <0.0-1.0>,
  "document_date": "<YYYY-MM or YYYY or null>",
  "description": "<one sentence describing what this document is>"
}"""


async def classify_document(
    filename: str,
    text_sample: str,  # first ~2000 chars of extracted text
) -> dict:
    """
    Classify a document using Claude.
    Returns: {category, confidence, document_date, description}
    """
    # Truncate sample to avoid token waste
    sample = text_sample[:2000]

    try:
        client = get_client()
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=256,
            system=CLASSIFICATION_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": (
                    f"Filename: {filename}\n\n"
                    f"Document text sample:\n{sample}\n\n"
                    f"Classify this document."
                )
            }],
        )

        import json
        text = response.content[0].text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)

        # Validate category
        category = result.get("category", "other")
        if category not in CATEGORY_MAP:
            category = "other"
        result["category"] = category

        return result

    except Exception as e:
        logger.warning(f"Classification failed for {filename}: {e}")
        return {
            "category": "other",
            "confidence": 0.0,
            "document_date": None,
            "description": f"Document: {filename}",
        }
