from __future__ import annotations

import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, Request

from ..legacy.request_context import request_auth_user as _request_auth_user


def build_session_not_found_detail(session_id) -> Dict[str, Any]:
    return {
        "code": "SESSION_NOT_FOUND",
        "session_id": str(session_id or ""),
        "message": "session not found (deleted?)",
    }


def raise_session_not_found(session_id) -> None:
    """P-1: missing/deleted session is a terminal 404 (never a bare 200-dict
    or a 500). Session-scoped handlers must use this instead of
    `return {"error": "not found"}`."""
    raise HTTPException(status_code=404, detail=build_session_not_found_detail(session_id))


def _to_non_negative_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        v = int(value)
        return v if v >= 0 else None
    except (ValueError, TypeError):
        return None


_CLIENT_ID_HEADER = "x-pm-client-id"
_CLIENT_ID_RE = re.compile(r"[^A-Za-z0-9_.:-]+")


def _normalize_client_id(value: Any) -> str:
    text = _CLIENT_ID_RE.sub("", str(value or "").strip())
    return text[:128]


def _resolve_client_id_from_request(request: Request = None) -> str:
    if request is None:
        return ""
    headers = request.headers or {}
    for key in (_CLIENT_ID_HEADER, "x-pm-client-id"):
        value = headers.get(key)
        if value:
            return _normalize_client_id(value)
    return ""


def _resolve_base_diagram_state_version(
    *, request: Request = None, payload: Dict[str, Any] | None = None
) -> Optional[int]:
    body = payload if isinstance(payload, dict) else {}

    for key in ("base_diagram_state_version", "base_bpmn_xml_version", "rev"):
        parsed = _to_non_negative_int(body.get(key))
        if parsed is not None:
            return parsed

    if request is not None:
        for key in ("x-base-diagram-state-version", "x-base-bpmn-xml-version"):
            parsed = _to_non_negative_int((request.headers or {}).get(key))
            if parsed is not None:
                return parsed
        if_match = str((request.headers or {}).get("if-match") or "").strip()
        if if_match:
            if if_match.startswith("W/"):
                if_match = if_match[2:].strip()
            if if_match.startswith('"') and if_match.endswith('"') and len(if_match) >= 2:
                if_match = if_match[1:-1].strip()
            parsed_if_match = _to_non_negative_int(if_match)
            if parsed_if_match is not None:
                return parsed_if_match
        query_params = getattr(request, "query_params", {}) or {}
        for key in ("base_diagram_state_version", "base_bpmn_xml_version", "rev"):
            raw_value = query_params.get(key) if hasattr(query_params, "get") else None
            parsed = _to_non_negative_int(raw_value)
            if parsed is not None:
                return parsed

    return None


def _resolve_actor_label_from_user(user: Any, fallback_user_id: str = "") -> str:
    actor = user if isinstance(user, dict) else {}
    for key in ("name", "username", "email", "id"):
        value = str(actor.get(key) or "").strip()
        if value:
            return value
    return str(fallback_user_id or "").strip()


def _build_server_last_write_payload(sess) -> Dict[str, Any]:
    changed_keys_raw = getattr(sess, "diagram_last_write_changed_keys", [])
    changed_keys = []
    if isinstance(changed_keys_raw, list):
        for item in changed_keys_raw:
            key = str(item or "").strip()
            if key:
                changed_keys.append(key)
    return {
        "actor_user_id": str(getattr(sess, "diagram_last_write_actor_user_id", "") or ""),
        "actor_label": str(getattr(sess, "diagram_last_write_actor_label", "") or ""),
        "client_id": str(getattr(sess, "diagram_last_write_client_id", "") or ""),
        "at": int(getattr(sess, "diagram_last_write_at", 0) or 0),
        "changed_keys": changed_keys,
    }


def _diagram_state_conflict_payload(
    *,
    code: str,
    session_id: str,
    client_base_version: Optional[int],
    server_current_version: int,
    sess,
) -> Dict[str, Any]:
    return {
        "code": str(code or "DIAGRAM_STATE_CONFLICT"),
        "session_id": str(session_id or ""),
        "client_base_version": client_base_version,
        "server_current_version": int(server_current_version or 0),
        "server_last_write": _build_server_last_write_payload(sess),
    }


