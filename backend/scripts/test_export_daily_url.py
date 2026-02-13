#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Run Common export_daily flow with one or more product URLs.

Usage:
  python backend/scripts/test_export_daily_url.py
  python backend/scripts/test_export_daily_url.py --url "https://www.amazon.com/dp/B00002248Y?psc=1"
  python backend/scripts/test_export_daily_url.py --url "...1" --url "...2"
"""

from __future__ import annotations

import argparse
import importlib
import sys
from datetime import date, datetime
from pathlib import Path


DEFAULT_TEST_URL = "https://www.amazon.com/dp/B00002248Y?psc=1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test export_daily with direct URL input")
    parser.add_argument(
        "--url",
        action="append",
        default=[],
        help="Amazon product URL, can pass multiple times",
    )
    parser.add_argument(
        "--site",
        default="US",
        help="Site code used for fact_bsr_daily.site, e.g. US/CA/UK/DE",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Only run export flow, skip parsing and DB import",
    )
    parser.add_argument(
        "--no-cdp",
        action="store_true",
        help="Disable CDP and launch Playwright browser directly",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run browser headless",
    )
    parser.add_argument(
        "--page-timeout-ms",
        type=int,
        default=60000,
        help="Page timeout in milliseconds passed to export flow",
    )
    parser.add_argument(
        "--blocked-wait-sec",
        type=int,
        default=30,
        help="Seconds to wait when bot check is detected",
    )
    return parser.parse_args()


def add_runtime_paths() -> None:
    bi_amazon_root = Path(__file__).resolve().parents[2]
    yida_root = bi_amazon_root.parent
    if not (yida_root / "Common").exists():
        raise SystemExit(f"Common path not found: {yida_root / 'Common'}")
    for path in (bi_amazon_root, yida_root):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)


def main() -> None:
    args = parse_args()
    urls = [str(u).strip() for u in (args.url or []) if str(u).strip()]
    if not urls:
        urls = [DEFAULT_TEST_URL]
    site = str(args.site or "US").strip().upper() or "US"

    add_runtime_paths()
    flow = importlib.import_module("Common.Web.Amazon.Flows.export_daily")
    from backend.app.services import bsr_service

    bi_amazon_root = Path(__file__).resolve().parents[2]
    export_dir = bi_amazon_root / "backend" / "files" / date.today().isoformat()
    export_dir.mkdir(parents=True, exist_ok=True)
    flow.CONFIG["export_dir"] = str(export_dir)
    flow.CONFIG["use_cdp"] = not bool(args.no_cdp)
    flow.CONFIG["headless"] = bool(args.headless)
    flow.CONFIG["page_timeout_ms"] = max(10000, int(args.page_timeout_ms or 60000))
    flow.CONFIG["blocked_wait_sec"] = max(0, int(args.blocked_wait_sec or 0))
    run_started_at = datetime.now()

    sys.argv = ["export_daily"]
    for url in urls:
        sys.argv.extend(["--url", url])

    print(f"[test_export_daily_url] urls={len(urls)}")
    print(f"[test_export_daily_url] site={site}")
    print(f"[test_export_daily_url] export_dir={export_dir}")
    print(f"[test_export_daily_url] use_cdp={flow.CONFIG['use_cdp']}")
    print(f"[test_export_daily_url] headless={flow.CONFIG['headless']}")
    print(f"[test_export_daily_url] page_timeout_ms={flow.CONFIG['page_timeout_ms']}")
    print(f"[test_export_daily_url] blocked_wait_sec={flow.CONFIG['blocked_wait_sec']}")
    flow.main()
    print("[test_export_daily_url] export finished")

    if args.skip_db:
        print("[test_export_daily_url] skip DB import (--skip-db)")
        return

    result = bsr_service._import_fact_bsr_daily_from_exports(export_dir, site, urls, run_started_at)
    print(
        "[test_export_daily_url] db import done:"
        f" rows={result.get('imported_rows', 0)},"
        f" workbooks={result.get('workbook_count', 0)},"
        f" failed_files={len(result.get('failed_files') or [])}"
    )
    for line in (result.get("failed_files") or []):
        print(f"[test_export_daily_url] failed_file={line}")


if __name__ == "__main__":
    main()
