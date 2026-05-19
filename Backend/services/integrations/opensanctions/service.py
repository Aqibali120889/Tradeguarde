# services/integrations/opensanctions/service.py
"""
OpenSanctions integration service layer.

Responsibilities:
  1. Accept a company name / entity query
  2. Run /match endpoint for structured matching
  3. Fall back to /search for fuzzy matching
  4. Normalize results to SanctionEntity / SanctionCheckResult schemas
  5. Persist SanctionRecord in DB if matches found
  6. Publish sanctions.detected event via EventBus
  7. Return structured SanctionCheckResult to caller
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.integrations.opensanctions.client import OpenSanctionsClient
from services.integrations.opensanctions.schemas import OSEntity
from services.models import SanctionRecord
from shared.schemas.intelligence import (
    SanctionCheckResult,
    SanctionEntity,
    RiskSeverity,
    SourceHealth,
)
from shared.events import EventTopic
from shared.utils import utcnow

logger = logging.getLogger(__name__)

# Score above which we consider an entity a confirmed sanction hit
SANCTIONS_THRESHOLD = 0.7
# Score above which we raise a HIGH risk (vs MEDIUM)
HIGH_RISK_THRESHOLD = 0.85


class OpenSanctionsService:
    """Orchestrates sanctions screening workflow."""

    def __init__(
        self,
        client: OpenSanctionsClient,
        db: AsyncSession,
        minio,
        event_bus,
    ) -> None:
        self._client   = client
        self._db       = db
        self._minio    = minio
        self._bus      = event_bus

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def check_company(
        self,
        company_name: str,
        country: Optional[str] = None,
        fuzzy: bool = True,
    ) -> SanctionCheckResult:
        """
        Screen a company name against OpenSanctions datasets.

        Returns a SanctionCheckResult with matches, risk score, and datasets.
        """
        logger.info("Sanctions check: '%s' (country=%s)", company_name, country)

        # 1. Structured match (most accurate)
        matched_entities: List[OSEntity] = await self._client.match(
            name=company_name,
            country=country,
            schema="Company",
            fuzzy=fuzzy,
            threshold=0.3,   # low threshold — we'll filter later
        )

        # 2. Fall back / supplement with search if few results
        if len(matched_entities) < 3:
            search_resp = await self._client.search(
                query=company_name,
                limit=10,
                schema="Company",
            )
            # Merge results, avoid duplicates
            existing_ids = {e.id for e in matched_entities}
            for entity in search_resp.results:
                if entity.id not in existing_ids:
                    # Assign a heuristic score for search results
                    entity.score = entity.score or 0.5
                    matched_entities.append(entity)

        # 3. Normalise to SanctionEntity list
        sanction_entities = [_normalize_entity(e) for e in matched_entities]
        # Filter to meaningful matches
        sanction_entities = [e for e in sanction_entities if e.score >= 0.3]
        sanction_entities.sort(key=lambda e: e.score, reverse=True)

        # 4. Compute aggregate risk score
        top_score = sanction_entities[0].score if sanction_entities else 0.0
        is_sanctioned = top_score >= SANCTIONS_THRESHOLD
        datasets_matched = list({d for e in sanction_entities for d in e.datasets})

        result = SanctionCheckResult(
            query=company_name,
            matches=sanction_entities[:10],   # cap output at 10
            total_matches=len(sanction_entities),
            risk_score=top_score,
            datasets_matched=datasets_matched,
            is_sanctioned=is_sanctioned,
        )

        # 5. Persist + publish if sanctioned
        if is_sanctioned:
            await self._persist_sanction(company_name, result, matched_entities)
            await self._publish_sanction_event(company_name, result)

        # 6. Store raw response in MinIO for audit
        try:
            raw_key = f"opensanctions/checks/{company_name.lower().replace(' ', '_')}.json"
            raw_bytes = json.dumps(
                {
                    "query": company_name,
                    "matches": [e.model_dump() for e in matched_entities],
                    "checked_at": utcnow().isoformat(),
                },
                default=str,
            ).encode()
            self._minio.upload_document(raw_key, raw_bytes, "application/json")
        except Exception as exc:
            logger.warning("MinIO upload failed for sanctions check '%s': %s", company_name, exc)

        return result

    async def health_check(self) -> SourceHealth:
        """Return health status of the OpenSanctions integration."""
        try:
            healthy = await self._client.health_check()
            return SourceHealth(
                name="OpenSanctions",
                last_checked=utcnow(),
                status="ok" if healthy else "error",
                error_message=None if healthy else "API returned non-200",
            )
        except Exception as exc:
            return SourceHealth(
                name="OpenSanctions",
                last_checked=utcnow(),
                status="error",
                error_message=str(exc),
            )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _persist_sanction(
        self,
        company_name: str,
        result: SanctionCheckResult,
        raw_entities: List[OSEntity],
    ) -> None:
        """Persist a SanctionRecord if not already stored."""
        try:
            existing = (
                await self._db.execute(
                    select(SanctionRecord).where(
                        SanctionRecord.entity_name == company_name
                    )
                )
            ).scalar_one_or_none()

            if existing:
                # Update score if higher
                if result.risk_score > (existing.risk_score or 0):
                    existing.risk_score = result.risk_score
                    existing.datasets = result.datasets_matched
                    existing.checked_at = utcnow()
                    await self._db.commit()
                return

            record = SanctionRecord(
                entity_name=company_name,
                risk_score=int(result.risk_score * 100),   # store as 0-100 integer
                is_sanctioned=str(result.is_sanctioned).lower(),
                datasets=result.datasets_matched,
                match_count=result.total_matches,
                raw_result=result.model_dump(mode="json"),
                checked_at=utcnow(),
            )
            self._db.add(record)
            await self._db.commit()
            logger.info(
                "Sanctions record persisted: %s (score=%.2f)",
                company_name, result.risk_score,
            )
        except Exception as exc:
            logger.error("Failed to persist sanctions record for '%s': %s", company_name, exc)

    async def _publish_sanction_event(
        self,
        company_name: str,
        result: SanctionCheckResult,
    ) -> None:
        """Publish sanctions.detected event to the event bus."""
        try:
            await self._bus.publish(
                EventTopic.SANCTIONS_DETECTED,
                {
                    "entity_name": company_name,
                    "risk_score": result.risk_score,
                    "is_sanctioned": result.is_sanctioned,
                    "total_matches": result.total_matches,
                    "datasets": result.datasets_matched,
                    "top_matches": [
                        {"name": m.name, "score": m.score, "datasets": m.datasets}
                        for m in result.matches[:3]
                    ],
                },
            )
            logger.info("Published sanctions.detected for '%s'", company_name)
        except Exception as exc:
            logger.warning("EventBus publish failed for sanctions '%s': %s", company_name, exc)


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

def _normalize_entity(entity: OSEntity) -> SanctionEntity:
    """Convert an OpenSanctions OSEntity to a normalized SanctionEntity."""
    props = entity.properties

    # Extract name and aliases
    names = props.get("name", [])
    aliases = props.get("alias", []) + props.get("weakAlias", [])
    primary_name = entity.caption or (names[0] if names else "Unknown")

    # Dates
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    if dates := props.get("modifiedAt", []):
        try:
            last_seen = datetime.fromisoformat(dates[0][:10])
        except (ValueError, TypeError):
            pass

    return SanctionEntity(
        entity_id=entity.id or "",
        name=primary_name,
        aliases=aliases[:10],
        entity_type=entity.schema_type,
        datasets=entity.datasets,
        countries=props.get("country", []) + props.get("jurisdiction", []),
        topics=props.get("topics", []),
        first_seen=first_seen,
        last_seen=last_seen,
        score=entity.score or 0.0,
        source_url=f"https://www.opensanctions.org/entities/{entity.id}/" if entity.id else "",
        raw_payload={"properties": props, "datasets": entity.datasets},
    )
