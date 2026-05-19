# apps/api/dependencies.py
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from services.db import get_db as _get_db
from services.event_bus import EventBus
from services.ai import GeminiClient, FeatherlessClient
from services.qdrant_client import QdrantService
from services.minio_client import MinioService


# ---------------------------------------------------------------------------
# Database session
# ---------------------------------------------------------------------------

async def get_db(db: AsyncSession = Depends(_get_db)) -> AsyncSession:
    yield db


# ---------------------------------------------------------------------------
# Services stored on app.state during startup
# ---------------------------------------------------------------------------

def get_event_bus(request: Request) -> EventBus:
    return request.app.state.event_bus


def get_gemini(request: Request) -> GeminiClient:
    return request.app.state.gemini


def get_featherless(request: Request) -> FeatherlessClient:
    return request.app.state.featherless


def get_qdrant(request: Request) -> QdrantService:
    return request.app.state.qdrant


def get_minio(request: Request) -> MinioService:
    return request.app.state.minio
