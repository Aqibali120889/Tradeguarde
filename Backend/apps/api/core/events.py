# apps/api/core/events.py
import logging

from fastapi import FastAPI

from services.event_bus import EventBus
from services.ai import get_gemini_client, get_featherless_client
from services.qdrant_client import get_qdrant_service
from services.minio_client import get_minio_service
from apps.api.core.config import settings

logger = logging.getLogger(__name__)


def create_startup_handler(app: FastAPI):
    async def startup():
        logger.info("TradeGuard API starting up ...")

        # --- Event Bus (Redis) — warn but continue if not available ---
        event_bus = EventBus(settings.REDIS_URL)
        try:
            await event_bus.connect()
        except Exception as exc:
            logger.warning("Redis not available at startup (continuing): %s", exc)
        app.state.event_bus = event_bus

        # --- AI Clients (lazy — no network call at startup) ---
        app.state.gemini = get_gemini_client()
        app.state.featherless = get_featherless_client()

        # --- Qdrant — warn but continue if not available ---
        qdrant = get_qdrant_service()
        try:
            await qdrant.ensure_collection()
        except Exception as exc:
            logger.warning("Qdrant not available at startup (continuing): %s", exc)
        app.state.qdrant = qdrant

        # --- MinIO — warn but continue if not available ---
        minio = get_minio_service()
        try:
            minio.ensure_bucket()
        except Exception as exc:
            logger.warning("MinIO not available at startup (continuing): %s", exc)
        app.state.minio = minio

        # --- Start Redis event listener with autonomous pipeline handlers ---
        try:
            from apps.api.core.event_handlers import start_event_listeners
            await start_event_listeners(event_bus)   # register handlers first
            await event_bus.start_listening()         # then subscribe to Redis channels
        except Exception as exc:
            logger.warning("EventBus listener could not start: %s", exc)

        logger.info("TradeGuard API startup complete")

    return startup


def create_shutdown_handler(app: FastAPI):
    async def shutdown():
        logger.info("TradeGuard API shutting down ...")

        event_bus: EventBus = getattr(app.state, "event_bus", None)
        if event_bus:
            try:
                await event_bus.disconnect()
            except Exception:
                pass

        qdrant = getattr(app.state, "qdrant", None)
        if qdrant:
            try:
                await qdrant.close()
            except Exception:
                pass

        featherless = getattr(app.state, "featherless", None)
        if featherless:
            try:
                await featherless.aclose()
            except Exception:
                pass

        logger.info("TradeGuard API shutdown complete")

    return shutdown