from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml

from .models import Node


NUM_UNIT_RE = re.compile(r"(?P<num>\d+(?:[.,]\d+)?)\s*(?P<unit>[a-zA-Zа-яА-Я]{1,6})\b")
WORD_RE = re.compile(r"[a-zA-Zа-яА-ЯёЁ][a-zA-Zа-яА-ЯёЁ\-]{2,}")


def load_seed_glossary(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"version": 1, "equipment": [], "resources": [], "units": []}
    obj = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        return {"version": 1, "equipment": [], "resources": [], "units": []}
    obj.setdefault("equipment", [])
    obj.setdefault("resources", [])
    obj.setdefault("units", [])
    obj.setdefault("version", 1)
    return obj


def _build_alias_index(items: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    idx: Dict[str, Dict[str, Any]] = {}
    for it in items:
        canon = (it.get("canon") or "").strip()
        title = (it.get("title") or "").strip()
        aliases = it.get("aliases") or []
        for a in aliases:
            key = (a or "").strip().lower()
            if key:
                idx[key] = {"canon": canon, "title": title}
    return idx


def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _extract_terms(text: str, alias_idx: Dict[str, Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    t = text.lower()
    found: List[Dict[str, Any]] = []
    for alias, meta in alias_idx.items():
        if not alias:
            continue
        if alias in t:
            found.append(
                {"raw": alias, "canon": meta["canon"], "title": meta["title"], "confidence": 0.8}
            )
    found = sorted(found, key=lambda x: (-len(x["raw"]), x["canon"]))
    dedup: List[Dict[str, Any]] = []
    seen = set()
    for x in found:
        key = (x["canon"], x["raw"])
        if key in seen:
            continue
        seen.add(key)
        dedup.append(x)

    unknown: List[str] = []
    words = [w.group(0).lower() for w in WORD_RE.finditer(text)]
    for w in words:
        if w in alias_idx:
            continue
        if w in ("если", "иначе", "параллельно", "одновременно", "ждать", "сообщить", "спросить", "уточнить"):
            continue
        if len(w) <= 3:
            continue
        unknown.append(w)
    unknown = sorted(list(set(unknown)))
    return dedup, unknown


def _extract_units(text: str, unit_alias_idx: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in NUM_UNIT_RE.finditer(text):
        num_s = m.group("num").replace(",", ".")
        unit_raw = m.group("unit").lower()
        meta = unit_alias_idx.get(unit_raw)
        if meta:
            out.append(
                {
                    "raw": f"{num_s} {unit_raw}",
                    "value": float(num_s),
                    "unit_raw": unit_raw,
                    "unit_canon": meta["canon"],
                    "unit_title": meta["title"],
                    "confidence": 0.8,
                }
            )
    return out


def normalize_nodes(nodes: List[Node], seed: Dict[str, Any]) -> Dict[str, Any]:
    eq_idx = _build_alias_index(seed.get("equipment") or [])
    res_idx = _build_alias_index(seed.get("resources") or [])
    unit_idx = _build_alias_index(seed.get("units") or [])

    session_equipment: Dict[str, Dict[str, Any]] = {}
    session_resources: Dict[str, Dict[str, Any]] = {}
    session_units: List[Dict[str, Any]] = []
    session_unknown: Dict[str, int] = {}

    by_node: Dict[str, Dict[str, Any]] = {}

    for n in nodes:
        text = _norm_text(n.title)
        eq_found, eq_unk = _extract_terms(text, eq_idx)
        res_found, res_unk = _extract_terms(text, res_idx)
        units = _extract_units(text, unit_idx)

        for e in eq_found:
            session_equipment[e["canon"]] = e
        for r in res_found:
            session_resources[r["canon"]] = r
        for u in units:
            session_units.append(u)

        unknown_terms = []
        for w in eq_unk + res_unk:
            session_unknown[w] = session_unknown.get(w, 0) + 1
            unknown_terms.append(w)

        if n.equipment:
            for raw in n.equipment:
                rr = (raw or "").strip().lower()
                if rr in eq_idx:
                    meta = eq_idx[rr]
                    session_equipment[meta["canon"]] = {"raw": rr, "canon": meta["canon"], "title": meta["title"], "confidence": 0.9}

        node_report = {
            "equipment": eq_found,
            "resources": res_found,
            "units": units,
            "unknown_terms": unknown_terms,
        }
        by_node[n.id] = node_report
        n.parameters.setdefault("_norm", node_report)

    unknown_sorted = sorted(session_unknown.items(), key=lambda x: (-x[1], x[0]))
    report = {
        "equipment": list(session_equipment.values()),
        "resources": list(session_resources.values()),
        "units": session_units,
        "unknown_terms": [{"term": k, "count": v} for (k, v) in unknown_sorted[:60]],
        "by_node": by_node,
    }
    return report
