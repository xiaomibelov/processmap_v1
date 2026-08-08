"""Защищённые Swagger/OpenAPI-эндпоинты (те же пути, что встроенные FastAPI).

Встроенные docs_url/redoc_url/openapi_url отключены в app_factory; здесь —
свои роуты на тех же путях с проверкой права уровня админки:

- без токена → 401 (auth_guard middleware, пути убраны из AUTH_PUBLIC_PATHS);
- аутентифицирован без права → 403;
- право = как у кнопки «Админ-панель»: platform admin (is_admin) ИЛИ org-роль
  {org_owner, org_admin, auditor} (та же система прав, новых пермишенов нет).

include_in_schema=False — контракт /api/openapi.json не меняется.
"""
from __future__ import annotations

from typing import Any, Optional, Tuple

from fastapi import APIRouter, Request, Response
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from .. import _legacy_main
from ..services.api_docs_ru import build_ru_openapi
from ..storage import list_user_org_memberships

router = APIRouter()

# Роли уровня админки (как canOpenOrgSettings на фронте, TopBar.jsx).
API_DOCS_ROLES = {"org_owner", "org_admin", "auditor"}

OPENAPI_PATH = "/api/openapi.json"
DOCS_TITLE = "Processmap API — Swagger UI"
REDOC_TITLE = "Processmap API — ReDoc"


def _api_docs_access(request: Request) -> Tuple[Optional[str], Optional[Response]]:
    """uid → None+401; нет права → None+403; ок → (uid, None)."""
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return None, _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    if bool(is_admin):
        return uid, None
    memberships = getattr(request.state, "org_memberships", None)
    if memberships is None:
        memberships = list_user_org_memberships(uid, is_admin=False)
    for row in memberships if isinstance(memberships, list) else []:
        role = str((row or {}).get("role") or "").strip().lower()
        if role in API_DOCS_ROLES:
            return uid, None
    return None, _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")


@router.get("/api/docs", include_in_schema=False)
def api_docs_swagger_ui(request: Request) -> Any:
    _uid, err = _api_docs_access(request)
    if err is not None:
        return err
    return get_swagger_ui_html(openapi_url=OPENAPI_PATH, title=DOCS_TITLE)


@router.get("/api/redoc", include_in_schema=False)
def api_docs_redoc(request: Request) -> Any:
    _uid, err = _api_docs_access(request)
    if err is not None:
        return err
    return get_redoc_html(openapi_url=OPENAPI_PATH, title=REDOC_TITLE)


@router.get("/api/openapi.json", include_in_schema=False)
def api_docs_openapi_json(request: Request) -> Any:
    _uid, err = _api_docs_access(request)
    if err is not None:
        return err
    app = request.app
    return JSONResponse(
        get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
    )


@router.get("/api/openapi_ru.json", include_in_schema=False)
def api_docs_openapi_ru_json(request: Request) -> Any:
    """Русская обогащённая спека (OpenAPI 3.0.3) для Swagger UI внутри SPA.

    Те же права, что у /api/docs. Генерируется на лету из get_openapi —
    без файловых дублей; правила идентичны экспорту docs/openapi.yaml (#694).
    """
    _uid, err = _api_docs_access(request)
    if err is not None:
        return err
    app = request.app
    spec = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    return JSONResponse(build_ru_openapi(spec))
