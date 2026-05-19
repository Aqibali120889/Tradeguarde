# apps/agents/impact_analyzer.py
"""
ImpactAnalyzerAgent — reasons about the impact of a regulation using Gemini Pro + Qdrant RAG.
"""
import logging
from typing import Any

from google.adk.agents import Agent
from sqlalchemy import select

from apps.api.core.config import settings
from services.db import async_session
from services.models import Product
from services.qdrant_client import get_qdrant_service
from services.ai import get_gemini_client, get_featherless_client

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a trade compliance impact analyst. \
Given a regulation event (JSON) and using the tools to retrieve product BOMs and similar past regulations, \
produce a structured impact analysis as JSON with exactly these fields:
- affected_skus: list of SKU strings impacted by this regulation
- risk_level: "high" | "medium" | "low"
- estimated_financial_impact: number in USD (your best estimate)
- supply_chain_nodes: list of strings (affected suppliers, ports, countries)
- compliance_deadline: ISO 8601 date string or null
- recommended_actions: array of short action strings
- reasoning: brief explanation of your analysis

Return ONLY valid JSON, no extra text."""


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------

async def get_product_bom(sku: str) -> dict[str, Any]:
    """
    Retrieve the Bill of Materials and metadata for a product SKU from the database.
    Returns a dict with sku, name, hs_code, bom, and supplier_ids.
    Falls back to a mock product if the table is empty or SKU not found.

    Args:
        sku: The product SKU to look up.
    """
    try:
        async with async_session() as session:
            result = await session.execute(
                select(Product).where(Product.sku == sku)
            )
            product = result.scalar_one_or_none()
            if product:
                return {
                    "sku": product.sku,
                    "name": product.name,
                    "hs_code": product.hs_code,
                    "bom": product.bom or [],
                    "supplier_ids": product.supplier_ids or [],
                }
    except Exception as exc:
        logger.warning("get_product_bom DB error for %s: %s", sku, exc)

    # Fallback mock for MVP
    return {
        "sku": sku,
        "name": f"Mock Product ({sku})",
        "hs_code": "8471.30",
        "bom": [
            {"component": "PCB", "supplier": "TSMC", "origin": "TW"},
            {"component": "Case", "supplier": "Foxconn", "origin": "CN"},
        ],
        "supplier_ids": ["sup-001", "sup-002"],
    }


async def search_similar_regulations(query: str) -> list[dict[str, Any]]:
    """
    Search Qdrant for regulations similar to the given query text.
    Returns up to 5 matching regulation payloads with similarity scores.

    Args:
        query: Natural-language description of what to search for.
    """
    try:
        gemini = get_gemini_client()
        embedding = await gemini.embed(query[:8000])
        qdrant = get_qdrant_service()
        results = await qdrant.search_similar(embedding, limit=5)
        return results
    except Exception as exc:
        logger.warning("search_similar_regulations failed: %s", exc)
        return []


async def classify_hs_code(description: str) -> str:
    """
    Classify a product or material description into the closest HS tariff code.
    Uses the Featherless model (Meta-Llama-3.1-8B-Instruct) for classification.

    Args:
        description: Plain-text description of the product or material.
    """
    try:
        featherless = get_featherless_client()
        result = await featherless.generate(
            prompt=f"Classify this product into the most specific HS tariff code (format: XXXX.XX): {description}\nRespond with ONLY the HS code, nothing else.",
            model=settings.FEATHERLESS_HS_MODEL,
            system_instruction="You are an expert in international trade and HS tariff classification. Respond with only the HS code.",
            temperature=0.0,
            max_tokens=20,
        )
        return result.strip()
    except Exception as exc:
        logger.warning("classify_hs_code failed: %s", exc)
        return "0000.00"


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

impact_analyzer_agent = Agent(
    name="ImpactAnalyzerAgent",
    model=settings.GEMINI_PRIMARY_MODEL,
    instruction=_SYSTEM_PROMPT,
    tools=[get_product_bom, search_similar_regulations, classify_hs_code],
)
