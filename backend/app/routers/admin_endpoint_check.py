"""Админские эндпоинты регрессионного сканера эндпоинтов (контур feature/endpoint-regression-scanner).

Авторизация чтения (GET) — то же право, что у кнопки «API Docs»
(_api_docs_access из routers/api_docs.py, не дублируем логику).

POST /run принимает ИЛИ bearer с api-docs-правом (trigger=manual), ИЛИ машинный
заголовок X-Deploy-Token == env ENDPOINT_CHECK_DEPLOY_TOKEN (trigger=deploy).
Путь /run добавлен в AUTH_PUBLIC_PATHS, чтобы deploy-токен работал без bearer —
проверка права полностью на этом обработчике (401 без валидной авторизации).
"""
from __future__ import annotations

import hmac
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from .. import _legacy_main
from ..auth import AuthError, user_from_bearer_header
from ..endpoint_check import service, store
from .api_docs import _api_docs_access

router = APIRouter()

DEPLOY_TOKEN_HEADER = "x-deploy-token"


def _unauthorized() -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": "unauthorized"})


def _deploy_token_valid(request: Request) -> Optional[bool]:
    """None — deploy-token-авторизация выключена (пустой env или заголовок);
    True/False — валиден ли переданный токен (сравнение через hmac.compare_digest)."""
    expected = service.deploy_token()
    provided = str(request.headers.get(DEPLOY_TOKEN_HEADER, "") or "").strip()
    if not expected or not provided:
        return None
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def _run_auth(request: Request) -> Tuple[str, str, Optional[JSONResponse]]:
    """-> (trigger, requested_by, err). err=None при успехе."""
    deploy_valid = _deploy_token_valid(request)
    if deploy_valid is True:
        return "deploy", "", None
    if deploy_valid is False:
        return "", "", _unauthorized()
    # Путь в AUTH_PUBLIC_PATHS (deploy-token без bearer): auth_guard bearer не
    # разбирает — делаем это сами, чтобы viewer получил 403, а не 401.
    authorization = str(request.headers.get("authorization", "") or "").strip()
    if authorization:
        try:
            request.state.auth_user = user_from_bearer_header(authorization)
        except AuthError:
            return "", "", _unauthorized()
    uid, err = _api_docs_access(request)
    if err is not None:
        # Без bearer-токена _api_docs_access отдаёт 401-конверт; приводим к простому виду.
        if err.status_code == 401:
            return "", "", _unauthorized()
        return "", "", err
    return "manual", str(uid or ""), None


def _run_brief(run: Dict[str, Any]) -> Dict[str, Any]:
    summary = run.get("summary_json") if isinstance(run.get("summary_json"), dict) else {}
    return {
        "id": run.get("id"),
        "started_at": run.get("started_at"),
        "finished_at": run.get("finished_at"),
        "trigger": run.get("trigger"),
        "status": run.get("status"),
        "version": {
            "commit": run.get("version_commit"),
            "branch": run.get("version_branch"),
            "env": run.get("version_env"),
        },
        "requested_by": run.get("requested_by"),
        "counts": summary.get("counts") or {},
        "diff": summary.get("diff") or {},
        "error": run.get("error") or "",
    }


@router.post("/api/admin/endpoint-check/run")
def admin_endpoint_check_run(request: Request) -> Any:
    trigger, requested_by, err = _run_auth(request)
    if err is not None:
        return err
    if trigger == "deploy" and not service.run_on_deploy_enabled():
        # Не ошибка: деплой-шаг не должен падать при выключенном флаге.
        return {"ok": True, "skipped": True, "reason": "run_on_deploy disabled"}
    try:
        outcome = service.request_run(trigger=trigger, requested_by=requested_by)
    except service.ScanConflictError as exc:
        return JSONResponse(
            status_code=409,
            content={"detail": "scan_already_running", "run_id": exc.run_id},
        )
    payload = {
        "ok": True,
        "run_id": outcome["run_id"],
        "status": outcome["status"],
        "trigger": outcome["trigger"],
    }
    if outcome.get("debounced"):
        payload["debounced"] = True
    return JSONResponse(status_code=202, content=payload)


@router.get("/api/admin/endpoint-check/status")
def admin_endpoint_check_status(request: Request) -> Any:
    _uid, err = _api_docs_access(request)
    if err is not None:
        return err
    active = service.get_active_run()
    active_payload: Optional[Dict[str, Any]] = None
    if active is not None:
        summary = active.get("summary_json") if isinstance(active.get("summary_json"), dict) else {}
        active_payload = {
            "run_id": active.get("id"),
            "status": active.get("status"),
            "trigger": active.get("trigger"),
            "started_at": active.get("started_at"),
            "progress": summary.get("progress") or {},
        }
    last_done = store.get_last_done_run()
    return {
        "ok": True,
        "active": active_payload,
        "last_run": _run_brief(last_done) if last_done is not None else None,
    }


@router.get("/api/admin/endpoint-check/runs")
def admin_endpoint_check_runs(
    request: Request,
    limit: int = Query(default=20),
    offset: int = Query(default=0),
) -> Any:
    _uid, err = _api_docs_access(request)
    if err is not None:
        return err
    lim = max(1, min(int(limit or 20), 100))
    off = max(0, int(offset or 0))
    rows = store.list_runs(limit=lim, offset=off)
    total = store.count_runs()
    return {
        "ok": True,
        "items": [_run_brief(row) for row in rows],
        "page": {"limit": lim, "offset": off, "total": total},
    }


@router.get("/api/admin/endpoint-check/runs/{run_id}")
def admin_endpoint_check_run_detail(run_id: str, request: Request) -> Any:
    _uid, err = _api_docs_access(request)
    if err is not None:
        return err
    run = store.get_run(run_id)
    if run is None:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    summary = run.get("summary_json") if isinstance(run.get("summary_json"), dict) else {}
    results = store.list_results(run["id"])
    return {
        "ok": True,
        "run": _run_brief(run),
        "results": results,
        "not_scanned": summary.get("not_scanned") or {},
        "blind_zone": summary.get("blind_zone") or [],
        "resolved_ids": summary.get("resolved_ids") or {},
    }
