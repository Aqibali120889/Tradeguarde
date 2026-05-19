# workers/tasks/communicator_tasks.py
"""
Communication Celery tasks.
Triggered by execution.completed or governance alerts — sends Slack + email notifications.
"""
import asyncio
import json
import logging
from typing import Any

from celery import Task

from workers.celery_app import celery_app
from apps.api.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(
    name="workers.tasks.communicator_tasks.send_completion_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="execution",
)
def send_completion_notification(self: Task, event_payload: dict) -> dict[str, Any]:
    """
    Send a notification via CommunicationAgent (Slack + email).
    Accepts any execution.completed or governance-alert event payload.

    event_payload keys: plan_id, organization_id, summary
    """
    plan_id = event_payload.get("plan_id", "unknown")
    summary = event_payload.get("summary", {})
    status = summary.get("status", "unknown")

    logger.info("Sending notification | plan=%s status=%s", plan_id, status)

    try:
        from apps.agents.communicator import communication_agent
        from apps.agents._base import run_agent

        # Compose a human-readable prompt for the CommunicationAgent
        if status == "awaiting_approval":
            event_type = "governance.approval_required"
            message = summary.get("message", f"Action plan {plan_id} requires human approval.")
            severity = "high"
        elif status in ("completed", "partial_failure"):
            event_type = "execution.completed"
            steps = summary.get("steps_executed", "?")
            message = f"Action plan {plan_id} execution {status}. Steps executed: {steps}."
            severity = "high" if status == "partial_failure" else "medium"
        else:
            event_type = "pipeline.update"
            message = f"TradeGuard pipeline event: {json.dumps(summary, indent=2)}"
            severity = "low"

        prompt = (
            f"Send a notification for this TradeGuard event.\n\n"
            f"Event type: {event_type}\n"
            f"Severity: {severity}\n"
            f"Message: {message}\n\n"
            f"Organisation ID: {event_payload.get('organization_id', 'N/A')}\n\n"
            f"For high severity, send to both Slack and email. "
            f"For medium, prefer Slack. For low, log only. "
            f"Call get_slack_webhook to retrieve the webhook URL."
        )

        result_text = asyncio.run(run_agent(communication_agent, prompt))
        logger.info("CommunicationAgent response: %s", result_text[:200])
        return {"plan_id": plan_id, "status": "notification_sent", "channel": event_type}

    except Exception as exc:
        logger.exception("Notification failed for plan %s: %s", plan_id, exc)
        raise self.retry(exc=exc)
