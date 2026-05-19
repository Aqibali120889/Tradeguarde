# apps/api/routers/stream.py
"""
Server-Sent Events (SSE) gateway.

GET /api/stream/events
  — Opens a persistent HTTP connection.
  — Subscribes to ALL EventTopics via a dedicated Redis pub/sub connection.
  — Yields events as they arrive from agents.
  — Sends a heartbeat every 15 s to keep the connection alive through proxies.
  — Cleans up on client disconnect.

Architecture:
  Agent → EventBus.publish() → Redis channel
                                      ↓
       SSE consumer (this router) receives message
                                      ↓
       Yields  data: {...}\\n\\n  to browser EventSource
"""
import asyncio
import json
import logging
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from apps.api.core.config import settings
from shared.events import EventTopic

logger = logging.getLogger(__name__)

router = APIRouter()

# All topics the SSE gateway subscribes to
ALL_TOPICS = [t.value for t in EventTopic]
HEARTBEAT_INTERVAL = 15  # seconds


async def _sse_generator(request: Request) -> AsyncGenerator[str, None]:
    """
    Open a dedicated Redis pub/sub connection per SSE client,
    listen for all TradeGuard events, and yield them as SSE frames.
    """
    redis_client: aioredis.Redis | None = None
    pubsub = None

    try:
        redis_client = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        pubsub = redis_client.pubsub(ignore_subscribe_messages=True)
        await pubsub.subscribe(*ALL_TOPICS)

        logger.info("SSE client connected — subscribed to %d topics", len(ALL_TOPICS))

        # Send initial connection confirmation
        yield f"data: {json.dumps({'type': 'connected', 'message': 'TradeGuard stream active'})}\n\n"

        last_heartbeat = asyncio.get_event_loop().time()

        while True:
            # Check client disconnect
            if await request.is_disconnected():
                logger.info("SSE client disconnected")
                break

            # Poll for new message (non-blocking, 100ms timeout)
            message = await pubsub.get_message(timeout=0.1)

            now = asyncio.get_event_loop().time()

            if message:
                data = message.get("data", "")
                if data:
                    yield f"data: {data}\n\n"

            # Heartbeat to keep connection alive through proxies/load balancers
            elif now - last_heartbeat >= HEARTBEAT_INTERVAL:
                yield f": heartbeat {int(now)}\n\n"
                last_heartbeat = now
            else:
                await asyncio.sleep(0.05)

    except asyncio.CancelledError:
        logger.info("SSE generator cancelled (client closed)")
    except Exception as exc:
        logger.exception("SSE generator error: %s", exc)
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
    finally:
        if pubsub:
            try:
                await pubsub.unsubscribe()
                await pubsub.aclose()
            except Exception:
                pass
        if redis_client:
            try:
                await redis_client.aclose()
            except Exception:
                pass
        logger.info("SSE connection cleaned up")


@router.get("/events")
async def stream_events(request: Request) -> StreamingResponse:
    """
    Server-Sent Events endpoint.
    Connect via:  EventSource('/api/stream/events')
    """
    return StreamingResponse(
        _sse_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control":       "no-cache",
            "X-Accel-Buffering":   "no",   # Disable nginx buffering
            "Connection":          "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/state")
async def get_operational_state() -> dict:
    """
    Returns the current in-memory operational snapshot.
    Used by the frontend for initial page hydration before SSE connects.
    """
    from services.agent_state import get_state
    return get_state().snapshot()
