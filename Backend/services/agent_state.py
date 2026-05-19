# services/agent_state.py
"""
Centralized in-memory operational state for TradeGuard.
Receives events from EventBus handlers and maintains a live snapshot
that is served to the frontend via GET /api/state (initial hydration)
and continuously streamed via SSE.
"""
import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List

from shared.events import TradeGuardEvent, EventSeverity

logger = logging.getLogger(__name__)


class OperationalState:
    """
    Singleton operational memory.  Updated by event handlers, read by SSE gateway.
    """
    MAX_EVENTS = 100

    def __init__(self) -> None:
        self._events: Deque[Dict[str, Any]] = deque(maxlen=self.MAX_EVENTS)
        self._kpi: Dict[str, Any] = {
            "compliance_score": 98.4,
            "compliance_trend": 1.2,
            "active_risks": 12,
            "risks_trend": -4,
            "affected_shipments": 142,
            "shipments_trend": -12,
            "autonomous_actions": 8942,
            "actions_trend": 24,
        }
        self._disruptions: List[Dict[str, Any]] = []
        self._active_alerts: List[Dict[str, Any]] = []
        # Broadcast queue — SSE gateway drains this
        self._broadcast_queue: asyncio.Queue = asyncio.Queue()

    # ── Ingest ────────────────────────────────────────────────────────────────

    def ingest(self, event: TradeGuardEvent) -> None:
        """Called by event handlers to update state and queue for SSE broadcast."""
        record = {
            "id":               str(event.trace_id),
            "topic":            event.topic,
            "title":            event.title,
            "summary":          event.summary,
            "severity":         event.severity,
            "agent":            event.agent,
            "timestamp":        event.timestamp.isoformat(),
            "payload":          event.payload,
            "affected_entities": event.affected_entities,
            "confidence_score": event.confidence_score,
        }
        self._events.appendleft(record)

        # Update derived state
        if event.severity == EventSeverity.CRITICAL:
            self._active_alerts.insert(0, record)
            self._active_alerts = self._active_alerts[:20]
            # Bump risk counter
            self._kpi["active_risks"] = min(self._kpi["active_risks"] + 1, 999)

        if event.severity == EventSeverity.SUCCESS:
            self._kpi["autonomous_actions"] += 1

        # Queue for SSE consumers
        try:
            self._broadcast_queue.put_nowait(record)
        except asyncio.QueueFull:
            logger.warning("Broadcast queue full — dropping oldest SSE event")

    # ── Read ──────────────────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, Any]:
        """Full state snapshot for initial page hydration."""
        return {
            "kpi":          self._kpi,
            "events":       list(self._events)[:50],
            "alerts":       self._active_alerts[:10],
            "disruptions":  self._disruptions[:10],
        }

    async def next_broadcast(self) -> Dict[str, Any]:
        """Block until the next event is ready for SSE broadcast."""
        return await self._broadcast_queue.get()


# Singleton
_state: OperationalState | None = None


def get_state() -> OperationalState:
    global _state
    if _state is None:
        _state = OperationalState()
    return _state
