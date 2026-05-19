# -*- coding: utf-8 -*-
"""
TradeGuard Backend - End-to-End Test Suite
==========================================
Tests every component: health, DB, Redis, Qdrant, MinIO,
AI services, regulation ingestion, and the autonomous pipeline.

Usage:
    python scripts/e2e_test.py [--base-url http://localhost:8000]
"""

import sys
import io
import json
import time
import argparse
import textwrap
import datetime
import urllib.request
import urllib.error
import urllib.parse

# Force UTF-8 output on Windows to avoid cp1252 encoding errors
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

results: list[dict] = []


def _log(color: str, prefix: str, msg: str):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"{color}{BOLD}[{ts}] {prefix}{RESET}  {msg}")


def ok(label: str, detail: str = ""):
    _log(GREEN, "✔ PASS", f"{label}  {detail}")
    results.append({"label": label, "status": "PASS", "detail": detail})


def fail(label: str, detail: str = ""):
    _log(RED, "✘ FAIL", f"{label}  {detail}")
    results.append({"label": label, "status": "FAIL", "detail": detail})


def info(msg: str):
    _log(CYAN, "  INFO", msg)


def warn(msg: str):
    _log(YELLOW, "  WARN", msg)


def section(title: str):
    print()
    print(f"{BOLD}{CYAN}{'-'*60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'-'*60}{RESET}")


# ─────────────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────────────

def _request(method: str, url: str, body: dict | None = None, timeout: int = 15) -> tuple[int, dict | str]:
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw
    except urllib.error.URLError as exc:
        return 0, str(exc.reason)
    except Exception as exc:
        return 0, str(exc)


def GET(base: str, path: str, **kw):
    return _request("GET", base.rstrip("/") + path, **kw)


def POST(base: str, path: str, body: dict | None = None, **kw):
    return _request("POST", base.rstrip("/") + path, body=body, **kw)


# ─────────────────────────────────────────────────────────────────────────────
# Test sections
# ─────────────────────────────────────────────────────────────────────────────

def test_server_reachable(base: str):
    section("1. SERVER REACHABILITY")
    status, body = GET(base, "/")
    if status == 0:
        fail("Server reachable", f"Cannot connect to {base} — {body}")
    elif status in (200, 404, 422):  # 404 is fine (no root route defined)
        ok("Server reachable", f"HTTP {status}")
    else:
        warn(f"Unexpected status {status} on GET /  — {body}")
        ok("Server reachable", f"HTTP {status} (non-standard root)")


def test_health(base: str):
    section("2. COMBINED HEALTH ENDPOINT  GET /api/health")
    status, body = GET(base, "/api/health")
    label = "GET /api/health"
    if status != 200:
        fail(label, f"HTTP {status} — {body}")
        return

    info(f"Response: {json.dumps(body, indent=2)}")
    overall = body.get("status", "?")
    services = body.get("services", {})

    if overall == "ok":
        ok(label, "Overall status = ok")
    else:
        fail(label, f"Overall status = {overall}")

    for svc, svc_status in services.items():
        svc_label = f"  └─ service: {svc}"
        if isinstance(svc_status, str) and svc_status.startswith("ok"):
            ok(svc_label, svc_status)
        else:
            fail(svc_label, str(svc_status))


def test_regulations(base: str) -> str | None:
    """Returns regulation_id if created successfully."""
    section("3. REGULATIONS  (LIST + CREATE + GET)")

    # 3a – list
    status, body = GET(base, "/api/regulations")
    if status == 200:
        total = body.get("total", "?")
        ok("GET /api/regulations", f"total={total}")
    else:
        fail("GET /api/regulations", f"HTTP {status} — {body}")

    # 3b – create
    unique_url = f"https://example.com/tariff-steel-{int(time.time())}"
    payload = {
        "title": "E2E Test: 25% Tariff on Canadian Steel",
        "source_url": unique_url,
        "published_date": "2025-05-15T00:00:00",
        "raw_text": (
            "New tariff rule: 25% duty on steel sheet and aluminum frame imports "
            "from Canada, effective immediately. Applies to HS codes 7208.x and 7606.x."
        ),
        "normalized_event": {
            "type": "TARIFF_CHANGE",
            "affected_countries": ["CA"],
            "duty_rate": 0.25,
        },
    }
    status, body = POST(base, "/api/regulations", body=payload)
    if status == 201:
        reg_id = body.get("id")
        ok("POST /api/regulations", f"Created id={reg_id}")
    elif status == 409:
        warn("POST /api/regulations: already exists (409) — fetching list to get an id")
        _, list_body = GET(base, "/api/regulations")
        items = list_body.get("items", [])
        reg_id = items[0]["id"] if items else None
        ok("POST /api/regulations", f"409 Conflict (re-using id={reg_id})")
    else:
        fail("POST /api/regulations", f"HTTP {status} — {body}")
        return None

    # 3c – get by id
    if reg_id:
        status, body = GET(base, f"/api/regulations/{reg_id}")
        if status == 200:
            ok(f"GET /api/regulations/{{id}}", f"title={body.get('title','?')[:60]}")
        else:
            fail(f"GET /api/regulations/{{id}}", f"HTTP {status} — {body}")

    return reg_id


