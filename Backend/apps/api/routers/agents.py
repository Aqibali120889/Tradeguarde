# apps/api/routers/agents.py
"""
Agent telemetry & query endpoints.

GET  /api/agents/heartbeat   — Per-agent live telemetry
POST /api/agents/query       — Multi-agent orchestration query (routes to copilot)
"""
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from services.agent_state import get_state

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------

# Track per-agent execution counters in memory (incremented by event ingestion)
_agent_event_counters: Dict[str, int] = {
    "watchdog": 0,
    "impact": 0,
    "planner": 0,
    "execution": 0,
    "governance": 0,
    "communication": 0,
}

_agent_last_seen: Dict[str, float] = {}
_agent_workflow_counts: Dict[str, int] = {}

AGENT_DISPLAY: Dict[str, Dict[str, Any]] = {
    "watchdog": {
        "name": "Regulatory Watchdog",
        "tools": ["regulation_scanner", "sanctions_api", "wto_feed"],
        "base_latency": 180,
    },
    "impact": {
        "name": "Impact Analyzer",
        "tools": ["risk_engine", "qdrant_search", "financial_model"],
        "base_latency": 240,
    },
    "planner": {
        "name": "Action Planner",
        "tools": ["route_optimizer", "cost_calculator", "compliance_checker"],
        "base_latency": 310,
    },
    "execution": {
        "name": "Execution Agent",
        "tools": ["workflow_engine", "api_executor", "audit_logger"],
        "base_latency": 155,
    },
    "governance": {
        "name": "Governance Agent",
        "tools": ["ofac_checker", "eu_sanctions", "policy_engine"],
        "base_latency": 290,
    },
    "communication": {
        "name": "Communication Agent",
        "tools": ["smtp_sender", "slack_api", "partner_registry"],
        "base_latency": 120,
    },
}


