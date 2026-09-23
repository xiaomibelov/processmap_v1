"""Агрегатор витрины canvas_event_read (feature/canvas-telemetry-feed).

raw → группы ошибок: классификация, дедуп по fingerprint, контекст (~20
последних событий сессии до ошибки), флаг converged (версии client/server
сошлись после последней ошибки сессии — «пустой шум» vs реальная дивергенция).

Идемпотентен: результат полностью определяется содержимым raw, повторный
запуск на том же срезе не меняет витрину.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Dict, List

from ...domains.storage.canvas_telemetry.repository import (
    _connect,
    _ensure_schema,
    _now_ts,
    list_raw_events,
    upsert_error_group,
)
from .classify import error_fingerprint

logger = logging.getLogger(__name__)

_CONTEXT_EVENTS = 20
_MAX_SESSION_EVENTS = 5000


def _payload_of(row: Dict[str, Any]) -> Dict[str, Any]:
    try:
        data = json.loads(row.get("payload_json") or "{}")
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _versions_match(event_payload: Dict[str, Any]) -> bool:
    versions = event_payload.get("versions")
    if not isinstance(versions, dict):
        return False
    client = versions.get("clientTracked")
    server = versions.get("serverAck")
    if client is None or server is None:
        return False
    try:
        return int(client) == int(server)
    except (TypeError, ValueError):
        return False


def _compute_converged(events: List[Dict[str, Any]], last_error_ts: int) -> int:
    """После последней ошибки сессии: ack/save_status saved с сошедшимися версиями."""
    for row in events:
        if int(row.get("ts") or 0) <= last_error_ts:
            continue
        payload = _payload_of(row)
        if row.get("kind") == "ack" and _versions_match(payload):
            return 1
        if row.get("kind") == "save_status":
            ux = payload.get("ux") if isinstance(payload.get("ux"), dict) else {}
            if str(ux.get("state") or "") == "saved" and _versions_match(payload):
                return 1
    return 0


def _is_confirmation_event(row: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    """Серверное подтверждение сохранения (F1): факт успешного save/ack.

    ack http.status=200 — сервер применил батч (tracker adopt'ит ack-версию);
    save_status ux.state=saved — успешная стадия, КРОМЕ ops-local (offline:
    локальная durability, сервер не подтверждал). Версии не обязаны совпадать:
    успешный save по определению ре-синкает клиента с сервером (adopt dsv).
    """
    if row.get("kind") == "ack":
        http = payload.get("http") if isinstance(payload.get("http"), dict) else {}
        return int(http.get("status") or 0) == 200
    if row.get("kind") == "save_status":
        ux = payload.get("ux") if isinstance(payload.get("ux"), dict) else {}
        if str(ux.get("state") or "") != "saved":
            return False
        return str(ux.get("opsStage") or "") != "ops-local"
    return False


def _compute_classification(events: List[Dict[str, Any]], group_last_seen_ts: int) -> str:
    """«потеря данных vs шум» (F1): transient_noise, если ПОСЛЕ последней
    ошибки группы сохранение подтвердилось сервером; иначе data_loss."""
    for row in events:
        if int(row.get("ts") or 0) <= group_last_seen_ts:
            continue
        if _is_confirmation_event(row, _payload_of(row)):
            return "transient_noise"
    return "data_loss"


def aggregate_session(session_id: str) -> Dict[str, Any]:
    _ensure_schema()
    events = list_raw_events(session_id, limit=_MAX_SESSION_EVENTS)
    error_rows = [row for row in events if row.get("kind") == "error"]
    if not error_rows:
        return {"groups": 0}

    last_error_ts = max(int(row.get("ts") or 0) for row in error_rows)
    converged = _compute_converged(events, last_error_ts)

    # группы по fingerprint, считаем по полному окну (детерминированно)
    by_fp: Dict[tuple, Dict[str, Any]] = {}
    for index, row in enumerate(events):
        if row.get("kind") != "error":
            continue
        payload = _payload_of(row)
        fp = error_fingerprint(payload)
        key = (fp["error_class"], fp["error_code"], fp["op_type"])
        context = [
            {
                "kind": r.get("kind"),
                "ts": int(r.get("ts") or 0),
                "event_id": r.get("event_id"),
                "payload": _payload_of(r),
            }
            for r in events[max(0, index - _CONTEXT_EVENTS + 1): index + 1]
        ]
        entry = by_fp.get(key)
        if entry is None:
            by_fp[key] = {
                "fingerprint": fp,
                "first_seen": int(row.get("ts") or 0),
                "last_seen": int(row.get("ts") or 0),
                "count": 1,
                "converged": converged,
                "classification": _compute_classification(events, int(row.get("ts") or 0)),
                "context": context,
            }
        else:
            entry["last_seen"] = int(row.get("ts") or 0)
            entry["count"] += 1
            # контекст обновляем к последнему вхождению fingerprint
            entry["context"] = context
            entry["classification"] = _compute_classification(events, entry["last_seen"])

    base = events[0]
    for entry in by_fp.values():
        fp = entry["fingerprint"]
        upsert_error_group(
            {
                "id": str(uuid.uuid4()),
                "org_id": base.get("org_id"),
                "session_id": session_id,
                "user_id": base.get("user_id"),
                "project_id": base.get("project_id"),
                "error_class": fp["error_class"],
                "error_code": fp["error_code"],
                "op_type": fp["op_type"],
                "op_id": fp["op_id"],
                "message": fp["message"],
                "first_seen": entry["first_seen"],
                "last_seen": entry["last_seen"],
                "count": entry["count"],
                "converged": int(entry["converged"]),
                "classification": entry["classification"],
                "context": entry["context"],
            }
        )
    return {"groups": len(by_fp)}


def _session_watermarks() -> Dict[str, int]:
    """max(last_seen) групп витрины по сессиям — watermark повторной обработки."""
    from ...domains.storage.canvas_telemetry.repository import list_session_watermarks

    return list_session_watermarks()


def aggregate_pending_sessions() -> Dict[str, Any]:
    """Сессии, у которых есть raw-события новее watermark витрины."""
    _ensure_schema()
    with _connect() as con:
        rows = con.execute(
            "SELECT session_id, MAX(ts) AS max_ts FROM canvas_event_raw GROUP BY session_id"
        ).fetchall()
    watermarks = _session_watermarks()
    processed = 0
    groups = 0
    for row in rows:
        session_id = str(row["session_id"] if hasattr(row, "keys") else row[0])
        max_ts = int(row["max_ts"] if hasattr(row, "keys") else row[1] or 0)
        if max_ts <= int(watermarks.get(session_id) or 0):
            continue
        try:
            result = aggregate_session(session_id)
        except Exception:
            logger.exception("aggregate_session failed: %s", session_id)
            continue
        processed += 1
        groups += int(result.get("groups") or 0)
    return {"sessions": processed, "groups": groups}
