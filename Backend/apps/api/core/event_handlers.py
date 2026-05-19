# apps/api/core/event_handlers.py
"""
Phase 5 — Autonomous pipeline event handlers.

Each handler is triggered by a Redis Pub/Sub event and dispatches
the appropriate Celery task, keeping the FastAPI async loop non-blocking.

Pipeline flow:
  regulation.detected
    → run_impact_analysis  (per org)
    → impact.analysis.completed
      → create_action_plan
      → action.plan.created
        → run_governance_check
          [auto-approved] → execute_action_plan
          [needs approval] → send_completion_notification (alert)
        → execution.completed
          → send_completion_notification (success)
"""
import asyncio
import logging

from shared.events import EventTopic, TradeGuardEvent
from services.agent_state import get_state

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# listen_channel — thin adapter between EventBus and handler functions
# ---------------------------------------------------------------------------

async def listen_channel(event_bus, channel: str, handler) -> None:
    """
    Subscribe handler to a Redis channel via the EventBus.
    Each incoming message's payload dict is passed to `await handler(payload)`.
    One exception in a handler does NOT affect other channels.
    """
    async def _adapter(event: TradeGuardEvent) -> None:
        # Feed every event into the operational state (→ SSE broadcast queue)
        try:
            get_state().ingest(event)
        except Exception:
            logger.exception("OperationalState.ingest() failed for topic '%s'", channel)
        try:
            await handler(event.payload)
        except Exception:
            logger.exception(
                "Handler '%s' raised on channel '%s'", handler.__name__, channel
            )

    _adapter.__name__ = f"{handler.__name__}__adapter"
    event_bus.subscribe(channel, _adapter)
    logger.info("Registered handler '%s' → channel '%s'", handler.__name__, channel)


# ---------------------------------------------------------------------------
# Individual handlers  (receive the TradeGuardEvent payload dict)
# ---------------------------------------------------------------------------

async def handle_regulation_detected(payload: dict) -> None:
    """
    Trigger ImpactAnalyzer for every organisation in the DB.
    payload keys: regulation_id, title, source_url
    """
    from sqlalchemy import select
    from services.db import async_session
    from services.models import Organization
    from workers.tasks.analyzer_tasks import run_impact_analysis

    regulation_id = payload.get("regulation_id")
    if not regulation_id:
        logger.warning("regulation.detected payload missing regulation_id — skipping")
        return

    # Dispatch one analysis task per organization
    try:
        async with async_session() as session:
            orgs = (await session.execute(select(Organization))).scalars().all()
    except Exception as exc:
        logger.error("DB query failed in handle_regulation_detected: %s", exc)
        return

    if not orgs:
        logger.warning(
            "No organisations in DB — skipping impact analysis for regulation %s",
            regulation_id,
        )
        return

    for org in orgs:
        run_impact_analysis.delay(
            regulation_id=regulation_id,
            org_id=str(org.id),
        )
        logger.info(
            "Dispatched run_impact_analysis | regulation=%s org=%s",
            regulation_id, org.id,
        )


async def handle_impact_completed(payload: dict) -> None:
    """
    Trigger ActionPlanner when an impact analysis finishes.
    payload keys: analysis_id, organization_id, regulation_id
    """
    from workers.tasks.planner_tasks import create_action_plan

    analysis_id = payload.get("analysis_id")
    org_id = payload.get("organization_id")
    if not analysis_id or not org_id:
        logger.warning("impact.analysis.completed payload missing fields — skipping")
        return

    create_action_plan.delay(analysis_id=analysis_id, org_id=org_id)
    logger.info("Dispatched create_action_plan | analysis=%s org=%s", analysis_id, org_id)


async def handle_plan_created(payload: dict) -> None:
    """
    Route to GovernanceAgent which then triggers execution or sends approval alert.
    payload keys: plan_id, organization_id, analysis_id, approval_required
    """
    from workers.tasks.governance_tasks import run_governance_check

    plan_id = payload.get("plan_id")
    if not plan_id:
        logger.warning("action.plan.created payload missing plan_id — skipping")
        return

    run_governance_check.delay(payload)
    logger.info("Dispatched run_governance_check | plan=%s", plan_id)


async def handle_execution_completed(payload: dict) -> None:
    """
    Send completion notification when execution finishes.
    payload keys: plan_id, organization_id, summary
    """
    from workers.tasks.communicator_tasks import send_completion_notification

    send_completion_notification.delay(payload)
    logger.info(
        "Dispatched send_completion_notification | plan=%s status=%s",
        payload.get("plan_id"),
        payload.get("summary", {}).get("status"),
    )


# ---------------------------------------------------------------------------
# start_event_listeners — registers all handlers before EventBus.start_listening()
# ---------------------------------------------------------------------------

async def start_event_listeners(event_bus) -> None:
    """
    Register all autonomous pipeline handlers with the EventBus.
    Must be called BEFORE event_bus.start_listening().
    """
    await listen_channel(event_bus, EventTopic.REGULATION_DETECTED,        handle_regulation_detected)
    await listen_channel(event_bus, EventTopic.IMPACT_ANALYSIS_COMPLETED, handle_impact_completed)
    await listen_channel(event_bus, EventTopic.ACTION_PLAN_CREATED,        handle_plan_created)
    await listen_channel(event_bus, EventTopic.EXECUTION_COMPLETED,        handle_execution_completed)
    logger.info("All autonomous pipeline event listeners registered")
