# shared/utils.py
import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


def truncate_text(text: str, max_chars: int = 8000) -> str:
    """Truncate text to max_chars, appending an ellipsis if truncated."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "... [truncated]"


def safe_json_loads(s: Any) -> Any:
    """Try to parse s as JSON; return s unchanged on failure."""
    if not isinstance(s, str):
        return s
    try:
        return json.loads(s)
    except (json.JSONDecodeError, TypeError):
        logger.warning("safe_json_loads: could not parse value (first 100 chars): %r", s[:100])
        return s


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks for RAG ingestion."""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks
