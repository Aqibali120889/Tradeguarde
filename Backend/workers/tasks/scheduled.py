# workers/tasks/scheduled.py
"""
Celery beat schedule definitions.
Imported by celery_app.py — kept here for readability.
Add new periodic tasks to BEAT_SCHEDULE and import it in celery_app.py.
"""

BEAT_SCHEDULE = {
    # Watchdog: scan all four regulatory sources every 30 minutes
    "watchdog-scan-30min": {
        "task": "workers.tasks.watchdog_tasks.scan_regulatory_sources",
        "schedule": 1800.0,
        "options": {"queue": "watchdog"},
    },
    # Future: nightly OFAC full-list refresh (00:05 UTC)
    # "ofac-nightly-refresh": {
    #     "task": "workers.tasks.watchdog_tasks.refresh_ofac_full_list",
    #     "schedule": crontab(hour=0, minute=5),
    #     "options": {"queue": "watchdog"},
    # },
}
