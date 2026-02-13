from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel


class FrontendLogPayload(BaseModel):
    level: str = "error"
    message: str
    stack: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
