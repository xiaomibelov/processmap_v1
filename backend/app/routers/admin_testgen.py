"""Admin API /api/admin/testgen/* — запуск LLM-генератора API-тестов из админки.

Генератор исполняется ТОЛЬКО в GitHub Actions (.github/workflows/llm-testgen.yml,
workflow_dispatch), никогда на сервере приложения. Этот роутер:

- POST /api/admin/testgen/run — workflow_dispatch через GitHub API
  (токен из env GITHUB_TOKEN или GH_PAT; репозиторий — GITHUB_REPOSITORY,
  default xiaomibelov/processmap_v1). Вход: tag (белый список тегов спеки),
  limit (1..20). 409 — уже есть активный запуск по этому тегу.
- GET /api/admin/testgen/runs — история запусков (sqlite testgen_runs),
  активные синкаются с GitHub (queued/running/done/failed + PR).
- GET /api/admin/testgen/runs/{run_id} — карточка запуска.

Право = как у админки/API Docs: is_admin ИЛИ роль в активной организации
∈ {org_owner, org_admin, auditor}. 401 без токена (middleware), 403 без права.

Связка с CI: workflow выставляет run-name «testgen <tag> x<limit> [<run_id>]»
и создаёт PR с «(run <run_id>, …)» в заголовке — по этим маркерам бэкенд
находит run и PR через GitHub API.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from .. import _legacy_main
from ..storage import _connect
from ..utils.authz import is_role_allowed
from .admin import _as_int

router = APIRouter()

# Право «API Docs» (см. frontend canOpenOrgSettings): platform admin или
# орг-роль из этого набора. Совпадает с ORG_SETTINGS_ROLES на фронте.
_TESTGEN_ALLOWED_ROLES = {"org_owner", "org_admin", "auditor"}

# Белый список тегов OpenAPI-спеки (docs/openapi.yaml) — зеркало Validate inputs
# в .github/workflows/llm-testgen.yml. Произвольные строки в inputs не уходят.
_ALLOWED_TAGS = frozenset({
    "admin", "analytics", "audit-log", "auto-pass", "clipboard",
    "deployment-notices", "dictionaries", "error-events", "explorer",
    "feature-flags", "health", "kitchens", "llm", "notes",
    "operation-catalog", "org-groups", "org-invites", "org-listing",
    "org-members", "org-property-dictionary", "organizations",
    "process-properties-registry", "process-templates",
    "product-actions-ai", "product-actions-registry",
    "project-analytics", "projects", "rag", "recipes",
    "reference-resolver", "reports", "save-status", "session-events",
    "sessions", "sku-bindings", "system", "templates",
    "transformation", "version",
})

_MAX_LIMIT = 20
_WORKFLOW_FILE = "llm-testgen.yml"
_ACTIVE_STATUSES = ("queued", "running")
_RUN_STATUSES = ("queued", "running", "done", "failed")


def _now() -> int:
    return int(time.time())


# ---------------------------------------------------------------- auth

def _testgen_context(request: Request):
    """Контекст права «API Docs»: (uid, oid, err). Паттерн routers/admin.py.

    Platform admin (is_admin) проходит без орг-членства; остальным нужна
    роль в активной организации из _TESTGEN_ALLOWED_ROLES.
    """
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return None, None, _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    oid = _legacy_main._request_active_org_id(request)
    if is_admin:
        return uid, oid, None
    role, err = _legacy_main._enterprise_require_org_member(request, oid)
    if err is not None:
        return None, None, err
    if not is_role_allowed(str(role or "").lower(), _TESTGEN_ALLOWED_ROLES):
        return None, None, _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
    return uid, oid, None


# ---------------------------------------------------------------- storage

def _row_to_run(row: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(row)
    try:
        item["summary"] = json.loads(item.pop("summary_json") or "{}")
    except (TypeError, ValueError):
        item["summary"] = {}
    return item


def _insert_run(run_id: str, tag: str, limit: int, requested_by: str) -> Dict[str, Any]:
    ts = _now()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO testgen_runs
              (run_id, status, tag, batch_limit, requested_by, created_at, updated_at)
            VALUES (?, 'queued', ?, ?, ?, ?, ?)
            """,
            (run_id, tag, int(limit), str(requested_by or ""), ts, ts),
        )
    return _get_run(run_id) or {}


