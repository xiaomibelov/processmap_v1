"""Долгосрочная память схемы для PROCESSMAN (AGENT-1).

CRUD agent_schema_memory + фоновый worker через Redis queue
(не Celery — решение владельца). Сервис не импортирует backend.app.*.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from db import adapt_sql, get_conn
from gateway import gateway
from gateway.redis_cache import get_client as get_redis_client
from runners import monolith_client

from .memory_store import list_turns

logger = logging.getLogger("agent.schema_memory")

QUEUE_KEY = "pm:agent:memory:queue"
FEATURE = "agent_memory"
MAX_TURNS = 10


def _now_ts() -> int:
    return int(time.time())


def _new_id() -> str:
    return f"asm_{uuid.uuid4().hex}"


def _json_loads(value: Any, fallback: Any) -> Any:
    raw = str(value or "")
    if not raw:
        return fallback
    try:
        parsed = json.loads(raw)
        return parsed if parsed is not None else fallback
    except Exception:
        return fallback


def load_schema_memory(session_id: str, org_id: str) -> Optional[Dict[str, Any]]:
    """Load schema memory row for (org_id, session_id) or None."""
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    with get_conn() as con:
        row = con.execute(
            adapt_sql(
                "SELECT * FROM agent_schema_memory WHERE org_id = ? AND session_id = ? LIMIT 1"
            ),
            [oid, sid],
        ).fetchone()
    if not row:
        return None
    row_d = dict(row)
    return {
        "id": str(row_d.get("id") or ""),
        "org_id": str(row_d.get("org_id") or ""),
        "session_id": str(row_d.get("session_id") or ""),
        "summary": str(row_d.get("summary") or ""),
        "facts": _json_loads(row_d.get("facts_json"), []),
        "decisions": _json_loads(row_d.get("decisions_json"), []),
        "projection_digest": str(row_d.get("projection_digest") or ""),
        "created_at": int(row_d.get("created_at") or 0),
        "updated_at": int(row_d.get("updated_at") or 0),
    }


def save_schema_memory(
    session_id: str,
    org_id: str,
    summary: str,
    facts_json: Any,
    decisions_json: Any,
    projection_digest: str,
    now_ms: Optional[int] = None,
) -> None:
    """Upsert schema memory for (org_id, session_id)."""
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    now = now_ms if now_ms is not None else _now_ts()
    summary_text = str(summary or "").strip()
    facts = facts_json if isinstance(facts_json, (list, dict)) else []
    decisions = decisions_json if isinstance(decisions_json, (list, dict)) else []
    digest = str(projection_digest or "").strip()

    with get_conn() as con:
        existing = con.execute(
            adapt_sql(
                "SELECT id FROM agent_schema_memory WHERE org_id = ? AND session_id = ? LIMIT 1"
            ),
            [oid, sid],
        ).fetchone()
        if existing:
            con.execute(
                adapt_sql(
                    """
                    UPDATE agent_schema_memory
                    SET summary = ?, facts_json = ?, decisions_json = ?,
                        projection_digest = ?, updated_at = ?
                    WHERE org_id = ? AND session_id = ?
                    """
                ),
                [
                    summary_text,
                    json.dumps(facts, ensure_ascii=False),
                    json.dumps(decisions, ensure_ascii=False),
                    digest,
                    now,
                    oid,
                    sid,
                ],
            )
        else:
            con.execute(
                adapt_sql(
                    """
                    INSERT INTO agent_schema_memory
                        (id, org_id, session_id, summary, facts_json, decisions_json,
                         projection_digest, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
                ),
                [
                    _new_id(),
                    oid,
                    sid,
                    summary_text,
                    json.dumps(facts, ensure_ascii=False),
                    json.dumps(decisions, ensure_ascii=False),
                    digest,
                    now,
                    now,
                ],
            )


