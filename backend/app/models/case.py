"""
ParaLex — SQLAlchemy Models
"""
import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, String, DateTime, Text, Integer,
    ForeignKey, Float, Boolean, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship

from app.db.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────

class CaseStatus(str, PyEnum):
    ACTIVE = "active"
    UNDER_REVIEW = "under_review"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    DENIED = "denied"


class DocumentCategory(str, PyEnum):
    # Biographical
    PASSPORT = "passport"
    BIRTH_CERTIFICATE = "birth_certificate"
    VISA_STAMPS = "visa_stamps"
    NATIONAL_ID = "national_id"

    # Financial — Income
    TAX_RETURN = "tax_return"
    W2 = "w2"
    PAY_STUB = "pay_stub"
    TAX_RECEIPT = "tax_receipt"

    # Financial — Assets
    BANK_STATEMENT = "bank_statement"
    INVESTMENT_STATEMENT = "investment_statement"
    STOCK_STATEMENT = "stock_statement"
    RETIREMENT_401K = "retirement_401k"
    PROPERTY_DOCUMENT = "property_document"

    # Financial — Transfers
    WIRE_TRANSFER = "wire_transfer"
    GIFT_LETTER = "gift_letter"
    LOAN_DOCUMENT = "loan_document"

    # Business
    BUSINESS_OWNERSHIP = "business_ownership"
    BUSINESS_FINANCIALS = "business_financials"

    # Legal / Prior Work
    PRIOR_MEMO = "prior_memo"
    LEGAL_CORRESPONDENCE = "legal_correspondence"

    # Uncategorized
    OTHER = "other"


class DocumentStatus(str, PyEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"


# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────

class Case(Base):
    __tablename__ = "cases"

    id = Column(String, primary_key=True, default=new_uuid)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Client info
    client_name = Column(String(255), nullable=False)
    client_email = Column(String(255))
    attorney_name = Column(String(255))
    case_reference = Column(String(100), unique=True)  # internal ref # like "EB5-2024-001"

    # EB-5 specifics
    investment_amount = Column(Float)           # USD
    is_tea = Column(Boolean, default=True)      # Targeted Employment Area
    regional_center = Column(String(255))       # RC name if applicable
    country_of_origin = Column(String(100))

    # Status
    status = Column(SAEnum(CaseStatus), default=CaseStatus.ACTIVE)
    notes = Column(Text)

    # Relationships
    documents = relationship("Document", back_populates="case", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="case", cascade="all, delete-orphan")
    memos = relationship("Memo", back_populates="case", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=new_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # File info
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_size = Column(Integer)          # bytes
    mime_type = Column(String(100))

    # Classification
    category = Column(SAEnum(DocumentCategory), default=DocumentCategory.OTHER)
    category_confidence = Column(Float)  # 0–1, confidence of auto-classification
    document_date = Column(String(50))   # e.g. "2023-03" (may be partial)
    description = Column(Text)           # attorney-provided or auto-generated

    # Processing
    status = Column(SAEnum(DocumentStatus), default=DocumentStatus.PENDING)
    page_count = Column(Integer)
    ocr_applied = Column(Boolean, default=False)
    extraction_notes = Column(Text)      # any warnings during parsing

    # Indexing
    chroma_collection = Column(String(200))  # collection name in ChromaDB
    chunk_count = Column(Integer, default=0)

    # Relationships
    case = relationship("Case", back_populates="documents")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=new_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    title = Column(String(500))

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    case = relationship("Case", back_populates="chat_sessions")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    role = Column(String(20), nullable=False)     # "user" | "assistant"
    content = Column(Text, nullable=False)
    citations = Column(JSON)                       # list of {doc_id, filename, page, excerpt}
    retrieved_chunks = Column(Integer, default=0)  # how many chunks were retrieved

    session = relationship("ChatSession", back_populates="messages")


class Memo(Base):
    __tablename__ = "memos"

    id = Column(String, primary_key=True, default=new_uuid)
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    memo_type = Column(String(100))  # "source_of_funds" | "gap_analysis" | "cover_letter"
    title = Column(String(500))
    content = Column(Text)           # markdown / structured text
    citations = Column(JSON)
    is_final = Column(Boolean, default=False)

    case = relationship("Case", back_populates="memos")
