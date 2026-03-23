from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, List, Tuple

from ..redis_client import get_client

logger = logging.getLogger(__name__)

_STREAM_TTL_SEC = 15 * 60
_STREAM_MAX_LEN = 1500
_MAX_OPS_PER_PUSH = 120
_MAX_OPS_PER_PULL = 240

_MEM_LOCK = threading.Lock()
_MEM_SEQ_BY_SESSION: Dict[str, int] = {}
_MEM_STREAM_BY_SESSION: Dict[str, Deque[Dict[str, Any]]] = {}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_int(value: Any, fallback: int = 0) -> int:
    try:
        num = int(value)
    except Exception:
        return int(fallback)
    return num


def _session_stream_key(session_id: str) -> str:
    sid = _as_text(session_id) or "unknown"
    return f"pm:rt:bpmn_ops:session:{sid}:stream:v1"


def _session_seq_key(session_id: str) -> str:
    sid = _as_text(session_id) or "unknown"
    return f"pm:rt:bpmn_ops:session:{sid}:seq:v1"


def _normalize_ops(raw_ops: Any, *, max_ops: int = _MAX_OPS_PER_PUSH) -> List[Dict[str, Any]]:
    items = raw_ops if isinstance(raw_ops, list) else []
    normalized: List[Dict[str, Any]] = []
    for raw in items[: max(1, int(max_ops))]:
        op = raw if isinstance(raw, dict) else {}
        kind = _as_text(op.get("kind")).lower()
        payload = op.get("payload")
        if not kind:
            continue
        if not isinstance(payload, dict):
            payload = {}
        normalized.append(
            {
                "kind": kind,
                "payload": payload,
                "client_ts": _as_int(op.get("client_ts") or op.get("ts") or 0, 0),
            }
        )
    return normalized


def _append_ops_memory(
    session_id: str,
    *,
    user_id: str,
    client_id: str,
    source: str,
    version_token: str,
    bpmn_version_token: str,
    collab_version_token: str,
    ops: List[Dict[str, Any]],
) -> Dict[str, Any]:
    sid = _as_text(session_id)
    now_ms = int(time.time() * 1000)
    if not sid:
        return {"ok": False, "error": "missing_session_id"}
    if not ops:
        return {
            "ok": True,
            "accepted": 0,
            "last_seq": int(_MEM_SEQ_BY_SESSION.get(sid, 0)),
            "degraded": True,
            "storage": "memory",
            "items": [],
        }
    with _MEM_LOCK:
        seq = int(_MEM_SEQ_BY_SESSION.get(sid, 0))
        stream = _MEM_STREAM_BY_SESSION.get(sid)
        if stream is None:
            stream = deque(maxlen=_STREAM_MAX_LEN)
            _MEM_STREAM_BY_SESSION[sid] = stream
        items: List[Dict[str, Any]] = []
        for op in ops:
            seq += 1
            item = {
                "seq": seq,
                "ts": now_ms,
                "session_id": sid,
                "user_id": user_id,
                "client_id": client_id,
                "source": source or "diagram",
                "version_token": version_token,
                "bpmn_version_token": bpmn_version_token,
                "collab_version_token": collab_version_token,
                "op": op,
            }
            stream.append(item)
            items.append(item)
        _MEM_SEQ_BY_SESSION[sid] = seq
    return {
        "ok": True,
        "accepted": len(items),
        "last_seq": seq,
        "degraded": True,
        "storage": "memory",
        "items": items,
    }


