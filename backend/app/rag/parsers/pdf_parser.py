"""
ParaLex — PDF Parser
Handles both digital PDFs and scanned PDFs (via OCR fallback).
"""
import io
import logging
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass, field

import fitz  # PyMuPDF
import pdfplumber
from PIL import Image
import pytesseract

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ParsedPage:
    page_number: int           # 1-indexed
    text: str
    is_ocr: bool = False
    confidence: Optional[float] = None  # OCR confidence 0–100


@dataclass
class ParsedDocument:
    pages: List[ParsedPage] = field(default_factory=list)
    total_pages: int = 0
    ocr_applied: bool = False
    extraction_warnings: List[str] = field(default_factory=list)

    @property
    def full_text(self) -> str:
        return "\n\n".join(
            f"[Page {p.page_number}]\n{p.text}"
            for p in self.pages
            if p.text.strip()
        )


# Minimum characters per page to consider text "digital" (not blank/garbage)
MIN_DIGITAL_TEXT_CHARS = 50


def parse_pdf(file_path: Path) -> ParsedDocument:
    """
    Parse a PDF file.  Strategy:
    1. Try pdfplumber for digital text extraction (most accurate for forms).
    2. For any page with < MIN_DIGITAL_TEXT_CHARS, fall back to PyMuPDF→PIL→Tesseract OCR.
    """
    result = ParsedDocument()

    try:
        with pdfplumber.open(file_path) as pdf:
            result.total_pages = len(pdf.pages)

            for i, page in enumerate(pdf.pages, start=1):
                # Attempt digital text extraction
                text = page.extract_text() or ""

                if len(text.strip()) >= MIN_DIGITAL_TEXT_CHARS:
                    result.pages.append(ParsedPage(
                        page_number=i,
                        text=_clean_text(text),
                        is_ocr=False,
                    ))
                else:
                    # Fallback to OCR for this page
                    ocr_text, confidence = _ocr_page(file_path, page_index=i - 1)
                    if ocr_text:
                        result.pages.append(ParsedPage(
                            page_number=i,
                            text=_clean_text(ocr_text),
                            is_ocr=True,
                            confidence=confidence,
                        ))
                        result.ocr_applied = True
                    else:
                        result.extraction_warnings.append(
                            f"Page {i}: no text extracted (blank or image-only)."
                        )

    except Exception as e:
        logger.error(f"PDF parsing failed for {file_path}: {e}")
        result.extraction_warnings.append(f"PDF parse error: {str(e)}")

    return result


def _ocr_page(pdf_path: Path, page_index: int) -> tuple[str, Optional[float]]:
    """Render a PDF page to image and run Tesseract OCR."""
    try:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

        doc = fitz.open(str(pdf_path))
        page = doc[page_index]
        # Render at 300 DPI for good OCR quality
        mat = fitz.Matrix(300 / 72, 300 / 72)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        doc.close()

        # Run Tesseract with confidence data
        ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        words = [
            ocr_data["text"][j]
            for j in range(len(ocr_data["text"]))
            if int(ocr_data["conf"][j]) > 0 and ocr_data["text"][j].strip()
        ]
        confidences = [
            int(ocr_data["conf"][j])
            for j in range(len(ocr_data["conf"]))
            if int(ocr_data["conf"][j]) > 0 and ocr_data["text"][j].strip()
        ]

        text = pytesseract.image_to_string(img)
        avg_confidence = sum(confidences) / len(confidences) if confidences else None
        return text, avg_confidence

    except Exception as e:
        logger.warning(f"OCR failed on page {page_index + 1}: {e}")
        return "", None


def _clean_text(text: str) -> str:
    """Basic text cleanup: normalize whitespace, remove control chars."""
    import re
    # Remove control characters except newlines/tabs
    text = re.sub(r"[^\x09\x0a\x0d\x20-\x7e\x80-\xff]", " ", text)
    # Normalize multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Normalize multiple spaces (but preserve indentation)
    text = re.sub(r" {3,}", "  ", text)
    return text.strip()
