from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import CurrentUser, require_admin
from ..core.responses import list_response, ok_response
from ..schemas.user import (
    DingTalkUserLookupPayload,
    ProductVisibilityPayload,
    UserCreatePayload,
    UserQueryPayload,
    UserUpdatePayload,
)
from ..services import user_service

router = APIRouter()


@router.get("/api/users")
def get_users(
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    role: Optional[str] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    normalized_role = user_service.normalize_user_role(role)
    normalized_status = user_service.normalize_user_status(status)
    items = user_service.list_users(limit, offset, normalized_role, normalized_status, keyword)
    user_service.log_audit(
        module="permission",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail="api=/api/users",
    )
    return ok_response(list_response(items))


@router.post("/api/users")
def create_user(
    payload: UserCreatePayload,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    userid = payload.dingtalk_userid.strip()
    username = payload.dingtalk_username.strip()
    if not userid or not username:
        raise HTTPException(status_code=400, detail="Missing userid or username")

    role = user_service.normalize_user_role(payload.role) or "operator"
    status = user_service.normalize_user_status(payload.status) or "active"

    product_scope = user_service.create_user(userid, username, payload.avatar_url, role, status)

    user_service.log_audit(
        module="user",
        action="create",
        target_id=userid,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"name={username}, role={role}, status={status}",
    )

    return ok_response(
        {
            "item": {
                "dingtalk_userid": userid,
                "dingtalk_username": username,
                "avatar_url": payload.avatar_url,
                "role": role,
                "status": status,
                "product_scope": product_scope,
            }
        }
    )


@router.post("/api/users/query")
def query_users(
    payload: UserQueryPayload,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    normalized_role = user_service.normalize_user_role(payload.role)
    normalized_status = user_service.normalize_user_status(payload.status)
    limit = max(1, min(payload.limit, 2000))
    offset = max(0, payload.offset)
    items = user_service.list_users(limit, offset, normalized_role, normalized_status, payload.keyword)
    user_service.log_audit(
        module="permission",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail="api=/api/users/query",
    )
    return ok_response(list_response(items))


@router.post("/api/users/dingtalk/search")
def lookup_dingtalk_users(
    payload: DingTalkUserLookupPayload,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    items = user_service.lookup_dingtalk_users_by_name(payload.name, payload.limit)
    user_service.log_audit(
        module="permission",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail="api=/api/users/dingtalk/search",
    )
    return ok_response(list_response(items))


@router.get("/api/permission/stats")
def get_permission_stats(
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    item = user_service.get_permission_stats()
    return ok_response({"item": item})


@router.put("/api/users/{userid}")
def update_user(
    userid: str,
    payload: UserUpdatePayload,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    role = user_service.normalize_user_role(payload.role)
    status = user_service.normalize_user_status(payload.status)
    if role is None and payload.role is not None:
        raise HTTPException(status_code=400, detail="Invalid role")
    if status is None and payload.status is not None:
        raise HTTPException(status_code=400, detail="Invalid status")

    affected = user_service.update_user(userid, role, status)
    if affected == 0:
        raise HTTPException(status_code=404, detail="User not found")

    user_service.log_audit(
        module="user",
        action="update",
        target_id=userid,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"role={role or 'unchanged'}, status={status or 'unchanged'}",
    )
    return ok_response({"updated": affected})


@router.delete("/api/users/{userid}")
def delete_user(
    userid: str,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    affected = user_service.remove_user(userid)
    if affected == 0:
        raise HTTPException(status_code=404, detail="User not found")
    user_service.log_audit(
        module="user",
        action="delete",
        target_id=userid,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=None,
    )
    return ok_response({"deleted": affected})


@router.get("/api/users/{userid}/product-visibility")
def get_user_product_visibility(
    userid: str,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    item = user_service.get_user_product_visibility(userid)
    return ok_response({"item": item})


@router.put("/api/users/{userid}/product-visibility")
def update_user_product_visibility(
    userid: str,
    payload: ProductVisibilityPayload,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    item = user_service.update_user_product_visibility(
        userid=userid,
        product_scope=payload.product_scope,
        asins=payload.asins,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
    )
    return ok_response({"item": item})
