from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from .. import auth as auth_core
from ..repositories import user_repo


def _normalize_allowed(value: Optional[str], allowed: set[str]) -> Optional[str]:
    if not value:
        return None
    value = value.strip().lower()
    return value if value in allowed else None


def normalize_user_role(value: Optional[str]) -> Optional[str]:
    return _normalize_allowed(value, {"admin", "operator"})


def normalize_user_status(value: Optional[str]) -> Optional[str]:
    return _normalize_allowed(value, {"active", "disabled"})


def normalize_product_scope(value: Optional[str]) -> Optional[str]:
    return _normalize_allowed(value, {"all", "restricted"})


def normalize_asins(values: Optional[List[str]]) -> List[str]:
    if not values:
        return []
    seen: set[str] = set()
    items: List[str] = []
    for raw in values:
        if raw is None:
            continue
        asin = str(raw).strip()
        if not asin:
            continue
        asin = asin.upper()
        if asin in seen:
            continue
        seen.add(asin)
        items.append(asin)
    return items


def _row_to_user_item(row: Dict[str, Any]) -> Dict[str, Any]:
    created_at = row.get("created_at")
    last_active_at = row.get("last_active_at")
    return {
        "dingtalk_userid": row.get("dingtalk_userid") or "",
        "dingtalk_username": row.get("dingtalk_username") or "",
        "role": row.get("role") or "",
        "status": row.get("status") or "",
        "product_scope": row.get("product_scope") or "all",
        "last_active_at": last_active_at.isoformat()
        if isinstance(last_active_at, date)
        else str(last_active_at) if last_active_at is not None else None,
        "created_at": created_at.isoformat()
        if isinstance(created_at, date)
        else str(created_at) if created_at is not None else None,
    }


def list_users(limit: int, offset: int, role: Optional[str], status: Optional[str], keyword: Optional[str]) -> List[Dict[str, Any]]:
    rows = user_repo.fetch_users(limit, offset, role, status, keyword)
    return [_row_to_user_item(row) for row in rows]


def default_product_scope_for_role(role: str) -> str:
    return "restricted" if role == "operator" else "all"


def create_user(userid: str, username: str, avatar_url: Optional[str], role: str, status: str) -> str:
    product_scope = default_product_scope_for_role(role)
    try:
        user_repo.insert_user(userid, username, avatar_url, role, status, product_scope)
    except Exception as exc:
        message = str(exc).lower()
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=409, detail="User already exists") from exc
        raise
    return product_scope


def update_user(userid: str, role: Optional[str], status: Optional[str]) -> int:
    return user_repo.update_user(userid, role, status)


def remove_user(userid: str) -> int:
    return user_repo.delete_user(userid)


def list_audit_logs(
    limit: int,
    offset: int,
    module: Optional[str],
    action: Optional[str],
    userid: Optional[str],
    keyword: Optional[str],
    date_from: Optional[Any],
    date_to: Optional[Any],
) -> List[Dict[str, Any]]:
    return user_repo.query_audit_logs(limit, offset, module, action, userid, keyword, date_from, date_to)


def log_audit(
    module: str,
    action: str,
    target_id: Optional[str],
    operator_userid: Optional[str],
    operator_name: Optional[str],
    detail: Optional[str],
) -> None:
    user_repo.insert_audit_log(module, action, target_id, operator_userid, operator_name, detail)


def lookup_user_name(userid: str) -> Optional[str]:
    return user_repo.lookup_user_name(userid)


def lookup_dingtalk_users_by_name(name: str, limit: int = 8) -> List[Dict[str, Any]]:
    keyword = str(name or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="Missing name")
    normalized_limit = max(1, min(int(limit or 8), 20))
    return auth_core.search_dingtalk_users(keyword, normalized_limit)


def _require_operator_visibility_user(userid: str) -> Dict[str, Any]:
    row = user_repo.fetch_user_product_visibility(userid)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if row.get("role") != "operator":
        raise HTTPException(status_code=400, detail="Product visibility only supports operator users")
    return row


def get_user_product_visibility(userid: str) -> Dict[str, Any]:
    row = _require_operator_visibility_user(userid)
    return {
        "userid": row.get("dingtalk_userid") or userid,
        "product_scope": normalize_product_scope(row.get("product_scope")) or "all",
        "asins": normalize_asins(row.get("asins")),
    }


