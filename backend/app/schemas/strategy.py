from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel


class StrategyPayload(BaseModel):
    competitor_asin: str
    yida_asin: str
    created_at: Optional[date] = None
    title: str
    detail: str
    owner: Optional[str] = None
    owner_userid: Optional[str] = None
    review_date: Optional[date] = None
    priority: str
    state: Optional[str] = None


class StrategyStatePayload(BaseModel):
    state: str


class StrategyUpdatePayload(BaseModel):
    yida_asin: str
    title: str
    detail: str
    owner: Optional[str] = None
    owner_userid: Optional[str] = None
    review_date: Optional[date] = None
    priority: str
    state: str


class StrategyQueryPayload(BaseModel):
    limit: int = 200
    offset: int = 0
    owner: Optional[str] = None
    brand: Optional[str] = None
    priority: Optional[str] = None
    state: Optional[str] = None
    competitor_asin: Optional[str] = None
    yida_asin: Optional[str] = None
