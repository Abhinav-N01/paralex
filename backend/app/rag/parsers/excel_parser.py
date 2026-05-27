"""
ParaLex — Excel / CSV Parser
Converts spreadsheets into readable text, preserving table structure.
Critical for bank statements, financial summaries, transaction logs.
"""
import logging
from pathlib import Path

import pandas as pd

from app.rag.parsers.pdf_parser import ParsedDocument, ParsedPage

logger = logging.getLogger(__name__)


def parse_excel(file_path: Path) -> ParsedDocument:
    """Parse .xlsx / .xls files. Each sheet becomes one 'page'."""
    result = ParsedDocument()

    try:
        xl = pd.ExcelFile(file_path)
        result.total_pages = len(xl.sheet_names)

        for i, sheet_name in enumerate(xl.sheet_names, start=1):
            df = xl.parse(sheet_name)
            text = _df_to_text(df, sheet_name)
            if text.strip():
                result.pages.append(ParsedPage(
                    page_number=i,
                    text=text,
                    is_ocr=False,
                ))

    except Exception as e:
        logger.error(f"Excel parse failed for {file_path}: {e}")
        result.extraction_warnings.append(f"Excel parse error: {str(e)}")

    return result


def parse_csv(file_path: Path) -> ParsedDocument:
    """Parse .csv files."""
    result = ParsedDocument(total_pages=1)

    try:
        df = pd.read_csv(file_path)
        text = _df_to_text(df, file_path.stem)
        result.pages.append(ParsedPage(page_number=1, text=text))
    except Exception as e:
        logger.error(f"CSV parse failed for {file_path}: {e}")
        result.extraction_warnings.append(f"CSV parse error: {str(e)}")

    return result


def _df_to_text(df: pd.DataFrame, sheet_name: str) -> str:
    """
    Convert a DataFrame to a readable text representation.
    Uses pipe-delimited table format so Claude can read it clearly.
    Also generates a statistical summary for numeric columns.
    """
    lines = [f"### Sheet: {sheet_name}"]
    lines.append(f"Rows: {len(df)}, Columns: {len(df.columns)}")
    lines.append("")

    if df.empty:
        lines.append("(empty sheet)")
        return "\n".join(lines)

    # Clean column names
    df.columns = [str(c).strip() for c in df.columns]

    # Full table (cap at 500 rows to avoid bloat)
    cap = 500
    display_df = df.head(cap)
    table_str = display_df.to_string(index=False, max_rows=cap, max_cols=30)
    lines.append(table_str)

    if len(df) > cap:
        lines.append(f"\n... ({len(df) - cap} more rows not shown)")

    # Numeric summary — useful for verifying totals in bank statements
    numeric_cols = df.select_dtypes(include="number")
    if not numeric_cols.empty:
        lines.append("\n#### Numeric Column Totals / Stats")
        for col in numeric_cols.columns:
            col_sum = numeric_cols[col].sum()
            col_min = numeric_cols[col].min()
            col_max = numeric_cols[col].max()
            lines.append(
                f"  {col}: sum={col_sum:,.2f}, min={col_min:,.2f}, max={col_max:,.2f}"
            )

    return "\n".join(lines)
