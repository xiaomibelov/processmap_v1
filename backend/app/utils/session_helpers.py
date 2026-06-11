from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, Request

from ..legacy.request_context import request_auth_user as _request_auth_user


def _to_non_negative_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        v = int(value)
        return v if v >= 0 else None
    except (ValueError, TypeError):
        return None


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
    if request is None or not hasattr(request, "scope"):
        return
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
    sess.diagram_last_write_at = int(time.time())
    sess.diagram_last_write_changed_keys = normalized_keys


def _resolve_actor_context(request: Request = None) -> Tuple[Dict[str, Any], str, str]:
    user = _request_auth_user(request) if request is not None else {}
    user = user if isinstance(user, dict) else {}
    actor_user_id = str(user.get("id") or "").strip()
    actor_label = _resolve_actor_label_from_user(user, actor_user_id)
    return user, actor_user_id, actor_label