def append_session_realtime_ops(
    session_id: Any,
    *,
    user_id: Any,
    client_id: Any,
    source: Any = "diagram",
    version_token: Any = "",
    bpmn_version_token: Any = "",
    collab_version_token: Any = "",
    ops: Any = None,
) -> Dict[str, Any]:
    sid = _as_text(session_id)
    uid = _as_text(user_id)
    cid = _as_text(client_id)
    src = _as_text(source) or "diagram"
    token = _as_text(version_token)
    bpmn_token = _as_text(bpmn_version_token)
    collab_token = _as_text(collab_version_token)
    normalized_ops = _normalize_ops(ops)
    if not sid:
        return {"ok": False, "error": "missing_session_id"}
    if not cid:
        return {"ok": False, "error": "missing_client_id"}

    conn = get_client()
    if conn is None:
        return _append_ops_memory(
            sid,
            user_id=uid,
            client_id=cid,
            source=src,
            version_token=token,
            bpmn_version_token=bpmn_token,
            collab_version_token=collab_token,
            ops=normalized_ops,
        )

    if not normalized_ops:
        try:
            current_seq = _as_int(conn.get(_session_seq_key(sid)), 0)
        except Exception:
            current_seq = 0
        return {
            "ok": True,
            "accepted": 0,
            "last_seq": current_seq,
            "degraded": False,
            "storage": "redis",
            "items": [],
        }

    stream_key = _session_stream_key(sid)
    seq_key = _session_seq_key(sid)
    now_ms = int(time.time() * 1000)
    items: List[Dict[str, Any]] = []
    try:
        for op in normalized_ops:
            seq = _as_int(conn.incr(seq_key), 0)
            item = {
                "seq": seq,
                "ts": now_ms,
                "session_id": sid,
                "user_id": uid,
                "client_id": cid,
                "source": src,
                "version_token": token,
                "bpmn_version_token": bpmn_token,
                "collab_version_token": collab_token,
                "op": op,
            }
            conn.rpush(stream_key, json.dumps(item, ensure_ascii=False, separators=(",", ":"), default=str))
            items.append(item)
        conn.ltrim(stream_key, -int(_STREAM_MAX_LEN), -1)
        conn.expire(stream_key, int(_STREAM_TTL_SEC))
        conn.expire(seq_key, int(_STREAM_TTL_SEC))
        last_seq = int(items[-1]["seq"]) if items else _as_int(conn.get(seq_key), 0)
        return {
            "ok": True,
            "accepted": len(items),
            "last_seq": last_seq,
            "degraded": False,
            "storage": "redis",
            "items": items,
        }
    except Exception as exc:
        logger.warning("realtime_bpmn_ops_stream: append redis failed sid=%s: %s", sid, exc)
        return _append_ops_memory(
            sid,
            user_id=uid,
            client_id=cid,
            source=src,
            version_token=token,
            bpmn_version_token=bpmn_token,
            collab_version_token=collab_token,
            ops=normalized_ops,
        )


def _read_ops_memory(session_id: str, *, after_seq: int, limit: int) -> Dict[str, Any]:
    sid = _as_text(session_id)
    if not sid:
        return {"ok": False, "error": "missing_session_id"}
    with _MEM_LOCK:
        stream = list(_MEM_STREAM_BY_SESSION.get(sid) or [])
        last_seq = int(_MEM_SEQ_BY_SESSION.get(sid, 0))
    rows = [row for row in stream if _as_int(row.get("seq"), 0) > int(after_seq)]
    rows.sort(key=lambda row: _as_int(row.get("seq"), 0))
    rows = rows[: max(1, int(limit))]
    return {
        "ok": True,
        "items": rows,
        "last_seq": last_seq,
        "degraded": True,
        "storage": "memory",
    }


def read_session_realtime_ops(session_id: Any, *, after_seq: Any = 0, limit: Any = _MAX_OPS_PER_PULL) -> Dict[str, Any]:
    sid = _as_text(session_id)
    after = max(0, _as_int(after_seq, 0))
    take = max(1, min(int(_MAX_OPS_PER_PULL), _as_int(limit, _MAX_OPS_PER_PULL)))
    if not sid:
        return {"ok": False, "error": "missing_session_id"}

    conn = get_client()
    if conn is None:
        return _read_ops_memory(sid, after_seq=after, limit=take)

    stream_key = _session_stream_key(sid)
    seq_key = _session_seq_key(sid)
    try:
        raw_rows = conn.lrange(stream_key, 0, -1) or []
        rows: List[Dict[str, Any]] = []
        for raw in raw_rows:
            try:
                item = json.loads(str(raw or "{}"))
            except Exception:
                continue
            if not isinstance(item, dict):
                continue
            rows.append(item)
        rows.sort(key=lambda row: _as_int(row.get("seq"), 0))
        filtered = [row for row in rows if _as_int(row.get("seq"), 0) > after][:take]
        last_seq = _as_int(conn.get(seq_key), 0)
        if not last_seq and rows:
            last_seq = _as_int(rows[-1].get("seq"), 0)
        return {
            "ok": True,
            "items": filtered,
            "last_seq": int(last_seq),
            "degraded": False,
            "storage": "redis",
        }
    except Exception as exc:
        logger.warning("realtime_bpmn_ops_stream: read redis failed sid=%s: %s", sid, exc)
        return _read_ops_memory(sid, after_seq=after, limit=take)


def get_session_realtime_ops_seq(session_id: Any) -> int:
    sid = _as_text(session_id)
    if not sid:
        return 0
    conn = get_client()
    if conn is None:
        with _MEM_LOCK:
            return int(_MEM_SEQ_BY_SESSION.get(sid, 0))
    try:
        value = conn.get(_session_seq_key(sid))
        return max(0, _as_int(value, 0))
    except Exception:
        with _MEM_LOCK:
            return int(_MEM_SEQ_BY_SESSION.get(sid, 0))

