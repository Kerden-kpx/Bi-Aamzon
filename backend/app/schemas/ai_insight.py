from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class AiInsightCreatePayload(BaseModel):
    asin: str
    site: Optional[str] = "US"
    range_days: int = 90


class AiInsightQueryPayload(BaseModel):
    limit: int = 100
    offset: int = 0
    asin: Optional[str] = None
    site: Optional[str] = None
    status: Optional[str] = None
