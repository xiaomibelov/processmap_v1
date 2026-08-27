"""Тонкий слой хранения прогонов endpoint-сканера (dual-backend sqlite/postgres).

Паттерн — как repositories/error_event_repo.py + storage error_events:
все операции через _connect()/_ensure_schema() из app.storage, sqlite-диалект
транслируется под postgres слоем _translate_sql_for_postgres.
История не затирается: runs/results только INSERT; UPDATE — только поля
жизненного цикла активного прогона (status, finished_at, summary_json, error).
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from ..storage import _connect, _ensure_schema, _json_dumps, _json_loads, _now_ts

_RUN_COLUMNS = (
    "id, started_at, finished_at, trigger, status, version_commit, version_branch,"
    " version_env, requested_by, summary_json, error"
)
_RESULT_COLUMNS = (
    "id, run_id, operation_id, method, path, url_path, http_status, category,"
    " latency_ms, fingerprint, diff_status, note, body_excerpt, error_events_json, created_at"
)

ACTIVE_STATUSES = ("pending", "running")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def _run_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "started_at": int(row["started_at"] or 0),
        "finished_at": int(row["finished_at"] or 0),
        "trigger": str(row["trigger"] or ""),
        "status": str(row["status"] or ""),
        "version_commit": str(row["version_commit"] or ""),
        "version_branch": str(row["version_branch"] or ""),
        "version_env": str(row["version_env"] or ""),
        "requested_by": str(row["requested_by"] or ""),
        "summary_json": _json_loads(row["summary_json"], {}),
        "error": str(row["error"] or ""),
    }


def _result_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "run_id": str(row["run_id"] or ""),
        "operation_id": str(row["operation_id"] or ""),
        "method": str(row["method"] or ""),
        "path": str(row["path"] or ""),
        "url_path": str(row["url_path"] or ""),
        "http_status": int(row["http_status"] or 0),
        "category": str(row["category"] or ""),
        "latency_ms": float(row["latency_ms"] or 0),
        "fingerprint": str(row["fingerprint"] or ""),
        "diff_status": str(row["diff_status"] or ""),
        "note": str(row["note"] or ""),
        "body_excerpt": str(row["body_excerpt"] or ""),
        "error_events": _json_loads(row["error_events_json"], []),
        "created_at": int(row["created_at"] or 0),
    }


def create_run(
    *,
    trigger: str,
    requested_by: str,
    version_commit: str = "",
    version_branch: str = "",
    version_env: str = "",
    summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    run_id = _new_id("ecr")
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO endpoint_check_runs (
              id, started_at, finished_at, trigger, status, version_commit, version_branch,
              version_env, requested_by, summary_json, error
            ) VALUES (?, ?, 0, ?, 'pending', ?, ?, ?, ?, ?, '')
            """,
            [
                run_id,
                now,
                str(trigger or "manual"),
                str(version_commit or ""),
                str(version_branch or ""),
                str(version_env or ""),
                str(requested_by or ""),
                _json_dumps(summary if isinstance(summary, dict) else {}, {}),
            ],
        )
        con.commit()
    run = get_run(run_id)
    if run is None:
        raise RuntimeError("create_run did not return a row")
    return run


def update_run(run_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    """Обновляет поля жизненного цикла прогона: status/finished_at/summary_json/error."""
    rid = str(run_id or "").strip()
    if not rid:
        return None
    allowed = {"status", "finished_at", "summary_json", "error", "started_at"}
    sets: List[str] = []
    params: List[Any] = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        if key == "summary_json":
            value = _json_dumps(value if isinstance(value, dict) else {}, {})
        elif key == "finished_at" or key == "started_at":
            value = int(value or 0)
        else:
            value = str(value or "")
        sets.append(f"{key} = ?")
        params.append(value)
    if not sets:
        return get_run(rid)
    _ensure_schema()
    with _connect() as con:
        con.execute(
            f"UPDATE endpoint_check_runs SET {', '.join(sets)} WHERE id = ?",
            [*params, rid],
        )
        con.commit()
    return get_run(rid)


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    rid = str(run_id or "").strip()
    if not rid:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"SELECT {_RUN_COLUMNS} FROM endpoint_check_runs WHERE id = ? LIMIT 1",
            [rid],
        ).fetchone()
    if not row:
        return None
    return _run_row_to_dict(row)


