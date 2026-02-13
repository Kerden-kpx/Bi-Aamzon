#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Re-import fact_bsr_daily data from exported xlsx files.

No CLI args. Configure constants below, then run:
  python backend/scripts/reimport_fact_bsr_daily.py
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path
from typing import List

# ===== Fixed runtime config =====
# Windows path is supported and will be converted to /mnt/... automatically.
TARGET_EXPORT_DIR = r"D:\Yida_project\Bi-Amazon\backend\files\2026-02-11"
TARGET_SITE = "US"


def add_runtime_paths() -> Path:
    bi_amazon_root = Path(__file__).resolve().parents[2]
    yida_root = bi_amazon_root.parent
    for path in (bi_amazon_root, yida_root):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)
    return bi_amazon_root


def convert_windows_path(raw: str) -> Path | None:
    text = str(raw or "").strip()
    if not text:
        return None
    # D:\foo\bar -> /mnt/d/foo/bar
    match = re.match(r"^([A-Za-z]):[\\/](.*)$", text)
    if not match:
        return None
    drive = match.group(1).lower()
    tail = match.group(2).replace("\\", "/")
    return Path(f"/mnt/{drive}/{tail}")


def resolve_export_dir(raw_dir: str) -> Path:
    direct = Path(raw_dir)
    if direct.exists():
        return direct
    converted = convert_windows_path(raw_dir)
    if converted and converted.exists():
        return converted
    raise SystemExit(f"导出目录不存在: {raw_dir}")


def collect_asin_tokens(export_dir: Path) -> List[str]:
    tokens: List[str] = []
    status_csv = export_dir / "status.csv"
    if status_csv.exists():
        try:
            with status_csv.open("r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    asin = str(row.get("asin") or "").strip().upper()
                    if re.fullmatch(r"[A-Z0-9]{10}", asin):
                        tokens.append(asin)
        except Exception:
            pass

    if tokens:
        return list(dict.fromkeys(tokens))

    for path in sorted(export_dir.glob("*.xlsx")):
        if path.name.startswith("~$"):
            continue
        match = re.match(r"([A-Za-z0-9]{10})(?:_|$)", path.name)
        if match:
            tokens.append(match.group(1).upper())
    return list(dict.fromkeys(tokens))


def main() -> None:
    site = str(TARGET_SITE or "US").strip().upper() or "US"
    add_runtime_paths()
    export_dir = resolve_export_dir(str(TARGET_EXPORT_DIR or "").strip())

    workbook_count = len([p for p in export_dir.glob("*.xlsx") if not p.name.startswith("~$")])
    if workbook_count <= 0:
        raise SystemExit(f"目录下没有可导入的 xlsx: {export_dir}")

    asin_tokens = collect_asin_tokens(export_dir)

    from backend.app.services import bsr_service

    print(f"[reimport] export_dir={export_dir}")
    print(f"[reimport] site={site}")
    print(f"[reimport] workbooks={workbook_count}")
    print(f"[reimport] asin_tokens={len(asin_tokens)}")

    # started_at=None: import current folder's matched xlsx directly.
    result = bsr_service._import_fact_bsr_daily_from_exports(export_dir, site, asin_tokens, None)
    print(
        "[reimport] done:"
        f" rows={result.get('imported_rows', 0)},"
        f" workbooks={result.get('workbook_count', 0)},"
        f" failed_files={len(result.get('failed_files') or [])}"
    )
    for line in (result.get("failed_files") or []):
        print(f"[reimport] failed_file={line}")


if __name__ == "__main__":
    main()
