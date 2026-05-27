"""
ParaLex — Image Parser (passports, ID scans, visa stamps, etc.)
Uses Tesseract OCR with preprocessing for better accuracy on ID documents.
"""
import logging
from pathlib import Path
from typing import Optional

import pytesseract
from PIL import Image, ImageFilter, ImageEnhance

from app.config import settings
from app.rag.parsers.pdf_parser import ParsedDocument, ParsedPage, _clean_text

logger = logging.getLogger(__name__)


def parse_image(file_path: Path) -> ParsedDocument:
    """OCR a standalone image file (JPG, PNG, TIFF, BMP)."""
    result = ParsedDocument(total_pages=1)
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

    try:
        img = Image.open(file_path)
        img = _preprocess_for_ocr(img)

        text = pytesseract.image_to_string(img, config="--oem 3 --psm 3")
        ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        confidences = [
            int(c) for c in ocr_data["conf"] if int(c) > 0
        ]
        avg_conf = sum(confidences) / len(confidences) if confidences else None

        if text.strip():
            result.pages.append(ParsedPage(
                page_number=1,
                text=_clean_text(text),
                is_ocr=True,
                confidence=avg_conf,
            ))
        else:
            result.extraction_warnings.append("No text extracted from image.")

        result.ocr_applied = True

    except Exception as e:
        logger.error(f"Image OCR failed for {file_path}: {e}")
        result.extraction_warnings.append(f"Image parse error: {str(e)}")

    return result


def _preprocess_for_ocr(img: Image.Image) -> Image.Image:
    """
    Preprocess image for better OCR results on documents:
    - Convert to grayscale
    - Increase contrast
    - Sharpen
    - Scale up if too small
    """
    # Convert to RGB first (handles RGBA, P, etc.)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Grayscale
    img = img.convert("L")

    # Scale up if small (OCR works better on 300+ DPI equivalent)
    min_dim = 1500
    w, h = img.size
    if min(w, h) < min_dim:
        scale = min_dim / min(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Enhance contrast
    img = ImageEnhance.Contrast(img).enhance(1.5)

    # Sharpen
    img = img.filter(ImageFilter.SHARPEN)

    return img
