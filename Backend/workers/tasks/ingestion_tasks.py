# workers/tasks/ingestion_tasks.py
"""
Phase 1 Celery tasks for external data ingestion.

Tasks:
  ingest_gta_regulations    — fetch GTA interventions and persist
  ingest_wto_measures       — fetch WTO tariff data for monitored pairs
  run_all_ingestion         — trigger all three sources sequentially
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from celery import Task

from workers.celery_app import celery_app
from apps.api.core.config import settings
from shared.events import EventTopic

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared async runner
# ---------------------------------------------------------------------------

def _run(coro):
    """Run an async coroutine from a sync Celery task."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# GTA ingestion task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="workers.tasks.ingestion_tasks.ingest_gta_regulations",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="watchdog",
)
def ingest_gta_regulations(
    self: Task,
    limit: int = 50,
    days_back: int = 7,
) -> dict[str, Any]:
    """Fetch and ingest Global Trade Alert interventions."""
    logger.info("GTA ingestion task started (task_id=%s)", self.request.id)
    return _run(_ingest_gta_async(limit=limit, days_back=days_back))


async def _ingest_gta_async(limit: int, days_back: int) -> dict[str, Any]:
    from services.integrations.gta.client import GTAClient
    from services.integrations.gta.service import GTAService
    from services.db import async_session
    from services.ai import get_gemini_client
    from services.qdrant_client import get_qdrant_service
    from services.minio_client import get_minio_service
    from services.event_bus import EventBus
    from services.models import WatchdogRun
    from shared.utils import utcnow

    bus = EventBus(settings.REDIS_URL)
    await bus.connect()

    async with async_session() as db:
        # Record watchdog run
        run = WatchdogRun(source="gta", status="started", started_at=utcnow())
        db.add(run)
        await db.flush()

        try:
            async with GTAClient(
                api_key=settings.GTA_API_KEY,
                base_url=settings.GTA_BASE_URL,
            ) as client:
                service = GTAService(
                    client=client,
                    db=db,
                    gemini=get_gemini_client(),
                    qdrant=get_qdrant_service(),
                    minio=get_minio_service(),
                    event_bus=bus,
                )
                result = await service.ingest(limit=limit, days_back=days_back)

            run.status = "completed"
            run.records_fetched = result.get("fetched", 0)
            run.records_stored = result.get("stored", 0)
            run.errors = result.get("errors", 0)
        except Exception as exc:
            run.status = "failed"
            run.error_detail = str(exc)
            logger.exception("GTA ingestion failed: %s", exc)
            result = {"provider": "gta", "error": str(exc)}
        finally:
            run.completed_at = utcnow()
            await db.commit()
            await bus.disconnect()

    return result


# ---------------------------------------------------------------------------
# WTO ingestion task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="workers.tasks.ingestion_tasks.ingest_wto_measures",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="watchdog",
)
def ingest_wto_measures(self: Task) -> dict[str, Any]:
    """Fetch and ingest WTO tariff measures for monitored country pairs."""
    logger.info("WTO ingestion task started (task_id=%s)", self.request.id)
    return _run(_ingest_wto_async())


async def _ingest_wto_async() -> dict[str, Any]:
    from services.integrations.wto.client import WTOClient
    from services.integrations.wto.service import WTOService
    from services.db import async_session
    from services.ai import get_gemini_client
    from services.qdrant_client import get_qdrant_service
    from services.minio_client import get_minio_service
    from services.event_bus import EventBus
    from services.models import WatchdogRun
    from shared.utils import utcnow

    bus = EventBus(settings.REDIS_URL)
    await bus.connect()

    async with async_session() as db:
        run = WatchdogRun(source="wto", status="started", started_at=utcnow())
        db.add(run)
        await db.flush()

        try:
            async with WTOClient(
                api_key=settings.WTO_API_KEY,
                base_url=settings.WTO_BASE_URL,
            ) as client:
                service = WTOService(
                    client=client,
                    db=db,
                    gemini=get_gemini_client(),
                    qdrant=get_qdrant_service(),
                    minio=get_minio_service(),
                    event_bus=bus,
                )
                result = await service.ingest()

            run.status = "completed"
            run.records_fetched = result.get("tariff_events", 0)
            run.records_stored = result.get("regulations_stored", 0)
            run.errors = result.get("errors", 0)
        except Exception as exc:
            run.status = "failed"
            run.error_detail = str(exc)
            logger.exception("WTO ingestion failed: %s", exc)
            result = {"provider": "wto", "error": str(exc)}
        finally:
            run.completed_at = utcnow()
            await db.commit()
            await bus.disconnect()

    return result


# ---------------------------------------------------------------------------
# Master scan task — triggers all sources
# ---------------------------------------------------------------------------

@celery_app.task(
    name="workers.tasks.ingestion_tasks.run_all_ingestion",
    bind=True,
    max_retries=1,
    default_retry_delay=300,
    queue="watchdog",
)
def run_all_ingestion(self: Task, sources: list[str] | None = None) -> dict[str, Any]:
    """
    Master ingestion task: trigger GTA + WTO ingestion.
    OpenSanctions is triggered separately via POST /api/sanctions/check.
    """
    logger.info("Master ingestion started (task_id=%s)", self.request.id)
    active_sources = sources or ["gta", "wto"]

    results: dict[str, Any] = {"task_id": self.request.id, "sources": {}}

    for source in active_sources:
        if source == "gta":
            try:
                r = _run(_ingest_gta_async(limit=50, days_back=7))
                results["sources"]["gta"] = r
            except Exception as exc:
                logger.exception("GTA subtask failed: %s", exc)
                results["sources"]["gta"] = {"error": str(exc)}

        elif source == "wto":
            try:
                r = _run(_ingest_wto_async())
                results["sources"]["wto"] = r
            except Exception as exc:
                logger.exception("WTO subtask failed: %s", exc)
                results["sources"]["wto"] = {"error": str(exc)}

    logger.info("Master ingestion complete: %s", results)
    return results
