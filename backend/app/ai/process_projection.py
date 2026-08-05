"""LLM1 — сериализатор проекции процесса сессии для LLM-анализа.

Компактный JSON-слепок процесса (НЕ сырой BPMN-XML — экономия №1 PLAN.md):
{
  "steps": [{"id", "type", "name_ru", "duration", "role", "operation_code?"}],
  "edges": [{"from", "to"}],
  "meta": {"session_id", "rev", "nodes_count", "schema"}
}

digest (md5) считается ТОЛЬКО по steps/edges/schema — session_id и rev в meta
не участвуют, чтобы повторный анализ неизменной схемы попадал в кэш
(критерий LLM1: «неизменная схема = 0 токенов») даже при бампе версии сессии
недиаграмменными правками.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

from ..models import Session

PROJECTION_SCHEMA_VERSION = 1


def build_process_projection(session: Session) -> Dict[str, Any]:
    """Слепок процесса из Session.nodes/edges (ui_model, без bpmn_xml)."""
    steps = []
    for node in (getattr(session, "nodes", None) or []):
        params = getattr(node, "parameters", None) or {}
        step: Dict[str, Any] = {
            "id": str(getattr(node, "id", "") or ""),
            "type": str(getattr(node, "type", "") or "step"),
            "name_ru": str(getattr(node, "title", "") or ""),
            "duration": getattr(node, "duration_min", None),
            "role": str(getattr(node, "actor_role", None) or ""),
        }
        op_code = str(params.get("operation_code") or "").strip()
        if op_code:
            step["operation_code"] = op_code
        steps.append(step)
    edges = [
        {"from": str(getattr(e, "from_id", "") or ""), "to": str(getattr(e, "to_id", "") or "")}
        for e in (getattr(session, "edges", None) or [])
    ]
    return {
        "steps": steps,
        "edges": edges,
        "meta": {
            "session_id": str(getattr(session, "id", "") or ""),
            "rev": int(getattr(session, "version", 0) or 0),
            "nodes_count": len(steps),
            "schema": PROJECTION_SCHEMA_VERSION,
        },
    }


def _canonical(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def projection_digest(projection: Dict[str, Any]) -> str:
    """Стабильный md5 каноничного JSON по steps/edges/schema (без meta идентификаторов)."""
    payload = {
        "steps": projection.get("steps") or [],
        "edges": projection.get("edges") or [],
        "schema": int((projection.get("meta") or {}).get("schema") or PROJECTION_SCHEMA_VERSION),
    }
    return hashlib.md5(_canonical(payload).encode("utf-8")).hexdigest()


def projection_size_bytes(projection: Dict[str, Any]) -> int:
    """Размер проекции в байтах (критерий экономии №1: ≤ 4KB на эталонной схеме)."""
    return len(json.dumps(projection, ensure_ascii=False).encode("utf-8"))
