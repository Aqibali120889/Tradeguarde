# services/integrations/wto/client.py
"""
Async HTTP client for the WTO Timeseries API v1.

Base URL : https://api.wto.org/timeseries/v1
Auth     : Ocp-Apim-Subscription-Key header
Docs     : https://apiportal.wto.org/docs/services/timeseries

Key endpoints used:
  GET /data         — tariff rates and trade statistics
  GET /indicators   — list available indicators
  GET /countries    — list countries
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

from services.integrations.wto.schemas import (
    WTODataPoint,
    WTOTariffResponse,
    WTOMeasure,
    WTOMeasuresResponse,
)

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "TradeGuard/1.0",
}

# Key MFN tariff indicator
MFN_TARIFF_INDICATOR = "HS_M_0010"  # MFN simple average applied tariff


class WTOClient:
    """Async client for the WTO Timeseries REST API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.wto.org/timeseries/v1",
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "WTOClient":
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers={**_HEADERS, "Ocp-Apim-Subscription-Key": self._api_key},
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

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        if not self._http:
            raise RuntimeError("WTOClient must be used as async context manager")
        try:
            resp = await self._http.get(path, params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "WTO API HTTP %s on %s: %s",
                exc.response.status_code, path, exc.response.text[:300],
            )
            raise
        except httpx.RequestError as exc:
            logger.error("WTO API request error on %s: %s", path, exc)
            raise

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    async def get_tariff_data(
        self,
        reporter: str,
        partner: str = "all",
        indicator: str = MFN_TARIFF_INDICATOR,
        period: Optional[str] = None,
        product: Optional[str] = None,
        max_records: int = 200,
    ) -> WTOTariffResponse:
        """
        Fetch tariff rates for a reporter/partner country pair.

        Args:
            reporter: ISO3 country code of the reporting country (e.g. "USA")
            partner:  ISO3 code of the partner country or "all"
            indicator: WTO indicator code (default: MFN applied tariff)
            period:   Year string e.g. "2024" or leave None for latest
            product:  HS code prefix e.g. "72" for iron and steel
            max_records: maximum rows to return
        """
        params: Dict[str, Any] = {
            "i":          indicator,
            "r":          reporter,
            "p":          partner,
            "ps":         period or "default",
            "fmt":        "json",
            "max":        max_records,
            "off":        0,
            "head":       "H",
        }
        if product:
            params["pc"] = product

        try:
            raw = await self._get("/data", params=params)
        except Exception as exc:
            logger.warning("WTO get_tariff_data failed: %s", exc)
            return WTOTariffResponse(total=0, data=[])

        # WTO returns { "data": [...], "hasMoreData": bool, "max": N }
        rows = raw.get("data", []) if isinstance(raw, dict) else []
        data_points: List[WTODataPoint] = []
        for row in rows:
            try:
                dp = WTODataPoint(
                    reporter_code=str(row.get("rc") or row.get("reporterCode") or ""),
                    reporter_name=str(row.get("rn") or row.get("reporterName") or ""),
                    partner_code=str(row.get("pc") or row.get("partnerCode") or ""),
                    partner_name=str(row.get("pn") or row.get("partnerName") or ""),
                    indicator_code=str(row.get("ic") or indicator),
                    product_code=str(row.get("pci") or product or ""),
                    product_name=str(row.get("pcn") or ""),
                    year=int(row.get("yr") or row.get("year") or 0) or None,
                    period=str(row.get("ps") or row.get("period") or ""),
                    value=float(row.get("va") or row.get("value") or 0.0),
                    value_flag=str(row.get("vf") or row.get("valueFlag") or ""),
                    raw=row,
                )
                data_points.append(dp)
            except Exception as exc:
                logger.debug("Skipping malformed WTO data point: %s", exc)

        return WTOTariffResponse(total=len(data_points), data=data_points)

    async def health_check(self) -> bool:
        """Verify WTO API is reachable."""
        try:
            # List indicators endpoint — very lightweight
            await self._get("/indicators", params={"fmt": "json", "max": 1})
            return True
        except Exception:
            return False
