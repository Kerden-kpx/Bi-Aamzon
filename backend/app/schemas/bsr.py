from __future__ import annotations

from datetime import date
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

SiteCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"(?i)^(US|CA|UK|DE)$"),
]
AsinCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z0-9]{10}$"),
]
TagText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
AsinMappingText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        max_length=256,
        pattern=r"^[A-Za-z0-9,，;|\s]*$",
    ),
]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]


class BsrQueryPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    limit: int = Field(default=200, ge=1, le=2000)
    offset: int = Field(default=0, ge=0)
    createtime: Optional[date] = None
    site: Optional[SiteCode] = None


class BsrMonthlyPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asin: AsinCode
    site: Optional[SiteCode] = "US"
    is_child: Optional[int] = Field(default=None, ge=0, le=1)


class BsrDailyPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asin: AsinCode
    site: Optional[SiteCode] = "US"


class BsrAiInsightPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asin: AsinCode
    site: Optional[SiteCode] = "US"
    range_days: Literal[7, 30, 90, 180] = 90


class BsrDatesPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    limit: int = Field(default=200, ge=1, le=2000)
    offset: int = Field(default=0, ge=0)
    site: Optional[SiteCode] = "US"


class BsrLookupPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asin: AsinCode
    createtime: Optional[date] = None
    site: Optional[SiteCode] = None
    brand: Optional[ShortText] = None


class BsrFetchDailyPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    site: Optional[SiteCode] = "US"


class TagUpdatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    tags: List[TagText] = Field(default_factory=list, max_length=50)
    createtime: Optional[date] = None
    site: Optional[SiteCode] = None


class MappingUpdatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    yida_asin: Optional[AsinMappingText] = None
    createtime: Optional[date] = None
    site: Optional[SiteCode] = None


class BsrPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    parent_asin: Optional[AsinCode] = None
    title: Optional[Annotated[str, StringConstraints(min_length=1, max_length=512)]] = None
    image_url: Optional[Annotated[str, StringConstraints(min_length=1, max_length=2048)]] = None
    product_url: Optional[Annotated[str, StringConstraints(min_length=1, max_length=2048)]] = None
    brand: Optional[Annotated[str, StringConstraints(min_length=1, max_length=128)]] = None
    price: Optional[float] = Field(default=None, ge=0, le=1000000)
    list_price: Optional[float] = Field(default=None, ge=0, le=1000000)
    score: Optional[float] = Field(default=None, ge=0, le=5)
    comment_count: Optional[int] = Field(default=None, ge=0, le=100000000)
    bsr_rank: Optional[int] = Field(default=None, ge=0, le=100000000)
    category_rank: Optional[int] = Field(default=None, ge=0, le=100000000)
    variation_count: Optional[int] = Field(default=None, ge=0, le=1000000)
    launch_date: Optional[date] = None
    conversion_rate: Optional[float] = Field(default=None, ge=0, le=100)
    organic_traffic_count: Optional[int] = Field(default=None, ge=0, le=100000000)
    ad_traffic_count: Optional[int] = Field(default=None, ge=0, le=100000000)
    organic_search_terms: Optional[int] = Field(default=None, ge=0, le=100000000)
    ad_search_terms: Optional[int] = Field(default=None, ge=0, le=100000000)
    search_recommend_terms: Optional[int] = Field(default=None, ge=0, le=100000000)
    sales_volume: Optional[int] = Field(default=None, ge=0, le=100000000)
    sales: Optional[float] = Field(default=None, ge=0, le=100000000)
    tags: Optional[Annotated[str, StringConstraints(min_length=1, max_length=512)]] = None
    createtime: Optional[date] = None
    site: Optional[SiteCode] = None
