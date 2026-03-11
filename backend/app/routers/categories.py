from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import CurrentUser, require_admin_or_team_lead
from ..core.responses import list_response, ok_response
from ..repositories import category_repo

router = APIRouter()


class CategoryCreatePayload(BaseModel):
    level1: str = Field(..., min_length=1, max_length=64)
    level2: str = Field(..., min_length=1, max_length=64)
    level3: str = Field(..., min_length=1, max_length=64)
    level4: str = Field(..., min_length=1, max_length=64)
    sort_order: int = Field(0, ge=0)


@router.get("/api/categories")
def get_categories() -> Dict[str, Any]:
    """返回全部类目列表，无需登录。"""
    items = category_repo.list_categories()
    return ok_response(list_response(items))


@router.post("/api/categories")
def create_category(
    payload: CategoryCreatePayload,
    current_user: CurrentUser = Depends(require_admin_or_team_lead),
) -> Dict[str, Any]:
    level1 = payload.level1.strip()
    level2 = payload.level2.strip()
    level3 = payload.level3.strip()
    level4 = payload.level4.strip()
    if not level1 or not level2 or not level3 or not level4:
        raise HTTPException(status_code=400, detail="level1/level2/level3/level4 不能为空")
    if category_repo.category_exists(level1, level2, level3, level4):
        raise HTTPException(status_code=409, detail="该类目已存在")
    new_id = category_repo.create_category(level1, level2, level3, level4, payload.sort_order)
    return ok_response({"item": {"id": new_id, "level1": level1, "level2": level2, "level3": level3, "level4": level4, "sort_order": payload.sort_order}})


@router.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    current_user: CurrentUser = Depends(require_admin_or_team_lead),
) -> Dict[str, Any]:
    affected = category_repo.delete_category(category_id)
    if affected == 0:
        raise HTTPException(status_code=404, detail="类目不存在")
    return ok_response({"deleted": affected})