def schedule_memory_update(
    session_id: str,
    org_id: str,
    projection_digest: str,
    projection: Optional[Dict[str, Any]] = None,
) -> None:
    """Enqueue background memory update job (LPUSH)."""
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    digest = str(projection_digest or "").strip()
    if not sid or not digest:
        return
    redis = get_redis_client()
    if redis is None:
        logger.warning("schedule_memory_update: redis unavailable, skipping")
        return
    payload: Dict[str, Any] = {
        "session_id": sid,
        "org_id": oid,
        "projection_digest": digest,
        "ts": _now_ts(),
    }
    if projection is not None:
        payload["projection_json"] = json.dumps(projection, ensure_ascii=False, default=str)
    try:
        redis.lpush(QUEUE_KEY, json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        logger.warning("schedule_memory_update: redis LPUSH failed: %s", exc)


def _build_memory_prompt(session_id: str, projection: Dict[str, Any], turns: List[Any]) -> str:
    projection_text = json.dumps(projection or {}, ensure_ascii=False)
    turn_lines: List[str] = []
    for turn in turns[-MAX_TURNS:]:
        content = turn.content if hasattr(turn, "content") else (turn.get("content") or {})
        text = str((content or {}).get("text") or "").strip()
        if text:
            prefix = "User" if (turn.role if hasattr(turn, "role") else turn.get("role")) == "user" else "Assistant"
            turn_lines.append(f"{prefix}: {text}")
    history_text = "\n".join(turn_lines)
    parts = ["=== BPMN-схема ===", projection_text]
    if history_text:
        parts.append("=== История диалога ===")
        parts.append(history_text)
    parts.append("Сохрани summary, facts и decisions в запрошенном JSON.")
    return "\n\n".join(parts)


def _extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    import re

    raw = str(text or "").strip()
    if not raw:
        return None
    block_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    candidate = block_match.group(1).strip() if block_match else raw
    obj_match = re.search(r"\{[\s\S]*\}", candidate)
    if obj_match:
        candidate = obj_match.group(0).strip()
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def update_schema_memory(
    session_id: str,
    org_id: str,
    projection_digest: str,
    token: str = "",
    projection: Optional[Dict[str, Any]] = None,
) -> bool:
    """Run background LLM call to update schema memory. Guard'ies return False."""
    sid = str(session_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"
    digest = str(projection_digest or "").strip()
    if not sid or not digest:
        return False

    if projection is None:
        try:
            proj = monolith_client.get_projection(sid, token=token)
            projection = dict(proj.get("projection") or {})
        except Exception as exc:
            logger.warning("update_schema_memory: projection failed: %s", exc)
            return False
    else:
        projection = dict(projection or {})

    steps = projection.get("steps") or []
    if not steps:
        logger.debug("update_schema_memory: empty projection, skipping")
        return False

    turns = list_turns(sid, "", oid, limit=MAX_TURNS)

    user_prompt = _build_memory_prompt(sid, projection, turns)
    result = gateway.complete(
        FEATURE,
        payload={"input": user_prompt},
        org_id=oid,
        session_id=sid,
        max_tokens=800,
    )
    if not result.get("ok"):
        logger.warning("update_schema_memory: LLM failed status=%s", result.get("status"))
        return False

    obj = _extract_json_block(str(result.get("text") or ""))
    if obj is None:
        logger.warning("update_schema_memory: JSON not found in response")
        return False

    summary = str(obj.get("summary") or "").strip()
    facts = obj.get("facts") if isinstance(obj.get("facts"), list) else []
    decisions = obj.get("decisions") if isinstance(obj.get("decisions"), list) else []
    if not summary and not facts and not decisions:
        logger.debug("update_schema_memory: empty result, skipping")
        return False

    save_schema_memory(sid, oid, summary, facts, decisions, digest)
    return True


def run_memory_worker_once(
    *,
    token: str = "",
    timeout_sec: float = 5.0,
    stop_event: Optional[Any] = None,
) -> bool:
    """Process one job from the queue. Returns True if a job was processed."""
    redis = get_redis_client()
    if redis is None:
        if stop_event is not None and stop_event.is_set():
            return False
        time.sleep(min(timeout_sec, 1.0))
        return False
    try:
        item = redis.brpop(QUEUE_KEY, timeout=int(timeout_sec))
    except Exception as exc:
        logger.warning("run_memory_worker_once: BRPOP failed: %s", exc)
        return False
    if not item:
        return False
    try:
        payload = json.loads(item[1] if isinstance(item, (list, tuple)) else item)
    except Exception as exc:
        logger.warning("run_memory_worker_once: invalid payload: %s", exc)
        return False
    try:
        proj_json = payload.get("projection_json")
        projection = json.loads(proj_json) if isinstance(proj_json, str) and proj_json else None
        update_schema_memory(
            payload.get("session_id", ""),
            payload.get("org_id", ""),
            payload.get("projection_digest", ""),
            token=token,
            projection=projection,
        )
    except Exception as exc:
        logger.warning("run_memory_worker_once: update failed: %s", exc)
    return True
