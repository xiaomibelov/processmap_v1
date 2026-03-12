from __future__ import annotations

import hashlib
import json
import logging
import threading
from typing import Any, Dict, Optional

from .redis_client import get_client

logger = logging.getLogger(__name__)

_STATS_LOCK = threading.Lock()
_CACHE_STATS: Dict[str, int] = {
    "hit": 0,
    "miss": 0,
    "set": 0,
    "delete": 0,
    "error": 0,
    "skip_no_client": 0,
}


def cache_stats_reset() -> None:
    with _STATS_LOCK:
        for key in list(_CACHE_STATS.keys()):
            _CACHE_STATS[key] = 0


def cache_stats_snapshot() -> Dict[str, int]:
    with _STATS_LOCK:
        return {key: int(value or 0) for key, value in _CACHE_STATS.items()}


def _stat_inc(name: str, delta: int = 1) -> None:
    key = str(name or "").strip() or "error"
    with _STATS_LOCK:
        _CACHE_STATS[key] = int(_CACHE_STATS.get(key, 0) or 0) + int(delta or 0)


def _stable_json_hash(payload: Dict[str, Any]) -> str:
    source = payload if isinstance(payload, dict) else {}
    raw = json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def workspace_filters_hash(filters_payload: Dict[str, Any]) -> str:
    return _stable_json_hash(filters_payload)[:24]


def workspace_cache_key(org_id: str, filters_hash: str) -> str:
    oid = str(org_id or "").strip() or "default"
    h = str(filters_hash or "").strip() or "all"
    return f"pm:cache:workspace:org:{oid}:v1:{h}"


def tldr_cache_key(session_id: str) -> str:
    sid = str(session_id or "").strip() or "unknown"
    return f"pm:cache:tldr:session:{sid}:v1"


_SESSION_OPEN_TTL = 72 * 60 * 60


def session_open_cache_ttl_sec() -> int:
    return int(_SESSION_OPEN_TTL)


def session_open_version_token(session_obj: Any) -> str:
    version = int(getattr(session_obj, "version", 0) or 0)
    bpmn_xml_version = int(getattr(session_obj, "bpmn_xml_version", 0) or 0)
    updated_at = int(getattr(session_obj, "updated_at", 0) or 0)
    return f"{version}.{bpmn_xml_version}.{updated_at}"


def session_open_cache_key(session_id: str, version_token: str) -> str:
    sid = str(session_id or "").strip() or "unknown"
    token = str(version_token or "").strip() or "0.0.0"
    return f"pm:cache:session_open:session:{sid}:v:{token}"


def invalidate_session_open(session_id: str, *, client: Any = None) -> int:
    sid = str(session_id or "").strip()
    if not sid:
        return 0
    prefix = f"pm:cache:session_open:session:{sid}:v:"
    return cache_delete_prefix(prefix, client=client)


def _resolve_client(client: Any = None):
    conn = client if client is not None else get_client()
    if conn is None:
        _stat_inc("skip_no_client")
    return conn


def cache_get_json(key: str, *, client: Any = None) -> Optional[Any]:
    cache_key = str(key or "").strip()
    if not cache_key:
        _stat_inc("miss")
        return None
    conn = _resolve_client(client=client)
    if conn is None:
        return None
    try:
        raw = conn.get(cache_key)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: get failed key=%s: %s", cache_key, exc)
        return None
    if raw is None:
        _stat_inc("miss")
        return None
    try:
        payload = json.loads(str(raw or "null"))
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: json decode failed key=%s: %s", cache_key, exc)
        return None
    _stat_inc("hit")
    return payload


def cache_set_json(key: str, value: Any, *, ttl_sec: int, client: Any = None) -> bool:
    cache_key = str(key or "").strip()
    if not cache_key:
        return False
    conn = _resolve_client(client=client)
    if conn is None:
        return False
    ttl = max(1, int(ttl_sec or 1))
    try:
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: json encode failed key=%s: %s", cache_key, exc)
        return False
    try:
        if hasattr(conn, "setex"):
            ok = conn.setex(cache_key, ttl, raw)
        else:
            ok = conn.set(cache_key, raw, ex=ttl)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: set failed key=%s: %s", cache_key, exc)
        return False
    if ok:
        _stat_inc("set")
    return bool(ok)


def cache_delete_key(key: str, *, client: Any = None) -> int:
    cache_key = str(key or "").strip()
    if not cache_key:
        return 0
    conn = _resolve_client(client=client)
    if conn is None:
        return 0
    try:
        deleted = int(conn.delete(cache_key) or 0)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: delete key failed key=%s: %s", cache_key, exc)
        return 0
    if deleted > 0:
        _stat_inc("delete", deleted)
    return deleted


