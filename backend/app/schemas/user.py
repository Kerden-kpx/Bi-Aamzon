from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class UserQueryPayload(BaseModel):
    limit: int = 200
    offset: int = 0
    role: Optional[str] = None
    status: Optional[str] = None
    keyword: Optional[str] = None


class DingTalkUserLookupPayload(BaseModel):
    name: str
    limit: int = 8


class UserCreatePayload(BaseModel):
    dingtalk_userid: str
    dingtalk_username: str
    role: Optional[str] = None
    status: Optional[str] = None
    avatar_url: Optional[str] = None


class UserUpdatePayload(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None


class ProductVisibilityPayload(BaseModel):
    product_scope: str = "all"
    asins: List[str] = Field(default_factory=list)
