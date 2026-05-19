# shared/schemas/intelligence.py
"""
Unified normalized event schemas for TradeGuard Phase 1 intelligence ingestion.

All external providers (GTA, WTO, OpenSanctions) map their raw responses
into these common structures before storage / event publishing.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Generic, List, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Severity
# ---------------------------------------------------------------------------

class RiskSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH     = "high"
    MEDIUM   = "medium"
    LOW      = "low"
    INFO     = "info"


# ---------------------------------------------------------------------------
# Standard API envelope  { success, data, metadata }
# ---------------------------------------------------------------------------

class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# RegulationEvent  — produced by GTA / WTO watchdog scans
# ---------------------------------------------------------------------------

class RegulationEvent(BaseModel):
    """Normalized regulation / trade-measure event from any provider."""
    provider: str                                # "gta" | "wto" | "rss"
    external_id: Optional[str] = None           # provider's own record ID
    title: str
    description: Optional[str] = None
    source_url: str
    published_date: Optional[datetime] = None
    effective_date: Optional[datetime] = None
    affected_countries: List[str] = Field(default_factory=list)
    affected_hs_codes: List[str] = Field(default_factory=list)
    measure_type: Optional[str] = None          # TARIFF | QUOTA | EMBARGO | SANCTION …
    duty_rate: Optional[float] = None           # e.g. 0.25 for 25%
    raw_payload: Dict[str, Any] = Field(default_factory=dict)
    severity: RiskSeverity = RiskSeverity.INFO


# ---------------------------------------------------------------------------
# TariffEvent  — produced by WTO tariff API
# ---------------------------------------------------------------------------

class TariffEvent(BaseModel):
    """Normalized tariff data point."""
    provider: str = "wto"
    reporter_country: str
    partner_country: str
    hs_code: str
    tariff_rate: float                          # MFN / preferential rate (fraction)
    tariff_type: str = "MFN"                   # MFN | PREFERENTIAL | ANTIDUMPING
    year: Optional[int] = None
    source_url: str
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# SanctionEvent  — produced by OpenSanctions screening
# ---------------------------------------------------------------------------

class SanctionEntity(BaseModel):
    entity_id: str
    name: str
    aliases: List[str] = Field(default_factory=list)
    entity_type: Optional[str] = None          # "Company" | "Person" | "Vessel"
    datasets: List[str] = Field(default_factory=list)
    countries: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)   # e.g. ["sanction", "debarment"]
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    score: float = 0.0                         # match confidence 0..1
    source_url: str = ""
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


class SanctionCheckResult(BaseModel):
    """Result returned from POST /api/sanctions/check."""
    query: str
    matches: List[SanctionEntity]
    total_matches: int
    risk_score: float                          # 0..1  computed from top match score
    datasets_matched: List[str]
    is_sanctioned: bool


# ---------------------------------------------------------------------------
# RiskEvent  — generated after analysis of any inbound event
# ---------------------------------------------------------------------------

class RiskEvent(BaseModel):
    """A computed risk record persisted and published on risk.created."""
    source_provider: str                       # "gta" | "wto" | "opensanctions"
    source_entity_id: Optional[str] = None    # regulation_id or sanction record id
    risk_type: str                             # "TARIFF_HIKE" | "SANCTION_HIT" | "EMBARGO" …
    severity: RiskSeverity
    score: float                               # 0..100
    title: str
    description: str
    affected_countries: List[str] = Field(default_factory=list)
    affected_hs_codes: List[str] = Field(default_factory=list)
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# WatchdogStatus  — returned by GET /api/watchdog/status
# ---------------------------------------------------------------------------

class SourceHealth(BaseModel):
    name: str
    last_checked: Optional[datetime] = None
    status: str = "unknown"                   # "ok" | "error" | "unknown"
    records_ingested: int = 0
    error_message: Optional[str] = None


class WatchdogStatus(BaseModel):
    last_scan_at: Optional[datetime] = None
    next_scan_at: Optional[datetime] = None
    sources: List[SourceHealth]
    total_regulations: int = 0
    total_sanctions: int = 0
    total_risks: int = 0
    is_running: bool = False


# ---------------------------------------------------------------------------
# Scan request / response
# ---------------------------------------------------------------------------

class ScanRequest(BaseModel):
    sources: Optional[List[str]] = None       # None → all; ["gta", "wto", "opensanctions"]
    force: bool = False                        # bypass dedup window


class SanctionCheckRequest(BaseModel):
    company_name: str
    country: Optional[str] = None
    fuzzy: bool = True
