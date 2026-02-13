from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel


class AuditLogQueryPayload(BaseModel):
    limit: int = 200
    offset: int = 0
    module: Optional[str] = None
    action: Optional[str] = None
    userid: Optional[str] = None
    keyword: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
