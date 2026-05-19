# services/event_bus.py
import asyncio
import logging
from typing import Any, Callable, Coroutine, Dict, List, Optional

import redis.asyncio as aioredis

from shared.events import TradeGuardEvent, EventTopic

logger = logging.getLogger(__name__)


class EventBus:
    """
    Redis Pub/Sub event bus for TradeGuard.
    Publishes TradeGuardEvent envelopes and dispatches them to async handlers.
    """

    def __init__(self, redis_url: str) -> None:
        self._url = redis_url
        self._redis: Optional[aioredis.Redis] = None
        self._pubsub: Optional[aioredis.client.PubSub] = None
        self._handlers: Dict[str, List[Callable]] = {}
        self._listener_task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        self._redis = await aioredis.from_url(
            self._url, encoding="utf-8", decode_responses=True
        )
        self._pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
        logger.info("EventBus connected to %s", self._url)

    async def disconnect(self) -> None:
        if self._listener_task and not self._listener_task.done():
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._pubsub:
            await self._pubsub.close()
        if self._redis:
            await self._redis.aclose()
        logger.info("EventBus disconnected")

    # ------------------------------------------------------------------
    # Publish
    # ------------------------------------------------------------------

    async def publish(
        self, topic: "EventTopic | str", payload: Dict[str, Any]
    ) -> None:
        if not self._redis:
            raise RuntimeError("EventBus.connect() must be called first")
        event = TradeGuardEvent(topic=str(topic), payload=payload)
        await self._redis.publish(str(topic), event.model_dump_json())
        logger.debug("Published to %s trace_id=%s", topic, event.trace_id)

    # ------------------------------------------------------------------
    # Subscribe
    # ------------------------------------------------------------------

    def subscribe(
        self,
        topic: "EventTopic | str",
        callback: Callable[[TradeGuardEvent], Coroutine],
    ) -> None:
        """Register an async callback for a topic. Call before start_listening()."""
        self._handlers.setdefault(str(topic), []).append(callback)
        logger.debug("Subscribed %s → %s", topic, callback.__name__)

    async def start_listening(self) -> None:
        """Subscribe all registered topics on Redis and start background loop."""
        if not self._pubsub:
            raise RuntimeError("EventBus.connect() must be called first")
        if self._handlers:
            await self._pubsub.subscribe(*self._handlers.keys())
        self._listener_task = asyncio.create_task(self._listen_loop())
        logger.info("EventBus listening on: %s", list(self._handlers.keys()))

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _listen_loop(self) -> None:
        try:
            async for message in self._pubsub.listen():
                if message is None:
                    continue
                channel: str = message.get("channel", "")
                data: str = message.get("data", "")
                handlers = self._handlers.get(channel, [])
                if not handlers:
                    continue
                try:
                    event = TradeGuardEvent.model_validate_json(data)
                except Exception as exc:
                    logger.error("Failed to parse event on %s: %s", channel, exc)
                    continue
                for handler in handlers:
                    try:
                        await handler(event)
                    except Exception:
                        logger.exception(
                            "Handler %s failed on topic %s", handler.__name__, channel
                        )
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("EventBus listener crashed")
