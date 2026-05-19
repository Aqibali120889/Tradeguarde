# workers/tasks/analyzer_tasks.py
"""
Impact analysis Celery tasks — calls ImpactAnalyzerAgent with Gemini Pro + Qdrant RAG.
"""
import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from celery import Task
from sqlalchemy import select

from workers.celery_app import celery_app
from services.db import async_session
from services.models import ImpactAnalysis, Regulation
from services.event_bus import EventBus
from shared.events import EventTopic
from shared.utils import utcnow, truncate_text
from apps.api.core.config import settings

logger = logging.getLogger(__name__)


async def _fetch_regulation(regulation_id: str) -> dict:
    async with async_session() as session:
        reg = (
            await session.execute(select(Regulation).where(Regulation.id == UUID(regulation_id)))
        ).scalar_one_or_none()
        if not reg:
            return {}
        return {
            "regulation_id": str(reg.id),
            "title": reg.title,
            "summary": truncate_text(reg.raw_text or "", 3000),
            "normalized_event": reg.normalized_event or {},
            "source_url": reg.source_url,
            "published_date": str(reg.published_date) if reg.published_date else None,
        }


async def _save_analysis(regulation_id: str, org_id: str, analysis_json: dict, status: str) -> str:
    async with async_session() as session:
        # Update if pending record exists, else create
        existing = (
            await session.execute(
                select(ImpactAnalysis).where(
                    ImpactAnalysis.regulation_id == UUID(regulation_id),
                    ImpactAnalysis.organization_id == UUID(org_id),
                    ImpactAnalysis.status == "pending",
                )
            )
        ).scalar_one_or_none()

        if existing:
            existing.analysis_json = analysis_json
            existing.status = status
            await session.commit()
            return str(existing.id)

        analysis = ImpactAnalysis(
            organization_id=UUID(org_id),
            regulation_id=UUID(regulation_id),
            analysis_json=analysis_json,
            status=status,
            created_at=utcnow(),
        )
        session.add(analysis)
        await session.commit()
        await session.refresh(analysis)
        return str(analysis.id)


async def _publish_analysis_completed(analysis_id: str, org_id: str, regulation_id: str) -> None:
    bus = EventBus(settings.REDIS_URL)
    await bus.connect()
    try:
        await bus.publish(
            EventTopic.IMPACT_ANALYSIS_COMPLETED,
            {"analysis_id": analysis_id, "organization_id": org_id, "regulation_id": regulation_id},
        )
    finally:
        await bus.disconnect()


@celery_app.task(
    name="workers.tasks.analyzer_tasks.run_impact_analysis",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="analysis",
)
def run_impact_analysis(self: Task, regulation_id: str, org_id: str) -> dict[str, Any]:
    """Analyse the impact of a detected regulation using ImpactAnalyzerAgent."""
    logger.info("Impact analysis | regulation=%s org=%s", regulation_id, org_id)

    try:
        from apps.agents.impact_analyzer import impact_analyzer_agent
        from apps.agents._base import run_agent, extract_json

        reg_data = asyncio.run(_fetch_regulation(regulation_id))
        if not reg_data:
            logger.error("Regulation %s not found", regulation_id)
            return {"status": "error", "message": "regulation not found"}

        prompt = (
            f"Analyse the impact of this regulation on our organisation's supply chain.\n\n"
            f"Regulation data:\n{json.dumps(reg_data, indent=2)}\n\n"
            f"Organisation ID: {org_id}\n\n"
            f"Use get_product_bom to check affected products, "
            f"search_similar_regulations to find precedents, "
            f"and classify_hs_code where product descriptions are unclear."
        )

        result_text = asyncio.run(run_agent(impact_analyzer_agent, prompt))
        analysis_json = extract_json(result_text)

        analysis_id = asyncio.run(_save_analysis(regulation_id, org_id, analysis_json, "completed"))
        asyncio.run(_publish_analysis_completed(analysis_id, org_id, regulation_id))

        logger.info("Impact analysis complete: %s", analysis_id)
        return {"analysis_id": analysis_id, "status": "completed", "risk_level": analysis_json.get("risk_level")}

    except Exception as exc:
        logger.exception("Impact analysis failed: %s", exc)
        raise self.retry(exc=exc)
