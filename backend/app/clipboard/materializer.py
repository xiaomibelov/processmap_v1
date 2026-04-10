from __future__ import annotations

import copy
import json
import time
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from fastapi import HTTPException, Request

from .. import _legacy_main
from ..models import Node, Session
from ..redis_lock import acquire_session_lock
from .models import (
    ClipboardFragmentEdge,
    ClipboardFragmentNode,
    ClipboardPasteResponse,
    ClipboardSubprocessPayload,
    ClipboardTaskElement,
    ClipboardTaskPayload,
)
from .xml_codec import (
    _BPMN_NS,
    _BPMNDI_NS,
    _DC_NS,
    _DI_NS,
    attr_name_from_key,
    build_extension_elements,
    build_tree,
    collect_di_maps,
    find_xml_element,
    iter_local,
    local_name,
    stable_json,
)


@dataclass
class ClipboardMaterializationError(RuntimeError):
    status_code: int
    code: str
    message: str

    def __post_init__(self) -> None:
        super().__init__(self.message)


def _load_target_session_for_edit(session_id: str, request: Request) -> tuple[Session, str, str]:
    user = _legacy_main._request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if not user_id:
        raise ClipboardMaterializationError(401, "unauthorized", "unauthorized")
    sess, org_id, _scope = _legacy_main._legacy_load_session_scoped(session_id, request)
    if not sess:
        raise ClipboardMaterializationError(404, "not_found", "not_found")
    role = _legacy_main._org_role_for_request(request, org_id) if request is not None and org_id else ("org_admin" if is_admin else "")
    if not _legacy_main._can_edit_workspace(role, is_admin=is_admin):
        raise ClipboardMaterializationError(403, "forbidden", "forbidden")
    return sess, str(org_id or getattr(sess, "org_id", "") or ""), user_id


def _parse_target_bpmn(xml_text: str) -> tuple[ET.Element, ET.Element, ET.Element]:
    source = str(xml_text or "").strip()
    if not source:
        raise ClipboardMaterializationError(422, "target_bpmn_missing", "target session has no BPMN XML")
    try:
        root = ET.fromstring(source)
    except Exception as exc:
        raise ClipboardMaterializationError(422, "invalid_target_bpmn_xml", f"invalid target BPMN XML: {exc}") from exc
    process = next(iter_local(root, "process"), None)
    plane = next(iter_local(root, "BPMNPlane"), None)
    if process is None:
        raise ClipboardMaterializationError(422, "invalid_target_bpmn_xml", "target BPMN has no process element")
    if plane is None:
        raise ClipboardMaterializationError(422, "invalid_target_bpmn_xml", "target BPMN has no BPMNPlane element")
    return root, process, plane


def _default_task_dimensions(element_type: str) -> tuple[float, float]:
    local = str(element_type or "").strip()
    if local in {"startEvent", "endEvent", "intermediateThrowEvent"}:
        return 36.0, 36.0
    if local in {"exclusiveGateway", "inclusiveGateway", "parallelGateway", "eventBasedGateway"}:
        return 50.0, 50.0
    return 120.0, 80.0


def _collect_existing_ids(root: ET.Element) -> Set[str]:
    out: Set[str] = set()
    for elem in root.iter():
        elem_id = str(elem.attrib.get("id") or "").strip()
        if elem_id:
            out.add(elem_id)
    return out


def _safe_id_base(value: str, fallback: str) -> str:
    src = str(value or "").strip()
    if not src:
        src = fallback
    chars = [ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in src]
    safe = "".join(chars).strip("_")
    return safe or fallback


def _allocate_new_id(existing_ids: Set[str], *, prefix: str, hint: str = "") -> str:
    base = _safe_id_base(hint, prefix)
    candidate = f"{prefix}_{base}_{uuid.uuid4().hex[:8]}"
    while candidate in existing_ids:
        candidate = f"{prefix}_{base}_{uuid.uuid4().hex[:8]}"
    existing_ids.add(candidate)
    return candidate


