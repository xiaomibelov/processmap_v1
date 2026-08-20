"""Применение edit_plan через существующий save-путь монолита (AGENT-3).

Сервис не импортирует backend.app.*. Все вызовы — HTTP к монолиту с JWT.
Правки применяются одним PATCH /api/sessions/{id} с CAS/rev-гвардом,
как это делает фронт (save-путь сессии).
"""
from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional

from runners import monolith_client


class EditApplyError(Exception):
    def __init__(self, status: str, message: str, *, details: Optional[Dict[str, Any]] = None) -> None:
        self.status = status
        self.details = details or {}
        super().__init__(message)


def _http_ok(resp: Dict[str, Any]) -> bool:
    return int(resp.get("_http_status", 200)) in (200, 201)


def _node_by_id(nodes: List[Dict[str, Any]], node_id: str) -> Optional[Dict[str, Any]]:
    for n in nodes:
        if str(n.get("id") or "").strip() == node_id:
            return n
    return None


def _edge_key(edge: Dict[str, Any]) -> tuple:
    return (str(edge.get("from_id") or "").strip(), str(edge.get("to_id") or "").strip())


def apply_edit_plan(
    session_id: str,
    token: str,
    edit_plan: Dict[str, Any],
    base_diagram_state_version: int,
    *,
    org_id: str = "",
    create_snapshot: bool = True,
) -> Dict[str, Any]:
    """Применить edit_plan к сессии. При конфликте версии — EditApplyError('conflict_rev', ...).

    Returns:
        {status: 'applied', operations_applied: int, snapshot_version_id: str|None}
    """
    sid = str(session_id or "").strip()
    operations = edit_plan.get("operations") if isinstance(edit_plan, dict) else []
    if not isinstance(operations, list):
        raise EditApplyError("bad_request", "edit_plan.operations должен быть списком")

    snapshot_version_id: Optional[str] = None
    if create_snapshot:
        # Для BPMN-сессий snapshot создаётся через PUT /bpmn (автоматически при сохранении).
        # Отдельного публичного endpoint'а для создания snapshot нет; audit и откат
        # покрываются историей версий BPMN и самим PATCH /sessions/{id}.
        try:
            snap = monolith_client.create_bpmn_version_snapshot(sid, token, org_id=org_id, source_action="agent_edit")
            snapshot_version_id = snap.get("version_id") or snap.get("id")
        except Exception:
            snapshot_version_id = None

    graph = monolith_client.get_session_graph(sid, token=token, org_id=org_id)
    nodes = copy.deepcopy(list(graph.get("nodes") or []))
    edges = copy.deepcopy(list(graph.get("edges") or []))
    current_version = int(graph.get("diagram_state_version") or base_diagram_state_version or 0)

    applied = 0
    for op in operations:
        if not isinstance(op, dict):
            continue
        op_type = str(op.get("op") or "").strip()

        if op_type == "update_node":
            node_id = str(op.get("node_id") or "").strip()
            node = _node_by_id(nodes, node_id)
            if node is None:
                raise EditApplyError("not_found", f"узел '{node_id}' не найден")
            for field, value in (op.get("fields") or {}).items():
                node[str(field)] = value
            applied += 1

        elif op_type == "add_node":
            new_node = {k: v for k, v in op.items() if k not in ("op", "incoming", "outgoing")}
            if "id" not in new_node or not str(new_node["id"]).strip():
                raise EditApplyError("bad_request", "add_node требует id")
            if _node_by_id(nodes, str(new_node["id"]).strip()) is not None:
                raise EditApplyError("bad_request", f"узел '{new_node['id']}' уже существует")
            nodes.append(new_node)
            applied += 1

        elif op_type == "delete_node":
            node_id = str(op.get("node_id") or "").strip()
            nodes = [n for n in nodes if str(n.get("id") or "").strip() != node_id]
            edges = [e for e in edges if (
                str(e.get("from_id") or "").strip() != node_id
                and str(e.get("to_id") or "").strip() != node_id
            )]
            applied += 1

        elif op_type == "add_edge":
            from_id = str(op.get("from_id") or "").strip()
            to_id = str(op.get("to_id") or "").strip()
            if not from_id or not to_id:
                raise EditApplyError("bad_request", "add_edge требует from_id/to_id")
            new_edge = {"from_id": from_id, "to_id": to_id}
            if op.get("when"):
                new_edge["when"] = str(op["when"])
            if _edge_key(new_edge) not in {_edge_key(e) for e in edges}:
                edges.append(new_edge)
            applied += 1

        elif op_type == "delete_edge":
            from_id = str(op.get("from_id") or "").strip()
            to_id = str(op.get("to_id") or "").strip()
            edges = [e for e in edges if not (
                str(e.get("from_id") or "").strip() == from_id
                and str(e.get("to_id") or "").strip() == to_id
            )]
            applied += 1

        else:
            raise EditApplyError("bad_request", f"неизвестная операция '{op_type}'")

    patch_body = {
        "nodes": nodes,
        "edges": edges,
        "base_diagram_state_version": current_version,
    }
    resp = monolith_client.patch_session(sid, token, patch_body, org_id=org_id)
    if not _http_ok(resp):
        _raise_from_response(resp)

    return {
        "status": "applied",
        "operations_applied": applied,
        "snapshot_version_id": snapshot_version_id,
    }


def _raise_from_response(resp: Dict[str, Any]) -> None:
    status = int(resp.get("_http_status", 500))
    detail = str(resp.get("detail") or resp.get("error") or resp.get("message") or "unknown error")
    if status == 409:
        raise EditApplyError(
            "conflict_rev",
            "схема изменилась, перечитайте",
            details={"server_current_version": resp.get("diagram_state_version")},
        )
    if status == 400:
        raise EditApplyError("bad_request", detail)
    if status == 404:
        raise EditApplyError("not_found", detail)
    raise EditApplyError("error", f"HTTP {status}: {detail}")
