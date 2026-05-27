"""
ParaLex — Grounded Q&A Chat Agent

Anti-hallucination design:
  1. All answers are grounded in retrieved document chunks only.
  2. System prompt explicitly forbids using outside knowledge.
  3. Every answer includes source citations (filename + page).
  4. If no relevant content is found → explicit "not found" response.
  5. Claude's extended thinking is NOT used (reduces fabrication risk).
"""
import logging
from typing import AsyncGenerator, Optional
import json

import anthropic

from app.config import settings
from app.rag.retrieval import retrieve, RetrievalResult

logger = logging.getLogger(__name__)


GROUNDED_SYSTEM_PROMPT = """You are ParaLex, an AI legal assistant for EB-5 investor visa cases.

## YOUR CORE RULE — NO HALLUCINATION
You MUST answer questions ONLY using the document excerpts provided in the [CONTEXT] block below.
- If the answer is clearly in the context → answer it with exact citations.
- If the context mentions something relevant but is incomplete → say what the context shows and note what's unclear.
- If the answer is NOT in the provided context → say exactly: "I could not find this information in the uploaded documents."
- NEVER invent facts, numbers, dates, or names.
- NEVER use your general knowledge about EB-5, immigration law, or finance to fill gaps.

## CITATION FORMAT
After every factual claim, cite the source inline like this:
  "The wire transfer of $850,000 was sent on March 14, 2023 [Chase Bank Statement, p.7]"

If multiple sources support a claim, cite all of them.

## RESPONSE STYLE
- Be precise and professional (attorney-level communication).
- When presenting financial figures, be exact — do not round unless the document rounds.
- When documents contradict each other, flag the discrepancy clearly.
- Structure longer answers with headers and bullet points for readability.

## SCOPE
You are assisting with EB-5 investor visa cases. Focus on:
- Source of funds analysis
- Fund traceability (path of funds)
- Biographical document review
- Document completeness
- Drafting support

Do not provide legal advice or predict USCIS decisions."""


async def chat_with_documents(
    case_id: str,
    question: str,
    conversation_history: list[dict],  # [{role, content}, ...]
    filter_category: Optional[str] = None,
    stream: bool = False,
) -> dict:
    """
    Answer a question using only the case's indexed documents.

    Returns:
        {
            "answer": str,
            "citations": list[dict],
            "retrieved_chunks": int,
            "has_relevant_content": bool,
        }
    """
    # 1. Retrieve relevant chunks
    retrieval = retrieve(
        case_id=case_id,
        query=question,
        filter_category=filter_category,
    )

    # 2. Build context block
    context_block = retrieval.format_context_for_llm()

    # 3. Build messages for Claude
    messages = []

    # Add conversation history (last 10 turns for context window efficiency)
    for msg in conversation_history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Add current question with context
    if retrieval.has_relevant_content:
        user_content = f"""[CONTEXT — Retrieved from case documents]
{context_block}

[END OF CONTEXT]

Based ONLY on the above document excerpts, please answer:
{question}"""
    else:
        user_content = f"""[CONTEXT — No relevant documents found for this query]

The question: {question}

Since no relevant document excerpts were retrieved, please respond that you could not find this information in the uploaded documents."""

    messages.append({"role": "user", "content": user_content})

    # 4. Call Claude
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=2048,
        system=GROUNDED_SYSTEM_PROMPT,
        messages=messages,
    )

    answer = response.content[0].text

    # 5. Extract unique citations from retrieved chunks
    citations = []
    seen = set()
    for chunk in retrieval.chunks:
        key = (chunk.doc_id, chunk.page_number)
        if key not in seen:
            seen.add(key)
            citations.append(chunk.to_citation())

    return {
        "answer": answer,
        "citations": citations,
        "retrieved_chunks": len(retrieval.chunks),
        "has_relevant_content": retrieval.has_relevant_content,
        "total_chunks_searched": retrieval.total_found,
    }


async def stream_chat_with_documents(
    case_id: str,
    question: str,
    conversation_history: list[dict],
    filter_category: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Streaming version of chat — yields SSE-formatted chunks."""

    # Retrieve first (synchronous, fast)
    retrieval = retrieve(
        case_id=case_id,
        query=question,
        filter_category=filter_category,
    )
    context_block = retrieval.format_context_for_llm()

    messages = []
    for msg in conversation_history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    if retrieval.has_relevant_content:
        user_content = (
            f"[CONTEXT — Retrieved from case documents]\n{context_block}\n\n"
            f"[END OF CONTEXT]\n\nBased ONLY on the above document excerpts:\n{question}"
        )
    else:
        user_content = (
            f"[CONTEXT — No relevant documents found]\n\n"
            f"Question: {question}\n\n"
            "Respond that you could not find this information in the uploaded documents."
        )

    messages.append({"role": "user", "content": user_content})

    # Emit metadata first
    citations = [c.to_citation() for c in retrieval.chunks]
    meta = {
        "type": "metadata",
        "retrieved_chunks": len(retrieval.chunks),
        "has_relevant_content": retrieval.has_relevant_content,
        "citations": citations,
    }
    yield f"data: {json.dumps(meta)}\n\n"

    # Stream Claude response
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    with client.messages.stream(
        model=settings.claude_model,
        max_tokens=2048,
        system=GROUNDED_SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        for text_chunk in stream.text_stream:
            yield f"data: {json.dumps({'type': 'text', 'text': text_chunk})}\n\n"

    yield "data: [DONE]\n\n"
