# apps/api/routers/copilot.py
"""
Operations Copilot endpoint.

POST /api/copilot/ask
  Body: { "query": "...", "context": { live_state_snapshot } }
  Returns structured intelligence response from the agent system.
"""
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from apps.api.dependencies import get_event_bus
from apps.agents._base import run_agent
from google.adk.agents import Agent
from apps.api.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class CopilotRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = None   # Live Zustand snapshot passed by frontend


class CopilotResponse(BaseModel):
    answer: str
    reasoning: str
    confidence: float
    sources: list[str]
    action_items: list[str]


COPILOT_SYSTEM_PROMPT = """
You are TradeGuard's Operational Intelligence Copilot — an enterprise AI embedded in an 
autonomous global trade compliance platform.

You have access to live operational context including:
- Active trade route disruptions
- Current risk alerts and sanctions flags  
- Autonomous agent actions taken
- KPI metrics (compliance score, active risks, affected shipments)
- Recent regulations detected by the watchdog system

Your role is to provide precise, structured intelligence answers to operators.

RESPONSE FORMAT (always respond in this exact JSON structure):
{
  "answer": "Direct answer to the query in 2-3 sentences",
  "reasoning": "Brief explanation of how you reached this conclusion (1-2 sentences)",
  "confidence": 0.85,
  "sources": ["List of data sources used"],
  "action_items": ["Specific recommended actions if any"]
}

Tone: analytical, precise, enterprise-grade. NOT conversational. NOT a chatbot.
"""


@router.post("/ask", response_model=CopilotResponse)
async def copilot_ask(body: CopilotRequest, request: Request) -> CopilotResponse:
    """
    Answer an operational intelligence query using live context + AI reasoning.
    """
    # Build context-enriched prompt
    context_block = ""
    if body.context:
        kpi = body.context.get("kpi", {})
        events = body.context.get("events", [])[:5]
        alerts = body.context.get("alerts", [])[:3]

        context_block = f"""
LIVE OPERATIONAL CONTEXT:
- Compliance Score: {kpi.get('compliance_score', 'N/A')}%
- Active Risks: {kpi.get('active_risks', 'N/A')}
- Affected Shipments: {kpi.get('affected_shipments', 'N/A')}
- Autonomous Actions Today: {kpi.get('autonomous_actions', 'N/A')}

RECENT EVENTS ({len(events)} shown):
{chr(10).join(f"- [{e.get('severity','?').upper()}] {e.get('title','?')}: {e.get('summary','')}" for e in events)}

ACTIVE ALERTS ({len(alerts)} shown):
{chr(10).join(f"- {a.get('title','?')} ({a.get('severity','?')})" for a in alerts)}
"""

    prompt = f"""{context_block}

OPERATOR QUERY: {body.query}

Respond in the exact JSON format specified in your instructions.
"""

    copilot_agent = Agent(
        name="TradeGuard_Copilot",
        model=settings.GEMINI_PRIMARY_MODEL,
        instruction=COPILOT_SYSTEM_PROMPT,
    )

    try:
        raw = await run_agent(copilot_agent, prompt)
        from apps.agents._base import extract_json
        parsed = extract_json(raw)
        return CopilotResponse(
            answer=parsed.get("answer", raw[:400]),
            reasoning=parsed.get("reasoning", ""),
            confidence=float(parsed.get("confidence", 0.8)),
            sources=parsed.get("sources", ["Live operational state", "Agent event stream"]),
            action_items=parsed.get("action_items", []),
        )
    except Exception as exc:
        logger.exception("Copilot agent failed: %s", exc)
        return CopilotResponse(
            answer="Unable to process query at this time. Agent system is reconnecting.",
            reasoning="Agent inference failed — check backend logs.",
            confidence=0.0,
            sources=[],
            action_items=["Check backend agent health at /api/health"],
        )
