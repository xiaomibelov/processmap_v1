"""Сервис фонового прогона read-only (GET) эндпоинтов живого приложения.

Логика обхода — как у одноразового scripts/endpoint_sweep.py (Этап 0 контура
feature/endpoint-regression-scanner), но прогон идёт против СОБСТВЕННОГО API
(http://localhost:8000, uvicorn внутри контейнера) с self-scan токеном.

- Фоновой запуск: threading.Thread(daemon=True), как auto_pass_jobs.
  asyncio.create_task в проекте не используется.
- Один активный прогон: in-memory lock + статус pending/running в БД → 409.
- Executor (функция HTTP-запроса) инжектируется — в тестах подменяется фейком,
  реальный localhost:8000 из тестов не дёргается.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import logging
import os
import re
import threading
import time
import urllib.parse
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from ..auth import _bool_env, create_access_token
from ..storage import _connect, _ensure_schema, _now_ts, list_auth_users
from . import store
from .diff import compute_diff, diff_counters

logger = logging.getLogger(__name__)

# backend/app/endpoint_check/service.py → backend/ — exclusions лежат в contract-suite.
_DEFAULT_EXCLUSIONS_PATH = Path(__file__).resolve().parents[2] / "tests" / "contract" / "exclusions.yaml"

BODY_CAPTURE_LIMIT = 2000
PROGRESS_FLUSH_EVERY = 10
ERROR_EVENTS_WINDOW_S = 60
ERROR_EVENTS_MAX_PER_RESULT = 3

# Статические значения, аналогичные seeded_*_params из contract_support.py.
STATIC_PARAMS = {"scope": "session"}
# scope_id = session_id (как в seeded_path_params).
ALIASES = {"scope_id": "session_id"}
# Query-параметры, которые подставляем (seeded_query_params).
QUERY_PARAM_NAMES = {"workspace_id", "scope", "scope_id", "org_id"}

# Обнаружение реальных id через list-эндпоинты (fallback, если в БД пусто).
DISCOVERY: Dict[str, List[Tuple[str, List[str]]]] = {
    "user_id": [("/api/auth/me", ["id", "user.id", "user_id"])],
    "org_id": [("/api/auth/me", ["active_org_id", "activeOrgId", "org_id", "orgs[0].id", "org.id"])],
    "workspace_id": [("/api/workspaces", ["[0].id", "items[0].id", "workspaces[0].id"])],
    "project_id": [("/api/projects", ["[0].id", "items[0].id", "projects[0].id"])],
    "session_id": [("/api/sessions", ["[0].id", "items[0].id", "sessions[0].id"])],
    "folder_id": [("/api/workspaces/{workspace_id}/folders", ["[0].id", "items[0].id", "folders[0].id"])],
}

# (url_path, query, token, timeout_s) -> (http_status, latency_ms, body, err_kind)
# err_kind: "" | "timeout" | "conn_error". HTTP-статус любой, включая 4xx/5xx.
Executor = Callable[[str, Dict[str, str], str, float], Tuple[int, float, bytes, str]]

# Ограничение: lock и «один активный прогон» покрывают ОДИН процесс uvicorn
# (в docker-compose он один). При появлении multi-worker/multi-replica гонка
# возможна — тогда нужен межпроцессный lock (redis/pg advisory lock).
_LOCK = threading.Lock()

# Margin для stale-recovery «зомби-прогонов» (B1): рестарт контейнера во время
# прогона оставляет строку pending/running навсегда (daemon-thread умирает с процессом).
STALE_MARGIN_S = 120


class ScanConflictError(Exception):
    """Уже есть активный (pending/running) прогон."""

    def __init__(self, run_id: str) -> None:
        super().__init__("scan_already_running")
        self.run_id = str(run_id or "")


# ------------------------------------------------------------------ stale-recovery (B1)
def _is_stale_run(run: Dict[str, Any], now: Optional[int] = None) -> bool:
    """Активный прогон считается мёртвым («зомби» после рестарта процесса), если:
    - now - started_at > deploy_delay + budget + margin, ИЛИ
    - heartbeat прогресса (summary_json.heartbeat_at, флашится с прогрессом)
      старше request_timeout * 2 + margin.
    """
    ts = int(now if now is not None else _now_ts())
    started_at = int(run.get("started_at") or 0)
    if started_at > 0 and ts - started_at > int(deploy_delay_s() + budget_s() + STALE_MARGIN_S):
        return True
    summary = run.get("summary_json") if isinstance(run.get("summary_json"), dict) else {}
    heartbeat_at = int(summary.get("heartbeat_at") or 0)
    if heartbeat_at > 0 and ts - heartbeat_at > int(request_timeout_s() * 2 + STALE_MARGIN_S):
        return True
    return False


def _recover_stale_run(run: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Мёртвый активный прогон переводит в failed и возвращает None; живой — как есть."""
    if run is None:
        return None
    if not _is_stale_run(run):
        return run
    logger.warning("endpoint_check: stale run %s recovered as failed", run.get("id"))
    store.update_run(str(run["id"]), status="failed", finished_at=_now_ts(), error="stale run recovered")
    return None


