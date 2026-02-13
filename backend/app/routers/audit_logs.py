from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, require_admin
from ..core.responses import list_response, ok_response
from ..schemas.audit import AuditLogQueryPayload
from ..services import user_service

router = APIRouter()


@router.post("/api/audit-logs/query")
def query_audit_logs(
    payload: AuditLogQueryPayload,
    current_user: CurrentUser = Depends(require_admin),
) -> Dict[str, Any]:
    limit = max(1, min(payload.limit, 2000))
    offset = max(0, payload.offset)
    rows = user_service.list_audit_logs(
        limit,
        offset,
        payload.module,
        payload.action,
        payload.userid,
        payload.keyword,
        payload.date_from,
        payload.date_to,
    )
    items = []
    for row in rows:
        created_at = row.get("created_at")
        items.append(
            {
                "id": row.get("id"),
                "module": row.get("module") or "",
                "action": row.get("action") or "",
                "target_id": row.get("target_id") or "",
                "operator_userid": row.get("operator_userid") or "",
                "operator_name": row.get("operator_name") or "",
                "detail": row.get("detail") or "",
                "created_at": created_at.isoformat() if created_at else None,
            }
        )
    return ok_response(list_response(items, limit, offset))