def _compute_fragment_bbox(root_node: ClipboardFragmentNode, child_nodes: List[ClipboardFragmentNode]) -> tuple[float, float, float, float]:
    points: List[tuple[float, float, float, float]] = []
    for node in [root_node, *list(child_nodes or [])]:
        bounds = getattr(node, "di_bounds", None)
        if bounds is None:
            continue
        x = float(bounds.x)
        y = float(bounds.y)
        w = float(bounds.width)
        h = float(bounds.height)
        points.append((x, y, x + w, y + h))
    if not points:
        return 0.0, 0.0, 220.0, 160.0
    min_x = min(row[0] for row in points)
    min_y = min(row[1] for row in points)
    max_x = max(row[2] for row in points)
    max_y = max(row[3] for row in points)
    return min_x, min_y, max_x, max_y


def _target_origin(plane: ET.Element) -> tuple[float, float]:
    max_x = 120.0
    min_y = 120.0
    for shape in iter_local(plane, "BPMNShape"):
        bounds = next(iter_local(shape, "Bounds"), None)
        if bounds is None:
            continue
        try:
            x = float(bounds.attrib.get("x", "0") or 0)
            y = float(bounds.attrib.get("y", "0") or 0)
            w = float(bounds.attrib.get("width", "0") or 0)
        except Exception:
            continue
        max_x = max(max_x, x + w)
        min_y = min(min_y, y)
    return max_x + 80.0, max(80.0, min_y)


def _build_node_maps(payload: ClipboardSubprocessPayload) -> tuple[Dict[str, ClipboardFragmentNode], Dict[str, List[ClipboardFragmentNode]]]:
    node_by_old_id: Dict[str, ClipboardFragmentNode] = {payload.root.old_id: payload.root}
    children_by_parent: Dict[str, List[ClipboardFragmentNode]] = {}
    for node in list(payload.fragment.nodes or []):
        node_by_old_id[node.old_id] = node
        children_by_parent.setdefault(str(node.parent_old_id or ""), []).append(node)
    for rows in children_by_parent.values():
        rows.sort(key=lambda item: (int(item.nesting_depth or 0), str(item.old_id or "")))
    return node_by_old_id, children_by_parent


def _build_edge_map(payload: ClipboardSubprocessPayload) -> Dict[str, List[ClipboardFragmentEdge]]:
    out: Dict[str, List[ClipboardFragmentEdge]] = {}
    for edge in list(payload.fragment.edges or []):
        out.setdefault(str(edge.parent_old_id or ""), []).append(edge)
    return out


def _remap_attribute_value(value: Any, id_map: Dict[str, str]) -> str:
    text = str(value or "")
    return str(id_map.get(text, text))


def _collect_payload_tree_id_hints(payload: Any, out: Dict[str, str]) -> None:
    if not isinstance(payload, dict):
        return
    attrs = payload.get("attributes")
    old_id = str(attrs.get("id") or "").strip() if isinstance(attrs, dict) else ""
    if old_id:
        out.setdefault(old_id, str(payload.get("type") or "Aux"))
    for child in payload.get("children") if isinstance(payload.get("children"), list) else []:
        _collect_payload_tree_id_hints(child, out)


def _collect_auxiliary_id_hints(
    *,
    nodes: Iterable[ClipboardFragmentNode],
    edges: Iterable[ClipboardFragmentEdge],
) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for node in nodes:
        for child_payload in list(node.extra_children or []):
            _collect_payload_tree_id_hints(child_payload, out)
    for edge in edges:
        for child_payload in list(edge.extra_children or []):
            _collect_payload_tree_id_hints(child_payload, out)
    return out


def _build_node_xml(node: ClipboardFragmentNode, *, new_id: str, id_map: Dict[str, str]) -> ET.Element:
    tag = f"{{{_BPMN_NS}}}{node.element_type}"
    elem = ET.Element(tag)
    elem.attrib["id"] = new_id
    if str(node.name or "").strip():
        elem.attrib["name"] = str(node.name)
    for key, value in dict(node.bpmn_attributes or {}).items():
        if str(key or "").strip() in {"id", "name"}:
            continue
        elem.attrib[attr_name_from_key(str(key))] = _remap_attribute_value(value, id_map)
    if str(node.documentation or "").strip():
        documentation = ET.SubElement(elem, f"{{{_BPMN_NS}}}documentation")
        documentation.text = str(node.documentation)
    ext = build_extension_elements(dict(node.extension_elements or {}))
    if ext is not None:
        elem.append(ext)
    for child_payload in list(node.extra_children or []):
        if not isinstance(child_payload, dict):
            continue
        elem.append(build_tree(child_payload, id_map=id_map))
    return elem