def cache_delete_prefix(prefix: str, *, client: Any = None) -> int:
    key_prefix = str(prefix or "").strip()
    if not key_prefix:
        return 0
    conn = _resolve_client(client=client)
    if conn is None:
        return 0
    match_expr = f"{key_prefix}*"
    keys: list[str] = []
    try:
        for item in conn.scan_iter(match=match_expr, count=500):
            key = str(item or "").strip()
            if key:
                keys.append(key)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: scan failed prefix=%s: %s", key_prefix, exc)
        return 0
    if not keys:
        return 0
    deleted = 0
    for key in keys:
        deleted += cache_delete_key(key, client=conn)
    return int(deleted)


def invalidate_workspace_org(org_id: str, *, client: Any = None) -> int:
    oid = str(org_id or "").strip() or "default"
    prefix = f"pm:cache:workspace:org:{oid}:v1:"
    return cache_delete_prefix(prefix, client=client)


def invalidate_tldr_session(session_id: str, *, client: Any = None) -> int:
    return cache_delete_key(tldr_cache_key(session_id), client=client)


# ─── Explorer cache helpers ───────────────────────────────────────────────────
# Key scheme:  pm:cache:explorer:<segment>:<qualifiers>:v1
#
# Segment       Key pattern
# ----------    -------------------------------------------------------
# memberships   pm:cache:explorer:memberships:user:{uid}:v1
# children      pm:cache:explorer:children:org:{oid}:workspace:{wid}:folder:{fid}:v1
# breadcrumb    pm:cache:explorer:breadcrumb:org:{oid}:workspace:{wid}:folder:{fid}:v1
# sessions      pm:cache:explorer:sessions:project:{pid}:v1

_EX_TTL_MEMBERSHIPS = 60          # seconds  (workspace list)
_EX_TTL_CHILDREN    = 30          # seconds  (folder/root children)
_EX_TTL_BREADCRUMB  = 120         # seconds  (folder path)
_EX_TTL_SESSIONS    = 30          # seconds  (project sessions)


def _ex_memberships_key(user_id: str) -> str:
    uid = str(user_id or "").strip() or "anon"
    return f"pm:cache:explorer:memberships:user:{uid}:v1"


def _ex_children_key(org_id: str, workspace_id: str, folder_id: str) -> str:
    oid = str(org_id or "").strip() or "default"
    wid = str(workspace_id or "").strip() or "default"
    fid = str(folder_id or "").strip() or "root"
    return f"pm:cache:explorer:children:org:{oid}:workspace:{wid}:folder:{fid}:v1"


def _ex_breadcrumb_key(org_id: str, workspace_id: str, folder_id: str) -> str:
    oid = str(org_id or "").strip() or "default"
    wid = str(workspace_id or "").strip() or "default"
    fid = str(folder_id or "").strip() or "root"
    return f"pm:cache:explorer:breadcrumb:org:{oid}:workspace:{wid}:folder:{fid}:v1"


def _ex_sessions_key(project_id: str) -> str:
    pid = str(project_id or "").strip() or "unknown"
    return f"pm:cache:explorer:sessions:project:{pid}:v1"


# ── get/set ────────────────────────────────────────────────────────────────────

def explorer_get_memberships(user_id: str, *, client: Any = None) -> Optional[Any]:
    return cache_get_json(_ex_memberships_key(user_id), client=client)


def explorer_set_memberships(user_id: str, value: Any, *, client: Any = None) -> bool:
    return cache_set_json(_ex_memberships_key(user_id), value,
                          ttl_sec=_EX_TTL_MEMBERSHIPS, client=client)


def explorer_get_children(org_id: str, workspace_id: str, folder_id: str, *, client: Any = None) -> Optional[Any]:
    return cache_get_json(_ex_children_key(org_id, workspace_id, folder_id), client=client)


def explorer_set_children(org_id: str, workspace_id: str, folder_id: str, value: Any, *, client: Any = None) -> bool:
    return cache_set_json(_ex_children_key(org_id, workspace_id, folder_id), value,
                          ttl_sec=_EX_TTL_CHILDREN, client=client)


def explorer_get_breadcrumb(org_id: str, workspace_id: str, folder_id: str, *, client: Any = None) -> Optional[Any]:
    return cache_get_json(_ex_breadcrumb_key(org_id, workspace_id, folder_id), client=client)


