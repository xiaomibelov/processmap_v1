from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from ..db import adapt_sql, get_conn, row_to_dict
from ..shared.dto.error_event_dto import ErrorEventIn, ErrorEventOut, ErrorEventPatchIn
from ..shared.dto.error_event_helpers import (
    _normalize_nullable_id,
    _normalize_occurred_at,
    _normalize_route,
    _normalize_text,
    _now_ts,
    compute_fingerprint,
    generate_event_id,
    generate_request_id,
    redact_context_json,
)


def _to_out(row: Optional[Any]) -> Optional[ErrorEventOut]:
    if not row:
        return None
    data = row_to_dict(row)
    # context_json is stored as text in DB
    if isinstance(data.get("context_json"), str):
        import json

        try:
            data["context_json"] = json.loads(data["context_json"])
        except Exception:
            data["context_json"] = {}
    return ErrorEventOut(**data)


def _build_intake_meta(
    *,
    payload_request_id: Optional[str],
    header_request_id: Optional[str],
    path: str,
    method: str,
    client_ip: Optional[str],
) -> Dict[str, Any]:
    if payload_request_id:
        source = "payload"
    elif header_request_id:
        source = "header"
    else:
        source = "generated"
    meta: Dict[str, Any] = {
        "ingest_path": _normalize_route(path),
        "ingest_method": _normalize_text(method, max_len=16),
        "normalized_request_id_source": source,
    }
    if client_ip:
        meta["client_ip"] = _normalize_text(client_ip, max_len=128)
    return meta