def _build_task_xml(element: ClipboardTaskElement, *, new_id: str) -> ET.Element:
    tag = f"{{{_BPMN_NS}}}{element.element_type}"
    elem = ET.Element(tag)
    elem.attrib["id"] = new_id
    if str(element.name or "").strip():
        elem.attrib["name"] = str(element.name)
    for key, value in dict(element.bpmn_attributes or {}).items():
        if str(key or "").strip() in {"id", "name"}:
            continue
        elem.attrib[attr_name_from_key(str(key))] = str(value)
    if str(element.documentation or "").strip():
        documentation = ET.SubElement(elem, f"{{{_BPMN_NS}}}documentation")
        documentation.text = str(element.documentation)
    ext = build_extension_elements(dict(element.extension_elements or {}))
    if ext is not None:
        elem.append(ext)
    for child_payload in list(element.extra_children or []):
        if not isinstance(child_payload, dict):
            continue
        elem.append(build_tree(child_payload, id_map={new_id: new_id}))
    return elem


def _build_edge_xml(edge: ClipboardFragmentEdge, *, new_id: str, id_map: Dict[str, str]) -> ET.Element:
    elem = ET.Element(
        f"{{{_BPMN_NS}}}sequenceFlow",
        attrib={
            "id": new_id,
            "sourceRef": str(id_map.get(edge.source_old_id, edge.source_old_id)),
            "targetRef": str(id_map.get(edge.target_old_id, edge.target_old_id)),
        },
    )
    if str(edge.name or "").strip():
        elem.attrib["name"] = str(edge.name)
    for key, value in dict(edge.bpmn_attributes or {}).items():
        if str(key or "").strip() in {"id", "name", "sourceRef", "targetRef"}:
            continue
        elem.attrib[attr_name_from_key(str(key))] = _remap_attribute_value(value, id_map)
    if str(edge.condition_expression or "").strip():
        cond = ET.SubElement(elem, f"{{{_BPMN_NS}}}conditionExpression")
        cond.text = str(edge.condition_expression)
    for child_payload in list(edge.extra_children or []):
        if not isinstance(child_payload, dict):
            continue
        elem.append(build_tree(child_payload, id_map=id_map))
    return elem


def _append_edge_refs(node_elements: Dict[str, ET.Element], edge_ids: Dict[str, str], edges: Iterable[ClipboardFragmentEdge], id_map: Dict[str, str]) -> None:
    outgoing_by_node: Dict[str, List[str]] = {}
    incoming_by_node: Dict[str, List[str]] = {}
    for edge in edges:
        new_edge_id = edge_ids.get(edge.old_id)
        src_new = id_map.get(edge.source_old_id)
        dst_new = id_map.get(edge.target_old_id)
        if not new_edge_id or not src_new or not dst_new:
            continue
        outgoing_by_node.setdefault(src_new, []).append(new_edge_id)
        incoming_by_node.setdefault(dst_new, []).append(new_edge_id)
    for node_id, elem in node_elements.items():
        for edge_id in outgoing_by_node.get(node_id, []):
            ET.SubElement(elem, f"{{{_BPMN_NS}}}outgoing").text = edge_id
        for edge_id in incoming_by_node.get(node_id, []):
            ET.SubElement(elem, f"{{{_BPMN_NS}}}incoming").text = edge_id