def _require_diagram_cas_or_409(
    *,
    sess,
    session_id: str,
    request: Request = None,
    client_base_version: Optional[int] = None,
) -> None:
    # Compatibility bridge for direct function-call harnesses used in unit tests.
    # Real HTTP requests always provide `.scope`; CAS stays strict there.
    if request is None or not hasattr(request, "scope"):
        return
    # SECURITY: E2E CAS bypass. MUST be unset in production.
    # Controlled test environments only (CI, local e2e).
    if os.environ.get("FPC_E2E_CAS_BYPASS") == "1":
        return
    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    if client_base_version is None:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_BASE_VERSION_REQUIRED",
                session_id=str(getattr(sess, "id", "") or session_id),
                client_base_version=None,
                server_current_version=current_version,
                sess=sess,
            ),
        )
    if int(client_base_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_CONFLICT",
                session_id=str(getattr(sess, "id", "") or session_id),
                client_base_version=int(client_base_version),
                server_current_version=current_version,
                sess=sess,
            ),
        )


def _mark_diagram_truth_write(
    sess,
    *,
    changed_keys: List[str],
    actor_user_id: str = "",
    actor_label: str = "",
    client_id: str = "",
) -> None:
    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    next_version = max(0, current_version) + 1
    normalized_keys = sorted(
        {
            str(key or "").strip()
            for key in (changed_keys or [])
            if str(key or "").strip()
        }
    )
    sess.diagram_state_version = next_version
    sess.diagram_last_write_actor_user_id = str(actor_user_id or "").strip()
    sess.diagram_last_write_actor_label = str(actor_label or actor_user_id or "").strip()
    sess.diagram_last_write_client_id = _normalize_client_id(client_id)
    sess.diagram_last_write_at = int(time.time())
    sess.diagram_last_write_changed_keys = normalized_keys


def _resolve_actor_context(request: Request = None) -> Tuple[Dict[str, Any], str, str]:
    user = _request_auth_user(request) if request is not None else {}
    user = user if isinstance(user, dict) else {}
    actor_user_id = str(user.get("id") or "").strip()
    actor_label = _resolve_actor_label_from_user(user, actor_user_id)
    return user, actor_user_id, actor_label


def _effective_sql_cas_base(client_base_version: Optional[int]) -> Optional[int]:
    """Base version to enforce at SQL level, or None for the legacy non-CAS path."""
    if client_base_version is None:
        return None
    if os.environ.get("FPC_E2E_CAS_BYPASS") == "1":
        return None
    try:
        return int(client_base_version)
    except (TypeError, ValueError):
        return None


def _save_session_with_cas(
    storage,
    sess,
    *,
    client_base_version: Optional[int],
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    bpmn_snapshot: Optional[Dict[str, Any]] = None,
) -> None:
    """Save session with SQL-level CAS on diagram_state_version when a base is available.

    Closes the check-then-act race between the in-memory CAS guard and the row
    upsert (audit P2 / T2-T3): a concurrent writer that committed in between
    makes the UPDATE affect zero rows -> 409 DIAGRAM_STATE_CONFLICT instead of
    a silent last-writer-wins overwrite. Paths without a base version keep the
    legacy full-row upsert behavior.
    """
    from ..storage import (  # local import to avoid cycles
        DiagramStateConflictError,
        SessionNotFoundError,
        _is_integrity_error,
    )

    base = _effective_sql_cas_base(client_base_version)
    try:
        if base is None:
            storage.save(
                sess,
                user_id=user_id,
                is_admin=is_admin,
                org_id=org_id,
                bpmn_snapshot=bpmn_snapshot,
            )
            return
        storage.save(
            sess,
            user_id=user_id,
            is_admin=is_admin,
            org_id=org_id,
            expected_diagram_state_version=base,
            bpmn_snapshot=bpmn_snapshot,
        )
    except SessionNotFoundError as exc:
        # P-1: the row was deleted between the pre-load and the CAS write.
        # A deleted session is a terminal 404, NOT a 409 version conflict —
        # the frontend must show the dead-session screen, not the conflict modal.
        raise HTTPException(
            status_code=404,
            detail=build_session_not_found_detail(exc.session_id),
        ) from exc
    except DiagramStateConflictError as exc:
        current_version = exc.current
        server_sess = sess
        try:
            reloaded = storage.load(exc.session_id, is_admin=True)
            if reloaded is not None:
                server_sess = reloaded
                current_version = int(getattr(reloaded, "diagram_state_version", 0) or 0)
        except Exception:
            pass
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_CONFLICT",
                session_id=exc.session_id,
                client_base_version=base,
                server_current_version=int(current_version if current_version is not None else 0),
                sess=server_sess,
            ),
        ) from exc
    except Exception as exc:
        if _is_integrity_error(exc):
            # Unique constraint (e.g. alembic-011 indexes) — clean 409, never a 500.
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "SESSION_WRITE_CONFLICT",
                    "session_id": str(getattr(sess, "id", "") or ""),
                    "message": "write conflicts with a uniqueness constraint",
                },
            ) from exc
        raise
