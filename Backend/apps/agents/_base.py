# apps/agents/_base.py
"""
Shared ADK setup and agent runner with transparent Featherless fallback.

Primary path:  ADK Runner → Gemini (gemini-2.0-flash-lite, free tier)
Fallback path: FeatherlessClient → Qwen2.5-72B  (if Gemini quota/error)

ADK architecture (Agent / Runner / InMemorySessionService) is preserved in both paths.
The fallback bypasses ADK tool-calling but returns the agent's text response.
"""
import json
import logging
import os
import re
import uuid
from typing import Any

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from apps.api.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ADK setup
# ---------------------------------------------------------------------------

def setup_adk() -> None:
    """Point google-adk at Google AI Studio with the configured API key."""
    os.environ.setdefault("GOOGLE_API_KEY", settings.GEMINI_API_KEY)
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")


# ---------------------------------------------------------------------------
# Featherless fallback
# ---------------------------------------------------------------------------

async def _featherless_fallback(system_instruction: str | None, prompt: str) -> str:
    """
    Call Featherless (Qwen2.5-72B) directly when Gemini is unavailable.
    The agent's system_instruction is preserved as the system prompt.
    """
    from services.ai import get_featherless_client
    client = get_featherless_client()
    return await client.generate(
        prompt=prompt,
        model=settings.FEATHERLESS_FALLBACK_MODEL,
        system_instruction=system_instruction,
        temperature=0.2,
        max_tokens=4096,
    )


# ---------------------------------------------------------------------------
# Core runner — primary Gemini + auto-fallback
# ---------------------------------------------------------------------------

async def run_agent(agent: Agent, prompt: str) -> str:
    """
    Run an ADK Agent and return the final text response.

    1. Tries ADK Runner → Gemini (agent.model).
    2. On ANY exception (quota, model not found, network error, empty response),
       transparently falls back to Featherless without raising.
    """
    setup_adk()

    # ---- Primary: ADK / Gemini ----
    try:
        session_service = InMemorySessionService()
        runner = Runner(
            agent=agent,
            app_name="tradeguard",
            session_service=session_service,
        )
        session = session_service.create_session(
            app_name="tradeguard",
            user_id="system",
        )

        collected: list[str] = []
        async for event in runner.run_async(
            user_id="system",
            session_id=session.id,
            new_message=types.Content(
                role="user",
                parts=[types.Part(text=prompt)],
            ),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        collected.append(part.text)

        result = "".join(collected).strip()
        if result:
            logger.debug("Agent %s responded via Gemini (%s)", agent.name, agent.model)
            return result

        # Empty response counts as a failure — trigger fallback
        raise ValueError("Gemini returned an empty response")

    except Exception as exc:
        logger.warning(
            "Gemini failed for agent '%s' (model=%s) — switching to Featherless (%s). Reason: %s",
            agent.name,
            getattr(agent, "model", "unknown"),
            settings.FEATHERLESS_FALLBACK_MODEL,
            exc,
        )

    # ---- Fallback: Featherless ----
    system_instruction = getattr(agent, "instruction", None)
    result = await _featherless_fallback(system_instruction, prompt)
    logger.info("Agent %s responded via Featherless fallback", agent.name)
    return result


# ---------------------------------------------------------------------------
# JSON extraction helper
# ---------------------------------------------------------------------------

def extract_json(text: str) -> Any:
    """
    Extract JSON from an agent response, stripping markdown fences if present.
    Raises json.JSONDecodeError on parse failure.
    """
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    for start_char, end_char in [("{", "}"), ("[", "]")]:
        idx = cleaned.find(start_char)
        if idx != -1:
            ridx = cleaned.rfind(end_char)
            if ridx != -1:
                return json.loads(cleaned[idx : ridx + 1])
    return json.loads(cleaned)