def _ex_breadcrumb_registry_key(org_id: str, workspace_id: str) -> str:
    oid = str(org_id or "").strip() or "default"
    wid = str(workspace_id or "").strip() or "default"
    return f"pm:cache:explorer:breadcrumb-registry:org:{oid}:workspace:{wid}:v1"


def explorer_set_breadcrumb(org_id: str, workspace_id: str, folder_id: str, value: Any, *, client: Any = None) -> bool:
    fid = str(folder_id or "").strip()
    ok = cache_set_json(_ex_breadcrumb_key(org_id, workspace_id, fid), value,
                        ttl_sec=_EX_TTL_BREADCRUMB, client=client)
    if ok and fid:
        # Register this folder_id in the per-org breadcrumb Set so we can
        # invalidate without a scan.
        conn = _resolve_client(client=client)
        if conn is not None:
            try:
                rkey = _ex_breadcrumb_registry_key(org_id, workspace_id)
                conn.sadd(rkey, fid)
                conn.expire(rkey, _EX_TTL_BREADCRUMB * 4)  # registry outlives entries
            except Exception as exc:
                logger.warning("redis_cache: breadcrumb registry sadd failed: %s", exc)
    return ok


def explorer_get_sessions(project_id: str, *, client: Any = None) -> Optional[Any]:
    return cache_get_json(_ex_sessions_key(project_id), client=client)


def explorer_set_sessions(project_id: str, value: Any, *, client: Any = None) -> bool:
    return cache_set_json(_ex_sessions_key(project_id), value,
                          ttl_sec=_EX_TTL_SESSIONS, client=client)


# ── targeted invalidation ──────────────────────────────────────────────────────

def explorer_invalidate_memberships(user_id: str, *, client: Any = None) -> int:
    """Invalidate workspace list for one user (org join/leave)."""
    return cache_delete_key(_ex_memberships_key(user_id), client=client)


def explorer_invalidate_children(org_id: str, workspace_id: str, folder_id: str, *, client: Any = None) -> int:
    """Invalidate explorer list for one folder (or root when folder_id='')."""
    return cache_delete_key(_ex_children_key(org_id, workspace_id, folder_id), client=client)


def explorer_invalidate_breadcrumb(org_id: str, workspace_id: str, folder_id: str, *, client: Any = None) -> int:
    """Invalidate breadcrumb for a specific folder."""
    return cache_delete_key(_ex_breadcrumb_key(org_id, workspace_id, folder_id), client=client)


def explorer_invalidate_all_breadcrumbs_for_workspace(org_id: str, workspace_id: str, *, client: Any = None) -> int:
    """Invalidate all cached breadcrumbs for one workspace using a Set-based registry.
    O(n_tracked_folders) — no key scan required.
    Falls back to prefix scan only when registry key itself is missing.
    """
    oid = str(org_id or "").strip() or "default"
    wid = str(workspace_id or "").strip() or "default"
    conn = _resolve_client(client=client)
    if conn is None:
        return 0

    rkey = _ex_breadcrumb_registry_key(org_id, workspace_id)
    deleted = 0
    try:
        folder_ids = conn.smembers(rkey)
    except Exception as exc:
        logger.warning("redis_cache: breadcrumb registry smembers failed: %s", exc)
        # Graceful fallback to prefix scan
        prefix = f"pm:cache:explorer:breadcrumb:org:{oid}:workspace:{wid}:"
        return cache_delete_prefix(prefix, client=conn)

    if folder_ids:
        keys_to_delete = [
            _ex_breadcrumb_key(oid, wid, fid.decode() if isinstance(fid, bytes) else str(fid))
            for fid in folder_ids
        ]
        for key in keys_to_delete:
            deleted += cache_delete_key(key, client=conn)

    # Delete the registry itself
    try:
        conn.delete(rkey)
    except Exception as exc:
        logger.warning("redis_cache: breadcrumb registry delete failed: %s", exc)

    logger.debug("explorer invalidate breadcrumbs org=%s workspace=%s keys=%d deleted=%d",
                 oid, wid, len(folder_ids) if folder_ids else 0, deleted)
    return deleted


def explorer_invalidate_sessions(project_id: str, *, client: Any = None) -> int:
    """Invalidate session list for a project."""
    return cache_delete_key(_ex_sessions_key(project_id), client=client)


def explorer_invalidate_org_children(org_id: str, workspace_id: str, *, client: Any = None) -> int:
    """Invalidate ALL children entries for one workspace (nuclear option for moves)."""
    oid = str(org_id or "").strip() or "default"
    wid = str(workspace_id or "").strip() or "default"
    prefix = f"pm:cache:explorer:children:org:{oid}:workspace:{wid}:"
    return cache_delete_prefix(prefix, client=client)
