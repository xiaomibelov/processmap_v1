"""Применение edit_plan через монолит (AGENT-3).

Сервис не импортирует backend.app.*. Все вызовы — HTTP к монолиту с JWT.

Две стратегии применения:
- BPMN-XML-truth сессии: редактируем имя элемента прямо в bpmn_xml и сохраняем
  через PUT /api/sessions/{id}/bpmn (CAS по diagram_state_version). Snapshot
  создаётся автоматически.
- Legacy/черновые сессии без bpmn_xml: применяем правки через granular
  sessions_graph endpoints (nodes/edges) с пооперационным CAS.

В обоих случаях после успешного применения пишется audit_log
agent_edit_applied через POST /api/sessions/{id}/agent/audit.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

from runners import monolith_client


class EditApplyError(Exception):
    def __init__(self, status: str, message: str, *, details: Optional[Dict[str, Any]] = None) -> None:
        self.status = status
        self.details = details or {}
        super().__init__(message)


def _http_ok(resp: Dict[str, Any]) -> bool:
    return int(resp.get("_http_status", 200)) in (200, 201)


def _version_from_response(resp: Dict[str, Any]) -> int:
    return int(resp.get("diagram_state_version") or resp.get("version") or 0)


def _raise_from_response(resp: Dict[str, Any]) -> None:
    status = int(resp.get("_http_status", 500))
    detail = str(resp.get("detail") or resp.get("error") or resp.get("message") or "unknown error")
    code: Optional[str] = None
    if isinstance(resp.get("detail"), dict):
        code = str(resp["detail"].get("code") or "").strip() or None
    if status == 409:
        # Distinguish a real version conflict from other 409s (e.g. read-only graph).
        if code and code != "DIAGRAM_STATE_CONFLICT":
            raise EditApplyError("conflict_rev", detail, details={"code": code, "server_current_version": resp.get("diagram_state_version")})
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


def _patch_bpmn_xml_for_updates(xml: str, operations: List[Dict[str, Any]]) -> str:
    """Apply update_node title changes to the stored BPMN XML."""
    root = ET.fromstring(xml.encode("utf-8"))
    updated = 0
    for op in operations:
        if not isinstance(op, dict):
            continue
        if str(op.get("op") or "").strip() != "update_node":
            continue
        node_id = str(op.get("node_id") or "").strip()
        fields = op.get("fields") if isinstance(op.get("fields"), dict) else {}
        new_title = fields.get("title")
        if not node_id or new_title is None:
            continue
        # Attribute lookup works across namespaces because we target the unprefixed id.
        elem = root.find(f".//*[@id='{node_id}']")
        if elem is not None:
            elem.set("name", str(new_title))
            updated += 1
    if updated == 0:
        return xml
    return ET.tostring(root, encoding="unicode")


def _apply_via_granular_endpoints(
    session_id: str,
    token: str,
    operations: List[Dict[str, Any]],
    base_version: int,
    *,
    org_id: str = "",
) -> int:
    """Apply operations one-by-one through sessions_graph endpoints.

    Each endpoint returns the updated session with diagram_state_version;
    we use it as the CAS base for the next operation.
    """
    current_version = base_version
    applied = 0
    for op in operations:
        if not isinstance(op, dict):
            continue
        op_type = str(op.get("op") or "").strip()

        if op_type == "update_node":
            node_id = str(op.get("node_id") or "").strip()
            fields = dict(op.get("fields") or {})
            resp = monolith_client.patch_node(
                session_id, node_id, token, fields,
                org_id=org_id, base_diagram_state_version=current_version,
            )

        elif op_type == "add_node":
            node = {k: v for k, v in op.items() if k not in ("op", "incoming", "outgoing")}
            if "type" not in node:
                node["type"] = "step"
            resp = monolith_client.add_node(
                session_id, token, node,
                org_id=org_id, base_diagram_state_version=current_version,
            )

        elif op_type == "delete_node":
            node_id = str(op.get("node_id") or "").strip()
            resp = monolith_client.delete_node(
                session_id, node_id, token,
                org_id=org_id, base_diagram_state_version=current_version,
            )

        elif op_type == "add_edge":
            from_id = str(op.get("from_id") or "").strip()
            to_id = str(op.get("to_id") or "").strip()
            if not from_id or not to_id:
                raise EditApplyError("bad_request", "add_edge требует from_id/to_id")
            edge: Dict[str, Any] = {"from_id": from_id, "to_id": to_id}
            if op.get("when"):
                edge["when"] = str(op["when"])
            resp = monolith_client.add_edge(
                session_id, token, edge,
                org_id=org_id, base_diagram_state_version=current_version,
            )

        elif op_type == "delete_edge":
            from_id = str(op.get("from_id") or "").strip()
            to_id = str(op.get("to_id") or "").strip()
            edge = {"from_id": from_id, "to_id": to_id}
            if op.get("when"):
                edge["when"] = str(op["when"])
            resp = monolith_client.delete_edge(
                session_id, token, edge,
                org_id=org_id, base_diagram_state_version=current_version,
            )

        else:
            raise EditApplyError("bad_request", f"неизвестная операция '{op_type}'")

        if not _http_ok(resp):
            _raise_from_response(resp)

        current_version = _version_from_response(resp) or current_version
        applied += 1

    return applied


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

    graph = monolith_client.get_session_graph(sid, token=token, org_id=org_id)
    current_version = int(graph.get("diagram_state_version") or base_diagram_state_version or 0)

    # Resume already checked the version, but the graph load is the real CAS gate.
    if current_version != int(base_diagram_state_version or 0):
        raise EditApplyError(
            "conflict_rev",
            "схема изменилась, перечитайте",
            details={
                "client_base_version": base_diagram_state_version,
                "server_current_version": current_version,
            },
        )

    bpmn_xml = monolith_client.get_session_bpmn(sid, token, org_id=org_id).strip()

    snapshot_version_id: Optional[str] = None
    if bpmn_xml:
        # BPMN-XML-truth sessions: rename elements in XML and save via PUT /bpmn.
        # PUT /bpmn creates a BPMN version snapshot automatically.
        if any(str(op.get("op") or "").strip() != "update_node" for op in operations if isinstance(op, dict)):
            raise EditApplyError(
                "not_supported",
                "BPMN-сессии пока поддерживают только переименование шагов",
            )
        updated_xml = _patch_bpmn_xml_for_updates(bpmn_xml, operations)
        if updated_xml == bpmn_xml:
            raise EditApplyError("bad_request", "нет изменений для применения")

        resp = monolith_client.bpmn_save(
            sid, token, updated_xml,
            org_id=org_id,
            base_diagram_state_version=current_version,
            source_action="agent_edit",
        )
        if not _http_ok(resp):
            _raise_from_response(resp)

        snap = resp.get("bpmn_version_snapshot") or {}
        snapshot_version_id = str(snap.get("id") or snap.get("version_id") or "").strip() or None
        applied = sum(
            1 for op in operations
            if isinstance(op, dict) and str(op.get("op") or "").strip() == "update_node"
        )
    else:
        # No BPMN XML: apply through granular sessions_graph endpoints.
        applied = _apply_via_granular_endpoints(
            sid, token, operations, current_version, org_id=org_id,
        )

    # Best-effort audit log. Failure must not fail the apply.
    try:
        monolith_client.write_agent_edit_audit(
            sid, token, org_id=org_id,
            meta={
                "operations_applied": applied,
                "has_bpmn_xml": bool(bpmn_xml),
                "source": "agent_edit",
            },
        )
    except Exception:
        pass

    return {
        "status": "applied",
        "operations_applied": applied,
        "snapshot_version_id": snapshot_version_id,
    }