def get_active_run() -> Optional[Dict[str, Any]]:
    """Активный (pending/running) прогон, самый свежий по started_at."""
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT {_RUN_COLUMNS} FROM endpoint_check_runs
             WHERE status IN ('pending', 'running')
             ORDER BY started_at DESC, id DESC
             LIMIT 1
            """
        ).fetchone()
    if not row:
        return None
    return _run_row_to_dict(row)


def get_last_done_run() -> Optional[Dict[str, Any]]:
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT {_RUN_COLUMNS} FROM endpoint_check_runs
             WHERE status = 'done'
             ORDER BY started_at DESC, id DESC
             LIMIT 1
            """
        ).fetchone()
    if not row:
        return None
    return _run_row_to_dict(row)


def get_recent_done_runs(limit: int = 5) -> List[Dict[str, Any]]:
    """Последние завершённые прогоны для flap-detection."""
    lim = max(1, min(int(limit), 20))
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT {_RUN_COLUMNS} FROM endpoint_check_runs
             WHERE status = 'done'
             ORDER BY started_at DESC, id DESC
             LIMIT ?
            """,
            [lim],
        ).fetchall()
    return [_run_row_to_dict(row) for row in rows]


def find_recent_deploy_run(since_ts: int) -> Optional[Dict[str, Any]]:
    """Недавний (pending/running) deploy-прогон в окне дебаунса (started_at >= since_ts)."""
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"""
            SELECT {_RUN_COLUMNS} FROM endpoint_check_runs
             WHERE status IN ('pending', 'running') AND trigger = 'deploy' AND started_at >= ?
             ORDER BY started_at DESC, id DESC
             LIMIT 1
            """,
            [int(since_ts or 0)],
        ).fetchone()
    if not row:
        return None
    return _run_row_to_dict(row)


def list_runs(*, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit or 20), 100))
    off = max(0, int(offset or 0))
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT {_RUN_COLUMNS} FROM endpoint_check_runs
             ORDER BY started_at DESC, id DESC
             LIMIT ? OFFSET ?
            """,
            [lim, off],
        ).fetchall()
    return [_run_row_to_dict(row) for row in rows]


def count_runs() -> int:
    _ensure_schema()
    with _connect() as con:
        row = con.execute("SELECT COUNT(*) AS c FROM endpoint_check_runs").fetchone()
    return int(row["c"] or 0) if row else 0


def insert_results(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        for item in rows:
            con.execute(
                """
                INSERT INTO endpoint_check_results (
                  id, run_id, operation_id, method, path, url_path, http_status, category,
                  latency_ms, fingerprint, diff_status, note, body_excerpt, error_events_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    _new_id("ecres"),
                    str(item.get("run_id") or ""),
                    str(item.get("operation_id") or ""),
                    str(item.get("method") or ""),
                    str(item.get("path") or ""),
                    str(item.get("url_path") or ""),
                    int(item.get("http_status") or 0),
                    str(item.get("category") or ""),
                    float(item.get("latency_ms") or 0),
                    str(item.get("fingerprint") or ""),
                    str(item.get("diff_status") or ""),
                    str(item.get("note") or ""),
                    str(item.get("body_excerpt") or ""),
                    _json_dumps(item.get("error_events_json") if isinstance(item.get("error_events_json"), list) else [], []),
                    now,
                ],
            )
        con.commit()


def list_results(run_id: str) -> List[Dict[str, Any]]:
    rid = str(run_id or "").strip()
    if not rid:
        return []
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT {_RESULT_COLUMNS} FROM endpoint_check_results
             WHERE run_id = ?
             ORDER BY path ASC, operation_id ASC, id ASC
            """,
            [rid],
        ).fetchall()
    return [_result_row_to_dict(row) for row in rows]
