# shared/events.py
"""
Standardized event envelope for all TradeGuard agent-to-frontend communication.
All agents MUST publish using TradeGuardEvent so the SSE gateway can relay them.
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class EventTopic(str, Enum):
    # ── Core pipeline ──────────────────────────────────────────────────
    REGULATION_DETECTED        = "regulation.detected"
    IMPACT_ANALYSIS_COMPLETED  = "impact.analysis.completed"
    ACTION_PLAN_CREATED        = "action.plan.created"
    EXECUTION_COMPLETED        = "execution.completed"
    GOVERNANCE_ALERT           = "governance.alert"

    # ── Phase 1: External data integrations ───────────────────────────
    SANCTIONS_DETECTED         = "sanctions.detected"
    RISK_CREATED               = "risk.created"
    WATCHDOG_SCAN_STARTED      = "watchdog.scan.started"
    WATCHDOG_SCAN_COMPLETED    = "watchdog.scan.completed"

    # ── Extended operational events (Phase 2 — frontend streaming) ────
    TARIFF_CHANGE              = "tariff.change"
    SHIPMENT_REROUTED          = "shipment.rerouted"
    RISK_SCORE_UPDATED         = "risk.score.updated"
    TRADE_LANE_DISRUPTION      = "trade_lane.disruption"
    SUPPLIER_RISK_DETECTED     = "supplier.risk.detected"
    AGENT_HEARTBEAT            = "agent.heartbeat"
    KPI_UPDATED                = "kpi.updated"


class EventSeverity(str, Enum):
    INFO     = "info"
    WARNING  = "warning"
    CRITICAL = "critical"
    SUCCESS  = "success"


class TradeGuardEvent(BaseModel):
    """
    Standardized envelope for ALL events published by TradeGuard agents.
    The SSE gateway serializes this verbatim and sends it to the frontend.
    """
    # ── Routing ───────────────────────────────────────────────────────
    topic:             str
    trace_id:          UUID = Field(default_factory=uuid4)
    timestamp:         datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # ── Display (required for frontend rendering) ─────────────────────
    title:             str = ""
    summary:           str = ""
    severity:          EventSeverity = EventSeverity.INFO
    agent:             str = "system"

    # ── Intelligence payload (freeform per agent) ─────────────────────
    payload:           Dict[str, Any] = Field(default_factory=dict)

    # ── Operational metadata ──────────────────────────────────────────
    affected_entities: List[str] = Field(default_factory=list)
    confidence_score:  float = 1.0  # 0.0 – 1.0

    def to_sse_data(self) -> str:
        """Serialize for SSE wire format."""
        return self.model_dump_json()
