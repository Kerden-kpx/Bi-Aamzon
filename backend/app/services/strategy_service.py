from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from ..repositories import strategy_repo
from . import dingtalk_todo_service, rbac_service, user_service


def _normalize_userids(userids: Any) -> List[str]:
    if not userids:
        return []
    if isinstance(userids, str):
        raw_items = [part.strip() for part in userids.split(",")]
    elif isinstance(userids, (list, tuple, set)):
        raw_items = [str(part).strip() for part in userids]
    else:
        raw_items = [str(userids).strip()]

    seen = set()
    result: List[str] = []
    for userid in raw_items:
        if not userid or userid in seen:
            continue
        seen.add(userid)
        result.append(userid)
    return result


def _resolve_participant_names(userids: List[str]) -> str:
    if not userids:
        return ""
    names: List[str] = []
    for userid in userids:
        names.append(user_service.lookup_user_name(userid) or userid)
    return ",".join(names)


def _require_strategy_permission_row(strategy_id: str) -> Dict[str, Any]:
    row = strategy_repo.fetch_strategy_permission_row(strategy_id)
    if not row:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return row


def _require_editable_strategy(strategy_id: str, role: str, userid: str) -> Dict[str, Any]:
    row = _require_strategy_permission_row(strategy_id)
    roles = rbac_service.resolve_user_roles(userid, role)
    if not can_edit_strategy(row, userid, roles):
        raise HTTPException(status_code=403, detail="Forbidden")
    return row


def _sync_strategy_todo_upsert(strategy_id: str, operator_userid: str) -> None:
    row = strategy_repo.fetch_strategy_detail(strategy_id, visible_userids=None)
    if not row:
        return
    item = _row_to_item(row)
    dingtalk_todo_service.sync_strategy_todo_upsert(item, operator_userid)


def _sync_strategy_todo_delete(strategy_id: str, operator_userid: str) -> None:
    dingtalk_todo_service.sync_strategy_todo_delete(strategy_id, operator_userid)


def _row_to_item(row: Dict[str, Any]) -> Dict[str, Any]:
    participant_userids = _normalize_userids(row.get("participant_userids"))
    participant_names = _normalize_userids(row.get("participant_names"))
    return {
        "id": row.get("id"),
        "competitor_asin": row.get("competitor_asin") or "",
        "yida_asin": row.get("yida_asin") or "",
        "created_at": row.get("created_at").isoformat()
        if isinstance(row.get("created_at"), date)
        else None,
        "title": row.get("title") or "",
        "detail": row.get("detail") or "",
        "userid": row.get("userid") or "",
        "owner": row.get("owner_name") or "",
        "owner_userid": row.get("owner_userid") or "",
        "participant_userids": participant_userids,
        "participant_names": participant_names,
        "review_date": row.get("review_date").isoformat()
        if isinstance(row.get("review_date"), date)
        else None,
        "deadline_time": str(row.get("deadline_time") or "").strip() or "18:00",
        "reminder_time": str(row.get("reminder_time") or "").strip() or "无",
        "priority": row.get("priority") or "",
        "state": row.get("state") or "",
        "brand": row.get("brand") or "",
    }


def _resolve_target_owner_userid(row: Dict[str, Any]) -> str:
    owner_userid = str(row.get("owner_userid") or "").strip()
    if owner_userid:
        return owner_userid
    return str(row.get("userid") or "").strip()


def _can_manage_owner(operator_userid: str, roles: Set[str], owner_userid: str) -> bool:
    if "admin" in roles:
        return True
    if not owner_userid:
        return False
    if owner_userid == operator_userid:
        return True
    if "team_lead" not in roles:
        return False
    scope = rbac_service.resolve_strategy_read_scope(operator_userid, roles)
    team_userids = set(scope.team_userids or [])
    return owner_userid in team_userids


def can_edit_strategy(row: Dict[str, Any], userid: str, roles: Set[str]) -> bool:
    return _can_manage_owner(userid, roles, _resolve_target_owner_userid(row))


