#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Test whether GEMINI_API_KEY can call Gemini successfully via google-genai SDK.

Usage:
  python backend/scripts/test_gemini_api_key.py
  python backend/scripts/test_gemini_api_key.py --model gemini-3-flash-preview
  python backend/scripts/test_gemini_api_key.py --api-key <KEY> --prompt "只回复OK"
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Dict


DEFAULT_MODEL = "gemini-3-flash-preview"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test Gemini API key availability")
    parser.add_argument("--api-key", default="", help="Gemini API key, fallback to GEMINI_API_KEY in env/.env")
    parser.add_argument("--model", default="", help="Gemini model, fallback to GEMINI_MODEL in env/.env")
    parser.add_argument("--prompt", default="请只回复：OK", help="Prompt used for connectivity check")
    parser.add_argument("--max-retries", type=int, default=4, help="Max retries for quota/429")
    parser.add_argument("--min-backoff", type=float, default=2.0, help="Min retry backoff seconds")
    parser.add_argument("--max-backoff", type=float, default=30.0, help="Max retry backoff seconds")
    return parser.parse_args()


def parse_env_file(path: Path) -> Dict[str, str]:
    data: Dict[str, str] = {}
    if not path.exists():
        return data
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        if key:
            data[key] = value
    return data


def mask_key(value: str) -> str:
    token = str(value or "").strip()
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}...{token[-4:]}"


def _calc_backoff_seconds(attempt: int, min_backoff: float, max_backoff: float) -> float:
    floor = max(0.1, float(min_backoff))
    ceiling = max(floor, float(max_backoff))
    backoff = min(ceiling, floor * (2 ** max(0, attempt - 1)))
    return min(ceiling, max(0.1, backoff))


def _is_quota_or_429_error(exc: Exception) -> bool:
    text = str(exc or "")
    normalized = text.lower()
    keywords = ("429", "resource_exhausted", "quota", "rate limit")
    return any(k in normalized for k in keywords)


def main() -> int:
    args = parse_args()

    try:
        from google import genai
    except ModuleNotFoundError:
        print("[FAIL] Missing dependency: google-genai")
        print("Install in target env: pip install -U google-genai")
        return 2
    backend_dir = Path(__file__).resolve().parents[1]
    env_map = parse_env_file(backend_dir / ".env")

    api_key = (
        str(args.api_key or "").strip()
        or os.getenv("GEMINI_API_KEY", "").strip()
        or env_map.get("GEMINI_API_KEY", "").strip()
    )
    model = (
        str(args.model or "").strip()
        or os.getenv("GEMINI_MODEL", "").strip()
        or env_map.get("GEMINI_MODEL", "").strip()
        or DEFAULT_MODEL
    )
    prompt = str(args.prompt or "").strip() or "请只回复：OK"

    if not api_key:
        print("[FAIL] GEMINI_API_KEY is empty (args/env/backend/.env).")
        return 2

    client = genai.Client(api_key=api_key)
    max_retries = max(0, int(args.max_retries))
    total_attempts = max_retries + 1

    print(f"[INFO] model={model}")
    print(f"[INFO] key={mask_key(api_key)}")
    print(f"[INFO] max_retries={max_retries}")

    last_exc: Exception | None = None
    for attempt in range(1, total_attempts + 1):
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            text = str(getattr(response, "text", "") or "").strip()
            print("[OK] Gemini API key is usable.")
            if text:
                preview = text if len(text) <= 200 else f"{text[:200]}..."
                print(f"[OK] reply={preview}")
            else:
                print("[WARN] API call succeeded but no text content was returned.")
            return 0
        except Exception as exc:
            last_exc = exc
            if _is_quota_or_429_error(exc) and attempt < total_attempts:
                sleep_seconds = _calc_backoff_seconds(
                    attempt=attempt,
                    min_backoff=float(args.min_backoff),
                    max_backoff=float(args.max_backoff),
                )
                print(
                    f"[WARN] quota/429 (attempt {attempt}/{total_attempts}), "
                    f"retry in {sleep_seconds:.1f}s"
                )
                time.sleep(sleep_seconds)
                continue
            break

    print("[FAIL] Gemini call failed.")
    if last_exc is not None:
        print(str(last_exc))
    return 1


if __name__ == "__main__":
    sys.exit(main())
