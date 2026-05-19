# workers/tasks/executor_tasks.py
"""
Execution Celery tasks — calls ExecutionAgent once per action plan step.
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
from services.models import ActionPlan, ExecutionLog
from services.event_bus import EventBus
from shared.events import EventTopic
from shared.utils import utcnow
from apps.api.core.config import settings

logger = logging.getLogger(__name__)


async def _get_plan(plan_id: str) -> ActionPlan | None:
    async with async_session() as session:
        return (
            await session.execute(select(ActionPlan).where(ActionPlan.id == UUID(plan_id)))
        ).scalar_one_or_none()


async def _write_log(plan_id: str, step_index: int, details: dict, response: dict, status: str) -> None:
    async with async_session() as session:
        session.add(ExecutionLog(
            action_plan_id=UUID(plan_id),
            step_index=step_index,
            api_call_details=details,
            response=response,
            status=status,
            timestamp=utcnow(),
        ))
        await session.commit()


async def _mark_plan_executed(plan_id: str) -> None:
    async with async_session() as session:
        plan = (
            await session.execute(select(ActionPlan).where(ActionPlan.id == UUID(plan_id)))
        ).scalar_one()
        plan.executed_at = utcnow()
        await session.commit()


async def _execute_step(step: dict, step_index: int) -> dict:
    """Run ExecutionAgent for a single step and return the parsed result."""
    from apps.agents.executor import execution_agent
    from apps.agents._base import run_agent, extract_json

    prompt = (
        f"Execute the following action plan step:\n\n"
        f"{json.dumps(step, indent=2)}\n\n"
        f"Step index: {step_index}\n"
        f"Choose the appropriate tool based on action_type and target_system, "
        f"then return a JSON confirmation."
    )
    result_text = await run_agent(execution_agent, prompt)
    try:
        return extract_json(result_text)
    except Exception:
        return {"status": "success", "message": result_text[:500]}


async def _publish_execution_completed(plan_id: str, org_id: str, summary: dict) -> None:
    bus = EventBus(settings.REDIS_URL)
    await bus.connect()
    try:
        await bus.publish(
            EventTopic.EXECUTION_COMPLETED,
            {"plan_id": plan_id, "organization_id": str(org_id), "summary": summary},
        )
    finally:
        await bus.disconnect()


@celery_app.task(
    name="workers.tasks.executor_tasks.execute_action_plan",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="execution",
)
def execute_action_plan(self: Task, plan_id: str) -> dict[str, Any]:
    """Execute all steps of an approved action plan using ExecutionAgent."""
    logger.info("Execution started | plan=%s", plan_id)

    plan = asyncio.run(_get_plan(plan_id))
    if not plan:
        return {"plan_id": plan_id, "status": "not_found"}
    if plan.approval_required == "true" and not plan.approved_by:
        logger.warning("Plan %s awaiting human approval — deferring", plan_id)
        return {"plan_id": plan_id, "status": "awaiting_approval"}

    steps: list = plan.steps or []
    results: list[dict] = []
    any_failed = False

    for idx, step in enumerate(steps):
        try:
            outcome = asyncio.run(_execute_step(step, idx))
            log_status = "failed" if outcome.get("status") == "failed" else "success"
        except Exception as exc:
            logger.exception("Step %d failed: %s", idx, exc)
            outcome = {"status": "failed", "error": str(exc)}
            log_status = "failed"
            any_failed = True

        asyncio.run(_write_log(plan_id, idx, {"step": step}, outcome, log_status))
        results.append({"step_index": idx, **outcome})

        if log_status == "failed":
            logger.warning("Step %d failed — stopping execution of plan %s", idx, plan_id)
            any_failed = True
            break

    asyncio.run(_mark_plan_executed(plan_id))

    final_status = "partial_failure" if any_failed else "completed"
    summary = {"plan_id": plan_id, "steps_executed": len(results), "status": final_status}
    asyncio.run(_publish_execution_completed(plan_id, str(plan.organization_id), summary))

    logger.info("Execution %s | plan=%s", final_status, plan_id)
    return {**summary, "results": results}


@celery_app.task(
    name="workers.tasks.executor_tasks.retry_failed_step",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="execution",
)
def retry_failed_step(self: Task, plan_id: str, step_index: int) -> dict[str, Any]:
    """Retry a single previously-failed execution step."""
    plan = asyncio.run(_get_plan(plan_id))
    if not plan or not plan.steps or step_index >= len(plan.steps):
        return {"plan_id": plan_id, "step_index": step_index, "status": "invalid"}

    try:
        step = plan.steps[step_index]
        outcome = asyncio.run(_execute_step(step, step_index))
        log_status = "success" if outcome.get("status") != "failed" else "failed"
        asyncio.run(_write_log(plan_id, step_index, {"step": step, "retry": True}, outcome, log_status))
        return {"plan_id": plan_id, "step_index": step_index, "status": log_status, **outcome}
    except Exception as exc:
        logger.exception("Retry failed: %s", exc)
        raise self.retry(exc=exc)