def _update_run(run_id: str, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = _now()
    cols = ", ".join(f"{k} = ?" for k in fields)
    with _connect() as con:
        con.execute(f"UPDATE testgen_runs SET {cols} WHERE run_id = ?", (*fields.values(), run_id))


def _get_run(run_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        row = con.execute("SELECT * FROM testgen_runs WHERE run_id = ?", (run_id,)).fetchone()
    return _row_to_run(dict(row)) if row is not None else None


def _list_runs(status: str = "", limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM testgen_runs"
    params: List[Any] = []
    if status in _RUN_STATUSES:
        sql += " WHERE status = ?"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params += [int(limit), int(offset)]
    with _connect() as con:
        rows = con.execute(sql, params).fetchall()
    return [_row_to_run(dict(r)) for r in rows]


def _has_active_run(tag: str) -> bool:
    with _connect() as con:
        row = con.execute(
            "SELECT 1 FROM testgen_runs WHERE tag = ? AND status IN ('queued', 'running') LIMIT 1",
            (tag,),
        ).fetchone()
    return row is not None


# ---------------------------------------------------------------- github api

def _github_token() -> str:
    return (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_PAT") or "").strip()


def _github_repo() -> str:
    return (os.environ.get("GITHUB_REPOSITORY") or "xiaomibelov/processmap_v1").strip()


def _github_api(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Any:
    """Вызов GitHub REST API. Отдельная функция — точка мока в тестах."""
    token = _github_token()
    if not token:
        raise RuntimeError("github_token_not_configured")
    resp = requests.request(
        method,
        f"https://api.github.com{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        json=payload,
        timeout=15.0,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"github_api_{resp.status_code}")
    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def _github_dispatch(tag: str, limit: int, run_id: str) -> None:
    _github_api(
        "POST",
        f"/repos/{_github_repo()}/actions/workflows/{_WORKFLOW_FILE}/dispatches",
        {"ref": "main", "inputs": {"tag": tag, "limit": str(int(limit)), "run_id": run_id}},
    )


def _github_find_workflow_run(run_id: str, created_after: int) -> Optional[Dict[str, Any]]:
    """Найти workflow-run по маркеру [<run_id>] в run-name (display_title)."""
    since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(max(0, created_after - 60)))
    data = _github_api(
        "GET",
        f"/repos/{_github_repo()}/actions/workflows/{_WORKFLOW_FILE}/runs"
        f"?event=workflow_dispatch&per_page=20&created=>={since}",
    )
    marker = f"[{run_id}]"
    for item in data.get("workflow_runs") or []:
        if marker in str(item.get("display_title") or ""):
            return item
    return None


def _github_get_workflow_run(github_run_id: str) -> Optional[Dict[str, Any]]:
    data = _github_api("GET", f"/repos/{_github_repo()}/actions/runs/{github_run_id}")
    return data if isinstance(data, dict) and data.get("id") else None


def _github_find_pr(run_id: str) -> str:
    data = _github_api(
        "GET",
        f"/search/issues?q=repo:{_github_repo()}+type:pr+{run_id}+in:title&per_page=5",
    )
    for item in data.get("items") or []:
        url = str(item.get("html_url") or "")
        if url:
            return url
    return ""


def _sync_run(item: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort синк активного запуска с GitHub. Ошибки GitHub не роняют чтение."""
    if item.get("status") not in _ACTIVE_STATUSES:
        return item
    run_id = str(item.get("run_id") or "")
    try:
        gh_run = None
        if item.get("github_run_id"):
            gh_run = _github_get_workflow_run(str(item["github_run_id"]))
        else:
            gh_run = _github_find_workflow_run(run_id, int(item.get("created_at") or 0))
            if gh_run:
                _update_run(run_id, github_run_id=str(gh_run.get("id") or ""))
                item["github_run_id"] = str(gh_run.get("id") or "")
        gh_status = str((gh_run or {}).get("status") or "")
        conclusion = str((gh_run or {}).get("conclusion") or "")
        if gh_run and gh_status == "completed":
            new_status = "done" if conclusion == "success" else "failed"
            fields: Dict[str, Any] = {"status": new_status}
            if new_status == "done" and not item.get("pr_url"):
                pr_url = _github_find_pr(run_id)
                if pr_url:
                    fields["pr_url"] = pr_url
            if new_status == "failed" and conclusion:
                fields["error"] = f"github_conclusion:{conclusion}"
            _update_run(run_id, **fields)
            item.update(fields)
        elif gh_run and gh_status in ("in_progress", "queued", "waiting", "requested"):
            new_status = "running" if gh_status in ("in_progress", "waiting") else "queued"
            if new_status != item.get("status"):
                _update_run(run_id, status=new_status)
                item["status"] = new_status
    except Exception:
        # GitHub недоступен/не настроен — отдаём последнее известное состояние.
        pass
    return item


# ---------------------------------------------------------------- endpoints

class TestgenRunBody(BaseModel):
    tag: str = ""
    limit: int = 5


@router.post("/api/admin/testgen/run", status_code=201)
def admin_testgen_run(request: Request, body: TestgenRunBody) -> Any:
    uid, _oid, err = _testgen_context(request)
    if err is not None:
        return err
    tag = (body.tag or "").strip()
    if tag not in _ALLOWED_TAGS:
        return _legacy_main._enterprise_error(
            422, "validation_error",
            f"tag вне белого списка спеки: {tag!r}",
        )
    try:
        limit = int(body.limit)
    except (TypeError, ValueError):
        return _legacy_main._enterprise_error(422, "validation_error", "limit должен быть целым числом")
    if not (1 <= limit <= _MAX_LIMIT):
        return _legacy_main._enterprise_error(422, "validation_error", f"limit вне диапазона 1..{_MAX_LIMIT}")
    if _has_active_run(tag):
        return _legacy_main._enterprise_error(
            409, "conflict", f"по тегу '{tag}' уже есть активный запуск",
        )
    if not _github_token():
        return _legacy_main._enterprise_error(503, "github_not_configured", "GITHUB_TOKEN/GH_PAT не настроен")

    run_id = f"tg_{uuid.uuid4().hex[:12]}"
    item = _insert_run(run_id, tag, limit, requested_by=str(uid or ""))
    try:
        _github_dispatch(tag, limit, run_id)
    except Exception as exc:  # сеть/4xx/5xx GitHub — запуск не создан
        _update_run(run_id, status="failed", error=f"dispatch_failed:{exc}")
        return _legacy_main._enterprise_error(502, "github_dispatch_failed", "не удалось запустить workflow")
    return {"ok": True, "item": _get_run(run_id) or item}


@router.get("/api/admin/testgen/runs")
def admin_testgen_runs(
    request: Request,
    status: str = Query(default=""),
    limit: str = Query(default="20"),
    offset: str = Query(default="0"),
) -> Any:
    _uid, _oid, err = _testgen_context(request)
    if err is not None:
        return err
    lim = max(1, min(_as_int(limit, 20), 100))
    off = max(0, _as_int(offset, 0))
    items = [_sync_run(it) for it in _list_runs(status.strip().lower(), lim, off)]
    return {"ok": True, "items": items, "count": len(items)}


@router.get("/api/admin/testgen/runs/{run_id}")
def admin_testgen_run_detail(request: Request, run_id: str) -> Any:
    _uid, _oid, err = _testgen_context(request)
    if err is not None:
        return err
    item = _get_run(run_id)
    if item is None:
        return _legacy_main._enterprise_error(404, "not_found", "run not found")
    return {"ok": True, "item": _sync_run(item)}
