"""Jev — whitelist-сборщик обезличенного state для внешнего API.

Периметр данных — PRIVACY.md контура audit/jev-tobe-classifier + ADR
(Decisions/ADR-Jev-Classifier-for-TO-BE-Transformation.md):
наружу ТОЛЬКО структура. Свободные тексты (name/documentation/lane name/
free-text props/annotation) наружу не уходят: name+documentation сжимаются
локально в name_hash_bucket; lane name → локально вычисленный lane_kind.

Запрещённое по умолчанию: payload собирается заново по белому списку,
а не фильтруется «всё, кроме».
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Optional

# enum-ключи camunda props, значения которых — коды домена v0.3 (не PII).
ENUM_PROP_KEYS = {"operation_code"}

_LANE_KIND_PATTERNS = [
    ("equipment", re.compile(r"оборуд|аппарат|машин|котел|танк", re.IGNORECASE)),
    ("operator", re.compile(r"оператор|персонал|рабоч|человек|технолог", re.IGNORECASE)),
    ("storage", re.compile(r"склад|хранилищ|холодильник|кладов", re.IGNORECASE)),
]


def lane_kind(lane_name: str) -> str:
    """Локальная категоризация имени дорожки; само имя наружу не уходит."""
    for kind, pattern in _LANE_KIND_PATTERNS:
        if pattern.search(lane_name or ""):
            return kind
    return "other"


def name_hash_bucket(name: str, documentation: str = "") -> str:
    """Стабильный короткий бакет от свободного текста; слова наружу не уходят."""
    text = f"{name or ''} {documentation or ''}".strip().lower()
    if not text:
        return ""
    return "kw_" + hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def build_jev_state(
    fact: Dict[str, Any],
    rules: List[Dict[str, Any]],
    candidate_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Собрать обезличенный state одного элемента по whitelist.

    candidate_ids: для tie-арбитража — ограничение кандидатов tied rule_ids
    (None = весь каталог, как в LLM-пути).
    """
    props = fact.get("camunda_props") or {}
    prop_numeric: Dict[str, float] = {}
    prop_enum: Dict[str, str] = {}
    for key, value in props.items():
        if key in ENUM_PROP_KEYS:
            prop_enum[key] = str(value)
            continue
        try:
            prop_numeric[key] = float(str(value).replace(",", "."))
        except (TypeError, ValueError):
            continue  # free-text значения вырезаются
    candidates = [
        {
            "rule_id": r["id"],
            "operation_code": r.get("operation_code") or "",
            "to_be_action": r.get("to_be_action") or "",
        }
        for r in rules
        if candidate_ids is None or r["id"] in set(candidate_ids)
    ]
    return {
        "element": {
            "element_id": fact["id"],
            "bpmn_type": fact.get("bpmn_type") or "",
            "lane_kind": lane_kind(fact.get("lane") or ""),
            "prop_keys": sorted(props.keys()),
            "prop_numeric": prop_numeric,
            "prop_enum": prop_enum,
            "name_hash_bucket": name_hash_bucket(fact.get("name") or "", fact.get("documentation") or ""),
            "has_name": bool((fact.get("name") or "").strip()),
        },
        "candidates": candidates,
    }
