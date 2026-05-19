# services/integrations/wto/service.py
"""
WTO integration service layer.

Focuses on fetching MFN tariff rates for key country pairs that TradeGuard
monitors, normalizing them into TariffEvent/RegulationEvent records, and
publishing events for downstream risk analysis.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.integrations.wto.client import WTOClient
from services.integrations.wto.schemas import WTODataPoint, WTOTariffResponse
from services.models import Regulation
from shared.schemas.intelligence import (
    RegulationEvent,
    RiskEvent,
    RiskSeverity,
    SourceHealth,
    TariffEvent,
)
from shared.events import EventTopic
from shared.utils import truncate_text, utcnow

logger = logging.getLogger(__name__)

# Default country pairs to monitor (reporter → partner)
DEFAULT_MONITOR_PAIRS: List[Tuple[str, str]] = [
    ("USA", "CHN"),
    ("USA", "CAN"),
    ("USA", "MEX"),
    ("EUN", "RUS"),
    ("EUN", "CHN"),
    ("GBR", "EUN"),
]

# High-tariff threshold — flag as a risk if MFN rate > this value (fraction)
HIGH_TARIFF_THRESHOLD = 0.15  # 15%


class WTOService:
    """Orchestrates the WTO tariff ingestion pipeline."""

    def __init__(
        self,
        client: WTOClient,
        db: AsyncSession,
        gemini,
        qdrant,
        minio,
        event_bus,
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
        country_pairs: Optional[List[Tuple[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Fetch tariff data for monitored country pairs and ingest into the pipeline.
        """
        pairs = country_pairs or DEFAULT_MONITOR_PAIRS
        logger.info("WTO ingestion started: %d country pairs", len(pairs))

        result: Dict[str, Any] = {
            "provider": "wto",
            "pairs_scanned": 0,
            "tariff_events": 0,
            "high_tariff_alerts": 0,
            "regulations_stored": 0,
            "errors": 0,
        }

        for reporter, partner in pairs:
            try:
                pair_result = await self._process_pair(reporter, partner)
                result["pairs_scanned"] += 1
                result["tariff_events"] += pair_result.get("points", 0)
                result["high_tariff_alerts"] += pair_result.get("alerts", 0)
                result["regulations_stored"] += pair_result.get("stored", 0)
            except Exception as exc:
                logger.exception("WTO pair %s→%s failed: %s", reporter, partner, exc)
                result["errors"] += 1

        logger.info(
            "WTO ingestion complete — pairs=%d tariff_events=%d alerts=%d errors=%d",
            result["pairs_scanned"], result["tariff_events"],
            result["high_tariff_alerts"], result["errors"],
        )
        return result

    async def health_check(self) -> SourceHealth:
        """Return health status of the WTO integration."""
        try:
            healthy = await self._client.health_check()
            return SourceHealth(
                name="WTO Timeseries API",
                last_checked=utcnow(),
                status="ok" if healthy else "error",
                error_message=None if healthy else "API returned non-200",
            )
        except Exception as exc:
            return SourceHealth(
                name="WTO Timeseries API",
                last_checked=utcnow(),
                status="error",
                error_message=str(exc),
            )

    # ------------------------------------------------------------------
    # Private pipeline steps
    # ------------------------------------------------------------------

    async def _process_pair(self, reporter: str, partner: str) -> Dict[str, int]:
        """Process a single reporter→partner tariff data fetch."""
        tariff_resp = await self._client.get_tariff_data(reporter=reporter, partner=partner)

        pair_result = {"points": 0, "alerts": 0, "stored": 0}
        pair_result["points"] = tariff_resp.total

        # Build tariff events and find high-tariff rows
        high_tariff_points: List[WTODataPoint] = []
        for dp in tariff_resp.data:
            if dp.value is not None and dp.value / 100.0 > HIGH_TARIFF_THRESHOLD:
                high_tariff_points.append(dp)

        # Store raw snapshot in MinIO
        raw_key = f"wto/tariffs/{reporter}-{partner}.json"
        try:
            raw_bytes = json.dumps(
                [dp.raw for dp in tariff_resp.data], default=str
            ).encode()
            self._minio.upload_document(raw_key, raw_bytes, "application/json")
        except Exception as exc:
            logger.warning("MinIO upload failed for WTO %s→%s: %s", reporter, partner, exc)

        # Create a single regulation record per high-tariff country pair scan
        if high_tariff_points:
            stored = await self._store_high_tariff_regulation(
                reporter, partner, high_tariff_points
            )
            pair_result["stored"] = int(stored)
            pair_result["alerts"] = len(high_tariff_points)

        return pair_result

    async def _store_high_tariff_regulation(
        self,
        reporter: str,
        partner: str,
        high_points: List[WTODataPoint],
    ) -> bool:
        """Persist a Regulation record for a high-tariff country pair."""
        source_url = (
            f"https://api.wto.org/timeseries/v1/data"
            f"?r={reporter}&p={partner}&i=HS_M_0010"
        )

        existing = (
            await self._db.execute(
                select(Regulation).where(Regulation.source_url == source_url)
            )
        ).scalar_one_or_none()
        if existing:
            return False  # dedup

        year = high_points[0].year if high_points else None
        avg_rate = sum(p.value or 0 for p in high_points) / len(high_points)

        title = (
            f"WTO Tariff Alert: {reporter}→{partner} "
            f"avg MFN {avg_rate:.1f}% on {len(high_points)} HS codes"
        )
        description = (
            f"WTO data indicates that {reporter} applies MFN tariff rates "
            f"exceeding {HIGH_TARIFF_THRESHOLD*100:.0f}% on {len(high_points)} "
            f"product categories when trading with {partner}. "
            f"Average rate: {avg_rate:.2f}%."
        )

        hs_codes = list({p.product_code for p in high_points if p.product_code})[:20]

        reg_event = RegulationEvent(
            provider="wto",
            external_id=f"{reporter}-{partner}-{year}",
            title=title,
            description=description,
            source_url=source_url,
            published_date=datetime(year or datetime.now().year, 1, 1, tzinfo=timezone.utc),
            affected_countries=[partner],
            affected_hs_codes=hs_codes,
            measure_type="TARIFF",
            duty_rate=avg_rate / 100.0,
            severity=RiskSeverity.HIGH if avg_rate > 25 else RiskSeverity.MEDIUM,
            raw_payload={"reporter": reporter, "partner": partner, "points": len(high_points)},
        )

        regulation = Regulation(
            title=title,
            source_url=source_url,
            published_date=reg_event.published_date,
            raw_text=description,
            normalized_event=reg_event.model_dump(mode="json"),
        )
        self._db.add(regulation)
        await self._db.flush()

        # Embed + Qdrant
        try:
            embedding = await self._gemini.embed(truncate_text(f"{title}\n{description}", 8000))
            point_id = await self._qdrant.upsert_regulation(
                reg_id=str(regulation.id),
                embedding=embedding,
                metadata={
                    "title": title,
                    "provider": "wto",
                    "source_url": source_url,
                    "reporter": reporter,
                    "partner": partner,
                },
            )
            regulation.embedding_id = point_id
        except Exception as exc:
            logger.warning("Qdrant embed failed for WTO %s→%s: %s", reporter, partner, exc)

        await self._db.commit()
        await self._db.refresh(regulation)

        # Publish events
        try:
            await self._bus.publish(
                EventTopic.REGULATION_DETECTED,
                {
                    "regulation_id": str(regulation.id),
                    "title": title,
                    "source_url": source_url,
                    "provider": "wto",
                    "severity": reg_event.severity,
                },
            )
            if reg_event.severity in (RiskSeverity.HIGH, RiskSeverity.CRITICAL):
                risk = RiskEvent(
                    source_provider="wto",
                    source_entity_id=str(regulation.id),
                    risk_type="TARIFF_HIKE",
                    severity=reg_event.severity,
                    score=75.0 if avg_rate > 25 else 50.0,
                    title=f"High Tariff Alert: {reporter}→{partner}",
                    description=description,
                    affected_countries=[partner],
                    affected_hs_codes=hs_codes,
                    raw_payload=reg_event.raw_payload,
                )
                await self._bus.publish(EventTopic.RISK_CREATED, risk.model_dump(mode="json"))
        except Exception as exc:
            logger.warning("EventBus publish failed for WTO %s→%s: %s", reporter, partner, exc)

        return True
