from __future__ import annotations

import os

from fastapi import Response


def set_refresh_cookie(resp: Response, refresh_token: str, max_age_seconds: int) -> None:
    secure = str(os.getenv("COOKIE_SECURE", "")).strip().lower() in {"1", "true", "yes", "on"}
    samesite = str(os.getenv("COOKIE_SAMESITE", "Lax")).strip()
    if samesite.lower() not in {"strict", "none", "lax"}:
        samesite = "lax"
    resp.set_cookie(
        key="refresh_token",
        value=str(refresh_token or ""),
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=max(1, int(max_age_seconds)),
        path="/",
    )


def clear_refresh_cookie(resp: Response) -> None:
    secure = str(os.getenv("COOKIE_SECURE", "")).strip().lower() in {"1", "true", "yes", "on"}
    samesite = str(os.getenv("COOKIE_SAMESITE", "Lax")).strip()
    if samesite.lower() not in {"strict", "none", "lax"}:
        samesite = "lax"
    resp.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
