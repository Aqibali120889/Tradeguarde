# apps/agents/governance.py
"""
GovernanceAgent — evaluates risk and enforces human approval for high-impact actions.
Sits between ActionPlanner and ExecutionAgent in the pipeline.
"""
import logging
from typing import Any
from uuid import UUID

from google.adk.agents import Agent
from sqlalchemy import select

from apps.api.core.config import settings
from services.db import async_session
from services.models import ActionPlan, Notification
from shared.utils import utcnow

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a governance and compliance safety agent for TradeGuard. \
Review the impact analysis or action plan JSON provided. \
Apply the following rules:
1. If estimated_financial_impact > risk_threshold.max_auto_cost → flag for human approval.
2. If any step has action_type in ["file_exemption", "kraken_trade", "hedge_financial"] → flag.
3. If risk_level is "high" → flag.

Return a JSON object with exactly these fields:
- approved_automatically: bool
- reason: string explaining the decision
- approval_id: string (the action_plan_id) if flagged, else null
- risk_flags: list of string (specific concerns identified)"""


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------

def get_risk_threshold() -> dict[str, Any]:
    """
    Return the organisation's auto-approval risk thresholds.
    In production, this would be fetched from the org's settings table.
    """
    return {
        "max_auto_cost": 50_000,        # USD — above this requires human approval
        "auto_approve_action_types": [  # these are always auto-approved
            "update_documentation",
            "contact_supplier",
        ],
        "always_flag_action_types": [   # these always require human approval
            "file_exemption",
            "hedge_financial",
        ],
    }


async def request_human_approval(action_plan_id: str, reason: str) -> bool:
    """
    Flag an action plan as requiring human approval and create a dashboard notification.
    Sets approval_required=true on the ActionPlan record.

    Args:
        action_plan_id: UUID string of the action plan to flag.
        reason: Human-readable explanation of why approval is required.
    """
    try:
        async with async_session() as session:
            result = await session.execute(
                select(ActionPlan).where(ActionPlan.id == UUID(action_plan_id))
            )
            plan = result.scalar_one_or_none()
            if plan:
                plan.approval_required = "true"
                await session.flush()

            notification = Notification(
                organization_id=plan.organization_id if plan else UUID(action_plan_id),
                event_type="governance.approval_required",
                channel="dashboard",
                content=(
                    f"Action plan {action_plan_id} requires human approval.\n"
                    f"Reason: {reason}"
                ),
                recipient="compliance_team",
                sent_at=utcnow(),
                status="pending",
            )
            session.add(notification)
            await session.commit()

            logger.warning(
                "Governance: human approval required for plan %s — %s",
                action_plan_id, reason,
            )
            return True
    except Exception as exc:
        logger.exception("request_human_approval failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

governance_agent = Agent(
    name="GovernanceAgent",
    model=settings.GEMINI_PRIMARY_MODEL,
    instruction=_SYSTEM_PROMPT,
    tools=[get_risk_threshold, request_human_approval],
)
