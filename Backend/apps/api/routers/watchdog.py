# apps/api/routers/watchdog.py
"""
Watchdog ingestion control API — Phase 1.

Routes:
  POST /api/watchdog/scan     — trigger external data ingestion
  GET  /api/watchdog/status   — source health and last scan summary
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_db, get_event_bus, get_gemini, get_qdrant, get_minio
from apps.api.core.config import settings
from services.event_bus import EventBus
from services.models import Regulation, SanctionRecord, RiskRecord, WatchdogRun
from shared.schemas.intelligence import (
    ApiResponse,
    ScanRequest,
    SourceHealth,
    WatchdogStatus,
)
from shared.events import EventTopic
from shared.utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# POST /api/watchdog/scan
# ---------------------------------------------------------------------------

@router.post("/scan", summary="Trigger external data ingestion scan")
async def trigger_scan(
    body: ScanRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    event_bus: EventBus = Depends(get_event_bus),
) -> ApiResponse[Dict[str, Any]]:
    """
    Dispatch Celery ingestion tasks for the requested sources.
    Returns immediately with task IDs. Processing is asynchronous.

    Body:
        sources: list of ["gta", "wto"] — omit for all
        force:   bypass deduplication window
    """
    from workers.tasks.ingestion_tasks import (
        ingest_gta_regulations,
        ingest_wto_measures,
        run_all_ingestion,
    )

    sources: List[str] = body.sources or ["gta", "wto"]
    task_ids: Dict[str, str] = {}

    try:
        await event_bus.publish(
            EventTopic.WATCHDOG_SCAN_STARTED,
            {"sources": sources, "triggered_at": utcnow().isoformat()},
        )
    except Exception as exc:
        logger.warning("Could not publish watchdog.scan.started: %s", exc)

    if "gta" in sources:
        try:
            task = ingest_gta_regulations.delay()
            task_ids["gta"] = task.id
            logger.info("Dispatched GTA ingestion task: %s", task.id)
        except Exception as exc:
            logger.error("Failed to dispatch GTA task: %s", exc)
            task_ids["gta"] = f"error: {exc}"

    if "wto" in sources:
        try:
            task = ingest_wto_measures.delay()
            task_ids["wto"] = task.id
            logger.info("Dispatched WTO ingestion task: %s", task.id)
        except Exception as exc:
            logger.error("Failed to dispatch WTO task: %s", exc)
            task_ids["wto"] = f"error: {exc}"

    return ApiResponse(
        success=True,
        data={
            "message": "Ingestion scan dispatched",
            "sources": sources,
            "task_ids": task_ids,
        },
        metadata={"triggered_at": utcnow().isoformat()},
    )


# ---------------------------------------------------------------------------
# GET /api/watchdog/status
# ---------------------------------------------------------------------------

@router.get("/status", summary="Watchdog source health and scan statistics")
async def watchdog_status(
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[WatchdogStatus]:
    """
    Returns:
      - Last scan time per source
      - Source health (ok / error / unknown)
      - Total regulations / sanctions / risks in DB
    """
    # Aggregate DB counts
    total_regulations = (
        await db.execute(select(func.count()).select_from(Regulation))
    ).scalar_one()
    total_sanctions = (
        await db.execute(select(func.count()).select_from(SanctionRecord))
    ).scalar_one()
    total_risks = (
        await db.execute(select(func.count()).select_from(RiskRecord))
    ).scalar_one()

    # Most recent runs per source
    sources_health: List[SourceHealth] = []
    for src in ["gta", "wto", "opensanctions"]:
        run = (
            await db.execute(
                select(WatchdogRun)
                .where(WatchdogRun.source == src)
                .order_by(WatchdogRun.started_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if run:
            sources_health.append(
                SourceHealth(
                    name=_source_display_name(src),
                    last_checked=run.completed_at or run.started_at,
                    status=run.status if run.status in ("completed", "failed") else "unknown",
                    records_ingested=run.records_stored or 0,
                    error_message=run.error_detail if run.status == "failed" else None,
                )
            )
        else:
            sources_health.append(
                SourceHealth(name=_source_display_name(src), status="unknown")
            )

    # Most recent overall scan
    last_run = (
        await db.execute(
            select(WatchdogRun).order_by(WatchdogRun.started_at.desc()).limit(1)
        )
    ).scalar_one_or_none()

    status = WatchdogStatus(
        last_scan_at=last_run.completed_at if last_run else None,
        sources=sources_health,
        total_regulations=total_regulations,
        total_sanctions=total_sanctions,
        total_risks=total_risks,
        is_running=False,  # could check Celery inspect in future
    )

    return ApiResponse(
        success=True,
        data=status,
        metadata={"retrieved_at": utcnow().isoformat()},
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _source_display_name(src: str) -> str:
    return {
        "gta": "Global Trade Alert",
        "wto": "WTO Timeseries API",
        "opensanctions": "OpenSanctions",
    }.get(src, src)
