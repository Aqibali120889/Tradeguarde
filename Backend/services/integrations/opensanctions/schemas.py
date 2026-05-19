# services/integrations/opensanctions/schemas.py
"""
Pydantic v2 schemas for the OpenSanctions API.

API docs: https://www.opensanctions.org/docs/api/
The main endpoint used is POST /match (entity matching) and GET /search.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class OSProperty(BaseModel):
    """OpenSanctions entity property (can be a list of values)."""
    values: List[str] = Field(default_factory=list)


class OSEntity(BaseModel):
    """
    An OpenSanctions entity returned from /search or /match.
    Follows the FollowTheMoney (FtM) data model.
    """
    id: Optional[str] = None
    schema_type: Optional[str] = Field(None, alias="schema")
    caption: Optional[str] = None
    datasets: List[str] = Field(default_factory=list)
    properties: Dict[str, List[str]] = Field(default_factory=dict)
    referents: List[str] = Field(default_factory=list)
    score: Optional[float] = None              # match score 0..1 from /match
    match: Optional[bool] = None               # True if API considers it a match

    model_config = {"populate_by_name": True}

    def get_property(self, name: str) -> List[str]:
        return self.properties.get(name, [])


class OSSearchResponse(BaseModel):
    """Response from GET /search/{dataset}?q=..."""
    total: Dict[str, Any] = Field(default_factory=dict)
    results: List[OSEntity] = Field(default_factory=list)
    offset: int = 0
    limit: int = 10


class OSMatchQuery(BaseModel):
    """Request body for POST /match (entity matching)."""
    queries: Dict[str, Any] = Field(default_factory=dict)


class OSMatchResult(BaseModel):
    """Response from POST /match."""
    responses: Dict[str, Any] = Field(default_factory=dict)
    matcher: Optional[str] = None
    cutoff: Optional[float] = None