def _append_di_shape(plane: ET.Element, *, bpmn_element_id: str, node: ClipboardFragmentNode, delta_x: float, delta_y: float, existing_ids: Set[str]) -> None:
    bounds = node.di_bounds
    if bounds is None:
        return
    shape_id = _allocate_new_id(existing_ids, prefix="BPMNShape", hint=bpmn_element_id)
    attrs = {"id": shape_id, "bpmnElement": bpmn_element_id}
    for key, value in dict(node.di_shape_attributes or {}).items():
        attrs[str(key)] = str(value)
    shape = ET.SubElement(plane, f"{{{_BPMNDI_NS}}}BPMNShape", attrib=attrs)
    ET.SubElement(
        shape,
        f"{{{_DC_NS}}}Bounds",
        attrib={
            "x": f"{float(bounds.x) + float(delta_x):.1f}",
            "y": f"{float(bounds.y) + float(delta_y):.1f}",
            "width": f"{float(bounds.width):.1f}",
            "height": f"{float(bounds.height):.1f}",
        },
    )


def _append_basic_di_shape(
    plane: ET.Element,
    *,
    bpmn_element_id: str,
    element_type: str,
    x: float,
    y: float,
    existing_ids: Set[str],
) -> None:
    width, height = _default_task_dimensions(element_type)
    shape_id = _allocate_new_id(existing_ids, prefix="BPMNShape", hint=bpmn_element_id)
    shape = ET.SubElement(
        plane,
        f"{{{_BPMNDI_NS}}}BPMNShape",
        attrib={"id": shape_id, "bpmnElement": bpmn_element_id},
    )
    ET.SubElement(
        shape,
        f"{{{_DC_NS}}}Bounds",
        attrib={
            "x": f"{float(x):.1f}",
            "y": f"{float(y):.1f}",
            "width": f"{float(width):.1f}",
            "height": f"{float(height):.1f}",
        },
    )


def _node_center(node: ClipboardFragmentNode, delta_x: float, delta_y: float) -> tuple[float, float]:
    if node.di_bounds is None:
        return 0.0, 0.0
    return (
        float(node.di_bounds.x) + float(delta_x) + float(node.di_bounds.width) / 2.0,
        float(node.di_bounds.y) + float(delta_y) + float(node.di_bounds.height) / 2.0,
    )


def _append_di_edge(
    plane: ET.Element,
    *,
    bpmn_element_id: str,
    edge: ClipboardFragmentEdge,
    source_node: ClipboardFragmentNode,
    target_node: ClipboardFragmentNode,
    delta_x: float,
    delta_y: float,
    existing_ids: Set[str],
) -> None:
    edge_id = _allocate_new_id(existing_ids, prefix="BPMNEdge", hint=bpmn_element_id)
    attrs = {"id": edge_id, "bpmnElement": bpmn_element_id}
    for key, value in dict(edge.di_edge_attributes or {}).items():
        attrs[str(key)] = str(value)
    di_edge = ET.SubElement(plane, f"{{{_BPMNDI_NS}}}BPMNEdge", attrib=attrs)
    waypoints = list(edge.di_waypoints or [])
    if not waypoints:
        sx, sy = _node_center(source_node, delta_x, delta_y)
        tx, ty = _node_center(target_node, delta_x, delta_y)
        waypoints = [type("P", (), {"x": sx, "y": sy})(), type("P", (), {"x": tx, "y": ty})()]
    for point in waypoints:
        ET.SubElement(
            di_edge,
            f"{{{_DI_NS}}}waypoint",
            attrib={
                "x": f"{float(getattr(point, 'x', 0.0)) + float(delta_x):.1f}",
                "y": f"{float(getattr(point, 'y', 0.0)) + float(delta_y):.1f}",
            },
        )


def _clone_session_node(session_node: Dict[str, Any], *, new_id: str) -> Optional[Node]:
    payload = stable_json(session_node)
    if not isinstance(payload, dict):
        return None
    payload["id"] = str(new_id or "")
    try:
        return Node.model_validate(payload)
    except Exception:
        return None


