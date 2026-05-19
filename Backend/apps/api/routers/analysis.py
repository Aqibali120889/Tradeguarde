# apps/api/routers/analysis.py
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.dependencies import get_db
from services.models import ImpactAnalysis, ActionPlan, ExecutionLog
from shared.schemas import (
    ActionPlanOut,
    ApproveActionPlanRequest,
    ExecutionLogOut,
    ImpactAnalysisOut,
    PaginatedResponse,
)
from shared.utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Impact Analyses
# ---------------------------------------------------------------------------

@router.get("/analyses", response_model=PaginatedResponse[ImpactAnalysisOut], summary="List impact analyses")
async def list_analyses(
    organization_id: UUID | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[ImpactAnalysisOut]:
    q = select(ImpactAnalysis)
    if organization_id:
        q = q.where(ImpactAnalysis.organization_id == organization_id)
    if status:
        q = q.where(ImpactAnalysis.status == status)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(
            q.order_by(ImpactAnalysis.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return PaginatedResponse(
        items=[ImpactAnalysisOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/analyses/{analysis_id}", response_model=ImpactAnalysisOut, summary="Get impact analysis detail")
async def get_analysis(
    analysis_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ImpactAnalysisOut:
    row = (
        await db.execute(select(ImpactAnalysis).where(ImpactAnalysis.id == analysis_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Impact analysis not found")
    return ImpactAnalysisOut.model_validate(row)


@router.post("/analyses/{analysis_id}/approve", response_model=ActionPlanOut, summary="Approve an action plan")
async def approve_action_plan(
    analysis_id: UUID,
    body: ApproveActionPlanRequest,
    db: AsyncSession = Depends(get_db),
) -> ActionPlanOut:
    analysis = (
        await db.execute(select(ImpactAnalysis).where(ImpactAnalysis.id == analysis_id))
    ).scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Impact analysis not found")
    if not analysis.action_plan_id:
        raise HTTPException(status_code=400, detail="No action plan linked to this analysis")

    plan = (
        await db.execute(select(ActionPlan).where(ActionPlan.id == analysis.action_plan_id))
    ).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Action plan not found")

    plan.approved_by = body.approved_by
    plan.approval_required = "false"
    analysis.status = "approved"
    await db.commit()
    await db.refresh(plan)
    return ActionPlanOut.model_validate(plan)


# ---------------------------------------------------------------------------
# Action Plans
# ---------------------------------------------------------------------------

@router.get("/action-plans/{plan_id}", response_model=ActionPlanOut, summary="Get action plan detail")
async def get_action_plan(
    plan_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ActionPlanOut:
    row = (
        await db.execute(select(ActionPlan).where(ActionPlan.id == plan_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Action plan not found")
    return ActionPlanOut.model_validate(row)


# ---------------------------------------------------------------------------
# Execution Logs
# ---------------------------------------------------------------------------

@router.get("/execution-logs", response_model=PaginatedResponse[ExecutionLogOut], summary="List execution logs")
async def list_execution_logs(
    action_plan_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[ExecutionLogOut]:
    q = select(ExecutionLog)
    if action_plan_id:
        q = q.where(ExecutionLog.action_plan_id == action_plan_id)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (
        await db.execute(
            q.order_by(ExecutionLog.timestamp.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return PaginatedResponse(
        items=[ExecutionLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
