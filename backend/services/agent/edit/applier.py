"""Применение edit_plan через существующий save-путь монолита (AGENT-3).

Сервис не импортирует backend.app.*. Все вызовы — HTTP к монолиту с JWT.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from runners import monolith_client


class EditApplyError(Exception):
    def __init__(self, status: str, message: str, *, details: Optional[Dict[str, Any]] = None) -> None:
        self.status = status
        self.details = details or {}
        super().__init__(message)


def _http_ok(resp: Dict[str, Any]) -> bool:
    return int(resp.get("_http_status", 200)) in (200, 201)


def apply_edit_plan(
    session_id: str,
    token: str,
    edit_plan: Dict[str, Any],
    base_diagram_state_version: int,
    *,
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
        try:
            snap = monolith_client.create_bpmn_version_snapshot(sid, token, source_action="agent_edit")
            snapshot_version_id = snap.get("version_id") or snap.get("id")
        except Exception:
            snapshot_version_id = None

    applied = 0
    for op in operations:
        if not isinstance(op, dict):
            continue
        op_type = str(op.get("op") or "").strip()

        if op_type == "update_node":
            node_id = str(op.get("node_id") or "").strip()
            fields = dict(op.get("fields") or {})
            resp = monolith_client.patch_node(
                sid, node_id, token, fields,
                base_diagram_state_version=base_diagram_state_version,
            )
            if not _http_ok(resp):
                _raise_from_response(resp)
            applied += 1

        elif op_type == "add_node":
            node = {k: v for k, v in op.items() if k != "op"}
            if "incoming" in node:
                del node["incoming"]
            if "outgoing" in node:
                del node["outgoing"]
            resp = monolith_client.add_node(
                sid, token, node,
                base_diagram_state_version=base_diagram_state_version,
            )
            if not _http_ok(resp):
                _raise_from_response(resp)
            applied += 1

        elif op_type == "delete_node":
            node_id = str(op.get("node_id") or "").strip()
            resp = monolith_client.delete_node(
                sid, node_id, token,
                base_diagram_state_version=base_diagram_state_version,
            )
            if not _http_ok(resp):
                _raise_from_response(resp)
            applied += 1

        elif op_type == "add_edge":
            edge = {
                "from_id": str(op.get("from_id") or "").strip(),
                "to_id": str(op.get("to_id") or "").strip(),
            }
            if op.get("when"):
                edge["when"] = str(op["when"])
            resp = monolith_client.add_edge(
                sid, token, edge,
                base_diagram_state_version=base_diagram_state_version,
            )
            if not _http_ok(resp):
                _raise_from_response(resp)
            applied += 1

        elif op_type == "delete_edge":
            edge = {
                "from_id": str(op.get("from_id") or "").strip(),
                "to_id": str(op.get("to_id") or "").strip(),
            }
            resp = monolith_client.delete_edge(
                sid, token, edge,
                base_diagram_state_version=base_diagram_state_version,
            )
            if not _http_ok(resp):
                _raise_from_response(resp)
            applied += 1

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
