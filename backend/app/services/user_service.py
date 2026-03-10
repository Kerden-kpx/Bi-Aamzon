from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from .. import auth as auth_core
from ..core.logging import logger
from ..repositories import rbac_repo, user_repo
from . import rbac_service


def _normalize_allowed(value: Optional[str], allowed: set[str]) -> Optional[str]:
    if not value:
        return None
    value = value.strip().lower()
    return value if value in allowed else None


def normalize_user_role(value: Optional[str]) -> Optional[str]:
    return _normalize_allowed(value, {"admin", "team_lead", "operator"})


def normalize_user_status(value: Optional[str]) -> Optional[str]:
    return _normalize_allowed(value, {"active", "disabled"})


def normalize_product_scope(value: Optional[str]) -> Optional[str]:
    return _normalize_allowed(value, {"all", "restricted"})


def _parse_permission_token(raw: Any) -> Optional[tuple[str, str]]:
    if raw is None:
        return None
    token = str(raw).strip()
    if not token:
        return None
    parts: List[str]
    for sep in ("|", "@@", "::"):
        if sep in token:
            parts = [part.strip() for part in token.split(sep, 1)]
            asin = (parts[0] if parts else "").upper()
            site = ((parts[1] if len(parts) > 1 else "") or "US").upper()
            if not asin:
                return None
            return asin, site
    return token.upper(), "US"


def normalize_permission_pairs(values: Optional[List[str]]) -> List[tuple[str, str]]:
    if not values:
        return []
    seen: set[tuple[str, str]] = set()
    items: List[tuple[str, str]] = []
    for raw in values:
        pair = _parse_permission_token(raw)
        if pair is None:
            continue
        if pair in seen:
            continue
        seen.add(pair)
        items.append(pair)
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


def _resolve_roles(userid: str, role: str) -> set[str]:
    return rbac_service.resolve_user_roles(userid, role)


def _is_admin(userid: str, role: str) -> bool:
    roles = _resolve_roles(userid, role)
    return "admin" in roles or role == "admin"


def _is_team_lead(userid: str, role: str) -> bool:
    roles = _resolve_roles(userid, role)
    return "team_lead" in roles or role == "team_lead"


def _team_member_userids_or_raise(userid: str, role: str) -> List[str]:
    if _is_admin(userid, role):
        return []
    if not _is_team_lead(userid, role):
        raise HTTPException(status_code=403, detail="Forbidden")
    return rbac_repo.list_lead_team_member_userids(userid)


def list_users_for_manager(
    limit: int,
    offset: int,
    role: Optional[str],
    status: Optional[str],
    keyword: Optional[str],
    operator_userid: str,
    operator_role: str,
) -> List[Dict[str, Any]]:
    if _is_admin(operator_userid, operator_role):
        return list_users(limit, offset, role, status, keyword)

    visible_userids = _team_member_userids_or_raise(operator_userid, operator_role)
    rows = user_repo.fetch_users(limit, offset, role, status, keyword, visible_userids=visible_userids)
    return [_row_to_user_item(row) for row in rows]


def assert_user_manageable(userid: str, operator_userid: str, operator_role: str) -> Dict[str, Any]:
    target = user_repo.fetch_user_by_userid(userid)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if _is_admin(operator_userid, operator_role):
        return target

    member_userids = _team_member_userids_or_raise(operator_userid, operator_role)
    if userid not in set(member_userids):
        raise HTTPException(status_code=403, detail="Forbidden")
    if str(target.get("role") or "").strip().lower() == "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return target


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
    if not rbac_repo.replace_user_roles(userid, [role]):
        logger.warning("rbac_user_role_sync_failed userid=%s role=%s", userid, role)
    return product_scope


def create_user_for_manager(
    userid: str,
    username: str,
    avatar_url: Optional[str],
    role: str,
    status: str,
    operator_userid: str,
    operator_role: str,
) -> str:
    if _is_admin(operator_userid, operator_role):
        return create_user(userid, username, avatar_url, role, status)

    _team_member_userids_or_raise(operator_userid, operator_role)
    if role == "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    member_userids = set(rbac_repo.list_lead_team_member_userids(operator_userid))
    if userid not in member_userids:
        raise HTTPException(status_code=403, detail="Forbidden")
    return create_user(userid, username, avatar_url, role, status)


