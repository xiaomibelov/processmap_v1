"""Core-shared pure helpers lifted verbatim from app._legacy_main (PR-5)."""
from __future__ import annotations

import json
from ..models import Edge
from ..models import Node
from ..utils.legacy_normalization import norm_roles as _norm_roles
from typing import Any
from typing import Dict
from typing import List

__all__ = [
    "_safe_model_dump",
    "_safe_model_dump_list",
    "_entity_key",
    "_stable_entity_signature",
    "_list_diff_by_id",
    "_role_diff",
    "_edge_identity",
    "_merge_nodes",
    "_merge_hybrid_layer",
    "_ensure_loss_dict",
]


def _safe_model_dump(value: Any) -> Dict[str, Any]:
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
            return dumped if isinstance(dumped, dict) else {}
        except Exception:
            return {}
    return dict(value or {}) if isinstance(value, dict) else {}


def _safe_model_dump_list(values: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in values or []:
        dumped = _safe_model_dump(item)
        if dumped:
            out.append(dumped)
    return out


def _entity_key(value: Any) -> str:
    row = _safe_model_dump(value)
    if not row and isinstance(value, dict):
        row = value
    if row:
        return str(row.get("id") or row.get("question_id") or row.get("from_id") or "").strip()
    return ""


def _stable_entity_signature(value: Any) -> str:
    row = _safe_model_dump(value)
    if not row and isinstance(value, dict):
        row = value
    try:
        return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        return str(row)


def _list_diff_by_id(current: Any, candidate: Any) -> Dict[str, Any]:
    current_rows = list(current or [])
    candidate_rows = list(candidate or [])
    current_by_id = {_entity_key(item): item for item in current_rows if _entity_key(item)}
    candidate_by_id = {_entity_key(item): item for item in candidate_rows if _entity_key(item)}
    added: List[str] = []
    updated: List[str] = []
    unchanged: List[str] = []
    for item_id, cand in candidate_by_id.items():
        cur = current_by_id.get(item_id)
        if cur is None:
            added.append(item_id)
        elif _stable_entity_signature(cur) == _stable_entity_signature(cand):
            unchanged.append(item_id)
        else:
            updated.append(item_id)
    removed = [item_id for item_id in current_by_id.keys() if item_id not in candidate_by_id]
    return {
        "added": sorted(added),
        "updated": sorted(updated),
        "unchanged": sorted(unchanged),
        "removed": sorted(removed),
        "added_count": len(added),
        "updated_count": len(updated),
        "unchanged_count": len(unchanged),
        "removed_count": len(removed),
    }


def _role_diff(current_roles: Any, candidate_roles: Any) -> Dict[str, Any]:
    current = set(_norm_roles(current_roles))
    candidate = set(_norm_roles(candidate_roles))
    return {
        "added": sorted(candidate - current),
        "removed": sorted(current - candidate),
        "unchanged": sorted(candidate & current),
        "added_count": len(candidate - current),
        "removed_count": len(current - candidate),
        "unchanged_count": len(candidate & current),
    }


def _edge_identity(edge: Edge) -> str:
    return f"{str(edge.from_id or '').strip()}->{str(edge.to_id or '').strip()}::{str(edge.when or '').strip()}"


def _merge_nodes(existing: List[Node], extracted: List[Node]) -> List[Node]:
    by_id = {n.id: n for n in existing}
    merged: List[Node] = []
    for nn in extracted:
        old = by_id.get(nn.id)
        if not old:
            merged.append(nn)
            continue

        p = dict(old.parameters or {})
        if p.get("_manual_title"):
            nn.title = old.title
        if p.get("_manual_type"):
            nn.type = old.type
        if p.get("_manual_actor"):
            nn.actor_role = old.actor_role
        if p.get("_manual_recipient"):
            nn.recipient_role = old.recipient_role
        if p.get("_manual_equipment"):
            nn.equipment = list(old.equipment or [])
        if p.get("_manual_duration"):
            nn.duration_min = old.duration_min
        if p.get("_manual_parameters"):
            nn.parameters = dict(old.parameters or {})
        if p.get("_manual_disposition"):
            nn.disposition = dict(old.disposition or {})

        if not p.get("_manual_equipment") and old.equipment and not nn.equipment:
            nn.equipment = list(old.equipment)
        if not p.get("_manual_actor") and old.actor_role and not nn.actor_role:
            nn.actor_role = old.actor_role
        if not p.get("_manual_duration") and old.duration_min is not None and nn.duration_min is None:
            nn.duration_min = old.duration_min
        if not p.get("_manual_disposition") and old.disposition and not nn.disposition:
            nn.disposition = dict(old.disposition)

        if old.qc:
            nn.qc = list(old.qc)
        if old.exceptions:
            nn.exceptions = list(old.exceptions)

        merged.append(nn)
    return merged


def _merge_hybrid_layer(current: Any, incoming: Any) -> Any:
    if isinstance(incoming, dict):
        if not incoming and isinstance(current, dict) and current:
            return current
        return incoming
    return current


def _ensure_loss_dict(node: Node) -> Dict[str, Any]:
    node.parameters = dict(node.parameters or {})
    loss = node.parameters.get("loss")
    if not isinstance(loss, dict):
        loss = {}
    node.parameters["loss"] = loss
    return loss
