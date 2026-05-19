# apps/agents/watchdog/agent.py
"""
RegulatoryWatchdogAgent — monitors regulatory sources and extracts structured events.
"""
from google.adk.agents import Agent

from apps.api.core.config import settings
from apps.agents.watchdog.prompts import WATCHDOG_SYSTEM_PROMPT
from apps.agents.watchdog.tools import (
    fetch_url,
    list_sources,
    parse_rss,
    store_regulation,
)

watchdog_agent = Agent(
    name="RegulatoryWatchdogAgent",
    model=settings.GEMINI_PRIMARY_MODEL,
    instruction=WATCHDOG_SYSTEM_PROMPT,
    tools=[fetch_url, parse_rss, store_regulation, list_sources],
)