def get_active_run() -> Optional[Dict[str, Any]]:
    """Активный прогон с учётом stale-recovery (используется и /status, и request_run)."""
    return _recover_stale_run(store.get_active_run())


# ------------------------------------------------------------------ env-конфиг
def _float_env(name: str, default: float) -> float:
    raw = str(os.getenv(name, "")).strip()
    try:
        return float(raw) if raw else float(default)
    except ValueError:
        return float(default)


def request_timeout_s() -> float:
    return _float_env("ENDPOINT_CHECK_REQUEST_TIMEOUT_S", 20.0)


def budget_s() -> float:
    return _float_env("ENDPOINT_CHECK_BUDGET_S", 900.0)


def deploy_delay_s() -> float:
    return _float_env("ENDPOINT_CHECK_DEPLOY_DELAY_S", 45.0)


def deploy_debounce_s() -> float:
    return _float_env("ENDPOINT_CHECK_DEPLOY_DEBOUNCE_S", 300.0)


def base_url() -> str:
    return str(os.getenv("ENDPOINT_CHECK_BASE_URL", "http://localhost:8000") or "").strip().rstrip("/") or "http://localhost:8000"


def run_on_deploy_enabled() -> bool:
    """Дефолт: включён на stage, иначе выключен; env переопределяет."""
    default = str(os.getenv("BUILD_ENV", "prod") or "").strip().lower() == "stage"
    return _bool_env("ENDPOINT_CHECK_RUN_ON_DEPLOY", default=default)


def deploy_token() -> str:
    return str(os.getenv("ENDPOINT_CHECK_DEPLOY_TOKEN", "") or "").strip()


def _version() -> Dict[str, str]:
    # Как routers/version.py: BUILD_ID/BUILD_BRANCH/BUILD_ENV из env деплоя.
    return {
        "version_commit": str(os.getenv("BUILD_ID", "unknown") or ""),
        "version_branch": str(os.getenv("BUILD_BRANCH", "unknown") or ""),
        "version_env": str(os.getenv("BUILD_ENV", "prod") or ""),
    }


# ------------------------------------------------------------------ HTTP executor
def default_executor(url_path: str, query: Dict[str, str], token: str, timeout_s: float) -> Tuple[int, float, bytes, str]:
    """Реальный executor: GET на собственный API через requests (синхронно, в thread)."""
    import requests

    url = f"{base_url()}{url_path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    started = time.monotonic()
    try:
        resp = requests.get(url, params=query or None, headers=headers, timeout=timeout_s)
        # Спека большая — для неё лимит шире; тела обычных ответов режем.
        limit = 16 * 1024 * 1024 if url_path == "/api/openapi.json" else BODY_CAPTURE_LIMIT * 4
        body = resp.content[:limit]
        return int(resp.status_code), (time.monotonic() - started) * 1000, body, ""
    except requests.Timeout:
        return 0, (time.monotonic() - started) * 1000, b"", "timeout"
    except requests.RequestException as exc:
        return 0, (time.monotonic() - started) * 1000, str(exc)[:500].encode(), "conn_error"


# ------------------------------------------------------------------ exclusions (как contract_support.py)
def load_exclusions() -> Dict[str, Any]:
    import yaml

    path = Path(str(os.getenv("ENDPOINT_CHECK_EXCLUSIONS_PATH", "") or "").strip() or _DEFAULT_EXCLUSIONS_PATH)
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def _exclusion_reasons(exclusions: Dict[str, Any], key: str) -> Dict[str, str]:
    return {entry["id"]: str(entry.get("reason", "")) for entry in exclusions.get(key) or []}


