# apps/agents/action_planner.py
"""
ActionPlannerAgent — converts an impact analysis into an ordered remediation plan.
"""
import logging
from typing import Any

from google.adk.agents import Agent
from sqlalchemy import select

from apps.api.core.config import settings
from services.db import async_session
from services.models import Product

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a supply chain remediation planner. \
Given an impact analysis (JSON) and using the tools to check inventory and supplier contacts, \
create a detailed action plan.

The plan MUST be a JSON array of step objects, each with:
- step_number: int (1-indexed)
- description: string
- action_type: one of "pause_orders" | "reroute_shipment" | "contact_supplier" | \
"update_documentation" | "file_exemption" | "hedge_financial"
- target_system: e.g. "ERP", "email", "Kraken", "customs_portal"
- payload: JSON object specific to the action \
  (e.g. {"po_ids": [123]}, {"supplier": "X", "message": "..."})
- dependencies: list of step_numbers that must complete first (empty list if none)

Output ONLY the JSON array, no extra text, no markdown."""


# ---------------------------------------------------------------------------
# Tool functions
# ---------------------------------------------------------------------------

async def get_supplier_contacts(supplier_name: str) -> dict[str, Any]:
    """
    Return contact information for a supplier.
    For MVP, returns mock data. In production, queries a supplier DB or CRM.

    Args:
        supplier_name: Name of the supplier to look up.
    """
    # Mock supplier contacts — replace with real CRM query in production
    mock_contacts = {
        "TSMC":     {"email": "supply@tsmc.com",    "phone": "+886-3-563-6688", "country": "TW"},
        "Foxconn":  {"email": "supply@foxconn.com", "phone": "+886-2-2268-3466", "country": "CN"},
        "Samsung":  {"email": "b2b@samsung.com",    "phone": "+82-2-2255-0114", "country": "KR"},
    }
    return mock_contacts.get(
        supplier_name,
        {"email": f"contact@{supplier_name.lower().replace(' ', '')}.com",
         "phone": "unknown",
         "country": "unknown"},
    )


async def check_inventory(sku: str) -> dict[str, Any]:
    """
    Return current stock levels for a product SKU.
    Queries the products table; falls back to a mock response.

    Args:
        sku: The product SKU to check.
    """
    try:
        async with async_session() as session:
            result = await session.execute(
                select(Product).where(Product.sku == sku)
            )
            product = result.scalar_one_or_none()
            if product:
                # In production, query ERP/WMS for live stock; BOM used here as proxy
                return {
                    "sku": product.sku,
                    "name": product.name,
                    "stock_units": 500,   # placeholder — replace with ERP call
                    "reorder_point": 100,
                    "lead_time_days": 45,
                }
    except Exception as exc:
        logger.warning("check_inventory DB error for %s: %s", sku, exc)

    return {
        "sku": sku,
        "stock_units": 500,
        "reorder_point": 100,
        "lead_time_days": 45,
        "note": "mock data",
    }


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

action_planner_agent = Agent(
    name="ActionPlannerAgent",
    model=settings.GEMINI_PRIMARY_MODEL,
    instruction=_SYSTEM_PROMPT,
    tools=[get_supplier_contacts, check_inventory],
)
