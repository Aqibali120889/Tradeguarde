# services/integrations/gta/schemas.py
"""
Pydantic v2 schemas for the Global Trade Alert (GTA) API.

GTA returns 'interventions' — policy measures affecting trade.
Reference: https://www.globaltradealert.org/api
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Raw GTA response shapes
# ---------------------------------------------------------------------------

class GTACountry(BaseModel):
    iso_code: Optional[str] = None
    name: Optional[str] = None


class GTAMeasure(BaseModel):
    """Single intervention / measure from the GTA API."""
    id: Optional[int] = None
    title: Optional[str] = None
    implementing_country: Optional[GTACountry] = None
    affected_countries: List[GTACountry] = Field(default_factory=list)
    hs_codes: List[str] = Field(default_factory=list)
    date_announced: Optional[str] = None
    date_implemented: Optional[str] = None
    date_removed: Optional[str] = None
    gta_evaluation: Optional[str] = None    # "Red" | "Amber" | "Green"
    intervention_type: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    raw: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("date_announced", "date_implemented", "date_removed", mode="before")
    @classmethod
    def _coerce_date(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return str(v)


class GTAInterventionList(BaseModel):
    """Wrapper around GTA list response."""
    total: int = 0
    measures: List[GTAMeasure] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Fetch parameters
# ---------------------------------------------------------------------------

class GTAFetchParams(BaseModel):
    """Parameters for filtering GTA interventions."""
    limit: int = 50
    offset: int = 0
    # Filter to harmful measures by default (Red/Amber evaluations)
    evaluations: List[str] = Field(default_factory=lambda: ["Red", "Amber"])
    # Date range — fetch recent 90 days if not specified
    date_from: Optional[str] = None
    date_to: Optional[str] = None
