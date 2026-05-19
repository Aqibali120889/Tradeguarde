# services/integrations/opensanctions/client.py
"""
Async HTTP client for the OpenSanctions API.

Base URL : https://api.opensanctions.org
Auth     : Authorization: ApiKey <key> header
Docs     : https://www.opensanctions.org/docs/api/

Key endpoints:
  GET  /search/default?q=<name>        — fuzzy search across all datasets
  POST /match/default                  — structured entity matching
  GET  /entities/<id>                  — fetch entity by ID
  GET  /health                         — API health check
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

from services.integrations.opensanctions.schemas import (
    OSEntity,
    OSSearchResponse,
    OSMatchResult,
)

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "TradeGuard/1.0 (trade-compliance-platform)",
    "Content-Type": "application/json",
}

# Default dataset to query — "default" covers all major sanctions lists
DEFAULT_DATASET = "default"


class OpenSanctionsClient:
    """Async client for the OpenSanctions matching and search API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.opensanctions.org",
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "OpenSanctionsClient":
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers={**_HEADERS, "Authorization": f"ApiKey {self._api_key}"},
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
            raise RuntimeError("OpenSanctionsClient must be used as async context manager")
        try:
            resp = await self._http.get(path, params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "OpenSanctions HTTP %s on %s: %s",
                exc.response.status_code, path, exc.response.text[:300],
            )
            raise
        except httpx.RequestError as exc:
            logger.error("OpenSanctions request error on %s: %s", path, exc)
            raise

    async def _post(self, path: str, body: Dict[str, Any]) -> Any:
        if not self._http:
            raise RuntimeError("OpenSanctionsClient must be used as async context manager")
        try:
            resp = await self._http.post(path, json=body)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "OpenSanctions POST HTTP %s on %s: %s",
                exc.response.status_code, path, exc.response.text[:300],
            )
            raise
        except httpx.RequestError as exc:
            logger.error("OpenSanctions POST request error on %s: %s", path, exc)
            raise

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        dataset: str = DEFAULT_DATASET,
        limit: int = 10,
        schema: Optional[str] = None,
    ) -> OSSearchResponse:
        """
        Full-text fuzzy search for entities across OpenSanctions datasets.

        Args:
            query:   Name or identifier to search for (e.g. "Huawei")
            dataset: Dataset identifier — use "default" for all
            limit:   Max results to return
            schema:  FtM schema type filter (e.g. "Company", "Person")

        Returns:
            OSSearchResponse with list of matching entities.
        """
        params: Dict[str, Any] = {
            "q": query,
            "limit": limit,
        }
        if schema:
            params["schema"] = schema

        try:
            raw = await self._get(f"/search/{dataset}", params=params)
        except Exception as exc:
            logger.warning("OpenSanctions search failed for '%s': %s", query, exc)
            return OSSearchResponse(results=[], total={})

        results: List[OSEntity] = []
        for item in raw.get("results", []):
            try:
                results.append(OSEntity.model_validate(item))
            except Exception as exc:
                logger.debug("Skipping malformed OS entity: %s", exc)

        return OSSearchResponse(
            total=raw.get("total", {}),
            results=results,
            offset=raw.get("offset", 0),
            limit=raw.get("limit", limit),
        )

    async def match(
        self,
        name: str,
        country: Optional[str] = None,
        schema: str = "Company",
        dataset: str = DEFAULT_DATASET,
        fuzzy: bool = True,
        threshold: float = 0.5,
    ) -> List[OSEntity]:
        """
        Structured entity matching using OpenSanctions /match endpoint.
        Returns entities that score above the threshold.

        The /match endpoint is more accurate than /search for compliance checks.
        """
        # Build the FtM entity structure for the query
        query_entity: Dict[str, Any] = {
            "schema": schema,
            "properties": {"name": [name]},
        }
        if country:
            query_entity["properties"]["country"] = [country]

        body: Dict[str, Any] = {
            "queries": {
                "q1": query_entity,
            },
        }

        try:
            raw = await self._post(f"/match/{dataset}", body=body)
        except Exception as exc:
            logger.warning("OpenSanctions match failed for '%s': %s", name, exc)
            return []

        matched: List[OSEntity] = []
        for _query_id, query_response in raw.get("responses", {}).items():
            for result in query_response.get("results", []):
                try:
                    entity = OSEntity.model_validate(result)
                    if (entity.score or 0) >= threshold:
                        matched.append(entity)
                except Exception as exc:
                    logger.debug("Skipping malformed OS match result: %s", exc)

        # Sort by score descending
        matched.sort(key=lambda e: e.score or 0, reverse=True)
        return matched

    async def health_check(self) -> bool:
        """Verify the OpenSanctions API is reachable."""
        try:
            raw = await self._get("/health")
            return raw.get("status") == "ok" or "status" in raw
        except Exception:
            return False