def update_user(userid: str, role: Optional[str], status: Optional[str]) -> int:
    affected = user_repo.update_user(userid, role, status)
    if affected > 0 and role:
        if not rbac_repo.replace_user_roles(userid, [role]):
            logger.warning("rbac_user_role_sync_failed userid=%s role=%s", userid, role)
    return affected


def update_user_for_manager(
    userid: str,
    role: Optional[str],
    status: Optional[str],
    operator_userid: str,
    operator_role: str,
) -> int:
    assert_user_manageable(userid, operator_userid, operator_role)
    if not _is_admin(operator_userid, operator_role):
        if role == "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
    return update_user(userid, role, status)


def remove_user(userid: str) -> int:
    return user_repo.delete_user(userid)


def remove_user_for_manager(userid: str, operator_userid: str, operator_role: str) -> int:
    assert_user_manageable(userid, operator_userid, operator_role)
    return remove_user(userid)


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


def _require_visibility_user(userid: str) -> Dict[str, Any]:
    row = user_repo.fetch_user_product_visibility(userid)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    role = str(row.get("role") or "").strip().lower()
    if role not in {"operator", "team_lead"}:
        raise HTTPException(status_code=400, detail="Product visibility only supports operator/team_lead users")
    return row


def get_user_product_visibility(userid: str) -> Dict[str, Any]:
    row = _require_visibility_user(userid)
    permissions_raw = row.get("permissions")
    permissions = []
    if isinstance(permissions_raw, list):
        for item in permissions_raw:
            asin = str((item or {}).get("asin") if isinstance(item, dict) else "").strip().upper()
            site = str((item or {}).get("site") if isinstance(item, dict) else "US").strip().upper() or "US"
            if not asin:
                continue
            permissions.append({"asin": asin, "site": site})
    return {
        "userid": row.get("dingtalk_userid") or userid,
        "product_scope": normalize_product_scope(row.get("product_scope")) or "all",
        "permissions": permissions,
        # Backward compatibility for old frontend payload/response handling.
        "asins": [f"{entry['asin']}|{entry['site']}" for entry in permissions],
    }


def get_user_product_visibility_for_manager(
    userid: str,
    operator_userid: str,
    operator_role: str,
) -> Dict[str, Any]:
    assert_user_manageable(userid, operator_userid, operator_role)
    return get_user_product_visibility(userid)


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

    _require_visibility_user(userid)

    normalized_pairs = normalize_permission_pairs(asins)
    if scope == "all":
        normalized_pairs = []

    ok = user_repo.replace_user_product_visibility(userid, scope, normalized_pairs, operator_userid)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")

    normalized_tokens = [f"{asin}|{site}" for asin, site in normalized_pairs]
    log_audit(
        module="permission",
        action="update_product_visibility",
        target_id=userid,
        operator_userid=operator_userid,
        operator_name=operator_name,
        detail=f"product_scope={scope}, asins={','.join(normalized_tokens)}",
    )

    return {
        "userid": userid,
        "product_scope": scope,
        "permissions": [{"asin": asin, "site": site} for asin, site in normalized_pairs],
        "asins": normalized_tokens,
        "count": len(normalized_pairs),
    }


def update_user_product_visibility_for_manager(
    userid: str,
    product_scope: str,
    asins: List[str],
    operator_userid: str,
    operator_name: str,
    operator_role: str,
) -> Dict[str, Any]:
    assert_user_manageable(userid, operator_userid, operator_role)
    return update_user_product_visibility(userid, product_scope, asins, operator_userid, operator_name)


