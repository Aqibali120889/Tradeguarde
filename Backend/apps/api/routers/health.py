# apps/api/routers/health.py
import logging

from fastapi import APIRouter, Request
from sqlalchemy import text

from services.db import async_session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", summary="System health check")
async def health_check(request: Request) -> dict:
    status: dict = {"status": "ok", "services": {}}

    # --- Database ---
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        status["services"]["database"] = "ok"
    except Exception as exc:
        status["services"]["database"] = f"error: {exc}"
        status["status"] = "degraded"

    # --- Redis ---
    try:
        event_bus = request.app.state.event_bus
        await event_bus._redis.ping()
        status["services"]["redis"] = "ok"
    except Exception as exc:
        status["services"]["redis"] = f"error: {exc}"
        status["status"] = "degraded"

    # --- Qdrant ---
    try:
        qdrant = request.app.state.qdrant
        cols = await qdrant._client.get_collections()
        status["services"]["qdrant"] = f"ok ({len(cols.collections)} collections)"
    except Exception as exc:
        status["services"]["qdrant"] = f"error: {exc}"
        status["status"] = "degraded"

    # --- MinIO ---
    try:
        minio = request.app.state.minio
        ok = minio.is_reachable()
        status["services"]["minio"] = "ok" if ok else "unreachable"
        if not ok:
            status["status"] = "degraded"
    except Exception as exc:
        status["services"]["minio"] = f"error: {exc}"
        status["status"] = "degraded"

    return status