def _spec_gap_status_map(exclusions: Dict[str, Any]) -> Dict[str, set]:
    out: Dict[str, set] = {}
    for entry in exclusions.get("spec_gap_status_operations") or []:
        out[entry["id"]] = {int(s) for s in entry.get("statuses") or []}
    return out


# ------------------------------------------------------------------ обход спеки (как endpoint_sweep.py)
def iter_get_operations(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    ops = []
    for path, path_item in (spec.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        path_params = path_item.get("parameters") or []
        op = path_item.get("get")
        if not isinstance(op, dict):
            continue
        params = list(path_params) + list(op.get("parameters") or [])
        ops.append(
            {
                "operation_id": op.get("operationId") or f"get_{path}",
                "method": "GET",
                "path": path,
                "parameters": params,
            }
        )
    ops.sort(key=lambda o: (o["path"], o["operation_id"]))
    return ops


def _path_param_names(op: Dict[str, Any]) -> List[str]:
    names = [p.get("name") for p in op["parameters"] if p.get("in") == "path"]
    if not names:
        names = re.findall(r"{([^}]+)}", op["path"])
    return [n for n in names if n]


def _required_query_without_mapping(op: Dict[str, Any]) -> List[str]:
    return [
        p.get("name")
        for p in op["parameters"]
        if p.get("in") == "query" and p.get("required") and p.get("name") not in QUERY_PARAM_NAMES
    ]


def _dig(obj: Any, path: str) -> Any:
    """Достаёт значение по пути вида 'a.b[0].c'. None, если пути нет."""
    cur = obj
    for part in path.split("."):
        if cur is None:
            return None
        if part.endswith("]") and "[" in part:
            name, idx = part[:-1].split("[", 1)
            if name:
                cur = cur.get(name) if isinstance(cur, dict) else None
            try:
                cur = cur[int(idx)] if isinstance(cur, list) and len(cur) > int(idx) else None
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


# ------------------------------------------------------------------ классификация (как endpoint_sweep.py)
def classify(
    op_id: str,
    status: int,
    err_kind: str,
    body: bytes,
    llm_envelope_ids: set,
    gap_map: Dict[str, set],
) -> Tuple[str, str]:
    """-> (category, note). category: ok|http_error|domain_error|timeout|conn_error."""
    note = ""
    if err_kind:
        return err_kind, ""
    if status in gap_map.get(op_id, set()):
        note = f"spec_gap status {status} (ожидаемый доменный, см. exclusions.yaml)"
    if status == 200 and op_id in llm_envelope_ids:
        try:
            parsed = json.loads(body.decode("utf-8", "replace"))
        except Exception:
            parsed = None
        if isinstance(parsed, dict) and (parsed.get("ok") is False or "error" in parsed):
            return "domain_error", f"LLM-конверт: {parsed.get('error') or parsed.get('message')}"
    if 200 <= status < 300:
        return "ok", note
    if 300 <= status < 400:
        return "ok", (note + "; " if note else "") + f"redirect {status}"
    return "http_error", note


# ------------------------------------------------------------------ fingerprint
_DYNAMIC_PATTERNS = (
    re.compile(r'"request_id"\s*:\s*"[^"]*"'),
    re.compile(r'"timestamp"\s*:\s*"[^"]*"'),
    re.compile(r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b"),
    re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"),
)


def error_fingerprint(method: str, path: str, status: int, body: bytes) -> str:
    """Нормализованный fingerprint ошибки: method+path+status+первые ~200 символов
    тела без динамики (request_id/timestamp/uuid вырезаются) → sha1 hex."""
    text = body.decode("utf-8", "replace")[: BODY_CAPTURE_LIMIT]
    for pattern in _DYNAMIC_PATTERNS:
        text = pattern.sub("<dyn>", text)
    normalized = text[:200]
    return hashlib.sha1(f"{method} {path} {status} {normalized}".encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ resolve реальных id
def _fetch_first_id(con: Any, sql: str, params: Optional[List[Any]] = None) -> str:
    try:
        row = con.execute(sql, params or []).fetchone()
    except Exception:
        return ""
    if not row:
        return ""
    try:
        return str(row["id"] or "").strip()
    except Exception:
        return ""


def _resolve_ids_from_db(user_id: str) -> Dict[str, str]:
    """Значения реальных id напрямую из БД (первая org, workspace, последняя сессия,
    любой проект, папка; user_id = инициатор)."""
    _ensure_schema()
    context: Dict[str, str] = {}
    with _connect() as con:
        org_id = _fetch_first_id(con, "SELECT id FROM orgs WHERE is_active = 1 ORDER BY created_at ASC, id ASC LIMIT 1") or _fetch_first_id(
            con, "SELECT id FROM orgs ORDER BY created_at ASC, id ASC LIMIT 1"
        )
        workspace_id = ""
        if org_id:
            workspace_id = _fetch_first_id(con, "SELECT id FROM workspaces WHERE org_id = ? ORDER BY created_at ASC, id ASC LIMIT 1", [org_id])
        if not workspace_id:
            workspace_id = _fetch_first_id(con, "SELECT id FROM workspaces ORDER BY created_at ASC, id ASC LIMIT 1")
        session_id = _fetch_first_id(con, "SELECT id FROM sessions WHERE deleted_at = 0 ORDER BY updated_at DESC, id DESC LIMIT 1") or _fetch_first_id(
            con, "SELECT id FROM sessions ORDER BY updated_at DESC, id DESC LIMIT 1"
        )
        project_id = _fetch_first_id(con, "SELECT id FROM projects ORDER BY updated_at DESC, id DESC LIMIT 1")
        folder_id = ""
        if workspace_id:
            folder_id = _fetch_first_id(
                con, "SELECT id FROM workspace_folders WHERE workspace_id = ? ORDER BY created_at ASC, id ASC LIMIT 1", [workspace_id]
            )
        if not folder_id:
            folder_id = _fetch_first_id(con, "SELECT id FROM workspace_folders ORDER BY created_at ASC, id ASC LIMIT 1")
    if org_id:
        context["org_id"] = org_id
    if workspace_id:
        context["workspace_id"] = workspace_id
    if session_id:
        context["session_id"] = session_id
    if project_id:
        context["project_id"] = project_id
    if folder_id:
        context["folder_id"] = folder_id
    if user_id:
        context["user_id"] = user_id
    return context


def _resolve_ids_via_discovery(
    context: Dict[str, str], executor: Executor, token: str, timeout_s: float
) -> Dict[str, str]:
    """Fallback: discovery через list-эндпоинты живого API, как endpoint_sweep.py."""
    for name, candidates in DISCOVERY.items():
        if context.get(name):
            continue
        for cand_path, json_paths in candidates:
            url_path = cand_path
            for key, value in context.items():
                url_path = url_path.replace("{" + key + "}", str(value))
            if "{" in url_path:
                continue
            status, _, body, err = executor(url_path, {}, token, timeout_s)
            if err or status != 200:
                continue
            try:
                payload = json.loads(body.decode("utf-8", "replace"))
            except Exception:
                continue
            for jp in json_paths:
                value = _dig(payload, jp)
                if value not in (None, ""):
                    context[name] = str(value)
                    break
            if context.get(name):
                break
    return context


# ------------------------------------------------------------------ error-events связка
def _attach_error_events(results: List[Dict[str, Any]], started_ts: int, finished_ts: int) -> None:
    """Для результатов с category != 'ok' подтягивает последние error-events
    в окне прогона (±60с) и матчит по route (точно по url_path или по path-шаблону)."""
    failing = [r for r in results if r.get("category") not in ("", "ok")]
    if not failing:
        return
    try:
        from ..storage import list_error_events

        events = list_error_events(
            occurred_from=max(0, int(started_ts) - ERROR_EVENTS_WINDOW_S),
            occurred_to=int(finished_ts) + ERROR_EVENTS_WINDOW_S,
            limit=100,
            order="desc",
        )
    except Exception as exc:
        logger.warning("endpoint_check: error-events lookup failed: %s", exc)
        return
    if not events:
        return

    def _route_matches(event_route: str, result: Dict[str, Any]) -> bool:
        route = str(event_route or "").split("?", 1)[0]
        if not route:
            return False
        if route == str(result.get("url_path") or ""):
            return True
        template = str(result.get("path") or "")
        if "{" not in template:
            return False
        # path-шаблон → regex: {param} матчит один сегмент пути.
        pattern = "^" + re.sub(r"\{[^}]+\}", "[^/]+", template) + "$"
        try:
            return bool(re.match(pattern, route))
        except re.error:
            return False

    for result in failing:
        matched: List[Dict[str, Any]] = []
        for event in events:
            if not isinstance(event, dict):
                continue
            if not _route_matches(str(event.get("route") or ""), result):
                continue
            matched.append(
                {
                    "event_id": str(event.get("id") or ""),
                    "message": str(event.get("message") or "")[:300],
                    "fingerprint": str(event.get("fingerprint") or ""),
                    "occurred_at": int(event.get("occurred_at") or 0),
                    "request_id": str(event.get("request_id") or ""),
                }
            )
            if len(matched) >= ERROR_EVENTS_MAX_PER_RESULT:
                break
        if matched:
            result["error_events_json"] = matched


# ------------------------------------------------------------------ прогон
def _scan_token_uid(run: Dict[str, Any]) -> str:
    """uid для self-scan токена: инициатор (manual) или первый активный is_admin."""
    uid = str(run.get("requested_by") or "").strip()
    if uid:
        return uid
    for user in list_auth_users():
        if bool(user.get("is_admin")) and bool(user.get("is_active", True)):
            return str(user.get("id") or "").strip()
    raise RuntimeError("deploy-trigger: нет активного is_admin пользователя для self-scan токена")


def _store_results_with_diff(run_id: str, results: List[Dict[str, Any]]) -> str:
    """Дифф против прошлого завершённого прогона + INSERT результатов.

    Возвращает prev_run_id (пусто, если прошлого прогона не было).
    """
    prev_run = store.get_last_done_run()
    prev_results = store.list_results(prev_run["id"]) if prev_run else []
    diff_map = compute_diff(prev_results, results)
    for result in results:
        diff_status, diff_note = diff_map.get(result["operation_id"], ("", ""))
        result["diff_status"] = diff_status
        if diff_note:
            result["note"] = (result["note"] + "; " if result["note"] else "") + diff_note
    store.insert_results(results)
    return str(prev_run["id"]) if prev_run else ""


def execute_run(run_id: str, executor: Optional[Executor] = None) -> None:
    """Синхронное выполнение прогона (вызывается из daemon-thread; в тестах — напрямую)."""
    exec_fn: Executor = executor or default_executor
    run = store.get_run(run_id)
    if run is None:
        return
    started_ts = _now_ts()
    summary: Dict[str, Any] = dict(run.get("summary_json") or {})
    results: List[Dict[str, Any]] = []
    results_stored = False
    store.update_run(run_id, status="running")
    try:
        timeout_s = request_timeout_s()
        budget = budget_s()
        t0 = time.monotonic()
        deadline = t0 + budget

        # M1: TTL self-scan токена = бюджет прогона + 15 мин, иначе хвост
        # длинного прогона ловил бы 401 (дефолтный TTL 15 мин ≈ бюджету 900с).
        token = create_access_token(_scan_token_uid(run), ttl_seconds=int(budget) + 900)

        # --- живая спека ---
        spec_status, _, spec_body, spec_err = exec_fn("/api/openapi.json", {}, token, timeout_s)
        if spec_err or spec_status != 200:
            raise RuntimeError(f"GET /api/openapi.json -> {spec_status or spec_err}")
        spec = json.loads(spec_body.decode("utf-8", "replace"))

        # --- exclusions ---
        exclusions = load_exclusions()
        skip_reasons = _exclusion_reasons(exclusions, "skip_operations")
        llm_envelope_ids = {entry["id"] for entry in exclusions.get("domain_error_envelope_operations") or []}
        gap_map = _spec_gap_status_map(exclusions)
        from ..db.config import get_db_runtime_config

        is_postgres = get_db_runtime_config().backend == "postgres"

        # --- реальные id ---
        context: Dict[str, str] = dict(STATIC_PARAMS)
        context.update(_resolve_ids_from_db(str(run.get("requested_by") or "")))
        context = _resolve_ids_via_discovery(context, exec_fn, token, timeout_s)
        for alias, target in ALIASES.items():
            if target in context:
                context[alias] = context[target]

        # --- план прогона ---
        get_ops = iter_get_operations(spec)
        plan: List[Dict[str, Any]] = []
        blind_zone: List[Dict[str, str]] = []
        not_scanned_mutations: List[str] = []

        # Мутации (не-GET) — не выполняем; в отчёте только счётчик + список operation_id.
        for path, path_item in (spec.get("paths") or {}).items():
            if not isinstance(path_item, dict):
                continue
            for method, op in path_item.items():
                if method in ("parameters", "get") or not isinstance(op, dict):
                    continue
                not_scanned_mutations.append(str(op.get("operationId") or f"{method}_{path}"))

        for op in get_ops:
            op_id = op["operation_id"]
            if op_id in skip_reasons:
                reason = skip_reasons[op_id]
                sqlite_env_only = reason.startswith("sqlite-env")
                if not (sqlite_env_only and is_postgres):
                    blind_zone.append({"operation_id": op_id, "method": "GET", "path": op["path"], "reason": f"skip_operations: {reason}"})
                    continue
                # sqlite-env ограничение тестового контура; на pg сканируем с пометкой.
                op["_note"] = "в contract-suite исключён (sqlite-env); на postgres сканируется"
            unresolved = [n for n in _path_param_names(op) if n not in context]
            if unresolved:
                blind_zone.append(
                    {
                        "operation_id": op_id,
                        "method": "GET",
                        "path": op["path"],
                        "status": "out_of_scope",
                        "reason": f"нет маппинга реальных id для path-параметров: {', '.join(unresolved)}",
                    }
                )
                continue
            missing_query = _required_query_without_mapping(op)
            if missing_query:
                blind_zone.append(
                    {
                        "operation_id": op_id,
                        "method": "GET",
                        "path": op["path"],
                        "status": "out_of_scope",
                        "reason": f"обязательные query-параметры без маппинга: {', '.join(missing_query)}",
                    }
                )
                continue
            plan.append(op)

        summary.update(
            {
                "progress": {"scanned": 0, "total": len(plan)},
                "heartbeat_at": _now_ts(),
                "resolved_ids": {k: v for k, v in sorted(context.items())},
                "blind_zone": blind_zone,
                "not_scanned": {"count": len(not_scanned_mutations), "operation_ids": sorted(not_scanned_mutations)},
            }
        )
        store.update_run(run_id, summary_json=summary)

        # --- выполнение ---
        def run_one(op: Dict[str, Any]) -> Dict[str, Any]:
            url_path = op["path"]
            for name in _path_param_names(op):
                url_path = url_path.replace("{" + name + "}", urllib.parse.quote(str(context[name]), safe=""))
            query: Dict[str, str] = {}
            for p in op["parameters"]:
                if p.get("in") == "query" and p.get("name") in QUERY_PARAM_NAMES and p["name"] in context:
                    query[p["name"]] = str(context[p["name"]])
            status, latency_ms, body, err_kind = exec_fn(url_path, query, token, timeout_s)
            category, note = classify(op["operation_id"], status, err_kind, body, llm_envelope_ids, gap_map)
            if op.get("_note"):
                note = (note + "; " if note else "") + op["_note"]
            fingerprint = "" if category == "ok" else error_fingerprint("GET", op["path"], status, body)
            return {
                "run_id": run_id,
                "operation_id": op["operation_id"],
                "method": "GET",
                "path": op["path"],
                "url_path": url_path + (("?" + urllib.parse.urlencode(query)) if query else ""),
                "http_status": status,
                "category": category,
                "latency_ms": round(latency_ms, 1),
                "fingerprint": fingerprint,
                "note": note,
                "body_excerpt": body.decode("utf-8", "replace")[:BODY_CAPTURE_LIMIT] if category == "http_error" and status >= 500 else "",
                "error_events_json": [],
            }

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = {}
            for op in plan:
                if time.monotonic() > deadline:
                    blind_zone.append(
                        {
                            "operation_id": op["operation_id"],
                            "method": "GET",
                            "path": op["path"],
                            "reason": "исчерпан общий бюджет времени прогона",
                        }
                    )
                    continue
                futures[pool.submit(run_one, op)] = op
            for fut in concurrent.futures.as_completed(futures):
                results.append(fut.result())
                if len(results) % PROGRESS_FLUSH_EVERY == 0:
                    summary["progress"] = {"scanned": len(results), "total": len(plan)}
                    summary["heartbeat_at"] = _now_ts()
                    store.update_run(run_id, summary_json=summary)

        results.sort(key=lambda r: (r["path"], r["operation_id"]))

        # --- error-events связка, затем дифф + INSERT результатов ---
        finished_ts = _now_ts()
        _attach_error_events(results, started_ts, finished_ts)
        prev_run_id = _store_results_with_diff(run_id, results)
        results_stored = True

        counts: Dict[str, int] = {}
        for r in results:
            counts[r["category"]] = counts.get(r["category"], 0) + 1
        summary.update(
            {
                "progress": {"scanned": len(results), "total": len(plan)},
                "duration_s": round(time.monotonic() - t0, 1),
                "counts": {
                    "ok": counts.get("ok", 0),
                    "http_error": counts.get("http_error", 0),
                    "http_error_5xx": sum(1 for r in results if r["category"] == "http_error" and int(r["http_status"]) >= 500),
                    "domain_error": counts.get("domain_error", 0),
                    "timeout": counts.get("timeout", 0),
                    "conn_error": counts.get("conn_error", 0),
                    "scanned": len(results),
                    "out_of_scope": sum(1 for b in blind_zone if b.get("status") == "out_of_scope"),
                    "blind_zone": len(blind_zone),
                },
                "diff": diff_counters([r["diff_status"] for r in results]),
                "prev_run_id": prev_run_id,
                "blind_zone": blind_zone,
            }
        )
        store.update_run(run_id, status="done", finished_at=finished_ts, summary_json=summary)
    except Exception as exc:
        logger.exception("endpoint_check: run %s failed", run_id)
        # m4: частичные результаты не теряем — сохраняем собранное до падения.
        if results and not results_stored:
            try:
                _store_results_with_diff(run_id, results)
            except Exception:
                logger.exception("endpoint_check: failed to store partial results for run %s", run_id)
        store.update_run(run_id, status="failed", finished_at=_now_ts(), error=str(exc)[:1000])


def _run_worker(run_id: str, executor: Optional[Executor], delay_s: float) -> None:
    try:
        if delay_s > 0:
            # Отложенный старт deploy-прогона (приложение должно прогреться после деплоя).
            time.sleep(delay_s)
        run = store.get_run(run_id)
        if run is None or run.get("status") != "pending":
            return
        execute_run(run_id, executor=executor)
    except Exception as exc:
        logger.exception("endpoint_check: worker failed for run %s", run_id)
        try:
            store.update_run(run_id, status="failed", finished_at=_now_ts(), error=str(exc)[:1000])
        except Exception:
            pass


def request_run(*, trigger: str, requested_by: str, executor: Optional[Executor] = None) -> Dict[str, Any]:
    """Создаёт прогон и запускает daemon-thread. Один активный прогон → ScanConflictError.

    Deploy-trigger: дебаунс — если есть pending/running deploy-прогон в окне
    ENDPOINT_CHECK_DEPLOY_DEBOUNCE_S, новый не создаётся (debounced=true).
    """
    trig = str(trigger or "manual").strip() or "manual"
    delay_s = deploy_delay_s() if trig == "deploy" else 0.0
    with _LOCK:
        if trig == "deploy":
            # B1: зомби deploy-прогон в окне дебаунса сначала хороним, иначе
            # дебаунс вернул бы мёртвый run и новый прогон не случился бы никогда.
            recent = _recover_stale_run(store.find_recent_deploy_run(_now_ts() - int(deploy_debounce_s())))
            if recent is not None:
                return {"run_id": recent["id"], "status": recent["status"], "trigger": trig, "debounced": True}
        active = get_active_run()
        if active is not None:
            raise ScanConflictError(str(active.get("id") or ""))
        run = store.create_run(trigger=trig, requested_by=str(requested_by or ""), **_version())
    thread = threading.Thread(
        target=_run_worker,
        args=(str(run["id"]), executor, delay_s),
        name=f"endpoint-check-{run['id']}",
        daemon=True,
    )
    thread.start()
    return {"run_id": run["id"], "status": "pending", "trigger": trig, "debounced": False}
