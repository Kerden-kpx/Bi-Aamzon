from __future__ import annotations

from datetime import date
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

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
DeadlineTimeText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=16)]
ReminderTimeText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
StrategyPriority = Literal["较低", "普通", "较高", "紧急"]
StrategyState = Literal["待开始", "进行中", "已完成", "搁置"]


class StrategyPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    competitor_asin: AsinCode
    yida_asin: AsinCode
    created_at: Optional[date] = None
    title: TitleText
    detail: DetailText
    owner: Optional[ShortText] = None
    owner_userid: Optional[OwnerUserIdText] = None
    participant_userids: Optional[List[OwnerUserIdText]] = None
    review_date: Optional[date] = None
    deadline_time: Optional[DeadlineTimeText] = None
    reminder_time: Optional[ReminderTimeText] = None
    priority: StrategyPriority
    state: Optional[StrategyState] = None


class StrategyStatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    state: StrategyState


class StrategyUpdatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    yida_asin: AsinCode
    title: TitleText
    detail: DetailText
    owner: Optional[ShortText] = None
    owner_userid: Optional[OwnerUserIdText] = None
    participant_userids: Optional[List[OwnerUserIdText]] = None
    review_date: Optional[date] = None
    deadline_time: Optional[DeadlineTimeText] = None
    reminder_time: Optional[ReminderTimeText] = None
    priority: StrategyPriority
    state: StrategyState


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
