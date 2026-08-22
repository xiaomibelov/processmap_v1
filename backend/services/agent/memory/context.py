"""Agent context loader — сервисная версия backend/app/agent/context.py.

Сессия НЕ грузится через session_repo (это монолит): доступ к сессии уже
проверен в services/auth_service (read-only SQL по sessions), а проекция
схемы запрашивается у монолита по HTTP (runners.monolith_client.get_projection
с пробросом JWT пользователя).
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from runners import monolith_client

from .memory_store import AgentTurn, list_turns

logger = logging.getLogger(__name__)

PROJECTION_SCHEMA_VERSION = 1


def _projection_digest(projection: Dict[str, Any]) -> str:
    payload = {
        "steps": projection.get("steps") or [],
        "edges": projection.get("edges") or [],
        "schema": int((projection.get("meta") or {}).get("schema") or PROJECTION_SCHEMA_VERSION),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


@dataclass
class AgentContext:
    session: Any
    projection: dict
    digest: str
    history: List[AgentTurn]


def _as_dict(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def _rag_chunks_to_steps(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Синтезировать projection.steps из проиндексированных BPMN-чанков."""
    by_id: Dict[str, Dict[str, Any]] = {}
    for chunk in chunks:
        meta = _as_dict(chunk.get("metadata"))
        eid = str(meta.get("element_id") or "").strip()
        if not eid:
            continue
        if eid not in by_id:
            by_id[eid] = {
                "id": eid,
                "type": str(meta.get("element_tag") or "step"),
                "name_ru": str(meta.get("element_name") or "").strip(),
                "duration": None,
                "role": "",
            }
    return list(by_id.values())


def _enrich_projection_from_rag(
    projection: Dict[str, Any],
    digest: str,
    session_id: str,
    org_id: str,
    token: str,
) -> tuple[Dict[str, Any], str]:
    """Fallback: если проекция пуста или устарела относительно RAG — добить из RAG."""
    sid = str(session_id or "").strip()
    steps = list(projection.get("steps") or [])

    try:
        # Ненулевой query требуется монолитным /api/rag/search.
        rag = monolith_client.search_rag(
            "bpmn",
            sid,
            token,
            org_id=org_id,
            source_type="bpmn_xml",
            top_k=3,
            min_score=0.0,
        )
        chunks = list(_as_dict(rag).get("results") or [])
    except Exception as exc:
        logger.warning("load_context: RAG fallback search failed for %s: %s", sid, exc)
        return projection, digest

    if not chunks:
        return projection, digest

    # Проверяем, совпадает ли digest проекции с проиндексированным.
    first_meta = _as_dict(chunks[0].get("metadata"))
    indexed_digest = str(first_meta.get("projection_digest") or "").strip()
    digest_mismatch = bool(indexed_digest and indexed_digest != digest)

    if not steps or digest_mismatch:
        # Подмена/добавление steps из чанков, чтобы AGENT-3 видел реальные узлы.
        fallback_steps = _rag_chunks_to_steps(chunks)
        if fallback_steps:
            if not steps:
                projection["steps"] = fallback_steps
            else:
                # Обогащаем существующую проекцию дополнительным контекстом.
                existing_ids = {s.get("id") for s in steps}
                for fs in fallback_steps:
                    if fs["id"] not in existing_ids:
                        steps.append(fs)
                projection["steps"] = steps
            projection["rag_context_chunks"] = [
                {
                    "element_id": _as_dict(c.get("metadata")).get("element_id"),
                    "element_name": _as_dict(c.get("metadata")).get("element_name"),
                    "chunk_text": c.get("chunk_text") or c.get("chunk") or "",
                }
                for c in chunks
            ]
            # Пересчитываем digest, т.к. steps изменились.
            digest = _projection_digest(projection)

    return projection, digest


def load_context(
    session_id: str,
    user_id: str,
    org_id: str,
    *,
    token: str = "",
    session_row: Optional[Dict[str, Any]] = None,
    history_limit: int = 50,
) -> AgentContext:
    """Load projection (HTTP к монолиту) + durable history (0 LLM calls).

    AGENT-2: если проекция пуста или устарела относительно RAG — добиваем
    контекст из проиндексированных чанков bpmn_xml этой же сессии.
    """
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"

    proj = monolith_client.get_projection(sid, token=token, org_id=oid)
    projection = dict(proj.get("projection") or {})
    digest = str(proj.get("projection_digest") or "")

    # Fallback на RAG только если в проекции нет шагов или digest не совпал.
    steps = list(projection.get("steps") or [])
    if not steps:
        projection, digest = _enrich_projection_from_rag(
            projection, digest, sid, oid, token
        )

    history = list_turns(sid, uid, oid, limit=history_limit)

    row = dict(session_row or {})
    session = SimpleNamespace(
        id=sid,
        org_id=oid,
        project_id=str(row.get("project_id") or ""),
        diagram_state_version=int(row.get("diagram_state_version") or 0),
    )

    return AgentContext(session=session, projection=projection, digest=digest, history=history)
