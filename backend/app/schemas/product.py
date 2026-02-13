from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel

from .bsr import BsrPayload


class YidaProductsQueryPayload(BaseModel):
    limit: int = 200
    offset: int = 0
    site: Optional[str] = None


class YidaProductPayload(BaseModel):
    asin: str
    site: Optional[str] = None
    sku: Optional[str] = None
    brand: Optional[str] = None
    product: Optional[str] = None
    application_tags: Optional[str] = None
    tooth_pattern_tags: Optional[str] = None
    material_tags: Optional[str] = None
    spec_length: Optional[str] = None
    spec_quantity: Optional[int] = None
    spec_other: Optional[str] = None
    position_tags: Optional[str] = None
    status: Optional[str] = "在售"
    created_at: Optional[date] = None
    updated_at: Optional[date] = None
    bsr: Optional[BsrPayload] = None