def update_user_product_visibility(
    userid: str,
    product_scope: str,
    asins: List[str],
    operator_userid: str,
    operator_name: str,
) -> Dict[str, Any]:
    scope = normalize_product_scope(product_scope)
    if not scope:
        raise HTTPException(status_code=400, detail="Invalid product_scope")

    _require_operator_visibility_user(userid)

    normalized_asins = normalize_asins(asins)
    if scope == "all":
        normalized_asins = []

    ok = user_repo.replace_user_product_visibility(userid, scope, normalized_asins, operator_userid)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")

    log_audit(
        module="permission",
        action="update_product_visibility",
        target_id=userid,
        operator_userid=operator_userid,
        operator_name=operator_name,
        detail=f"product_scope={scope}, asins={','.join(normalized_asins)}",
    )

    return {"userid": userid, "product_scope": scope, "asins": normalized_asins, "count": len(normalized_asins)}


def _to_int(value: Any) -> int:
    if value is None:
        return 0
    try:
        return int(value)
    except Exception:
        try:
            return int(float(value))
        except Exception:
            return 0


def _to_date_key(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return ""
    return text.split(" ")[0]


def _build_day_keys(days: int) -> List[str]:
    today = date.today()
    return [(today - timedelta(days=offset)).isoformat() for offset in range(days - 1, -1, -1)]


def get_permission_stats() -> Dict[str, Any]:
    raw = user_repo.fetch_permission_stats_aggregates()

    summary_row = raw.get("summary") or {}
    weekly_rows = raw.get("weekly_rows") or []
    monthly_rows = raw.get("monthly_rows") or []
    module_rows = raw.get("module_rows") or []
    usage_rows = raw.get("usage_rows") or []

    weekly_keys = _build_day_keys(7)
    monthly_keys = _build_day_keys(30)

    weekly_map: Dict[str, int] = {}
    for row in weekly_rows:
        key = _to_date_key(row.get("date_key"))
        if not key:
            continue
        weekly_map[key] = _to_int(row.get("count"))

    monthly_map: Dict[str, int] = {}
    for row in monthly_rows:
        key = _to_date_key(row.get("date_key"))
        if not key:
            continue
        monthly_map[key] = _to_int(row.get("count"))

    weekly_trend = [{"date": day, "count": weekly_map.get(day, 0)} for day in weekly_keys]
    monthly_trend = [{"date": day, "count": monthly_map.get(day, 0)} for day in monthly_keys]

    base_modules = ["bsr", "strategy", "product", "permission", "user"]
    module_counter: Dict[str, int] = {module: 0 for module in base_modules}
    for row in module_rows:
        module = str(row.get("module") or "unknown").strip() or "unknown"
        module_counter[module] = module_counter.get(module, 0) + _to_int(row.get("count"))
    module_total = sum(module_counter.values()) or 1
    module_usage = sorted(
        [
            {"module": module, "count": count, "ratio": count / module_total}
            for module, count in module_counter.items()
        ],
        key=lambda item: (-item["count"], item["module"]),
    )

    usage_items: List[Dict[str, Any]] = []
    for row in usage_rows:
        userid = str(row.get("userid") or "").strip()
        username = str(row.get("username") or "").strip()
        if not userid:
            continue
        usage_items.append(
            {
                "userid": userid,
                "name": username or userid,
                "sevenDays": _to_int(row.get("visits_7d")),
                "thirtyDays": _to_int(row.get("visits_30d")),
                "total": _to_int(row.get("total_visits")),
            }
        )

    return {
        "summary": {
            "totalUsers": len(usage_items),
            "activeToday": _to_int(summary_row.get("active_today")),
            "activeWeek": _to_int(summary_row.get("active_week")),
            "visitCount": _to_int(summary_row.get("visits_30d")),
            "actionCount": _to_int(summary_row.get("total_visits")),
        },
        "weeklyTrend": weekly_trend,
        "monthlyTrend": monthly_trend,
        "moduleUsage": module_usage,
        "usageRows": usage_items,
    }
