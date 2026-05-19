# workers/tasks/governance_tasks.py
"""
Governance Celery tasks.
Triggered by action.plan.created — decides whether to auto-execute or hold for human approval.
"""
import asyncio
import logging
from typing import Any
from uuid import UUID

from celery import Task
from sqlalchemy import select

from workers.celery_app import celery_app
from services.db import async_session
from services.models import ActionPlan
from apps.api.core.config import settings

logger = logging.getLogger(__name__)


async def _get_plan_approval_status(plan_id: str) -> dict:
    async with async_session() as session:
        plan = (
            await session.execute(select(ActionPlan).where(ActionPlan.id == UUID(plan_id)))
        ).scalar_one_or_none()
        if not plan:
            return {"found": False}
        return {
            "found": True,
            "approval_required": plan.approval_required == "true",
            "approved_by": plan.approved_by,
            "organization_id": str(plan.organization_id),
        }


@celery_app.task(
    name="workers.tasks.governance_tasks.run_governance_check",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="planning",
)
def run_governance_check(self: Task, plan_event: dict) -> dict[str, Any]:
    """
    Route an action plan after creation:
    - Auto-approved  → dispatch execute_action_plan
    - Needs approval → dispatch send_completion_notification (governance alert)

    The approval decision was already made by GovernanceAgent inside create_action_plan.
    This task reads that decision from the DB and routes accordingly.
    """
    plan_id = plan_event.get("plan_id", "")
    org_id = plan_event.get("organization_id", "")
    logger.info("Governance check | plan=%s", plan_id)

    try:
        plan_info = asyncio.run(_get_plan_approval_status(plan_id))

        if not plan_info["found"]:
            logger.error("Governance: plan %s not found", plan_id)
            return {"plan_id": plan_id, "status": "not_found"}

        approval_required = plan_info["approval_required"]

        if not approval_required:
            # Auto-approved: trigger execution
            from workers.tasks.executor_tasks import execute_action_plan
            execute_action_plan.delay(plan_id=plan_id)
            logger.info("Governance: auto-approved plan %s — execution dispatched", plan_id)
            return {"plan_id": plan_id, "auto_approved": True, "status": "executing"}
        else:
            # Requires human approval: send alert notification
            from workers.tasks.communicator_tasks import send_completion_notification
            send_completion_notification.delay({
                "plan_id": plan_id,
                "organization_id": org_id,
                "summary": {
                    "status": "awaiting_approval",
                    "message": (
                        f"Action plan {plan_id} requires human approval before execution. "
                        "Please review it in the TradeGuard dashboard."
                    ),
                },
            })
            logger.info("Governance: plan %s flagged — approval required alert sent", plan_id)
            return {"plan_id": plan_id, "auto_approved": False, "status": "awaiting_approval"}

    except Exception as exc:
        logger.exception("Governance check failed for plan %s: %s", plan_id, exc)
        raise self.retry(exc=exc)