def _merge_payload_state_into_session(
    *,
    session_obj: Session,
    payload: ClipboardSubprocessPayload,
    id_map: Dict[str, str],
    edge_id_map: Dict[str, str],
    normalized_meta: Dict[str, Any],
) -> None:
    nodes = list(getattr(session_obj, "nodes", []) or [])
    existing_node_ids = {str(getattr(node, "id", "") or "").strip() for node in nodes}
    notes_by_element = dict(getattr(session_obj, "notes_by_element", {}) or {})

    def apply_node_state(node_payload: ClipboardFragmentNode) -> None:
        new_id = id_map.get(node_payload.old_id)
        if not new_id:
            return
        if isinstance(node_payload.session_node, dict) and new_id not in existing_node_ids:
            cloned = _clone_session_node(node_payload.session_node, new_id=new_id)
            if cloned is not None:
                nodes.append(cloned)
                existing_node_ids.add(new_id)
        for key, value in dict(node_payload.task_local_state or {}).items():
            if key == "notes_by_element":
                notes_by_element[new_id] = stable_json(value)
                continue
            target_map = normalized_meta.get(key)
            if not isinstance(target_map, dict):
                target_map = {}
            target_map[new_id] = stable_json(value)
            normalized_meta[key] = target_map

    apply_node_state(payload.root)
    for node in list(payload.fragment.nodes or []):
        apply_node_state(node)
    flow_meta = normalized_meta.get("flow_meta")
    if not isinstance(flow_meta, dict):
        flow_meta = {}
    for edge in list(payload.fragment.edges or []):
        new_edge_id = edge_id_map.get(edge.old_id)
        if not new_edge_id or not isinstance(edge.edge_local_state, dict) or not edge.edge_local_state:
            continue
        flow_meta[new_edge_id] = stable_json(edge.edge_local_state)
    normalized_meta["flow_meta"] = flow_meta
    session_obj.nodes = nodes
    session_obj.notes_by_element = notes_by_element


def _merge_task_state_into_session(
    *,
    session_obj: Session,
    payload: ClipboardTaskPayload,
    new_id: str,
    normalized_meta: Dict[str, Any],
) -> None:
    nodes = list(getattr(session_obj, "nodes", []) or [])
    existing_node_ids = {str(getattr(node, "id", "") or "").strip() for node in nodes}
    notes_by_element = dict(getattr(session_obj, "notes_by_element", {}) or {})

    if isinstance(payload.element.session_node, dict) and new_id not in existing_node_ids:
        cloned = _clone_session_node(payload.element.session_node, new_id=new_id)
        if cloned is not None:
            nodes.append(cloned)
            existing_node_ids.add(new_id)

    for key, value in dict(payload.element.task_local_state or {}).items():
        if key == "notes_by_element":
            notes_by_element[new_id] = stable_json(value)
            continue
        target_map = normalized_meta.get(key)
        if not isinstance(target_map, dict):
            target_map = {}
        target_map[new_id] = stable_json(value)
        normalized_meta[key] = target_map

    session_obj.nodes = nodes
    session_obj.notes_by_element = notes_by_element


def materialize_task_payload_into_session(
    *,
    payload: ClipboardTaskPayload,
    target_session_id: str,
    request: Request,
) -> ClipboardPasteResponse:
    target_session, target_org_id, user_id = _load_target_session_for_edit(target_session_id, request)

    lock = acquire_session_lock(str(target_session.id or target_session_id), ttl_ms=15000)
    if not lock.acquired:
        raise ClipboardMaterializationError(423, "lock_busy", "target session is being updated, retry")

    try:
        root, process, plane = _parse_target_bpmn(str(getattr(target_session, "bpmn_xml", "") or ""))
        existing_ids = _collect_existing_ids(root)
        new_id = _allocate_new_id(existing_ids, prefix=str(payload.element.element_type or "Node"), hint=str(payload.context.source_element_id or "task"))
        target_x, target_y = _target_origin(plane)
        task_elem = _build_task_xml(payload.element, new_id=new_id)
        process.append(task_elem)
        _append_basic_di_shape(
            plane,
            bpmn_element_id=new_id,
            element_type=str(payload.element.element_type or ""),
            x=float(target_x),
            y=float(target_y),
            existing_ids=existing_ids,
        )

        xml_text = ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8", errors="replace")
        flow_ctx = _legacy_main._collect_sequence_flow_meta(xml_text)
        current_meta = _legacy_main._normalize_bpmn_meta(getattr(target_session, "bpmn_meta", {}))
        raw_meta = stable_json(current_meta) if isinstance(current_meta, dict) else {}
        if not isinstance(raw_meta, dict):
            raw_meta = {}
        _merge_task_state_into_session(
            session_obj=target_session,
            payload=payload,
            new_id=new_id,
            normalized_meta=raw_meta,
        )
        target_session.bpmn_xml = xml_text
        target_session.bpmn_xml_version = int(getattr(target_session, "version", 0) or 0)
        target_session.bpmn_graph_fingerprint = _legacy_main._session_graph_fingerprint(target_session)
        target_session.bpmn_meta = _legacy_main._normalize_bpmn_meta(
            raw_meta,
            allowed_flow_ids=flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else None,
            allowed_node_ids=flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else None,
        )
        st = _legacy_main.get_storage()
        st.save(target_session, user_id=user_id, org_id=target_org_id, is_admin=True)
        _legacy_main._invalidate_session_caches(
            target_session,
            session_id=str(target_session.id or target_session_id),
            org_id=target_org_id or getattr(target_session, "org_id", "") or _legacy_main.get_default_org_id(),
        )
        return ClipboardPasteResponse(
            clipboard_item_type=str(payload.clipboard_item_type),
            target_session_id=str(target_session.id or target_session_id),
            pasted_root_element_id=str(new_id),
            created_node_ids=[str(new_id)],
            created_edge_ids=[],
            schema_version=str(payload.schema_version),
        )
    finally:
        lock.release()


