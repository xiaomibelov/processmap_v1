from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, Optional

from ..redis_cache import (
    cache_delete_prefix,
    cache_get_json,
    cache_get_str,
    cache_set_json,
    cache_set_str,
)

logger = logging.getLogger(__name__)

SESSION_CACHE_TTL = 30          # seconds — mutable session projection
BPMN_CACHE_TTL = 60             # seconds — raw BPMN XML (immutable between saves)
META_CACHE_TTL = 60             # seconds — aggregate metadata
AUTO_PASS_PRECHECK_TTL = 300    # seconds — precheck result

_KEY_PREFIX = "pm:cache:session"


def _session_key(session_id: str, segment: str) -> str:
    sid = str(session_id or "").strip() or "unknown"
    return f"{_KEY_PREFIX}:{sid}:{segment}:v1"


def _bpmn_xml_hash(xml: str) -> str:
    raw = str(xml or "").encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def get_projection(session_id: str) -> Optional[Dict[str, Any]]:
    return cache_get_json(_session_key(session_id, "projection"))


def set_projection(session_id: str, projection: Dict[str, Any], *, ttl_sec: int = SESSION_CACHE_TTL) -> bool:
    return cache_set_json(_session_key(session_id, "projection"), projection, ttl_sec=ttl_sec)


def get_bpmn_raw(session_id: str) -> Optional[str]:
    return cache_get_str(_session_key(session_id, "bpmn_raw"))


def set_bpmn_raw(session_id: str, xml: str, *, ttl_sec: int = BPMN_CACHE_TTL) -> bool:
    return cache_set_str(_session_key(session_id, "bpmn_raw"), xml, ttl_sec=ttl_sec)


def get_meta(session_id: str) -> Optional[Dict[str, Any]]:
    return cache_get_json(_session_key(session_id, "meta"))


def set_meta(session_id: str, meta: Dict[str, Any], *, ttl_sec: int = META_CACHE_TTL) -> bool:
    return cache_set_json(_session_key(session_id, "meta"), meta, ttl_sec=ttl_sec)


def get_auto_pass_precheck(session_id: str) -> Optional[Dict[str, Any]]:
    return cache_get_json(_session_key(session_id, "auto_pass_precheck"))


def set_auto_pass_precheck(session_id: str, result: Dict[str, Any], *, ttl_sec: int = AUTO_PASS_PRECHECK_TTL) -> bool:
    return cache_set_json(_session_key(session_id, "auto_pass_precheck"), result, ttl_sec=ttl_sec)


def invalidate_session(session_id: str) -> int:
    """Delete all cached segments for a session."""
    sid = str(session_id or "").strip()
    if not sid:
        return 0
    prefix = f"{_KEY_PREFIX}:{sid}:"
    try:
        return cache_delete_prefix(prefix)
    except Exception as exc:
        logger.warning("session_cache: invalidate failed for %s: %s", sid, exc)
        return 0


def build_projection(
    session_id: str,
    raw_row: Dict[str, Any],
    *,
    normalize_bpmn_meta: Any = None,
    extract_publish_git_mirror: Any = None,
    notes_decode: Any = None,
) -> Dict[str, Any]:
    """Build a lightweight session projection from a partial DB row.

    Excludes the raw BPMN XML payload (which is cached separately) but keeps
    everything else the frontend needs for the canvas shell.
    """
    sid = str(session_id or "").strip()
    row = raw_row if isinstance(raw_row, dict) else {}

    def _str(key: str, default: str = "") -> str:
        return str(row.get(key) or default).strip()

    def _int(key: str, default: int = 0) -> int:
        try:
            return int(row.get(key) or default)
        except Exception:
            return default

    def _json(key: str, default: Any = None) -> Any:
        value = row.get(key)
        if value is None:
            return default
        if isinstance(value, str):
            try:
                import json
                return json.loads(value)
            except Exception:
                return default
        return value

    interview = _json("interview_json", {})
    bpmn_meta_raw = _json("bpmn_meta_json", {})
    bpmn_meta = bpmn_meta_raw
    if callable(normalize_bpmn_meta):
        try:
            bpmn_meta = normalize_bpmn_meta(bpmn_meta_raw)
        except Exception as exc:
            logger.warning("session_cache: bpmn_meta normalization failed for %s: %s", sid, exc)

    notes_raw = _str("notes")
    notes = notes_raw
    if callable(notes_decode):
        try:
            notes = notes_decode(notes_raw)
        except Exception:
            notes = notes_raw

    publish_git_mirror = None
    if callable(extract_publish_git_mirror):
        try:
            publish_git_mirror = extract_publish_git_mirror(interview)
        except Exception:
            publish_git_mirror = None

    bpmn_xml_length = _int("bpmn_xml_length", 0)
    bpmn_xml = _str("bpmn_xml", "")
    has_bpmn_xml = bpmn_xml_length > 0 or len(bpmn_xml) > 0

    projection = {
        "id": sid,
        "title": _str("title"),
        "roles": _json("roles_json", []),
        "start_role": row.get("start_role"),
        "project_id": row.get("project_id"),
        "mode": row.get("mode"),
        "notes": notes,
        "notes_by_element": _json("notes_by_element_json", {}),
        "interview": interview,
        "nodes": _json("nodes_json", []),
        "edges": _json("edges_json", []),
        "questions": _json("questions_json", []),
        "mermaid": _str("mermaid"),
        "mermaid_simple": _str("mermaid_simple"),
        "mermaid_lanes": _str("mermaid_lanes"),
        "normalized": _json("normalized_json", {}),
        "resources": _json("resources_json", {}),
        "analytics": _json("analytics_json", {}),
        "ai_llm_state": _json("ai_llm_state_json", {}),
        "bpmn_xml": "",  # loaded separately via /bpmn
        "has_bpmn_xml": has_bpmn_xml,
        "bpmn_xml_hash": _bpmn_xml_hash(bpmn_xml) if has_bpmn_xml else "",
        "bpmn_xml_version": _int("bpmn_xml_version"),
        "diagram_state_version": _int("diagram_state_version"),
        "bpmn_graph_fingerprint": _str("bpmn_graph_fingerprint"),
        "bpmn_meta": bpmn_meta,
        "version": _int("version"),
        "owner_user_id": _str("owner_user_id"),
        "org_id": _str("org_id"),
        "created_by": _str("created_by"),
        "updated_by": _str("updated_by"),
        "created_at": _int("created_at"),
        "updated_at": _int("updated_at"),
        "navigation_stack": _json("navigation_stack") if "navigation_stack" in row else _json("navigation_stack_json", []),
        "parent_session_id": _str("parent_session_id"),
        "element_id_in_parent": _str("element_id_in_parent"),
    }
    if publish_git_mirror is not None:
        projection["publish_git_mirror"] = publish_git_mirror
    return projection
