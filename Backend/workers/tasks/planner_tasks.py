# workers/tasks/planner_tasks.py
"""
Action planning Celery tasks — calls ActionPlannerAgent then GovernanceAgent.
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
from services.models import ActionPlan, ImpactAnalysis
from services.event_bus import EventBus
from shared.events import EventTopic
from shared.utils import utcnow
from apps.api.core.config import settings

logger = logging.getLogger(__name__)


async def _fetch_analysis(analysis_id: str) -> dict:
    async with async_session() as session:
        row = (
            await session.execute(
                select(ImpactAnalysis).where(ImpactAnalysis.id == UUID(analysis_id))
            )
        ).scalar_one_or_none()
        if not row:
            return {}
        return {
            "analysis_id": str(row.id),
            "organization_id": str(row.organization_id),
            "regulation_id": str(row.regulation_id),
            "analysis_json": row.analysis_json or {},
        }


async def _save_plan(org_id: str, steps: list, approval_required: bool) -> str:
    async with async_session() as session:
        plan = ActionPlan(
            organization_id=UUID(org_id),
            steps=steps,
            approval_required=str(approval_required).lower(),
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        return str(plan.id)


async def _link_plan(analysis_id: str, plan_id: str, status: str) -> None:
    async with async_session() as session:
        row = (
            await session.execute(
                select(ImpactAnalysis).where(ImpactAnalysis.id == UUID(analysis_id))
            )
        ).scalar_one()
        row.action_plan_id = UUID(plan_id)
        row.status = status
        await session.commit()


async def _run_governance_check(plan_id: str, org_id: str, analysis_json: dict, steps: list) -> dict:
    from apps.agents.governance import governance_agent
    from apps.agents._base import run_agent, extract_json

    prompt = (
        f"Review this action plan for governance compliance.\n\n"
        f"Action Plan ID: {plan_id}\n"
        f"Organisation: {org_id}\n\n"
        f"Impact Analysis:\n{json.dumps(analysis_json, indent=2)}\n\n"
        f"Proposed Steps:\n{json.dumps(steps, indent=2)}\n\n"
        f"Call get_risk_threshold to check limits. "
        f"If approval is needed, call request_human_approval with the plan_id and reason."
    )
    result_text = await run_agent(governance_agent, prompt)
    return extract_json(result_text)


async def _publish_plan_created(plan_id: str, org_id: str, analysis_id: str, approval_required: bool) -> None:
    bus = EventBus(settings.REDIS_URL)
    await bus.connect()
    try:
        await bus.publish(
            EventTopic.ACTION_PLAN_CREATED,
            {
                "plan_id": plan_id,
                "organization_id": org_id,
                "analysis_id": analysis_id,
                "approval_required": approval_required,
            },
        )
    finally:
        await bus.disconnect()


@celery_app.task(
    name="workers.tasks.planner_tasks.create_action_plan",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="planning",
)
def create_action_plan(self: Task, analysis_id: str, org_id: str) -> dict[str, Any]:
    """Generate an action plan via ActionPlannerAgent, then run GovernanceAgent."""
    logger.info("Action planning | analysis=%s org=%s", analysis_id, org_id)

    try:
        from apps.agents.action_planner import action_planner_agent
        from apps.agents._base import run_agent, extract_json

        analysis_data = asyncio.run(_fetch_analysis(analysis_id))
        if not analysis_data:
            return {"status": "error", "message": "analysis not found"}

        analysis_json = analysis_data["analysis_json"]

        # 1. Generate action plan
        prompt = (
            f"Create a remediation action plan for this impact analysis.\n\n"
            f"Impact Analysis:\n{json.dumps(analysis_json, indent=2)}\n\n"
            f"Organisation: {org_id}\n\n"
            f"Use check_inventory for affected SKUs and get_supplier_contacts as needed."
        )
        plan_text = asyncio.run(run_agent(action_planner_agent, prompt))
        steps = extract_json(plan_text)
        if not isinstance(steps, list):
            steps = [steps]

        # 2. Governance check
        governance_result = asyncio.run(
            _run_governance_check(
                plan_id="pending",   # ID not yet assigned
                org_id=org_id,
                analysis_json=analysis_json,
                steps=steps,
            )
        )
        approval_required = not governance_result.get("approved_automatically", True)

        # 3. Persist plan
        plan_id = asyncio.run(_save_plan(org_id, steps, approval_required))
        asyncio.run(_link_plan(analysis_id, plan_id, "planned"))
        asyncio.run(_publish_plan_created(plan_id, org_id, analysis_id, approval_required))

        logger.info("Action plan created: %s (approval_required=%s)", plan_id, approval_required)
        return {
            "plan_id": plan_id,
            "analysis_id": analysis_id,
            "approval_required": approval_required,
            "governance": governance_result,
            "status": "created",
        }

    except Exception as exc:
        logger.exception("Action planning failed: %s", exc)
        raise self.retry(exc=exc)
