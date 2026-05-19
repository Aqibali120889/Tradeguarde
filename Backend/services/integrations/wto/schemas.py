# services/integrations/wto/schemas.py
"""
Pydantic v2 schemas for the WTO Timeseries API.

API Reference: https://api.wto.org/timeseries/v1
The WTO API returns tariff rates, trade volumes, and SPS/TBT measures.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WTOIndicator(BaseModel):
    """A single tariff or trade statistic indicator."""
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    multiplier: Optional[float] = None


class WTODataPoint(BaseModel):
    """Single data record from WTO timeseries endpoint."""
    reporter_code: Optional[str] = None   # ISO3 code of reporting country
    reporter_name: Optional[str] = None
    partner_code: Optional[str] = None    # ISO3 code of partner country
    partner_name: Optional[str] = None
    indicator_code: Optional[str] = None
    product_code: Optional[str] = None    # HS code
    product_name: Optional[str] = None
    year: Optional[int] = None
    period: Optional[str] = None
    value: Optional[float] = None
    value_flag: Optional[str] = None
    raw: Dict[str, Any] = Field(default_factory=dict)


class WTOTariffResponse(BaseModel):
    """Parsed WTO tariff data for a reporter/partner/HS triple."""
    total: int = 0
    data: List[WTODataPoint] = Field(default_factory=list)


class WTOMeasure(BaseModel):
    """Non-tariff measure from WTO measures endpoint."""
    id: Optional[str] = None
    reporter_code: Optional[str] = None
    measure_type: Optional[str] = None    # e.g. "SPS", "TBT", "ADP"
    title: Optional[str] = None
    description: Optional[str] = None
    date_initiated: Optional[str] = None
    hs_codes: List[str] = Field(default_factory=list)
    raw: Dict[str, Any] = Field(default_factory=dict)


class WTOMeasuresResponse(BaseModel):
    total: int = 0
    measures: List[WTOMeasure] = Field(default_factory=list)