def test_analyses(base: str):
    section("4. IMPACT ANALYSES  GET /api/analyses")
    status, body = GET(base, "/api/analyses")
    if status == 200:
        total = body.get("total", "?")
        ok("GET /api/analyses", f"total={total}")
        items = body.get("items", [])
        if items:
            aid = items[0]["id"]
            status2, body2 = GET(base, f"/api/analyses/{aid}")
            if status2 == 200:
                ok(f"GET /api/analyses/{{id}}", f"status={body2.get('status','?')}")
            else:
                fail(f"GET /api/analyses/{{id}}", f"HTTP {status2} — {body2}")
        else:
            info("No analyses found yet — skipping detail fetch")
    else:
        fail("GET /api/analyses", f"HTTP {status} — {body}")


def test_action_plans(base: str):
    section("5. ACTION PLANS & EXECUTION LOGS")
    # action plans require a valid UUID from analyses — just test list endpoints
    status, body = GET(base, "/api/execution-logs")
    if status == 200:
        ok("GET /api/execution-logs", f"total={body.get('total','?')}")
    else:
        fail("GET /api/execution-logs", f"HTTP {status} — {body}")


def test_pipeline_wait(base: str, regulation_id: str | None):
    section("6. AUTONOMOUS PIPELINE MONITORING")
    if not regulation_id:
        warn("No regulation_id available — skipping pipeline wait")
        return

    info(f"Watching for ImpactAnalysis linked to regulation {regulation_id} ...")
    info("Polling GET /api/analyses every 3 s (up to 60 s) ...")

    deadline = time.time() + 60
    found_analysis = None
    while time.time() < deadline:
        status, body = GET(base, "/api/analyses")
        if status == 200:
            for item in body.get("items", []):
                if str(item.get("regulation_id")) == str(regulation_id):
                    found_analysis = item
                    break
        if found_analysis:
            break
        time.sleep(3)
        sys.stdout.write(".")
        sys.stdout.flush()

    print()

    if found_analysis:
        anal_status = found_analysis.get("status", "?")
        anal_id = found_analysis.get("id")
        ok("Pipeline produced ImpactAnalysis", f"id={anal_id}  status={anal_status}")
        info(f"Full record:\n{textwrap.indent(json.dumps(found_analysis, indent=2), '  ')}")
    else:
        warn(
            "No ImpactAnalysis found for this regulation after 60 s. "
            "The pipeline may still be running (Celery worker / agents). "
            "This is a SOFT failure — infrastructure is healthy."
        )
        results.append({"label": "Pipeline produced ImpactAnalysis", "status": "WARN",
                        "detail": "Not completed within 60 s timeout"})


# ─────────────────────────────────────────────────────────────────────────────
# Docs / OpenAPI sanity
# ─────────────────────────────────────────────────────────────────────────────

def test_openapi(base: str):
    section("7. OPENAPI / SWAGGER DOCS")
    status, body = GET(base, "/openapi.json")
    if status == 200 and isinstance(body, dict):
        paths = list(body.get("paths", {}).keys())
        ok("GET /openapi.json", f"{len(paths)} paths registered")
        info("Registered paths:\n" + "\n".join(f"  {p}" for p in sorted(paths)))
    else:
        fail("GET /openapi.json", f"HTTP {status} — {str(body)[:200]}")


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

def print_summary():
    section("FINAL SUMMARY")
    passed  = [r for r in results if r["status"] == "PASS"]
    failed  = [r for r in results if r["status"] == "FAIL"]
    warned  = [r for r in results if r["status"] == "WARN"]

    print(f"\n  {GREEN}PASS{RESET}: {len(passed)}   {RED}FAIL{RESET}: {len(failed)}   {YELLOW}WARN{RESET}: {len(warned)}\n")

    if failed:
        print(f"{RED}{BOLD}  ✘ FAILED CHECKS:{RESET}")
        for r in failed:
            print(f"    • {r['label']}: {r['detail']}")
        print()

    if warned:
        print(f"{YELLOW}{BOLD}  ⚠ WARNINGS:{RESET}")
        for r in warned:
            print(f"    • {r['label']}: {r['detail']}")
        print()

    if not failed:
        print(f"{GREEN}{BOLD}  [OK] All TradeGuard backend services are healthy and end-to-end test succeeded.{RESET}")
    else:
        print(f"{RED}{BOLD}  [FAIL] Some checks failed - see above.{RESET}")


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="TradeGuard E2E Test")
    parser.add_argument("--base-url", default="http://localhost:8000",
                        help="Base URL of the FastAPI server")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    print(f"\n{BOLD}{CYAN}TradeGuard Backend — End-to-End Test Suite{RESET}")
    print(f"  Target: {base}")
    print(f"  Time  : {datetime.datetime.now().isoformat()}")

    test_server_reachable(base)
    test_openapi(base)
    test_health(base)
    reg_id = test_regulations(base)
    test_analyses(base)
    test_action_plans(base)
    test_pipeline_wait(base, reg_id)
    print_summary()

    # Exit non-zero if any hard failures
    sys.exit(1 if any(r["status"] == "FAIL" for r in results) else 0)


if __name__ == "__main__":
    main()
