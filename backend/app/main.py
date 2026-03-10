from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles

from .core.config import get_auth_secret_or_raise
from .core.handlers import http_exception_handler, unhandled_exception_handler, validation_exception_handler
from .core.logging import request_logging_middleware
from .routers import ai_insights, audit_logs, auth, bsr, categories, dev, health, products, strategy, users

get_auth_secret_or_raise()

app = FastAPI(title="Bi-Amazon API", version="0.1.0")

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.middleware("http")(request_logging_middleware)

app.include_router(dev.router)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(audit_logs.router)
app.include_router(bsr.router)
app.include_router(ai_insights.router)
app.include_router(products.router)
app.include_router(strategy.router)
app.include_router(categories.router)

uploads_root = Path(str(os.getenv("STRATEGY_ATTACHMENT_ROOT", "") or "").strip() or (Path(__file__).resolve().parents[1] / "uploads"))
uploads_root.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_root)), name="uploads")
