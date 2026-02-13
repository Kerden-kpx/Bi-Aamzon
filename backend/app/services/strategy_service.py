from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from ..repositories import strategy_repo
from ..services import user_service


def _require_strategy_permission_row(strategy_id: int) -> Dict[str, Any]:
    row = strategy_repo.fetch_strategy_permission_row(strategy_id)
    if not row:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return row


def _require_editable_strategy(strategy_id: int, role: str, userid: str) -> Dict[str, Any]:
    row = _require_strategy_permission_row(strategy_id)
    if not can_edit_strategy(row, userid, role):
        raise HTTPException(status_code=403, detail="Forbidden")
    return row


def _row_to_item(row: Dict[str, Any]) -> Dict[str, Any]:
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
        "review_date": row.get("review_date").isoformat()
        if isinstance(row.get("review_date"), date)
        else None,
        "priority": row.get("priority") or "",
        "state": row.get("state") or "",
        "brand": row.get("brand") or "",
    }


def can_edit_strategy(row: Dict[str, Any], userid: str, role: str) -> bool:
    if role == "admin":
        return True
    owner_userid = row.get("owner_userid")
    if owner_userid:
        return owner_userid == userid
    return row.get("userid") == userid


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
    restrict_userid = None if role == "admin" else userid
    rows = strategy_repo.fetch_strategies(
        limit,
        offset,
        owner,
        brand,
        priority,
        state,
        competitor_asin,
        yida_asin,
        restrict_userid,
    )
    return [_row_to_item(row) for row in rows]


def get_strategy_detail(strategy_id: int, role: str, userid: str) -> Dict[str, Any]:
    restrict_userid = None if role == "admin" else userid
    row = strategy_repo.fetch_strategy_detail(strategy_id, restrict_userid)
    if not row:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return _row_to_item(row)


def create_strategy(payload, role: str, userid: str, username: str) -> Tuple[int, str, str]:
    owner_userid = payload.owner_userid
    owner_name = payload.owner
    if role != "admin":
        owner_userid = userid
        owner_name = username
    else:
        if not owner_userid:
            owner_userid = userid
        if not owner_name:
            owner_name = user_service.lookup_user_name(owner_userid) or username

    params = (
        payload.competitor_asin,
        payload.yida_asin,
        payload.created_at,
        payload.title,
        payload.detail,
        userid,
        owner_name,
        owner_userid,
        payload.review_date,
        payload.priority,
        payload.state,
        userid,
    )
    strategy_id = strategy_repo.insert_strategy(params)
    return strategy_id, owner_userid or "", owner_name or ""


def update_strategy_state(strategy_id: int, state: str, role: str, userid: str) -> None:
    _require_editable_strategy(strategy_id, role, userid)
    affected = strategy_repo.update_strategy_state(strategy_id, state, userid)
    if affected == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")


def update_strategy(strategy_id: int, payload, role: str, userid: str) -> Tuple[str, str]:
    row = _require_editable_strategy(strategy_id, role, userid)

    owner_name = payload.owner
    owner_userid = payload.owner_userid
    if role != "admin":
        owner_name = row.get("owner_name")
        owner_userid = row.get("owner_userid")
    else:
        if not owner_userid:
            owner_userid = row.get("owner_userid")
        if not owner_name:
            owner_name = row.get("owner_name")
        if owner_userid and not owner_name:
            owner_name = user_service.lookup_user_name(owner_userid) or row.get("owner_name")

    params = (
        payload.yida_asin,
        payload.title,
        payload.detail,
        owner_name,
        owner_userid,
        payload.review_date,
        payload.priority,
        payload.state,
        userid,
        strategy_id,
    )
    affected = strategy_repo.update_strategy(params)
    if affected == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return owner_userid or "", owner_name or ""


def delete_strategy(strategy_id: int, role: str, userid: str) -> None:
    _require_editable_strategy(strategy_id, role, userid)
    affected = strategy_repo.delete_strategy(strategy_id)
    if affected == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
