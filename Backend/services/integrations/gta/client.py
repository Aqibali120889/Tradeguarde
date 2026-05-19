# services/integrations/gta/client.py
"""
Async HTTP client for the Global Trade Alert (GTA) REST API v1.

Base URL : https://api.globaltradealert.org/v1
Auth     : X-API-Key header
Docs     : https://www.globaltradealert.org/api-documentation
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

from services.integrations.gta.schemas import GTAMeasure, GTAInterventionList

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "TradeGuard/1.0 (trade-compliance-platform)",
}


class GTAClient:
    """
    Async client for the Global Trade Alert API.

    Usage:
        async with GTAClient(api_key, base_url) as client:
            measures = await client.fetch_interventions(limit=50)
    """

    def __init__(self, api_key: str, base_url: str = "https://api.globaltradealert.org/v1") -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "GTAClient":
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers={**_HEADERS, "X-API-Key": self._api_key},
            timeout=_TIMEOUT,
            follow_redirects=True,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._http:
            await self._http.aclose()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self._http:
            raise RuntimeError("GTAClient must be used as async context manager")
        try:
            resp = await self._http.get(path, params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "GTA API HTTP error %s on %s: %s",
                exc.response.status_code, path, exc.response.text[:500],
            )
            raise
        except httpx.RequestError as exc:
            logger.error("GTA API request error on %s: %s", path, exc)
            raise

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    async def fetch_interventions(
        self,
        limit: int = 50,
        offset: int = 0,
        evaluations: Optional[List[str]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> GTAInterventionList:
        """
        Fetch a list of trade interventions (measures) from GTA.

        Args:
            limit: max records to return (GTA default 100, max 500)
            offset: pagination offset
            evaluations: filter by GTA evaluation ["Red", "Amber", "Green"]
            date_from: ISO date string YYYY-MM-DD (announcement date)
            date_to:   ISO date string YYYY-MM-DD

        Returns:
            GTAInterventionList with total count and parsed measures.
        """
        params: Dict[str, Any] = {
            "limit": limit,
            "offset": offset,
            "output_format": "json",
        }
        if evaluations:
            params["gta_evaluation"] = ",".join(evaluations)
        if date_from:
            params["date_announced_from"] = date_from
        if date_to:
            params["date_announced_to"] = date_to

        try:
            raw = await self._get("/interventions", params=params)
        except Exception as exc:
            logger.warning("GTA fetch_interventions failed: %s", exc)
            return GTAInterventionList(total=0, measures=[])

        # GTA API response shape: {"count": N, "results": [...]}
        # Adapt to our schema
        results = raw.get("results", raw.get("data", []))
        if not isinstance(results, list):
            results = []

        measures: List[GTAMeasure] = []
        for item in results:
            try:
                # Build a normalised GTAMeasure from the raw dict
                measure = _parse_raw_measure(item)
                measures.append(measure)
            except Exception as exc:
                logger.debug("Skipping malformed GTA measure: %s", exc)

        return GTAInterventionList(
            total=raw.get("count", len(measures)),
            measures=measures,
        )

    async def health_check(self) -> bool:
        """Ping the GTA API. Returns True if reachable."""
        try:
            await self._get("/interventions", params={"limit": 1, "output_format": "json"})
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Private: raw dict → GTAMeasure
# ---------------------------------------------------------------------------

def _parse_raw_measure(item: Dict[str, Any]) -> GTAMeasure:
    """Map a raw GTA API dict to a GTAMeasure, tolerating missing fields."""
    from services.integrations.gta.schemas import GTACountry

    def _country(v: Any) -> Optional[GTACountry]:
        if isinstance(v, dict):
            return GTACountry(
                iso_code=v.get("iso_code") or v.get("iso3") or v.get("isoCode"),
                name=v.get("name"),
            )
        if isinstance(v, str) and len(v) >= 2:
            return GTACountry(iso_code=v)
        return None

    implementing = _country(
        item.get("implementing_country")
        or item.get("implementingJurisdiction")
    )

    affected_raw = item.get("affected_countries") or item.get("affectedJurisdictions") or []
    if isinstance(affected_raw, list):
        affected = [c for c in (_country(x) for x in affected_raw) if c]
    else:
        affected = []

    hs_raw = item.get("hs_codes") or item.get("hsCodes") or []
    hs_codes = [str(h) for h in hs_raw] if isinstance(hs_raw, list) else []

    # Build source URL
    intervention_id = item.get("id") or item.get("intervention_id")
    source_url = (
        item.get("source_url")
        or item.get("url")
        or (f"https://www.globaltradealert.org/intervention/{intervention_id}" if intervention_id else "")
    )

    return GTAMeasure(
        id=intervention_id,
        title=item.get("title") or item.get("intervention_title") or "GTA Intervention",
        implementing_country=implementing,
        affected_countries=affected,
        hs_codes=hs_codes,
        date_announced=str(item.get("date_announced") or item.get("dateAnnounced") or ""),
        date_implemented=str(item.get("date_implemented") or item.get("dateImplemented") or ""),
        gta_evaluation=item.get("gta_evaluation") or item.get("gtaEvaluation"),
        intervention_type=item.get("intervention_type") or item.get("interventionType"),
        description=item.get("description") or item.get("abstract") or "",
        source_url=source_url,
        raw=item,
    )
