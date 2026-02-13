from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from .bsr import BsrPayload

SiteCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"(?i)^(US|CA|UK|DE)$"),
]
AsinCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z0-9]{10}$"),
]
SkuText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
MediumText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)]


class YidaProductsQueryPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    limit: int = Field(default=200, ge=1, le=2000)
    offset: int = Field(default=0, ge=0)
    site: Optional[SiteCode] = None


class YidaProductPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    asin: AsinCode
    site: Optional[SiteCode] = None
    sku: Optional[SkuText] = None
    brand: Optional[ShortText] = None
    product: Optional[MediumText] = None
    application_tags: Optional[MediumText] = None
    tooth_pattern_tags: Optional[MediumText] = None
    material_tags: Optional[MediumText] = None
    spec_length: Optional[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]] = None
    spec_quantity: Optional[int] = Field(default=None, ge=0, le=1000000)
    spec_other: Optional[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)]] = None
    position_tags: Optional[MediumText] = None
    status: Optional[Literal["在售", "停售", "待上架", "下架"]] = "在售"
    created_at: Optional[date] = None
    updated_at: Optional[date] = None
    bsr: Optional[BsrPayload] = None
