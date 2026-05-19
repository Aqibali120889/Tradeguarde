# apps/agents/communicator.py
"""
CommunicationAgent — sends notifications to Slack and/or email at key pipeline milestones.
"""
import logging

from google.adk.agents import Agent

from apps.api.core.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a notification agent for TradeGuard. \
Given an event_type and a message payload (JSON), compose a clear, concise notification \
and send it via the appropriate channel (Slack for high-severity alerts, email for others). \
Return a JSON object: {"channel_used": "slack"|"email"|"both", "success": true|false, "message": "..."}"""


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------

async def send_slack_message(webhook_url: str, text: str) -> bool:
    """
    Post a message to a Slack channel via an Incoming Webhook URL.

    Args:
        webhook_url: The Slack Incoming Webhook URL.
        text: The message text (supports Slack markdown).
    """
    import httpx
    if not webhook_url:
        logger.info("Slack webhook not configured — logging message: %s", text[:100])
        return True
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json={"text": text})
            resp.raise_for_status()
            logger.info("Slack message sent (status %d)", resp.status_code)
            return True
    except Exception as exc:
        logger.error("send_slack_message failed: %s", exc)
        return False


async def send_notification_email(to: str, subject: str, body: str) -> bool:
    """
    Send an email notification via SMTP.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Plain-text email body.
    """
    import smtplib
    from email.mime.text import MIMEText

    if not settings.SMTP_USER:
        logger.info("SMTP not configured — logging email to %s: [%s]", to, subject)
        return True
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(settings.SMTP_FROM, [to], msg.as_string())
        logger.info("Notification email sent to %s", to)
        return True
    except Exception as exc:
        logger.error("send_notification_email failed: %s", exc)
        return False


def get_slack_webhook() -> str:
    """Return the configured Slack webhook URL from settings."""
    return settings.SLACK_WEBHOOK_URL


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

communication_agent = Agent(
    name="CommunicationAgent",
    model=settings.GEMINI_PRIMARY_MODEL,
    instruction=_SYSTEM_PROMPT,
    tools=[send_slack_message, send_notification_email, get_slack_webhook],
)
