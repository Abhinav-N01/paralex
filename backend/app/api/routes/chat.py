"""
ParaLex — Chat API Routes
Grounded Q&A over case documents.
"""
from datetime import datetime
from typing import Optional
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.case import Case, ChatSession, ChatMessage
from app.agents.chat_agent import chat_with_documents, stream_chat_with_documents

router = APIRouter(prefix="/cases/{case_id}/chat", tags=["Chat"])


# ─────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None  # if None, creates a new session
    filter_category: Optional[str] = None
    stream: bool = False


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    answer: str
    citations: list[dict]
    retrieved_chunks: int
    has_relevant_content: bool


class SessionResponse(BaseModel):
    id: str
    title: Optional[str]
    created_at: datetime
    message_count: int = 0


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
async def ask_question(
    case_id: str,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Ask a question about a case's documents.
    Returns a grounded answer with citations.
    If stream=True, use the /stream endpoint instead.
    """
    # Validate case
    await _get_case_or_404(case_id, db)

    # Get or create session
    session = await _get_or_create_session(case_id, payload.session_id, db)

    # Load conversation history
    history_stmt = select(ChatMessage).where(
        ChatMessage.session_id == session.id
    ).order_by(ChatMessage.created_at.asc()).limit(20)
    history_result = await db.execute(history_stmt)
    history_msgs = history_result.scalars().all()
    history = [{"role": m.role, "content": m.content} for m in history_msgs]

    # Save user message
    user_msg = ChatMessage(
        session_id=session.id,
        role="user",
        content=payload.question,
    )
    db.add(user_msg)
    await db.flush()

    # Get grounded answer
    result = await chat_with_documents(
        case_id=case_id,
        question=payload.question,
        conversation_history=history,
        filter_category=payload.filter_category,
    )

    # Save assistant message
    assistant_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=result["answer"],
        citations=result["citations"],
        retrieved_chunks=result["retrieved_chunks"],
    )
    db.add(assistant_msg)
    await db.flush()
    await db.refresh(assistant_msg)

    # Update session title from first question
    if not session.title:
        session.title = payload.question[:100]

    return ChatResponse(
        session_id=session.id,
        message_id=assistant_msg.id,
        answer=result["answer"],
        citations=result["citations"],
        retrieved_chunks=result["retrieved_chunks"],
        has_relevant_content=result["has_relevant_content"],
    )


@router.post("/stream")
async def stream_question(
    case_id: str,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Streaming version of the Q&A endpoint.
    Returns Server-Sent Events (SSE).
    First event: metadata (citations, chunk count).
    Subsequent events: text chunks.
    Final event: [DONE].
    """
    await _get_case_or_404(case_id, db)
    session = await _get_or_create_session(case_id, payload.session_id, db)

    history_stmt = select(ChatMessage).where(
        ChatMessage.session_id == session.id
    ).order_by(ChatMessage.created_at.asc()).limit(20)
    history_result = await db.execute(history_stmt)
    history_msgs = history_result.scalars().all()
    history = [{"role": m.role, "content": m.content} for m in history_msgs]

    user_msg = ChatMessage(session_id=session.id, role="user", content=payload.question)
    db.add(user_msg)
    await db.commit()

    if not session.title:
        session.title = payload.question[:100]
        await db.commit()

    return StreamingResponse(
        stream_chat_with_documents(
            case_id=case_id,
            question=payload.question,
            conversation_history=history,
            filter_category=payload.filter_category,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(case_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ChatSession).where(
        ChatSession.case_id == case_id
    ).order_by(ChatSession.created_at.desc())
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    responses = []
    for session in sessions:
        count_stmt = select(ChatMessage).where(ChatMessage.session_id == session.id)
        count_result = await db.execute(count_stmt)
        count = len(count_result.scalars().all())
        responses.append(SessionResponse(
            id=session.id,
            title=session.title,
            created_at=session.created_at,
            message_count=count,
        ))
    return responses


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    case_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ChatMessage).where(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at.asc())
    result = await db.execute(stmt)
    messages = result.scalars().all()

    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "citations": m.citations,
            "retrieved_chunks": m.retrieved_chunks,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    case_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ChatSession).where(
        ChatSession.id == session_id,
        ChatSession.case_id == case_id,
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

async def _get_case_or_404(case_id: str, db: AsyncSession) -> Case:
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    return case


async def _get_or_create_session(
    case_id: str,
    session_id: Optional[str],
    db: AsyncSession,
) -> ChatSession:
    if session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.case_id == case_id,
            )
        )
        session = result.scalar_one_or_none()
        if session:
            return session

    # Create new session
    session = ChatSession(case_id=case_id)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session
