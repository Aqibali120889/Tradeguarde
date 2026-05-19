# workers/tasks/watchdog_tasks.py
"""
Watchdog Celery tasks — scan regulatory sources using RegulatoryWatchdogAgent.
"""
import asyncio
import json
import logging
from typing import Any

from celery import Task

from workers.celery_app import celery_app
from services.event_bus import EventBus
from shared.events import EventTopic
from apps.api.core.config import settings

logger = logging.getLogger(__name__)

REGULATORY_SOURCES = [
    {"name": "WTO News Feed",     "type": "rss",  "url": "https://www.wto.org/rss/english/news_e.xml"},
    {"name": "US CBP Trade News", "type": "rss",  "url": "https://www.cbp.gov/trade/rss"},
    {"name": "OFAC Sanctions",    "type": "html", "url": "https://ofac.treasury.gov/recent-actions"},
    {"name": "EUR-Lex OJ RSS",    "type": "rss",  "url": "https://eur-lex.europa.eu/rss-oj-daily-en.xml"},
]


async def _run_watchdog_for_source(source: dict) -> list[str]:
    """
    Run the RegulatoryWatchdogAgent against one source.
    The agent will call parse_rss/fetch_url and store_regulation internally.
    Returns list of new regulation IDs published to the DB.
    """
    from apps.agents.watchdog import watchdog_agent
    from apps.agents._base import run_agent, extract_json

    feed_type = source["type"]
    url = source["url"]
    name = source["name"]

    prompt = (
        f"Monitor the following regulatory source and extract any new regulation events.\n"
        f"Source: {name}\nType: {feed_type}\nURL: {url}\n\n"
        f"Steps:\n"
        f"1. Call {'parse_rss' if feed_type == 'rss' else 'fetch_url'} with the URL.\n"
        f"2. For each regulation found, call store_regulation with the structured JSON event.\n"
        f"3. Return a JSON array of the regulation IDs you stored (from store_regulation responses)."
    )

    try:
        result_text = await run_agent(watchdog_agent, prompt)
        ids = extract_json(result_text)
        if isinstance(ids, list):
            return [str(i) for i in ids if i and not str(i).startswith(("duplicate", "error", "skip"))]
        return []
    except Exception as exc:
        logger.warning("Watchdog agent failed for %s: %s", name, exc)
        return []


async def _publish_regulation_detected(regulation_id: str, title: str, url: str) -> None:
    bus = EventBus(settings.REDIS_URL)
    await bus.connect()
    try:
        await bus.publish(
            EventTopic.REGULATION_DETECTED,
            {"regulation_id": regulation_id, "title": title, "source_url": url},
        )
    finally:
        await bus.disconnect()


@celery_app.task(
    name="workers.tasks.watchdog_tasks.scan_regulatory_sources",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    queue="watchdog",
)
def scan_regulatory_sources(self: Task) -> dict[str, Any]:
    """Periodic task: scan all regulatory sources and publish regulation.detected events."""
    logger.info("Watchdog scan started (task_id=%s)", self.request.id)
    results: dict[str, Any] = {"scanned": [], "new_regulations": [], "errors": []}

    for source in REGULATORY_SOURCES:
        try:
            new_ids = asyncio.run(_run_watchdog_for_source(source))
            results["scanned"].append(source["name"])
            results["new_regulations"].extend(new_ids)

            # Publish regulation.detected for each new regulation
            for reg_id in new_ids:
                asyncio.run(
                    _publish_regulation_detected(reg_id, source["name"], source["url"])
                )
        except Exception as exc:
            logger.exception("Watchdog failed on %s: %s", source["name"], exc)
            results["errors"].append({"source": source["name"], "error": str(exc)})

    logger.info(
        "Watchdog complete — scanned=%d new=%d errors=%d",
        len(results["scanned"]), len(results["new_regulations"]), len(results["errors"]),
    )
    return results


@celery_app.task(
    name="workers.tasks.watchdog_tasks.scan_single_source",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="watchdog",
)
def scan_single_source(self: Task, source_url: str, source_name: str = "custom") -> dict[str, Any]:
    """Scan a single regulatory source on demand."""
    source = {"name": source_name, "type": "html", "url": source_url}
    new_ids = asyncio.run(_run_watchdog_for_source(source))
    for reg_id in new_ids:
        asyncio.run(_publish_regulation_detected(reg_id, source_name, source_url))
    return {"source": source_name, "url": source_url, "new_regulations": new_ids}
