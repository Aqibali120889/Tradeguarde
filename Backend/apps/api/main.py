# apps/api/main.py
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.api.core.events import create_startup_handler, create_shutdown_handler
from apps.api.routers import health, regulations, analysis
from apps.api.routers import watchdog, sanctions, risks  # Phase 1
from apps.api.routers import stream, copilot             # Phase 2: Realtime
from apps.api.routers import agents                      # Phase 3: Agent telemetry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

app = FastAPI(
    title="TradeGuard API",
    version="0.1.0",
    description="Autonomous AI agent system for global supply chain compliance.",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router,       prefix="/api/health",       tags=["Health"])
app.include_router(regulations.router,  prefix="/api/regulations",  tags=["Regulations"])
app.include_router(analysis.router,     prefix="/api",              tags=["Analysis"])
# Phase 1: External data integrations
app.include_router(watchdog.router,     prefix="/api/watchdog",     tags=["Watchdog"])
app.include_router(sanctions.router,    prefix="/api/sanctions",    tags=["Sanctions"])
app.include_router(risks.router,        prefix="/api/risks",        tags=["Risks"])
# Phase 2: Realtime streaming + copilot
app.include_router(stream.router,       prefix="/api/stream",       tags=["Stream"])
app.include_router(copilot.router,      prefix="/api/copilot",      tags=["Copilot"])
# Phase 3: Agent telemetry & multi-agent queries
app.include_router(agents.router,       prefix="/api/agents",       tags=["Agents"])

# Lifecycle
app.add_event_handler("startup",  create_startup_handler(app))
app.add_event_handler("shutdown", create_shutdown_handler(app))