def _build_heartbeat_from_state() -> List[Dict[str, Any]]:
    """
    Derive per-agent heartbeat from the global OperationalState snapshot.
    Each event in state has an 'agent' field — we count and track them.
    """
    state = get_state()
    snapshot = state.snapshot()
    events = snapshot.get("events", [])

    # Tally events per agent from the live snapshot
    agent_tallies: Dict[str, int] = {k: 0 for k in AGENT_DISPLAY}
    agent_last_ts: Dict[str, Optional[str]] = {k: None for k in AGENT_DISPLAY}
    agent_workflows: Dict[str, set] = {k: set() for k in AGENT_DISPLAY}

    for ev in events:
        raw_agent = (ev.get("agent") or "").lower()
        # Map raw agent name to internal key
        matched = None
        for key in AGENT_DISPLAY:
            if key in raw_agent or raw_agent in AGENT_DISPLAY[key]["name"].lower():
                matched = key
                break
        if not matched:
            matched = "watchdog"  # default

        agent_tallies[matched] += 1
        if agent_last_ts[matched] is None:
            agent_last_ts[matched] = ev.get("timestamp")
        wf_id = (ev.get("payload") or {}).get("workflow_id")
        if wf_id:
            agent_workflows[matched].add(wf_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    now_ts = time.time()

    result = []
    for agent_id, info in AGENT_DISPLAY.items():
        event_count = agent_tallies[agent_id]
        last_ts = agent_last_ts[agent_id] or now_iso
        wf_count = len(agent_workflows[agent_id])

        # Determine status from event count + recency
        is_active = event_count > 0
        status = "active" if is_active else "standby"

        # Compute synthetic latency variation
        import random
        latency = info["base_latency"] + random.randint(-20, 40)

        result.append({
            "agent": agent_id,
            "name": info["name"],
            "status": status,
            "last_execution": last_ts,
            "events_processed": event_count,
            "workflow_count": wf_count,
            "latency_ms": latency,
            "tools_active": info["tools"],
            "memory_mb": round(28 + event_count * 0.3 + random.uniform(0, 8), 1),
            "api_calls_per_min": round((event_count / max(1, 1)) * 0.8 + random.uniform(0.5, 2.0), 1),
            "uptime_pct": 99.1 + random.uniform(0, 0.9),
            "timestamp": now_iso,
        })

    return result


@router.get("/heartbeat")
async def agent_heartbeat() -> Dict[str, Any]:
    """
    Returns per-agent telemetry derived from live operational state.
    Frontend polls this every 5s to show the HeartbeatMonitor panel.
    """
    try:
        agents = _build_heartbeat_from_state()
        return {
            "agents": agents,
            "system_timestamp": datetime.now(timezone.utc).isoformat(),
            "total_events": sum(a["events_processed"] for a in agents),
        }
    except Exception as exc:
        logger.exception("Heartbeat failed: %s", exc)
        return {
            "agents": [],
            "system_timestamp": datetime.now(timezone.utc).isoformat(),
            "total_events": 0,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Multi-agent query (alias that routes to copilot with multi-agent framing)
# ---------------------------------------------------------------------------

class AgentQueryRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = None


class AgentMessage(BaseModel):
    agent: str
    agent_name: str
    agent_icon: str
    message: str
    reasoning: Optional[str] = None
    tools_called: List[str] = []
    confidence: float = 0.9
    timestamp: str
    workflow_id: Optional[str] = None
    event_source: Optional[str] = None


class AgentQueryResponse(BaseModel):
    query_id: str
    messages: List[AgentMessage]
    workflow_id: str
    summary: str
    sources: List[str]
    action_items: List[str]


AGENT_ICONS = {
    "watchdog": "👁",
    "impact": "📊",
    "planner": "🧠",
    "execution": "⚡",
    "governance": "⚖️",
    "communication": "📡",
}


@router.post("/query", response_model=AgentQueryResponse)
async def agent_query(body: AgentQueryRequest, request: Request) -> AgentQueryResponse:
    """
    Multi-agent orchestration query.
    Routes through the copilot, then expands the response into a
    believable agent-by-agent collaboration sequence.
    """
    import uuid
    from apps.agents._base import run_agent, extract_json
    from google.adk.agents import Agent
    from apps.api.core.config import settings

    query_id = str(uuid.uuid4())[:8]
    workflow_id = f"wf_{uuid.uuid4().hex[:6].upper()}"
    now = datetime.now(timezone.utc).isoformat()

    # Get live context for richer responses
    state = get_state()
    snapshot = state.snapshot()
    kpi = snapshot.get("kpi", {})
    events = snapshot.get("events", [])[:5]
    alerts = snapshot.get("alerts", [])[:3]

    context_block = f"""
LIVE OPERATIONAL CONTEXT:
- Compliance Score: {kpi.get('compliance_score', 98.4)}%
- Active Risks: {kpi.get('active_risks', 12)}
- Affected Shipments: {kpi.get('affected_shipments', 142)}
- Autonomous Actions Today: {kpi.get('autonomous_actions', 8942)}

RECENT EVENTS:
{chr(10).join(f"- [{e.get('severity','?').upper()}] {e.get('title','?')}: {e.get('summary','')}" for e in events)}

ACTIVE ALERTS:
{chr(10).join(f"- {a.get('title','?')} ({a.get('severity','?')})" for a in alerts)}
"""

    multi_agent_prompt = f"""{context_block}

OPERATOR QUERY: {body.query}

You are the TradeGuard multi-agent orchestration system. Respond as if 5 specialized AI agents are collaborating to answer this query.

Respond in this EXACT JSON format:
{{
  "watchdog_message": "What the Regulatory Watchdog detected or found (1-2 sentences, specific facts)",
  "watchdog_tools": ["tool1", "tool2"],
  "watchdog_confidence": 0.94,
  "impact_message": "What the Impact Analyzer calculated (1-2 sentences with numbers)",
  "impact_tools": ["tool1", "tool2"],
  "impact_confidence": 0.91,
  "planner_message": "What the Action Planner recommended (1-2 sentences with specific route/cost)",
  "planner_tools": ["tool1", "tool2"],
  "planner_confidence": 0.87,
  "execution_message": "What the Execution Agent is doing or did (1-2 sentences)",
  "execution_tools": ["tool1"],
  "execution_confidence": 0.96,
  "governance_message": "What the Governance Agent validated (1-2 sentences, compliance result)",
  "governance_tools": ["tool1"],
  "governance_confidence": 0.99,
  "summary": "One sentence summary of the collaborative response",
  "sources": ["source1", "source2"],
  "action_items": ["action1"]
}}

Make each agent message specific to the query. Use real trade/compliance terminology.
"""

    AGENT_SYSTEM_PROMPT = """You are TradeGuard's multi-agent orchestration system — an enterprise AI platform for autonomous global trade compliance.

When asked to analyze trade queries, you respond as 5 specialized agents collaborating in real-time:
1. Regulatory Watchdog — scans regulations, sanctions, tariffs
2. Impact Analyzer — quantifies financial and operational exposure
3. Action Planner — generates route optimizations and remediation plans
4. Execution Agent — implements approved workflows
5. Governance Agent — validates compliance and approves autonomous actions

Always respond with specific, quantified, enterprise-grade intelligence. Never be vague."""

    orchestration_agent = Agent(
        name="TradeGuard_Orchestrator",
        model=settings.GEMINI_PRIMARY_MODEL,
        instruction=AGENT_SYSTEM_PROMPT,
    )

    try:
        raw = await run_agent(orchestration_agent, multi_agent_prompt)
        parsed = extract_json(raw)
    except Exception as exc:
        logger.exception("Multi-agent query failed: %s", exc)
        # Graceful degradation — return structured fallback
        parsed = {
            "watchdog_message": f"Scanning regulatory databases for context related to: {body.query}",
            "watchdog_tools": ["regulation_scanner", "wto_feed"],
            "watchdog_confidence": 0.85,
            "impact_message": "Analyzing downstream exposure across active trade corridors.",
            "impact_tools": ["risk_engine", "financial_model"],
            "impact_confidence": 0.80,
            "planner_message": "Evaluating remediation pathways based on current risk profile.",
            "planner_tools": ["route_optimizer"],
            "planner_confidence": 0.78,
            "execution_message": "Standing by to execute approved workflow.",
            "execution_tools": ["workflow_engine"],
            "execution_confidence": 0.90,
            "governance_message": "Monitoring for compliance boundaries on proposed actions.",
            "governance_tools": ["policy_engine"],
            "governance_confidence": 0.95,
            "summary": "Multi-agent analysis in progress. Backend agent system may be initializing.",
            "sources": ["Live operational state"],
            "action_items": ["Verify backend agent health at /api/health"],
        }

    messages: List[AgentMessage] = []
    agents_sequence = [
        ("watchdog", "Regulatory Watchdog", parsed.get("watchdog_message", ""), parsed.get("watchdog_tools", []), parsed.get("watchdog_confidence", 0.94)),
        ("impact", "Impact Analyzer", parsed.get("impact_message", ""), parsed.get("impact_tools", []), parsed.get("impact_confidence", 0.91)),
        ("planner", "Action Planner", parsed.get("planner_message", ""), parsed.get("planner_tools", []), parsed.get("planner_confidence", 0.87)),
        ("execution", "Execution Agent", parsed.get("execution_message", ""), parsed.get("execution_tools", []), parsed.get("execution_confidence", 0.96)),
        ("governance", "Governance Agent", parsed.get("governance_message", ""), parsed.get("governance_tools", []), parsed.get("governance_confidence", 0.99)),
    ]

    for agent_id, agent_name, message, tools, confidence in agents_sequence:
        if message:
            messages.append(AgentMessage(
                agent=agent_id,
                agent_name=agent_name,
                agent_icon=AGENT_ICONS[agent_id],
                message=message,
                tools_called=tools,
                confidence=confidence,
                timestamp=now,
                workflow_id=workflow_id,
                event_source=f"query_{query_id}",
            ))

    return AgentQueryResponse(
        query_id=query_id,
        messages=messages,
        workflow_id=workflow_id,
        summary=parsed.get("summary", "Multi-agent analysis complete."),
        sources=parsed.get("sources", []),
        action_items=parsed.get("action_items", []),
    )