def materialize_subprocess_payload_into_session(
    *,
    payload: ClipboardSubprocessPayload,
    target_session_id: str,
    request: Request,
) -> ClipboardPasteResponse:
    target_session, target_org_id, user_id = _load_target_session_for_edit(target_session_id, request)
    if str(payload.context.source_session_id or "").strip() == str(target_session_id or "").strip():
        # same-session paste is still a valid isolated insert
        pass

    lock = acquire_session_lock(str(target_session.id or target_session_id), ttl_ms=15000)
    if not lock.acquired:
        raise ClipboardMaterializationError(423, "lock_busy", "target session is being updated, retry")

    try:
        root, process, plane = _parse_target_bpmn(str(getattr(target_session, "bpmn_xml", "") or ""))
        existing_ids = _collect_existing_ids(root)
        node_by_old_id, children_by_parent = _build_node_maps(payload)
        edges_by_parent = _build_edge_map(payload)

        id_map: Dict[str, str] = {}
        all_nodes = [payload.root, *list(payload.fragment.nodes or [])]
        for node in all_nodes:
            prefix = "SubProcess" if str(node.element_type or "") == "subProcess" else str(node.element_type or "Node")
            id_map[node.old_id] = _allocate_new_id(existing_ids, prefix=prefix, hint=node.old_id)

        edge_id_map: Dict[str, str] = {}
        for edge in list(payload.fragment.edges or []):
            edge_id_map[edge.old_id] = _allocate_new_id(existing_ids, prefix="Flow", hint=edge.old_id)
        auxiliary_id_hints = _collect_auxiliary_id_hints(nodes=all_nodes, edges=payload.fragment.edges or [])
        auxiliary_id_map: Dict[str, str] = {}
        for old_id, element_type in sorted(auxiliary_id_hints.items()):
            prefix = _safe_id_base(str(element_type or "Aux"), "Aux")
            auxiliary_id_map[old_id] = _allocate_new_id(existing_ids, prefix=prefix, hint=old_id)
        remap_id_map = {**id_map, **edge_id_map, **auxiliary_id_map}

        min_x, min_y, _max_x, _max_y = _compute_fragment_bbox(payload.root, list(payload.fragment.nodes or []))
        target_x, target_y = _target_origin(plane)
        delta_x = target_x - min_x
        delta_y = target_y - min_y

        xml_node_by_old_id: Dict[str, ET.Element] = {}
        for node in all_nodes:
            xml_node_by_old_id[node.old_id] = _build_node_xml(node, new_id=id_map[node.old_id], id_map=remap_id_map)

        # Attach hierarchy first.
        root_elem = xml_node_by_old_id[payload.root.old_id]
        process.append(root_elem)
        queue = list(children_by_parent.get(payload.root.old_id, []))
        while queue:
            node = queue.pop(0)
            parent_old_id = str(node.parent_old_id or "")
            parent_elem = xml_node_by_old_id.get(parent_old_id)
            child_elem = xml_node_by_old_id.get(node.old_id)
            if parent_elem is None or child_elem is None:
                raise ClipboardMaterializationError(422, "invalid_clipboard_payload", "subprocess node hierarchy is incomplete")
            parent_elem.append(child_elem)
            queue.extend(children_by_parent.get(node.old_id, []))

        all_edges = list(payload.fragment.edges or [])
        edge_xml_by_old_id: Dict[str, ET.Element] = {}
        for edge in all_edges:
            edge_xml_by_old_id[edge.old_id] = _build_edge_xml(edge, new_id=edge_id_map[edge.old_id], id_map=remap_id_map)
        _append_edge_refs(
            {id_map[node.old_id]: xml_node_by_old_id[node.old_id] for node in all_nodes},
            edge_id_map,
            all_edges,
            id_map,
        )
        for edge in all_edges:
            parent_elem = xml_node_by_old_id.get(str(edge.parent_old_id or payload.root.old_id))
            if parent_elem is None:
                raise ClipboardMaterializationError(422, "invalid_clipboard_payload", "subprocess edge parent hierarchy is incomplete")
            parent_elem.append(edge_xml_by_old_id[edge.old_id])

        # BPMNDI
        for node in all_nodes:
            _append_di_shape(
                plane,
                bpmn_element_id=id_map[node.old_id],
                node=node,
                delta_x=delta_x,
                delta_y=delta_y,
                existing_ids=existing_ids,
            )
        for edge in all_edges:
            source_node = node_by_old_id.get(edge.source_old_id)
            target_node = node_by_old_id.get(edge.target_old_id)
            if source_node is None or target_node is None:
                raise ClipboardMaterializationError(422, "invalid_clipboard_payload", "edge refs point outside subprocess subtree")
            _append_di_edge(
                plane,
                bpmn_element_id=edge_id_map[edge.old_id],
                edge=edge,
                source_node=source_node,
                target_node=target_node,
                delta_x=delta_x,
                delta_y=delta_y,
                existing_ids=existing_ids,
            )

        xml_text = ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8", errors="replace")
        flow_ctx = _legacy_main._collect_sequence_flow_meta(xml_text)
        current_meta = _legacy_main._normalize_bpmn_meta(getattr(target_session, "bpmn_meta", {}))
        raw_meta = stable_json(current_meta) if isinstance(current_meta, dict) else {}
        if not isinstance(raw_meta, dict):
            raw_meta = {}
        _merge_payload_state_into_session(
            session_obj=target_session,
            payload=payload,
            id_map=id_map,
            edge_id_map=edge_id_map,
            normalized_meta=raw_meta,
        )
        target_session.bpmn_xml = xml_text
        target_session.bpmn_xml_version = int(getattr(target_session, "version", 0) or 0)
        target_session.bpmn_graph_fingerprint = _legacy_main._session_graph_fingerprint(target_session)
        target_session.bpmn_meta = _legacy_main._normalize_bpmn_meta(
            raw_meta,
            allowed_flow_ids=flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else None,
            allowed_node_ids=flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else None,
        )
        st = _legacy_main.get_storage()
        st.save(target_session, user_id=user_id, org_id=target_org_id, is_admin=True)
        _legacy_main._invalidate_session_caches(
            target_session,
            session_id=str(target_session.id or target_session_id),
            org_id=target_org_id or getattr(target_session, "org_id", "") or _legacy_main.get_default_org_id(),
        )
        return ClipboardPasteResponse(
            clipboard_item_type=str(payload.clipboard_item_type),
            target_session_id=str(target_session.id or target_session_id),
            pasted_root_element_id=str(id_map.get(payload.root.old_id) or ""),
            created_node_ids=[str(id_map[node.old_id]) for node in all_nodes],
            created_edge_ids=[str(edge_id_map[edge.old_id]) for edge in all_edges],
            schema_version=str(payload.schema_version),
        )
    finally:
        lock.release()
