from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user
from ..core.responses import list_response, ok_response
from ..schemas.strategy import StrategyPayload, StrategyQueryPayload, StrategyStatePayload, StrategyUpdatePayload
from ..services import strategy_service, user_service

router = APIRouter()


@router.get("/api/yida-strategy")
def get_strategy_list(
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    owner: Optional[str] = None,
    brand: Optional[str] = None,
    priority: Optional[str] = None,
    state: Optional[str] = None,
    competitor_asin: Optional[str] = None,
    yida_asin: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    items = strategy_service.list_strategies(
        limit,
        offset,
        owner,
        brand,
        priority,
        state,
        competitor_asin,
        yida_asin,
        current_user.role,
        current_user.userid,
    )
    user_service.log_audit(
        module="strategy",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail="api=/api/yida-strategy",
    )
    return ok_response(list_response(items, limit, offset))


@router.post("/api/yida-strategy/query")
def query_strategy_list(
    payload: StrategyQueryPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    limit = max(1, min(payload.limit, 2000))
    offset = max(0, payload.offset)
    items = strategy_service.list_strategies(
        limit,
        offset,
        payload.owner,
        payload.brand,
        payload.priority,
        payload.state,
        payload.competitor_asin,
        payload.yida_asin,
        current_user.role,
        current_user.userid,
    )
    user_service.log_audit(
        module="strategy",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail="api=/api/yida-strategy/query",
    )
    return ok_response(list_response(items, limit, offset))


@router.get("/api/yida-strategy/{strategy_id}")
def get_strategy_detail(
    strategy_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    item = strategy_service.get_strategy_detail(strategy_id, current_user.role, current_user.userid)
    return ok_response({"item": item})


@router.post("/api/yida-strategy")
def create_strategy(
    payload: StrategyPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    strategy_id, owner_userid, _owner_name = strategy_service.create_strategy(
        payload,
        current_user.role,
        current_user.userid,
        current_user.username,
    )
    user_service.log_audit(
        module="strategy",
        action="create",
        target_id=str(strategy_id),
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"competitor_asin={payload.competitor_asin}, yida_asin={payload.yida_asin}, owner_userid={owner_userid}",
    )
    return ok_response({"id": strategy_id})


@router.put("/api/yida-strategy/{strategy_id}/state")
def update_strategy_state(
    strategy_id: int,
    payload: StrategyStatePayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    strategy_service.update_strategy_state(strategy_id, payload.state, current_user.role, current_user.userid)
    user_service.log_audit(
        module="strategy",
        action="update_state",
        target_id=str(strategy_id),
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"state={payload.state}",
    )
    return ok_response({"id": strategy_id, "state": payload.state})


@router.put("/api/yida-strategy/{strategy_id}")
def update_strategy(
    strategy_id: int,
    payload: StrategyUpdatePayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    owner_userid, _owner_name = strategy_service.update_strategy(
        strategy_id,
        payload,
        current_user.role,
        current_user.userid,
    )
    user_service.log_audit(
        module="strategy",
        action="update",
        target_id=str(strategy_id),
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"yida_asin={payload.yida_asin}, priority={payload.priority}, state={payload.state}, owner_userid={owner_userid}",
    )
    return ok_response({"id": strategy_id})


@router.delete("/api/yida-strategy/{strategy_id}")
def delete_strategy(
    strategy_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    strategy_service.delete_strategy(strategy_id, current_user.role, current_user.userid)
    user_service.log_audit(
        module="strategy",
        action="delete",
        target_id=str(strategy_id),
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=None,
    )
    return ok_response({"id": strategy_id})
