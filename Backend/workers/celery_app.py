# workers/celery_app.py
"""
TradeGuard Celery application.

Broker  : Redis db=0  (same as pub/sub)
Backend : Redis db=1  (task result storage)
Beat    : Periodic watchdog scan every 30 minutes

Run worker:
    celery -A workers.celery_app worker --loglevel=info -P solo

Run beat scheduler:
    celery -A workers.celery_app beat --loglevel=info

Run both (dev only):
    celery -A workers.celery_app worker --loglevel=info -B -P solo
"""

from celery import Celery
from apps.api.core.config import settings

# Broker  = Redis db/0, Backend = Redis db/1
_broker = settings.REDIS_URL          # redis://localhost:6379/0
_backend = _broker.rstrip("/0") + "/1" if _broker.endswith("/0") else _broker + "/1"

celery_app = Celery(
    "tradeguard",
    broker=_broker,
    backend=_backend,
    include=[
        "workers.tasks.watchdog_tasks",
        "workers.tasks.ingestion_tasks",       # Phase 1: GTA, WTO ingestion
        "workers.tasks.analyzer_tasks",
        "workers.tasks.planner_tasks",
        "workers.tasks.executor_tasks",
        "workers.tasks.governance_tasks",
        "workers.tasks.communicator_tasks",
    ],
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Time
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,       # one task at a time per worker

    # Result TTL
    result_expires=86400,               # keep results 24 h

    # Retry defaults (overridden per task where needed)
    task_max_retries=3,
)

# ---------------------------------------------------------------------------
# Beat schedule — periodic tasks
# ---------------------------------------------------------------------------
celery_app.conf.beat_schedule = {
    # Watchdog scans all regulatory sources every 30 minutes
    "watchdog-scan-30min": {
        "task": "workers.tasks.watchdog_tasks.scan_regulatory_sources",
        "schedule": 1800.0,  # seconds
        "options": {"queue": "watchdog"},
    },
    # Phase 1: GTA ingestion every 6 hours
    "gta-ingestion-6h": {
        "task": "workers.tasks.ingestion_tasks.ingest_gta_regulations",
        "schedule": 21600.0,
        "options": {"queue": "watchdog"},
    },
    # Phase 1: WTO ingestion every 12 hours
    "wto-ingestion-12h": {
        "task": "workers.tasks.ingestion_tasks.ingest_wto_measures",
        "schedule": 43200.0,
        "options": {"queue": "watchdog"},
    },
}

# ---------------------------------------------------------------------------
# Queue routing — keeps long scans from blocking fast analysis tasks
# ---------------------------------------------------------------------------
celery_app.conf.task_routes = {
    "workers.tasks.watchdog_tasks.*":  {"queue": "watchdog"},
    "workers.tasks.analyzer_tasks.*":  {"queue": "analysis"},
    "workers.tasks.planner_tasks.*":   {"queue": "planning"},
    "workers.tasks.executor_tasks.*":  {"queue": "execution"},
}