def list_teams_for_manager(operator_userid: str, operator_role: str) -> List[Dict[str, Any]]:
    if _is_admin(operator_userid, operator_role):
        team_names: List[str] | None = None
        rows = rbac_repo.fetch_team_members()
    else:
        team_names = rbac_repo.list_lead_team_names(operator_userid)
        rows = rbac_repo.fetch_team_members(team_names)

    grouped: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        team_name = str(row.get("team_name") or "").strip()
        if not team_name:
            continue
        team_item = grouped.setdefault(
            team_name,
            {
                "team_name": team_name,
                "member_count": 0,
                "members": [],
            },
        )
        member = {
            "userid": str(row.get("dingtalk_userid") or "").strip(),
            "username": str(row.get("dingtalk_username") or "").strip(),
            "member_role": str(row.get("member_role") or "").strip(),
            "status": str(row.get("status") or "").strip(),
        }
        if not member["userid"]:
            continue
        team_item["members"].append(member)

    result = list(grouped.values())
    for item in result:
        item["member_count"] = len(item["members"])
    result.sort(key=lambda x: str(x.get("team_name") or ""))
    return result


def create_team(team_name: str, lead_userid: str, member_userids: List[str]) -> Dict[str, Any]:
    normalized_team_name = str(team_name or "").strip()
    normalized_lead_userid = str(lead_userid or "").strip()
    if not normalized_team_name:
        raise HTTPException(status_code=400, detail="Missing team_name")
    if not normalized_lead_userid:
        raise HTTPException(status_code=400, detail="Missing lead_userid")
    if rbac_repo.team_exists(normalized_team_name):
        raise HTTPException(status_code=409, detail="Team already exists")
    if not rbac_repo.user_exists(normalized_lead_userid):
        raise HTTPException(status_code=400, detail="Lead user not found")

    normalized_members: List[str] = []
    seen: set[str] = set()
    for raw in member_userids or []:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        if not rbac_repo.user_exists(value):
            continue
        seen.add(value)
        normalized_members.append(value)
    if normalized_lead_userid not in seen:
        normalized_members.insert(0, normalized_lead_userid)

    rbac_repo.insert_team_members(normalized_team_name, normalized_lead_userid, normalized_members)
    return {
        "team_name": normalized_team_name,
        "lead_userid": normalized_lead_userid,
        "member_userids": normalized_members,
    }


def update_team(
    team_name: str,
    lead_userid: str,
    member_userids: List[str],
    new_team_name: str | None = None,
) -> Dict[str, Any]:
    normalized_team_name = str(team_name or "").strip()
    normalized_new_team_name = str(new_team_name or normalized_team_name).strip()
    normalized_lead_userid = str(lead_userid or "").strip()
    if not normalized_team_name:
        raise HTTPException(status_code=400, detail="Missing team_name")
    if not normalized_new_team_name:
        raise HTTPException(status_code=400, detail="Missing new_team_name")
    if not normalized_lead_userid:
        raise HTTPException(status_code=400, detail="Missing lead_userid")
    if not rbac_repo.team_exists(normalized_team_name):
        raise HTTPException(status_code=404, detail="Team not found")
    if normalized_new_team_name != normalized_team_name and rbac_repo.team_exists(normalized_new_team_name):
        raise HTTPException(status_code=409, detail="Team already exists")
    if not rbac_repo.user_exists(normalized_lead_userid):
        raise HTTPException(status_code=400, detail="Lead user not found")

    normalized_members: List[str] = []
    seen: set[str] = set()
    for raw in member_userids or []:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        if not rbac_repo.user_exists(value):
            continue
        seen.add(value)
        normalized_members.append(value)
    if normalized_lead_userid not in seen:
        normalized_members.insert(0, normalized_lead_userid)

    rbac_repo.replace_team_members(
        normalized_team_name,
        normalized_lead_userid,
        normalized_members,
        normalized_new_team_name,
    )
    return {
        "team_name": normalized_new_team_name,
        "lead_userid": normalized_lead_userid,
        "member_userids": normalized_members,
    }


def delete_team(team_name: str) -> int:
    normalized_team_name = str(team_name or "").strip()
    if not normalized_team_name:
        raise HTTPException(status_code=400, detail="Missing team_name")
    if not rbac_repo.team_exists(normalized_team_name):
        raise HTTPException(status_code=404, detail="Team not found")
    return rbac_repo.delete_team(normalized_team_name)


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
