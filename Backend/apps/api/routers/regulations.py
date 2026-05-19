# apps/api/routers/regulations.py
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_db, get_event_bus, get_gemini, get_qdrant
from services.event_bus import EventBus
from services.ai import GeminiClient
from services.qdrant_client import QdrantService
from services.models import Regulation
from shared.events import EventTopic
from shared.schemas import PaginatedResponse, RegulationCreate, RegulationOut
from shared.utils import truncate_text

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=PaginatedResponse[RegulationOut], summary="List regulations")
async def list_regulations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[RegulationOut]:
    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(Regulation))).scalar_one()
    rows = (
        await db.execute(
            select(Regulation)
            .order_by(Regulation.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()
    return PaginatedResponse(
        items=[RegulationOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{regulation_id}", response_model=RegulationOut, summary="Get regulation detail")
async def get_regulation(
    regulation_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> RegulationOut:
    row = (
        await db.execute(select(Regulation).where(Regulation.id == regulation_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Regulation not found")
    return RegulationOut.model_validate(row)


@router.post("", response_model=RegulationOut, status_code=201, summary="Manually ingest a regulation")
async def create_regulation(
    body: RegulationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    event_bus: EventBus = Depends(get_event_bus),
    gemini: GeminiClient = Depends(get_gemini),
    qdrant: QdrantService = Depends(get_qdrant),
) -> RegulationOut:
    # Uniqueness check
    existing = (
        await db.execute(select(Regulation).where(Regulation.source_url == body.source_url))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Regulation with this source_url already exists")

    # Persist regulation
    regulation = Regulation(
        title=body.title,
        source_url=body.source_url,
        published_date=body.published_date,
        raw_text=body.raw_text,
        normalized_event=body.normalized_event,
    )
    db.add(regulation)
    await db.flush()  # obtain the generated ID

    # Embed + upsert into Qdrant
    try:
        embedding = await gemini.embed(truncate_text(body.raw_text, 8000))
        point_id = await qdrant.upsert_regulation(
            reg_id=str(regulation.id),
            embedding=embedding,
            metadata={
                "title": body.title,
                "source_url": body.source_url,
            },
        )
        regulation.embedding_id = point_id
    except Exception as exc:
        logger.warning("Qdrant upsert failed for regulation %s: %s", regulation.id, exc)

    await db.commit()
    await db.refresh(regulation)

    # Publish event to kick off the autonomous pipeline
    await event_bus.publish(
        EventTopic.REGULATION_DETECTED,
        {
            "regulation_id": str(regulation.id),
            "title": regulation.title,
            "source_url": regulation.source_url,
        },
    )

    return RegulationOut.model_validate(regulation)
