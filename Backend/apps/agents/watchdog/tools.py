# apps/agents/watchdog/tools.py
"""
ADK tool functions for the RegulatoryWatchdogAgent.
All functions are plain async Python — ADK wraps them into FunctionTools automatically.
"""
import logging
from typing import Any

import feedparser
import httpx
from sqlalchemy import select

from services.db import async_session
from services.models import Regulation
from shared.utils import utcnow

logger = logging.getLogger(__name__)

_SOURCES = [
    {"name": "WTO News Feed",        "type": "rss",  "url": "https://www.wto.org/rss/english/news_e.xml"},
    {"name": "US CBP Trade News",    "type": "rss",  "url": "https://www.cbp.gov/trade/rss"},
    {"name": "OFAC Sanctions",       "type": "html", "url": "https://ofac.treasury.gov/recent-actions"},
    {"name": "EUR-Lex OJ RSS",       "type": "rss",  "url": "https://eur-lex.europa.eu/rss-oj-daily-en.xml"},
]


async def fetch_url(url: str) -> str:
    """
    Fetch the raw HTML/text content of a URL.
    Returns up to 100 KB of text. Returns an error message on failure.

    Args:
        url: The URL to fetch.
    """
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "TradeGuard/1.0"})
            resp.raise_for_status()
            return resp.text[:102_400]
    except Exception as exc:
        logger.warning("fetch_url failed for %s: %s", url, exc)
        return f"ERROR: could not fetch {url}: {exc}"


async def parse_rss(url: str) -> list[dict[str, Any]]:
    """
    Fetch and parse an RSS/Atom feed. Returns a list of entries.
    Each entry has: title, link, summary, published.

    Args:
        url: The RSS feed URL to parse.
    """
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "TradeGuard/1.0"})
            resp.raise_for_status()
            raw = resp.text
        feed = feedparser.parse(raw)
        entries = []
        for entry in feed.entries[:20]:  # cap at 20 per scan
            entries.append({
                "title":     getattr(entry, "title",     ""),
                "link":      getattr(entry, "link",      ""),
                "summary":   getattr(entry, "summary",   ""),
                "published": getattr(entry, "published", ""),
            })
        return entries
    except Exception as exc:
        logger.warning("parse_rss failed for %s: %s", url, exc)
        return []


async def store_regulation(event_json: dict[str, Any]) -> str:
    """
    Persist a structured regulation event to Supabase.
    Skips duplicates (by source_url). Returns the regulation ID or 'duplicate'.

    Args:
        event_json: Structured regulation dict with at minimum title and source_url.
    """
    source_url = event_json.get("source_url", "")
    title = event_json.get("title", "Unknown")

    if not source_url:
        logger.warning("store_regulation called with no source_url — skipping")
        return "skipped: no source_url"

    try:
        async with async_session() as session:
            existing = (
                await session.execute(
                    select(Regulation).where(Regulation.source_url == source_url)
                )
            ).scalar_one_or_none()

            if existing:
                return f"duplicate: {existing.id}"

            regulation = Regulation(
                title=title,
                source_url=source_url,
                published_date=utcnow(),
                normalized_event=event_json,
                raw_text=event_json.get("summary", ""),
            )
            session.add(regulation)
            await session.commit()
            await session.refresh(regulation)
            logger.info("Stored regulation: %s [%s]", title, regulation.id)
            return str(regulation.id)
    except Exception as exc:
        logger.exception("store_regulation DB error: %s", exc)
        return f"error: {exc}"


def list_sources() -> list[dict[str, str]]:
    """
    Return the list of regulatory sources TradeGuard monitors.
    The agent can call this to know which URLs to fetch.
    """
    return _SOURCES
