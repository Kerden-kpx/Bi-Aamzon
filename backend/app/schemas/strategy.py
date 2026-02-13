from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

AsinCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z0-9]{10}$"),
]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
TitleText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
DetailText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
OwnerUserIdText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._@-]+$"),
]
StrategyPriority = Literal["高", "中", "低"]
StrategyState = Literal["待开始", "进行中", "已完成", "已暂停", "已取消"]

_PRIORITY_ALIASES = {
    "高": "高",
    "中": "中",
    "低": "低",
    "p0": "高",
    "p1": "中",
    "p2": "低",
    "high": "高",
    "medium": "中",
    "low": "低",
}
_STATE_ALIASES = {
    "待开始": "待开始",
    "todo": "待开始",
    "pending": "待开始",
    "进行中": "进行中",
    "doing": "进行中",
    "in_progress": "进行中",
    "已完成": "已完成",
    "done": "已完成",
    "completed": "已完成",
    "已暂停": "已暂停",
    "paused": "已暂停",
    "on_hold": "已暂停",
    "已取消": "已取消",
    "cancelled": "已取消",
    "canceled": "已取消",
}


class StrategyPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    competitor_asin: AsinCode
    yida_asin: AsinCode
    created_at: Optional[date] = None
    title: TitleText
    detail: DetailText
    owner: Optional[ShortText] = None
    owner_userid: Optional[OwnerUserIdText] = None
    review_date: Optional[date] = None
    priority: StrategyPriority
    state: Optional[StrategyState] = None

    @field_validator("priority", mode="before")
    @classmethod
    def _normalize_priority(cls, value):
        if value is None:
            return value
        raw = str(value).strip().lower()
        return _PRIORITY_ALIASES.get(raw, value)

    @field_validator("state", mode="before")
    @classmethod
    def _normalize_state(cls, value):
        if value is None:
            return value
        raw = str(value).strip().lower()
        return _STATE_ALIASES.get(raw, value)


class StrategyStatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    state: StrategyState

    @field_validator("state", mode="before")
    @classmethod
    def _normalize_state(cls, value):
        if value is None:
            return value
        raw = str(value).strip().lower()
        return _STATE_ALIASES.get(raw, value)


class StrategyUpdatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    yida_asin: AsinCode
    title: TitleText
    detail: DetailText
    owner: Optional[ShortText] = None
    owner_userid: Optional[OwnerUserIdText] = None
    review_date: Optional[date] = None
    priority: StrategyPriority
    state: StrategyState

    @field_validator("priority", mode="before")
    @classmethod
    def _normalize_priority(cls, value):
        if value is None:
            return value
        raw = str(value).strip().lower()
        return _PRIORITY_ALIASES.get(raw, value)

    @field_validator("state", mode="before")
    @classmethod
    def _normalize_state(cls, value):
        if value is None:
            return value
        raw = str(value).strip().lower()
        return _STATE_ALIASES.get(raw, value)


class StrategyQueryPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    limit: int = Field(default=200, ge=1, le=2000)
    offset: int = Field(default=0, ge=0)
    owner: Optional[ShortText] = None
    brand: Optional[ShortText] = None
    priority: Optional[StrategyPriority] = None
    state: Optional[StrategyState] = None
    competitor_asin: Optional[AsinCode] = None
    yida_asin: Optional[AsinCode] = None

    @field_validator("priority", mode="before")
    @classmethod
    def _normalize_priority(cls, value):
        if value is None:
            return value
        raw = str(value).strip().lower()
        return _PRIORITY_ALIASES.get(raw, value)

    @field_validator("state", mode="before")
    @classmethod
    def _normalize_state(cls, value):
        if value is None:
            return value
        raw = str(value).strip().lower()
        return _STATE_ALIASES.get(raw, value)
