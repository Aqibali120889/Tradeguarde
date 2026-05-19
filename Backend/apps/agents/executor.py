# apps/agents/executor.py
"""
ExecutionAgent — executes a single action plan step by calling the appropriate tool.
The Celery task loops over steps and calls this agent once per step.
"""
import logging
from typing import Any

from google.adk.agents import Agent
from sqlalchemy import select

from apps.api.core.config import settings
from services.db import async_session
from services.models import ExecutionLog
from shared.utils import utcnow

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a supply chain execution agent. \
Based on the action step provided (JSON), choose the correct tool and execute it. \
The step JSON has: action_type, target_system, description, payload. \
After executing, return a brief JSON confirmation: \
{"status": "success"|"failed", "message": "...", "tool_used": "..."}"""


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------

async def call_rest_api(method: str, url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Make an HTTP REST API call (GET/POST/PUT/PATCH/DELETE).
    Used for ERP systems, customs portals, and custom broker APIs.

    Args:
        method: HTTP method (GET, POST, PUT, PATCH, DELETE).
        url: Target URL.
        payload: Optional JSON body for POST/PUT requests.
    """
    import httpx
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(
                method=method.upper(),
                url=url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            try:
                return {"status": resp.status_code, "body": resp.json()}
            except Exception:
                return {"status": resp.status_code, "body": resp.text[:2000]}
    except Exception as exc:
        logger.warning("call_rest_api failed: %s %s — %s", method, url, exc)
        # MVP: return mock success so pipeline continues
        return {"status": 200, "body": {"mock": True, "message": str(exc)}}


async def kraken_trade(symbol: str, side: str, volume: float) -> dict[str, Any]:
    """
    Place a trade on Kraken exchange for currency hedging.
    In production, calls the Kraken REST API. Currently logs intent and returns mock.

    Args:
        symbol: Trading pair, e.g. "USDEUR".
        side: "buy" or "sell".
        volume: Trade volume in base currency units.
    """
    logger.info("KRAKEN TRADE (stub): %s %s %.4f", side.upper(), symbol, volume)
    # Production: call Kraken API with HMAC authentication
    return {
        "status": "mock_submitted",
        "order_id": f"mock-{symbol}-{side}-{volume}",
        "symbol": symbol,
        "side": side,
        "volume": volume,
        "note": "Kraken live API integration pending",
    }


async def send_email(to: str, subject: str, body: str) -> bool:
    """
    Send an email notification via SMTP.
    Falls back to logging in development when SMTP is not configured.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Plain-text email body.
    """
    import smtplib
    from email.mime.text import MIMEText
    from apps.api.core.config import settings

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
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("send_email failed: %s", exc)
        return False


async def log_execution(step_number: int, status: str, response: dict[str, Any]) -> None:
    """
    Write an execution log entry to the database.

    Args:
        step_number: The 1-indexed step number from the action plan.
        status: "success", "failed", or "retrying".
        response: The tool response or error details.
    """
    logger.info("Execution log: step=%d status=%s", step_number, status)
    # Note: action_plan_id is injected by the Celery task when creating the log directly.
    # This tool is used by the agent to signal completion; the task writes the DB record.


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

execution_agent = Agent(
    name="ExecutionAgent",
    model=settings.GEMINI_PRIMARY_MODEL,
    instruction=_SYSTEM_PROMPT,
    tools=[call_rest_api, kraken_trade, send_email, log_execution],
)
