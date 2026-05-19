# services/integrations/gta/service.py
"""
GTA integration service layer.

Responsibilities:
  1. Fetch interventions from GTAClient
  2. Normalize to shared RegulationEvent / RiskEvent schemas
  3. Persist Regulation records (dedup by source_url)
  4. Embed regulation text via Gemini → upsert Qdrant
  5. Store raw JSON snapshot in MinIO
  6. Publish EventBus events (regulation.detected / risk.created)
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.integrations.gta.client import GTAClient
from services.integrations.gta.schemas import GTAMeasure
from services.models import Regulation
from shared.schemas.intelligence import (
    RegulationEvent,
    RiskEvent,
    RiskSeverity,
    SourceHealth,
)
from shared.events import EventTopic
from shared.utils import truncate_text, utcnow

logger = logging.getLogger(__name__)

# Severity mapping from GTA evaluation to our RiskSeverity
_GTA_SEVERITY: Dict[str, RiskSeverity] = {
    "Red":   RiskSeverity.HIGH,
    "Amber": RiskSeverity.MEDIUM,
    "Green": RiskSeverity.LOW,
}

# Risk score mapping
_GTA_SCORE: Dict[str, float] = {
    "Red":   80.0,
    "Amber": 50.0,
    "Green": 20.0,
}


class GTAService:
    """
    Orchestrates the Global Trade Alert ingestion pipeline.
    Stateless — all dependencies injected per call.
    """

    def __init__(
        self,
        client: GTAClient,
        db: AsyncSession,
        gemini,        # GeminiClient
        qdrant,        # QdrantService
        minio,         # MinioService
        event_bus,     # EventBus
    ) -> None:
        self._client   = client
        self._db       = db
        self._gemini   = gemini
        self._qdrant   = qdrant
        self._minio    = minio
        self._bus      = event_bus

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def ingest(
        self,
        limit: int = 50,
        days_back: int = 7,
    ) -> Dict[str, Any]:
        """
        Fetch, normalize, persist, embed, and publish GTA interventions.

        Returns summary dict with counts.
        """
        date_from = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
        logger.info("GTA ingestion started: limit=%d, date_from=%s", limit, date_from)

        result: Dict[str, Any] = {
            "provider": "gta",
            "fetched": 0,
            "stored": 0,
            "duplicates": 0,
            "errors": 0,
        }

        try:
            intervention_list = await self._client.fetch_interventions(
                limit=limit,
                evaluations=["Red", "Amber"],
                date_from=date_from,
            )
        except Exception as exc:
            logger.error("GTA fetch failed: %s", exc)
            result["error"] = str(exc)
            return result

        result["fetched"] = len(intervention_list.measures)

        for measure in intervention_list.measures:
            try:
                stored, duplicate = await self._process_measure(measure)
                if duplicate:
                    result["duplicates"] += 1
                elif stored:
                    result["stored"] += 1
            except Exception as exc:
                logger.exception("GTA measure processing error (id=%s): %s", measure.id, exc)
                result["errors"] += 1

        logger.info(
            "GTA ingestion complete — fetched=%d stored=%d duplicates=%d errors=%d",
            result["fetched"], result["stored"], result["duplicates"], result["errors"],
        )
        return result

    async def health_check(self) -> SourceHealth:
        """Return health status of the GTA integration."""
        try:
            healthy = await self._client.health_check()
            return SourceHealth(
                name="Global Trade Alert",
                last_checked=utcnow(),
                status="ok" if healthy else "error",
                error_message=None if healthy else "API returned non-200",
            )
        except Exception as exc:
            return SourceHealth(
                name="Global Trade Alert",
                last_checked=utcnow(),
                status="error",
                error_message=str(exc),
            )

    # ------------------------------------------------------------------
    # Private pipeline steps
    # ------------------------------------------------------------------

    async def _process_measure(self, measure: GTAMeasure) -> Tuple[bool, bool]:
        """
        Process a single GTA measure through the full pipeline.
        Returns (stored: bool, duplicate: bool).
        """
        source_url = measure.source_url or f"https://www.globaltradealert.org/intervention/{measure.id}"

        # 1. Dedup check
        existing = (
            await self._db.execute(
                select(Regulation).where(Regulation.source_url == source_url)
            )
        ).scalar_one_or_none()
        if existing:
            return False, True

        # 2. Normalize to RegulationEvent
        reg_event = _normalize_measure(measure)

        # 3. Store raw snapshot in MinIO
        raw_key = f"gta/interventions/{measure.id or 'unknown'}.json"
        try:
            raw_bytes = json.dumps(measure.raw, default=str).encode()
            self._minio.upload_document(raw_key, raw_bytes, content_type="application/json")
        except Exception as exc:
            logger.warning("MinIO upload failed for GTA %s: %s", measure.id, exc)

        # 4. Persist Regulation to DB
        regulation = Regulation(
            title=reg_event.title,
            source_url=source_url,
            published_date=reg_event.published_date,
            raw_text=reg_event.description or reg_event.title,
            normalized_event=reg_event.model_dump(mode="json"),
        )
        self._db.add(regulation)
        await self._db.flush()  # get the generated ID

        # 5. Embed text → Qdrant
        try:
            embed_text = truncate_text(f"{reg_event.title}\n\n{reg_event.description or ''}", 8000)
            embedding = await self._gemini.embed(embed_text)
            point_id = await self._qdrant.upsert_regulation(
                reg_id=str(regulation.id),
                embedding=embedding,
                metadata={
                    "title":    reg_event.title,
                    "provider": "gta",
                    "source_url": source_url,
                    "severity": reg_event.severity,
                    "measure_type": reg_event.measure_type,
                },
            )
            regulation.embedding_id = point_id
        except Exception as exc:
            logger.warning("Qdrant embedding failed for GTA %s: %s", measure.id, exc)

        await self._db.commit()
        await self._db.refresh(regulation)

        # 6. Publish regulation.detected
        try:
            await self._bus.publish(
                EventTopic.REGULATION_DETECTED,
                {
                    "regulation_id": str(regulation.id),
                    "title": regulation.title,
                    "source_url": source_url,
                    "provider": "gta",
                    "severity": reg_event.severity,
                },
            )
        except Exception as exc:
            logger.warning("EventBus publish failed for GTA %s: %s", measure.id, exc)

        # 7. Publish risk.created for Red/Amber measures
        if reg_event.severity in (RiskSeverity.HIGH, RiskSeverity.CRITICAL, RiskSeverity.MEDIUM):
            risk = _build_risk(measure, reg_event, str(regulation.id))
            try:
                await self._bus.publish(
                    EventTopic.RISK_CREATED,
                    risk.model_dump(mode="json"),
                )
            except Exception as exc:
                logger.warning("EventBus risk.created failed for GTA %s: %s", measure.id, exc)

        return True, False


# ---------------------------------------------------------------------------
# Normalizers
# ---------------------------------------------------------------------------

def _normalize_measure(m: GTAMeasure) -> RegulationEvent:
    """Map a GTAMeasure to a unified RegulationEvent."""
    affected_countries = [
        c.iso_code or c.name or ""
        for c in (m.affected_countries or [])
        if c.iso_code or c.name
    ]

    published: Optional[datetime] = None
    if m.date_announced:
        try:
            published = datetime.strptime(m.date_announced[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    severity = _GTA_SEVERITY.get(m.gta_evaluation or "", RiskSeverity.INFO)

    return RegulationEvent(
        provider="gta",
        external_id=str(m.id) if m.id else None,
        title=m.title or "GTA Intervention",
        description=m.description or "",
        source_url=m.source_url or "",
        published_date=published,
        affected_countries=affected_countries,
        affected_hs_codes=m.hs_codes or [],
        measure_type=m.intervention_type or "TRADE_MEASURE",
        severity=severity,
        raw_payload=m.raw,
    )


def _build_risk(m: GTAMeasure, reg_event: RegulationEvent, regulation_id: str) -> RiskEvent:
    """Derive a RiskEvent from a GTA measure."""
    score = _GTA_SCORE.get(m.gta_evaluation or "", 10.0)
    return RiskEvent(
        source_provider="gta",
        source_entity_id=regulation_id,
        risk_type=m.intervention_type or "TRADE_RESTRICTION",
        severity=reg_event.severity,
        score=score,
        title=f"GTA Alert: {reg_event.title}",
        description=reg_event.description or reg_event.title,
        affected_countries=reg_event.affected_countries,
        affected_hs_codes=reg_event.affected_hs_codes,
        raw_payload=m.raw,
    )
