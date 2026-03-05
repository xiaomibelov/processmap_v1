from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import _legacy_main
from .routers import ROUTERS

app = FastAPI(title="Food Process Copilot MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_legacy_main.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Requested-With",
        "X-Org-Id",
        "X-Active-Org-Id",
    ],
)
app.middleware("http")(_legacy_main.auth_guard_middleware)

if _legacy_main.STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_legacy_main.STATIC_DIR)), name="static")

for router in ROUTERS:
    app.include_router(router)

