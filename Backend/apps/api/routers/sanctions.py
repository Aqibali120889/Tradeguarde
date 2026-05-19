# apps/api/routers/sanctions.py
"""
Sanctions screening API — Phase 1.

Routes:
  POST /api/sanctions/check   — screen a company against OpenSanctions
  GET  /api/sanctions         — list past sanction checks with pagination
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_db, get_event_bus, get_minio
from apps.api.core.config import settings
from services.event_bus import EventBus
from services.minio_client import MinioService
from services.models import SanctionRecord
from shared.schemas.intelligence import (
    ApiResponse,
    SanctionCheckRequest,
    SanctionCheckResult,
    SanctionEntity,
)
from shared.utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# POST /api/sanctions/check
# ---------------------------------------------------------------------------

@router.post("/check", summary="Screen a company against sanctions databases")
async def check_sanctions(
    body: SanctionCheckRequest,
    db: AsyncSession = Depends(get_db),
    event_bus: EventBus = Depends(get_event_bus),
    minio: MinioService = Depends(get_minio),
) -> ApiResponse[SanctionCheckResult]:
    """
    Screen a company name against OpenSanctions datasets.

    Returns:
      - List of matching entities with scores
      - Aggregate risk score (0-1)
      - Datasets where matches were found
      - is_sanctioned boolean flag
    """
    from services.integrations.opensanctions.client import OpenSanctionsClient
    from services.integrations.opensanctions.service import OpenSanctionsService

    if not body.company_name.strip():
        raise HTTPException(status_code=422, detail="company_name must not be empty")

    async with OpenSanctionsClient(
        api_key=settings.OS_API_KEY,
        base_url=settings.OS_BASE_URL,
    ) as client:
        service = OpenSanctionsService(
            client=client,
            db=db,
            minio=minio,
            event_bus=event_bus,
        )
        result = await service.check_company(
            company_name=body.company_name,
            country=body.country,
            fuzzy=body.fuzzy,
        )

    return ApiResponse(
        success=True,
        data=result,
        metadata={
            "provider": "opensanctions",
            "checked_at": utcnow().isoformat(),
            "threshold": 0.7,
        },
    )


# ---------------------------------------------------------------------------
# GET /api/sanctions
# ---------------------------------------------------------------------------

@router.get("", summary="List past sanctions screening records")
async def list_sanction_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_sanctioned: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[Dict[str, Any]]:
    """
    Paginated list of past OpenSanctions screening records.
    Optionally filter to only confirmed sanctioned entities.
    """
    q = select(SanctionRecord)
    if is_sanctioned is not None:
        q = q.where(SanctionRecord.is_sanctioned == str(is_sanctioned).lower())

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(
            q.order_by(SanctionRecord.checked_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    items = [
        {
            "id": str(r.id),
            "entity_name": r.entity_name,
            "risk_score": r.risk_score,
            "is_sanctioned": r.is_sanctioned,
            "datasets": r.datasets,
            "match_count": r.match_count,
            "checked_at": r.checked_at.isoformat() if r.checked_at else None,
        }
        for r in rows
    ]

    return ApiResponse(
        success=True,
        data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        },
        metadata={"retrieved_at": utcnow().isoformat()},
    )
