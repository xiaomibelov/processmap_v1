from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from ..legacy.request_context import (
    extract_org_from_headers as _extract_org_from_headers,
    request_client_ip as _request_client_ip,
)
from ..schemas.legacy_api import (
    AuthLoginIn,
    AuthMeOut,
    AuthTokenOut,
    InviteActivateIn,
    InvitePreviewIn,
)
from ..services import auth_service as _svc
from ..utils.auth_helpers import clear_refresh_cookie, set_refresh_cookie

router = APIRouter()


@router.post("/api/auth/login", response_model=AuthTokenOut)
def auth_login(inp: AuthLoginIn, request: Request):
    try:
        result = _svc.login(
            email=str(inp.email or "").strip(),
            password=str(inp.password or "").strip(),
            user_agent=request.headers.get("user-agent", ""),
            ip=_request_client_ip(request) or "",
        )
    except _svc.AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    max_age = max(1, int(result.get("refresh_expires_at", 0)) - int(__import__("time").time()))
    payload = {
        "access_token": str(result.get("access_token") or ""),
        "token_type": "bearer",
    }
    resp = JSONResponse(status_code=200, content=payload)
    set_refresh_cookie(resp, str(result.get("refresh_token") or ""), max_age)
    return resp


@router.post("/api/auth/refresh", response_model=AuthTokenOut)
def auth_refresh(request: Request):
    refresh_token = str(request.cookies.get("refresh_token") or "").strip()
    if not refresh_token:
        resp = JSONResponse(status_code=401, content={"detail": "missing_refresh_token"})
        clear_refresh_cookie(resp)
        return resp

    try:
        result = _svc.refresh(
            refresh_token=refresh_token,
            user_agent=request.headers.get("user-agent", ""),
            ip=_request_client_ip(request) or "",
        )
    except _svc.AuthServiceError as exc:
        resp = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        clear_refresh_cookie(resp)
        return resp

    max_age = max(1, int(result.get("refresh_expires_at", 0)) - int(__import__("time").time()))
    payload = {
        "access_token": str(result.get("access_token") or ""),
        "token_type": "bearer",
    }
    resp = JSONResponse(status_code=200, content=payload)
    set_refresh_cookie(resp, str(result.get("refresh_token") or ""), max_age)
    return resp


@router.post("/api/auth/logout")
def auth_logout(request: Request):
    refresh_token = str(request.cookies.get("refresh_token") or "").strip()
    _svc.logout(refresh_token)
    resp = JSONResponse(status_code=200, content={"ok": True})
    clear_refresh_cookie(resp)
    return resp


@router.get("/api/auth/me", response_model=AuthMeOut)
def auth_me(request: Request):
    user = getattr(request.state, "auth_user", None)
    if not isinstance(user, dict):
        try:
            from ..auth import user_from_bearer_header
            user = user_from_bearer_header(request.headers.get("authorization", ""))
        except Exception as exc:
            raise HTTPException(status_code=401, detail="unauthorized") from exc

    requested_org_id = _extract_org_from_headers(request)
    return _svc.me(user=user, requested_org_id=requested_org_id or None)


@router.post("/api/auth/invite/preview")
@router.post("/api/invite/resolve")
def auth_invite_preview(inp: InvitePreviewIn, request: Request):
    try:
        return _svc.preview_invite(inp)
    except _svc.AuthServiceError as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@router.post("/api/auth/invite/activate")
@router.post("/api/invite/activate")
def auth_invite_activate(inp: InviteActivateIn, request: Request):
    try:
        result = _svc.activate_invite(
            raw_token_input=inp,
            password=str(getattr(inp, "password", "") or ""),
            password_confirm=str(getattr(inp, "password_confirm", "") or ""),
            ip=_request_client_ip(request) or "",
            user_agent=request.headers.get("user-agent", ""),
        )
    except _svc.AuthServiceError as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    max_age = max(1, int(result.get("refresh_expires_at", 0)) - int(__import__("time").time()))
    resp = JSONResponse(status_code=200, content=result)
    set_refresh_cookie(resp, str(result.get("refresh_token") or ""), max_age)
    return resp
