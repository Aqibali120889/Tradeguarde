#!/usr/bin/env python
# scripts/test_pipeline.py
"""
End-to-end pipeline simulation for TradeGuard.

This script:
1. Creates a test Regulation in Supabase (or reuses an existing one).
2. Publishes a regulation.detected event to Redis.
3. Optionally dispatches each Celery task directly to simulate the full pipeline.
4. Prints results at each stage.

Usage (from the backend root):
    .venv/Scripts/python.exe scripts/test_pipeline.py               # via Redis + Celery
    .venv/Scripts/python.exe scripts/test_pipeline.py --direct      # sync, no broker needed
    .venv/Scripts/python.exe scripts/test_pipeline.py --dry-run     # print payloads only
"""
import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path

# Force UTF-8 output on Windows to avoid cp1252 encode errors
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from apps.api.core.config import settings
from services.db import async_session
from services.models import Organization, Regulation
from services.event_bus import EventBus
from shared.events import EventTopic
from shared.utils import utcnow

# Test payload — simulates a regulation detected by the Watchdog
TEST_REGULATION = {
    "title": "Test US Tariff on Lithium Batteries (Section 301)",
    "country": "US",
    "category": "tariff",
    "severity": "high",
    "summary": "25% tariff applied to lithium battery imports from China effective 2026-07-01.",
    "affected_products": ["lithium batteries", "HS 8507.60"],
    "effective_date": "2026-07-01",
    "source_url": "https://test.tradeguard.internal/regulations/test-tariff",
}

SEPARATOR = "-" * 60


async def get_or_create_test_org() -> str:
    """Return the first org ID from DB, or create a test org."""
    from sqlalchemy import select
    async with async_session() as session:
        org = (await session.execute(select(Organization).limit(1))).scalar_one_or_none()
        if org:
            print(f"  Using existing org: {org.id} ({getattr(org, 'name', 'N/A')})")
            return str(org.id)
        # Create a minimal test org — Organization only has: id, name, created_at
        org = Organization(name="TradeGuard Test Org")
        session.add(org)
        await session.commit()
        await session.refresh(org)
        print(f"  Created test org: {org.id}")
        return str(org.id)


async def create_test_regulation() -> str:
    """Create a test Regulation row; return its ID."""
    from sqlalchemy import select
    async with async_session() as session:
        existing = (
            await session.execute(
                select(Regulation).where(
                    Regulation.source_url == TEST_REGULATION["source_url"]
                )
            )
        ).scalar_one_or_none()
        if existing:
            print(f"  Reusing existing regulation: {existing.id}")
            return str(existing.id)

        reg = Regulation(
            title=TEST_REGULATION["title"],
            source_url=TEST_REGULATION["source_url"],
            published_date=utcnow(),
            raw_text=TEST_REGULATION["summary"],
            normalized_event=TEST_REGULATION,
        )
        session.add(reg)
        await session.commit()
        await session.refresh(reg)
        print(f"  Created test regulation: {reg.id}")
        return str(reg.id)


async def publish_regulation_detected(regulation_id: str, dry_run: bool) -> None:
    """Publish regulation.detected event to Redis."""
    payload = {
        "regulation_id": regulation_id,
        "title": TEST_REGULATION["title"],
        "source_url": TEST_REGULATION["source_url"],
    }
    if dry_run:
        print(f"  [DRY-RUN] Would publish to {EventTopic.REGULATION_DETECTED}:")
        print(f"  {json.dumps(payload, indent=4)}")
        return

    bus = EventBus(settings.REDIS_URL)
    try:
        await bus.connect()
        await bus.publish(EventTopic.REGULATION_DETECTED, payload)
        print(f"  Published to '{EventTopic.REGULATION_DETECTED}'")
        print(f"  Payload: {json.dumps(payload, indent=4)}")
    except Exception as exc:
        print(f"  WARNING: Could not publish to Redis: {exc}")
        print("  Is Redis running? Start with: docker run -d -p 6379:6379 redis:alpine")
    finally:
        try:
            await bus.disconnect()
        except Exception:
            pass


def run_celery_task_sync(task_fn, **kwargs):
    """Call a Celery task synchronously (bypassing broker) for direct-mode testing."""
    # Calling the underlying function directly, not via .delay()
    try:
        # Celery bound tasks have self as first arg — handle gracefully
        result = task_fn(**kwargs)
        return result
    except TypeError:
        # Try with a mock self if bind=True
        from unittest.mock import MagicMock
        mock_self = MagicMock()
        mock_self.request.id = str(uuid.uuid4())
        mock_self.retry = lambda exc=None, **kw: (_ for _ in ()).throw(exc or Exception("retry"))
        return task_fn.__wrapped__(mock_self, **kwargs) if hasattr(task_fn, "__wrapped__") else task_fn(mock_self, **kwargs)


