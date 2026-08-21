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
import xml.etree.ElementTree as ET
from typing import Any, Dict, List

from ..models import Session

PROJECTION_SCHEMA_VERSION = 1

# BPMN-элементы, которые образуют шаги проекции.
_FLOW_NODE_TAGS = {
    "task",
    "userTask",
    "serviceTask",
    "manualTask",
    "sendTask",
    "receiveTask",
    "scriptTask",
    "businessRuleTask",
    "callActivity",
    "subProcess",
    "startEvent",
    "endEvent",
    "intermediateCatchEvent",
    "intermediateThrowEvent",
    "boundaryEvent",
    "exclusiveGateway",
    "inclusiveGateway",
    "parallelGateway",
    "eventBasedGateway",
    "complexGateway",
}


def _local_name(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[-1]
    return tag


def _build_projection_from_bpmn_xml(xml: str) -> Dict[str, Any]:
    """Слепок процесса напрямую из BPMN-XML.

    Используется, когда у сессии пустые nodes/edges, но есть bpmn_xml.
    Лёгкий парсер без валидации — только id/name/type и sequenceFlow.
    """
    steps: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    node_ids: set = set()

    raw = str(xml or "").strip()
    if not raw:
        return {"steps": steps, "edges": edges, "meta": _projection_meta("", 0)}

    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return {"steps": steps, "edges": edges, "meta": _projection_meta("", 0)}

    for el in root.iter():
        local = _local_name(str(el.tag))
        if local in _FLOW_NODE_TAGS:
            element_id = str(el.get("id") or "").strip()
            if not element_id:
                continue
            node_ids.add(element_id)
            step: Dict[str, Any] = {
                "id": element_id,
                "type": local,
                "name_ru": str(el.get("name") or "").strip(),
                "duration": None,
                "role": "",
            }
            steps.append(step)
        elif local == "sequenceFlow":
            source = str(el.get("sourceRef") or "").strip()
            target = str(el.get("targetRef") or "").strip()
            if source and target:
                edges.append({"from": source, "to": target})

    # Оставляем только рёбра между известными узлами.
    edges = [e for e in edges if e["from"] in node_ids and e["to"] in node_ids]
    return {"steps": steps, "edges": edges, "meta": _projection_meta("", 0)}


def _projection_meta(session_id: str, rev: int) -> Dict[str, Any]:
    return {
        "session_id": str(session_id or ""),
        "rev": int(rev or 0),
        "nodes_count": 0,
        "schema": PROJECTION_SCHEMA_VERSION,
    }


def build_process_projection(session: Session) -> Dict[str, Any]:
    """Слепок процесса из Session.nodes/edges; fallback на bpmn_xml, если nodes пусты."""
    nodes = getattr(session, "nodes", None) or []
    bpmn_xml = str(getattr(session, "bpmn_xml", "") or "").strip()

    if not nodes and bpmn_xml:
        projection = _build_projection_from_bpmn_xml(bpmn_xml)
    else:
        steps = []
        for node in nodes:
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
        projection = {"steps": steps, "edges": edges, "meta": _projection_meta("", 0)}

    projection["meta"]["session_id"] = str(getattr(session, "id", "") or "")
    projection["meta"]["rev"] = int(getattr(session, "version", 0) or 0)
    projection["meta"]["nodes_count"] = len(projection["steps"])
    return projection


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