def append_error_event(
    dto: ErrorEventIn,
    *,
    trusted_user_id: Optional[str] = None,
    trusted_org_id: Optional[str] = None,
    path: str = "",
    method: str = "POST",
    client_ip: Optional[str] = None,
    header_request_id: Optional[str] = None,
) -> ErrorEventOut:
    now_ts = _now_ts()
    advisory_user_id = _normalize_nullable_id(dto.user_id)
    advisory_org_id = _normalize_nullable_id(dto.org_id)
    normalized_request_id = _normalize_nullable_id(dto.request_id) or header_request_id or generate_request_id()
    client_route = _normalize_route(dto.route)

    sanitized_context = redact_context_json(dto.context_json)
    intake_meta = _build_intake_meta(
        payload_request_id=_normalize_nullable_id(dto.request_id),
        header_request_id=header_request_id,
        path=path,
        method=method,
        client_ip=client_ip,
    )
    if advisory_user_id and advisory_user_id != _normalize_nullable_id(trusted_user_id):
        intake_meta["client_claimed_user_id"] = advisory_user_id
    if advisory_org_id and advisory_org_id != _normalize_nullable_id(trusted_org_id):
        intake_meta["client_claimed_org_id"] = advisory_org_id
    sanitized_context["_server"] = intake_meta

    event_id = generate_event_id()
    event: Dict[str, Any] = {
        "id": event_id,
        "schema_version": dto.schema_version,
        "occurred_at": _normalize_occurred_at(dto.occurred_at, default_ts=now_ts),
        "ingested_at": now_ts,
        "source": dto.source,
        "event_type": dto.event_type,
        "severity": dto.severity,
        "message": dto.message,
        "user_id": _normalize_nullable_id(trusted_user_id),
        "org_id": _normalize_nullable_id(trusted_org_id),
        "session_id": _normalize_nullable_id(dto.session_id),
        "project_id": _normalize_nullable_id(dto.project_id),
        "route": client_route or None,
        "runtime_id": _normalize_nullable_id(dto.runtime_id),
        "tab_id": _normalize_nullable_id(dto.tab_id),
        "request_id": normalized_request_id,
        "correlation_id": _normalize_nullable_id(dto.correlation_id),
        "app_version": _normalize_nullable_id(dto.app_version),
        "git_sha": _normalize_nullable_id(dto.git_sha),
        "fingerprint": _normalize_nullable_id(dto.fingerprint) or "",
        "context_json": sanitized_context,
    }
    if not event["fingerprint"]:
        event["fingerprint"] = compute_fingerprint(event)

    import json

    sql = """
        INSERT INTO error_events (
            id, schema_version, occurred_at, ingested_at, source, event_type, severity, message,
            user_id, org_id, session_id, project_id, route, runtime_id, tab_id, request_id,
            correlation_id, app_version, git_sha, fingerprint, context_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = [
        event["id"], event["schema_version"], event["occurred_at"], event["ingested_at"],
        event["source"], event["event_type"], event["severity"], event["message"],
        event["user_id"], event["org_id"], event["session_id"], event["project_id"],
        event["route"], event["runtime_id"], event["tab_id"], event["request_id"],
        event["correlation_id"], event["app_version"], event["git_sha"], event["fingerprint"],
        json.dumps(event["context_json"], ensure_ascii=False),
    ]
    with get_conn() as conn:
        conn.execute(adapt_sql(sql), params)
    return _to_out(event)


def get_error_event(event_id: str) -> Optional[ErrorEventOut]:
    eid = str(event_id or "").strip()
    if not eid:
        return None
    sql = """
        SELECT id, schema_version, occurred_at, ingested_at, source, event_type, severity, message,
               user_id, org_id, session_id, project_id, route, runtime_id, tab_id, request_id,
               correlation_id, app_version, git_sha, fingerprint, context_json
          FROM error_events
         WHERE id = ?
         LIMIT 1
    """
    with get_conn() as conn:
        row = conn.execute(adapt_sql(sql), [eid]).fetchone()
    return _to_out(row)


def _build_where(filters: Dict[str, Any]) -> Tuple[str, List[Any]]:
    conditions = []
    params: List[Any] = []
    for key in (
        "session_id",
        "request_id",
        "correlation_id",
        "user_id",
        "org_id",
        "runtime_id",
        "event_type",
        "source",
        "severity",
    ):
        value = filters.get(key)
        if value is not None:
            conditions.append(f"{key} = ?")
            params.append(value)
    occurred_from = filters.get("occurred_from")
    if occurred_from is not None:
        conditions.append("occurred_at >= ?")
        params.append(int(occurred_from))
    occurred_to = filters.get("occurred_to")
    if occurred_to is not None:
        conditions.append("occurred_at <= ?")
        params.append(int(occurred_to))
    where = " AND ".join(conditions) if conditions else "1=1"
    return where, params


def list_error_events(
    *,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "asc",
) -> List[ErrorEventOut]:
    filters = {
        k: _normalize_nullable_id(v)
        for k, v in {
            "session_id": session_id,
            "request_id": request_id,
            "correlation_id": correlation_id,
            "user_id": user_id,
            "org_id": org_id,
            "runtime_id": runtime_id,
            "event_type": event_type,
            "source": source,
            "severity": severity,
            "occurred_from": occurred_from,
            "occurred_to": occurred_to,
        }.items()
    }
    where, params = _build_where(filters)
    direction = "ASC" if str(order).strip().lower() == "asc" else "DESC"
    sql = f"""
        SELECT id, schema_version, occurred_at, ingested_at, source, event_type, severity, message,
               user_id, org_id, session_id, project_id, route, runtime_id, tab_id, request_id,
               correlation_id, app_version, git_sha, fingerprint, context_json
          FROM error_events
         WHERE {where}
         ORDER BY occurred_at {direction}
         LIMIT ? OFFSET ?
    """
    params = params + [int(limit), int(offset)]
    with get_conn() as conn:
        rows = conn.execute(adapt_sql(sql), params).fetchall()
    return [_to_out(row) for row in rows if row is not None]


def count_error_events(
    *,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
) -> int:
    filters = {
        k: _normalize_nullable_id(v)
        for k, v in {
            "session_id": session_id,
            "request_id": request_id,
            "correlation_id": correlation_id,
            "user_id": user_id,
            "org_id": org_id,
            "runtime_id": runtime_id,
            "event_type": event_type,
            "source": source,
            "severity": severity,
            "occurred_from": occurred_from,
            "occurred_to": occurred_to,
        }.items()
    }
    where, params = _build_where(filters)
    sql = f"SELECT COUNT(*) FROM error_events WHERE {where}"
    with get_conn() as conn:
        row = conn.execute(adapt_sql(sql), params).fetchone()
    if not row:
        return 0
    return int(row_to_dict(row).get("count", 0) or row[0])


def update_error_event(event_id: str, patch: ErrorEventPatchIn) -> Optional[ErrorEventOut]:
    eid = str(event_id or "").strip()
    if not eid:
        return None
    import json

    updates: Dict[str, Any] = {}
    if patch.severity is not None:
        updates["severity"] = patch.severity
    if patch.message is not None:
        updates["message"] = patch.message
    if patch.context_json is not None:
        updates["context_json"] = json.dumps(redact_context_json(patch.context_json), ensure_ascii=False)
    if not updates:
        return get_error_event(eid)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    params = list(updates.values()) + [eid]
    sql = f"""
        UPDATE error_events
           SET {set_clause}
         WHERE id = ?
    """
    with get_conn() as conn:
        conn.execute(adapt_sql(sql), params)
    return get_error_event(eid)


def delete_error_event(event_id: str) -> bool:
    eid = str(event_id or "").strip()
    if not eid:
        return False
    sql = "DELETE FROM error_events WHERE id = ?"
    with get_conn() as conn:
        cur = conn.execute(adapt_sql(sql), [eid])
        return int(getattr(cur, "rowcount", 0) or 0) > 0
