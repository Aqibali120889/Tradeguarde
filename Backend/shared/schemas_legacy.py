# shared/schemas.py
from typing import Any, Dict, Generic, List, Optional, TypeVar
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Generic pagination
# ---------------------------------------------------------------------------

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Regulations
# ---------------------------------------------------------------------------

class RegulationCreate(BaseModel):
    title: str
    source_url: str
    published_date: Optional[datetime] = None
    raw_text: str
    normalized_event: Optional[Dict[str, Any]] = None


class RegulationOut(BaseModel):
    id: UUID
    title: Optional[str] = None
    source_url: Optional[str] = None
    published_date: Optional[datetime] = None
    raw_text: Optional[str] = None
    normalized_event: Optional[Dict[str, Any]] = None
    embedding_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Impact Analyses
# ---------------------------------------------------------------------------

class ImpactAnalysisOut(BaseModel):
    id: UUID
    organization_id: UUID
    regulation_id: UUID
    analysis_json: Optional[Dict[str, Any]] = None
    action_plan_id: Optional[UUID] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Action Plans
# ---------------------------------------------------------------------------

class ActionPlanOut(BaseModel):
    id: UUID
    organization_id: UUID
    steps: Optional[List[Dict[str, Any]]] = None
    approval_required: str
    approved_by: Optional[str] = None
    executed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ApproveActionPlanRequest(BaseModel):
    approved_by: str  # user email or ID


# ---------------------------------------------------------------------------
# Execution Logs
# ---------------------------------------------------------------------------

class ExecutionLogOut(BaseModel):
    id: UUID
    action_plan_id: UUID
    step_index: Optional[int] = None
    api_call_details: Optional[Dict[str, Any]] = None
    response: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationOut(BaseModel):
    id: UUID
    organization_id: UUID
    event_type: Optional[str] = None
    channel: Optional[str] = None
    content: Optional[str] = None
    recipient: Optional[str] = None
    sent_at: Optional[datetime] = None
    status: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trigger requests
# ---------------------------------------------------------------------------

class TriggerAnalysisRequest(BaseModel):
    regulation_id: UUID
    organization_id: UUID
