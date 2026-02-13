from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .core.handlers import http_exception_handler, unhandled_exception_handler, validation_exception_handler
from .core.logging import request_logging_middleware
from .routers import ai_insights, audit_logs, auth, bsr, dev, health, products, todo, users

app = FastAPI(title="Bi-Amazon API", version="0.1.0")

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_logging_middleware)

app.include_router(dev.router)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(audit_logs.router)
app.include_router(bsr.router)
app.include_router(ai_insights.router)
app.include_router(products.router)
app.include_router(todo.router)
