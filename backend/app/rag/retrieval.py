"""
ParaLex — RAG Retrieval Engine

Anti-hallucination guarantees:
  1. Only returns text from indexed documents (no LLM knowledge injected).
  2. Every retrieved chunk carries provenance metadata (filename, page, category).
  3. Similarity threshold: chunks below the threshold are discarded.
  4. The system prompt forbids the LLM from answering outside retrieved context.
"""
import logging
from dataclasses import dataclass, field
from typing import Optional

from app.config import settings
from app.rag.ingestion import get_or_create_collection, embed_texts

logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    chunk_id: str
    text: str
    score: float          # cosine similarity (higher = more relevant)
    doc_id: str
    filename: str
    category: str
    page_number: int
    is_ocr: bool

    def to_citation(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "filename": self.filename,
            "category": self.category,
            "page_number": self.page_number,
            "excerpt": self.text[:300] + ("..." if len(self.text) > 300 else ""),
            "score": round(self.score, 3),
        }


@dataclass
class RetrievalResult:
    chunks: list[RetrievedChunk] = field(default_factory=list)
    query: str = ""
    total_found: int = 0

    @property
    def has_relevant_content(self) -> bool:
        return len(self.chunks) > 0

    def format_context_for_llm(self) -> str:
        """Format retrieved chunks as a structured context block for Claude."""
        if not self.chunks:
            return "No relevant documents found."

        parts = []
        for i, chunk in enumerate(self.chunks, start=1):
            parts.append(
                f"[SOURCE {i}] "
                f"File: \"{chunk.filename}\" | "
                f"Category: {chunk.category} | "
                f"Page: {chunk.page_number}\n"
                f"{chunk.text}"
            )

        return "\n\n---\n\n".join(parts)


def retrieve(
    case_id: str,
    query: str,
    top_k: int = settings.top_k_retrieval,
    filter_category: Optional[str] = None,
    filter_doc_ids: Optional[list[str]] = None,
    min_score: float = settings.similarity_threshold,
) -> RetrievalResult:
    """
    Query the vector store for the most relevant chunks in a case.

    Args:
        case_id: Which case's collection to search.
        query: Natural language question.
        top_k: Maximum number of chunks to return.
        filter_category: Optionally restrict to a document category.
        filter_doc_ids: Optionally restrict to specific document IDs.
        min_score: Cosine similarity threshold (0–1). Below this → discarded.
    """
    result = RetrievalResult(query=query)

    try:
        collection = get_or_create_collection(case_id)

        # Count docs in collection
        count = collection.count()
        if count == 0:
            logger.warning(f"Collection for case {case_id} is empty.")
            return result

        # Build metadata filter
        where: Optional[dict] = None
        filters = []
        if filter_category:
            filters.append({"category": {"$eq": filter_category}})
        if filter_doc_ids:
            filters.append({"doc_id": {"$in": filter_doc_ids}})

        if len(filters) == 1:
            where = filters[0]
        elif len(filters) > 1:
            where = {"$and": filters}

        # Embed query
        query_embedding = embed_texts([query])[0]

        # Query ChromaDB
        query_kwargs = dict(
            query_embeddings=[query_embedding],
            n_results=min(top_k * 2, count),  # fetch extra, then filter by score
            include=["documents", "metadatas", "distances"],
        )
        if where:
            query_kwargs["where"] = where

        raw = collection.query(**query_kwargs)

        ids = raw["ids"][0]
        docs = raw["documents"][0]
        metas = raw["metadatas"][0]
        # ChromaDB returns L2 distance for cosine space — convert to similarity
        distances = raw["distances"][0]

        result.total_found = len(ids)

        for chunk_id, doc_text, meta, dist in zip(ids, docs, metas, distances):
            # ChromaDB cosine distance: 0 = identical, 2 = opposite
            # Convert to similarity: 1 - dist/2 ≈ cosine similarity
            similarity = 1.0 - (dist / 2.0)

            if similarity < min_score:
                continue

            result.chunks.append(RetrievedChunk(
                chunk_id=chunk_id,
                text=doc_text,
                score=similarity,
                doc_id=meta.get("doc_id", ""),
                filename=meta.get("filename", "unknown"),
                category=meta.get("category", "other"),
                page_number=int(meta.get("page_number", 0)),
                is_ocr=meta.get("is_ocr", "False") == "True",
            ))

        # Sort by relevance (descending) and cap at top_k
        result.chunks.sort(key=lambda c: c.score, reverse=True)
        result.chunks = result.chunks[:top_k]

    except Exception as e:
        logger.error(f"Retrieval failed for case {case_id}: {e}")

    return result