async def run_direct_task_chain(regulation_id: str, org_id: str) -> None:
    """Run the Celery task chain synchronously — no broker needed."""
    from workers.tasks.analyzer_tasks import run_impact_analysis
    from workers.tasks.planner_tasks import create_action_plan
    from workers.tasks.governance_tasks import run_governance_check
    from workers.tasks.executor_tasks import execute_action_plan
    from workers.tasks.communicator_tasks import send_completion_notification

    print()
    print(SEPARATOR)
    print("STEP 2: Impact Analysis")
    print(SEPARATOR)
    try:
        result = run_impact_analysis(regulation_id=regulation_id, org_id=org_id)
        print(f"  Result: {json.dumps(result, indent=4)}")
    except Exception as exc:
        print(f"  ERROR: {exc}")
        return
    analysis_id = result.get("analysis_id")
    if not analysis_id or result.get("status") == "error":
        print("  Impact analysis failed — stopping pipeline.")
        return

    print()
    print(SEPARATOR)
    print("STEP 3: Action Planning + Governance")
    print(SEPARATOR)
    try:
        plan_result = create_action_plan(analysis_id=analysis_id, org_id=org_id)
        print(f"  Result: {json.dumps(plan_result, indent=4)}")
    except Exception as exc:
        print(f"  ERROR: {exc}")
        return
    plan_id = plan_result.get("plan_id")
    if not plan_id:
        print("  Action plan creation failed — stopping.")
        return

    print()
    print(SEPARATOR)
    print("STEP 4: Governance Routing")
    print(SEPARATOR)
    try:
        gov_result = run_governance_check(plan_result)
        print(f"  Result: {json.dumps(gov_result, indent=4)}")
    except Exception as exc:
        print(f"  ERROR: {exc}")
        return

    if gov_result.get("status") == "awaiting_approval":
        print("\n  Plan requires human approval — execution paused.")
        print("  Approve in the TradeGuard dashboard.")
        return

    print()
    print(SEPARATOR)
    print("STEP 5: Execution")
    print(SEPARATOR)
    try:
        exec_result = execute_action_plan(plan_id=plan_id)
        print(f"  Result: {json.dumps(exec_result, indent=4)}")
    except Exception as exc:
        print(f"  ERROR: {exc}")
        exec_result = {"status": "error", "error": str(exc)}

    print()
    print(SEPARATOR)
    print("STEP 6: Notification")
    print(SEPARATOR)
    try:
        notif_result = send_completion_notification({
            "plan_id": plan_id,
            "organization_id": org_id,
            "summary": exec_result,
        })
        print(f"  Result: {json.dumps(notif_result, indent=4)}")
    except Exception as exc:
        print(f"  ERROR: {exc}")


async def main(dry_run: bool, direct: bool) -> None:
    print()
    print("=" * 60)
    print("  TradeGuard — End-to-End Pipeline Test")
    print("=" * 60)

    print()
    print(SEPARATOR)
    print("STEP 0: Setup — Organisation + Regulation")
    print(SEPARATOR)

    if dry_run:
        org_id = str(uuid.uuid4())
        regulation_id = str(uuid.uuid4())
        print(f"  [DRY-RUN] Using fake org_id: {org_id}")
        print(f"  [DRY-RUN] Using fake regulation_id: {regulation_id}")
    else:
        try:
            org_id = await get_or_create_test_org()
            regulation_id = await create_test_regulation()
        except Exception as exc:
            print(f"  ERROR connecting to Supabase DB: {exc}")
            print("  Check DATABASE_URL in .env")
            return

    print()
    print(SEPARATOR)
    print("STEP 1: Publish regulation.detected to Redis")
    print(SEPARATOR)
    await publish_regulation_detected(regulation_id, dry_run)

    if direct and not dry_run:
        print()
        print("  Running full task chain synchronously (--direct mode)...")
        await run_direct_task_chain(regulation_id, org_id)
    elif not dry_run:
        print()
        print("  Event published. If a Celery worker is running, the pipeline")
        print("  will execute autonomously. Start worker with:")
        print("  .venv/Scripts/python.exe -m celery -A workers.celery_app worker \\")
        print("      --loglevel=info -P solo -Q watchdog,analysis,planning,execution")

    print()
    print("=" * 60)
    print("  Pipeline test complete.")
    print("=" * 60)
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TradeGuard pipeline test script")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print event payloads without connecting to Redis or DB.")
    parser.add_argument("--direct", action="store_true",
                        help="Run the full task chain synchronously (no Celery broker).")
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run, direct=args.direct))
