# apps/api/routers/risks.py
"""
Risk intelligence API — Phase 1.

Routes:
  GET /api/risks              — paginated risk records
  GET /api/risks/{risk_id}   — single risk detail
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_db
from services.models import RiskRecord
from shared.schemas.intelligence import ApiResponse, RiskSeverity
from shared.utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# GET /api/risks
# ---------------------------------------------------------------------------

@router.get("", summary="List generated risk intelligence records")
async def list_risks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    severity: Optional[str] = Query(None, description="Filter: critical|high|medium|low|info"),
    provider: Optional[str] = Query(None, description="Filter: gta|wto|opensanctions"),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[Dict[str, Any]]:
    """
    Returns paginated risk records computed from ingested intelligence.
    Optionally filter by severity or source provider.
    """
    q = select(RiskRecord)
    if severity:
        q = q.where(RiskRecord.severity == severity.lower())
    if provider:
        q = q.where(RiskRecord.source_provider == provider.lower())

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(
            q.order_by(RiskRecord.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    items = [_risk_to_dict(r) for r in rows]

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


# ---------------------------------------------------------------------------
# GET /api/risks/{risk_id}
# ---------------------------------------------------------------------------

@router.get("/{risk_id}", summary="Get a single risk record by ID")
async def get_risk(
    risk_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[Dict[str, Any]]:
    """Return a single RiskRecord by its UUID."""
    row = (
        await db.execute(select(RiskRecord).where(RiskRecord.id == risk_id))
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Risk record not found")

    return ApiResponse(
        success=True,
        data=_risk_to_dict(row),
        metadata={"retrieved_at": utcnow().isoformat()},
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _risk_to_dict(r: RiskRecord) -> Dict[str, Any]:
    return {
        "id": str(r.id),
        "source_provider": r.source_provider,
        "source_entity_id": r.source_entity_id,
        "risk_type": r.risk_type,
        "severity": r.severity,
        "score": r.score,
        "title": r.title,
        "description": r.description,
        "affected_countries": r.affected_countries or [],
        "affected_hs_codes": r.affected_hs_codes or [],
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
