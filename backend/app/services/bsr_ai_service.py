from __future__ import annotations

from typing import Any, Dict, List
import json
import os
import urllib.error
import urllib.request

from fastapi import HTTPException

from ..core.config import normalize_site
from ..repositories import bsr_repo
from .ai_report_prompt import KEEPA_REPORT_SYSTEM_PROMPT, build_keepa_report_user_prompt
from .bsr_common_service import _tail_text, to_float, to_int

_OPENROUTER_API_BASE = "https://openrouter.ai/api/v1/chat/completions"


def _parse_openrouter_text(response_json: Dict[str, Any]) -> str:
    choices = response_json.get("choices")
    if not isinstance(choices, list):
        return ""
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        message = choice.get("message")
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        if not isinstance(content, list):
            continue
        fragments: List[str] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                fragments.append(text.strip())
        if fragments:
            return "\n".join(fragments).strip()
    return ""


def _resolve_openrouter_model() -> str:
    explicit = str(os.getenv("OPENROUTER_MODEL", "")).strip() or str(os.getenv("OPEN_ROUTER_MODEL", "")).strip()
    if explicit:
        return explicit

    legacy = str(os.getenv("GEMINI_MODEL", "")).strip()
    if legacy:
        if legacy == "gemini-2.0-flash":
            return "google/gemini-2.0-flash-001"
        if "/" in legacy:
            return legacy
        return f"google/{legacy}"
    return "google/gemini-3-flash-preview"


def _build_openrouter_headers(api_key: str) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json; charset=utf-8",
    }
    referer = str(os.getenv("OPENROUTER_SITE_URL", "")).strip()
    if referer:
        headers["HTTP-Referer"] = referer
    app_name = str(os.getenv("OPENROUTER_APP_NAME", "Bi-Amazon Backend")).strip()
    if app_name:
        headers["X-Title"] = app_name
    return headers


def _build_bsr_ai_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    first = rows[0]
    last = rows[-1]
    first_price = to_float(first.get("price"), 0.0)
    last_price = to_float(last.get("price"), 0.0)
    first_child_sales = to_int(first.get("child_sales"), 0)
    last_child_sales = to_int(last.get("child_sales"), 0)
    coupon_days = sum(1 for row in rows if to_float(row.get("coupon_price"), 0.0) > 0)
    avg_price = round(sum(to_float(row.get("price"), 0.0) for row in rows) / max(len(rows), 1), 2)
    avg_buybox = round(sum(to_float(row.get("buybox_price"), 0.0) for row in rows) / max(len(rows), 1), 2)
    max_child_sales = max(to_int(row.get("child_sales"), 0) for row in rows)
    min_child_sales = min(to_int(row.get("child_sales"), 0) for row in rows)
    return {
        "date_start": str(first.get("date") or ""),
        "date_end": str(last.get("date") or ""),
        "first_price": first_price,
        "last_price": last_price,
        "first_child_sales": first_child_sales,
        "last_child_sales": last_child_sales,
        "coupon_days": coupon_days,
        "avg_price": avg_price,
        "avg_buybox_price": avg_buybox,
        "max_child_sales": max_child_sales,
        "min_child_sales": min_child_sales,
    }


def _call_openrouter_bsr_ai_insight(
    asin: str,
    site: str,
    range_days: int,
    rows: List[Dict[str, Any]],
    summary: Dict[str, Any],
) -> str:
    api_key = (
        str(os.getenv("OPENROUTER_API_KEY", "")).strip()
        or str(os.getenv("OPEN_ROUTER_API_KEY", "")).strip()
    )
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY 未配置")

    model = _resolve_openrouter_model()

    rows_payload = []
    for row in rows:
        rows_payload.append(
            {
                "date": str(row.get("date") or ""),
                "buybox_price": to_float(row.get("buybox_price"), 0.0),
                "price": to_float(row.get("price"), 0.0),
                "prime_price": to_float(row.get("prime_price"), 0.0),
                "coupon_price": to_float(row.get("coupon_price"), 0.0),
                "coupon_discount": to_float(row.get("coupon_discount"), 0.0),
                "child_sales": to_int(row.get("child_sales"), 0),
                "fba_price": to_float(row.get("fba_price"), 0.0),
                "fbm_price": to_float(row.get("fbm_price"), 0.0),
                "strikethrough_price": to_float(row.get("strikethrough_price"), 0.0),
                "bsr_rank": to_int(row.get("bsr_rank"), 0),
                "bsr_reciprocating_saw_blades": to_int(row.get("bsr_reciprocating_saw_blades"), 0),
                "rating": to_float(row.get("rating"), 0.0),
                "rating_count": to_int(row.get("rating_count"), 0),
                "seller_count": to_int(row.get("seller_count"), 0),
            }
        )
    prompt = build_keepa_report_user_prompt(
        asin=asin,
        site=site,
        range_days=range_days,
        summary=summary,
        rows_payload=rows_payload,
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": KEEPA_REPORT_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "top_p": 0.9,
        "max_tokens": 3072,
    }
    raw_payload = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        _OPENROUTER_API_BASE,
        data=raw_payload,
        method="POST",
        headers=_build_openrouter_headers(api_key),
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"OpenRouter 调用失败: {exc.code} {_tail_text(body, 500)}")
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter 网络错误: {exc.reason}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter 调用异常: {exc}")

    try:
        response_json = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="OpenRouter 返回解析失败")

    text = _parse_openrouter_text(response_json)
    if not text:
        raise HTTPException(status_code=502, detail="OpenRouter 未返回可用文本")
    return text


def _call_gemini_bsr_ai_insight(
    asin: str,
    site: str,
    range_days: int,
    rows: List[Dict[str, Any]],
    summary: Dict[str, Any],
) -> str:
    return _call_openrouter_bsr_ai_insight(asin, site, range_days, rows, summary)


def get_bsr_ai_insight(asin: str, site: str, range_days: int) -> Dict[str, Any]:
    target_asin = str(asin or "").strip().upper()
    if not target_asin:
        raise HTTPException(status_code=400, detail="asin 不能为空")
    normalized_site = normalize_site(site)
    safe_range_days = range_days if range_days in {7, 30, 90, 180} else 90
    rows = bsr_repo.fetch_bsr_daily_window(target_asin, normalized_site, safe_range_days)
    if not rows:
        raise HTTPException(status_code=404, detail="该 ASIN 在 fact_bsr_daily 暂无可分析数据")
    summary = _build_bsr_ai_summary(rows)
    report = _call_openrouter_bsr_ai_insight(target_asin, normalized_site, safe_range_days, rows, summary)
    return {
        "asin": target_asin,
        "site": normalized_site,
        "range_days": safe_range_days,
        "summary": summary,
        "report": report,
    }
