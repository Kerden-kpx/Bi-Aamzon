from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class BsrQueryPayload(BaseModel):
    limit: int = 200
    offset: int = 0
    createtime: Optional[date] = None
    site: Optional[str] = None


class BsrMonthlyPayload(BaseModel):
    asin: str
    site: Optional[str] = "US"
    is_child: Optional[int] = None


class BsrDailyPayload(BaseModel):
    asin: str
    site: Optional[str] = "US"


class BsrAiInsightPayload(BaseModel):
    asin: str
    site: Optional[str] = "US"
    range_days: int = 90


class BsrDatesPayload(BaseModel):
    limit: int = 200
    offset: int = 0
    site: Optional[str] = "US"


class BsrLookupPayload(BaseModel):
    asin: str
    createtime: Optional[date] = None
    site: Optional[str] = None
    brand: Optional[str] = None


class BsrFetchDailyPayload(BaseModel):
    site: Optional[str] = "US"


class TagUpdatePayload(BaseModel):
    tags: List[str] = Field(default_factory=list)
    createtime: Optional[date] = None
    site: Optional[str] = None


class MappingUpdatePayload(BaseModel):
    yida_asin: Optional[str] = None
    createtime: Optional[date] = None
    site: Optional[str] = None


class BsrPayload(BaseModel):
    parent_asin: Optional[str] = None
    title: Optional[str] = None
    image_url: Optional[str] = None
    product_url: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    score: Optional[float] = None
    comment_count: Optional[int] = None
    bsr_rank: Optional[int] = None
    category_rank: Optional[int] = None
    variation_count: Optional[int] = None
    launch_date: Optional[date] = None
    conversion_rate: Optional[float] = None
    organic_traffic_count: Optional[int] = None
    ad_traffic_count: Optional[int] = None
    organic_search_terms: Optional[int] = None
    ad_search_terms: Optional[int] = None
    search_recommend_terms: Optional[int] = None
    sales_volume: Optional[int] = None
    sales: Optional[float] = None
    tags: Optional[str] = None
    createtime: Optional[date] = None
    site: Optional[str] = None