def list_strategies(
    limit: int,
    offset: int,
    owner: Optional[str],
    brand: Optional[str],
    priority: Optional[str],
    state: Optional[str],
    competitor_asin: Optional[str],
    yida_asin: Optional[str],
    role: str,
    userid: str,
) -> List[Dict[str, Any]]:
    roles = rbac_service.resolve_user_roles(userid, role)
    scope = rbac_service.resolve_strategy_read_scope(userid, roles)
    visible_userids = None if scope.allow_all else (scope.team_userids or [userid])
    rows = strategy_repo.fetch_strategies(
        limit,
        offset,
        owner,
        brand,
        priority,
        state,
        competitor_asin,
        yida_asin,
        visible_userids,
    )
    return [_row_to_item(row) for row in rows]


def get_strategy_detail(strategy_id: str, role: str, userid: str) -> Dict[str, Any]:
    roles = rbac_service.resolve_user_roles(userid, role)
    scope = rbac_service.resolve_strategy_read_scope(userid, roles)
    visible_userids = None if scope.allow_all else (scope.team_userids or [userid])
    row = strategy_repo.fetch_strategy_detail(strategy_id, visible_userids)
    if not row:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return _row_to_item(row)


def create_strategy(payload, role: str, userid: str, username: str) -> Tuple[str, str, str]:
    roles = rbac_service.resolve_user_roles(userid, role)
    owner_userid = payload.owner_userid
    owner_name = payload.owner
    if not owner_userid:
        owner_userid = userid
    if not _can_manage_owner(userid, roles, str(owner_userid or "").strip()):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not owner_name:
        owner_name = user_service.lookup_user_name(owner_userid) or (username if owner_userid == userid else owner_userid)

    participant_userids = _normalize_userids(payload.participant_userids)
    participant_names = _resolve_participant_names(participant_userids)

    params = (
        payload.competitor_asin,
        payload.yida_asin,
        payload.created_at,
        payload.title,
        payload.detail,
        userid,
        owner_name,
        owner_userid,
        ",".join(participant_userids),
        participant_names,
        payload.review_date,
        payload.deadline_time or "18:00",
        payload.reminder_time or "无",
        payload.priority,
        payload.state,
        userid,
    )
    strategy_id = strategy_repo.insert_strategy(params)
    _sync_strategy_todo_upsert(strategy_id, userid)
    return strategy_id, owner_userid or "", owner_name or ""


def update_strategy_state(strategy_id: str, state: str, role: str, userid: str) -> None:
    _require_editable_strategy(strategy_id, role, userid)
    affected = strategy_repo.update_strategy_state(strategy_id, state, userid)
    if affected == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    _sync_strategy_todo_upsert(strategy_id, userid)


def update_strategy(strategy_id: str, payload, role: str, userid: str) -> Tuple[str, str]:
    row = _require_editable_strategy(strategy_id, role, userid)
    roles = rbac_service.resolve_user_roles(userid, role)
    current_owner_userid = _resolve_target_owner_userid(row)

    owner_name = payload.owner
    owner_userid = payload.owner_userid
    if not owner_userid:
        owner_userid = current_owner_userid
    if not _can_manage_owner(userid, roles, str(owner_userid or "").strip()):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not owner_name:
        owner_name = user_service.lookup_user_name(owner_userid) or row.get("owner_name") or owner_userid

    if payload.participant_userids is None:
        participant_userids = _normalize_userids(row.get("participant_userids"))
    else:
        participant_userids = _normalize_userids(payload.participant_userids)
    participant_names = _resolve_participant_names(participant_userids)
    deadline_time = str(payload.deadline_time or row.get("deadline_time") or "18:00").strip() or "18:00"
    reminder_time = str(payload.reminder_time or row.get("reminder_time") or "无").strip() or "无"

    params = (
        payload.yida_asin,
        payload.title,
        payload.detail,
        owner_name,
        owner_userid,
        ",".join(participant_userids),
        participant_names,
        payload.review_date,
        deadline_time,
        reminder_time,
        payload.priority,
        payload.state,
        userid,
        strategy_id,
    )
    affected = strategy_repo.update_strategy(params)
    if affected == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    _sync_strategy_todo_upsert(strategy_id, userid)
    return owner_userid or "", owner_name or ""


def delete_strategy(strategy_id: str, role: str, userid: str) -> None:
    _require_editable_strategy(strategy_id, role, userid)
    _sync_strategy_todo_delete(strategy_id, userid)
    affected = strategy_repo.delete_strategy(strategy_id)
    if affected == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
