from __future__ import annotations

import copy
import json
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Set

from ..models import Session
from .models import (
    CLIPBOARD_SUBPROCESS_ITEM_TYPE,
    ClipboardContext,
    ClipboardExternalDependency,
    ClipboardFragment,
    ClipboardFragmentEdge,
    ClipboardFragmentNode,
    ClipboardMetadata,
    ClipboardPayload,
    ClipboardSubprocessPayload,
    ClipboardTaskElement,
    ClipboardTaskPayload,
)
from .xml_codec import (
    _BPMN_NS,
    collect_di_maps,
    collect_di_maps_for_bpmn_element,
    extract_documentation,
    find_xml_element,
    local_name,
    serialize_extension_elements,
    serialize_tree,
    stable_json,
)

_SUPPORTED_TASK_TYPES = {
    "task",
    "userTask",
    "serviceTask",
    "manualTask",
    "scriptTask",
    "businessRuleTask",
    "sendTask",
    "receiveTask",
}
_SUPPORTED_SUBPROCESS_ROOT_TYPES = {"subProcess"}
_SUPPORTED_SUBTREE_NODE_TYPES = {
    *list(_SUPPORTED_TASK_TYPES),
    "startEvent",
    "endEvent",
    "intermediateThrowEvent",
    "dataStoreReference",
    "exclusiveGateway",
    "inclusiveGateway",
    "parallelGateway",
    "eventBasedGateway",
    "subProcess",
}
_SUPPORTED_AUXILIARY_SUBTREE_ELEMENT_TYPES = {
    "dataInputAssociation",
    "dataOutputAssociation",
    "property",
}
_STRICT_EXTERNAL_AUXILIARY_REF_TYPES = {
    "dataInputAssociation",
    "dataOutputAssociation",
}
_STRICT_EXTERNAL_AUXILIARY_REF_LOCALS = {
    "sourceRef",
    "targetRef",
}
_SUPPORTED_EXTERNAL_DATASTORE_TYPE = "dataStoreReference"
_INTERNAL_DEDICATED_PLANE_MARKER = "__pm_dedicated_plane"
_TASK_LOCAL_META_FIELDS = {
    "node_path_meta",
    "robot_meta_by_element_id",
    "camunda_extensions_by_element_id",
    "presentation_by_element_id",
    "hybrid_layer_by_element_id",
}


class ClipboardSerializationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = str(code or "clipboard_serialization_error")
        self.message = str(message or "clipboard serialization error")


def _stable_clone(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return None


def _load_xml_root(bpmn_xml: str) -> ET.Element:
    xml_text = str(bpmn_xml or "").strip()
    if not xml_text:
        raise ClipboardSerializationError("empty_bpmn_xml", "BPMN XML is empty")
    try:
        return ET.fromstring(xml_text)
    except Exception as exc:
        raise ClipboardSerializationError("invalid_bpmn_xml", f"invalid BPMN XML: {exc}") from exc


def _extract_task_local_meta(bpmn_meta: Any, element_id: str) -> Dict[str, Any]:
    raw = bpmn_meta if isinstance(bpmn_meta, dict) else {}
    out: Dict[str, Any] = {}
    for field in sorted(_TASK_LOCAL_META_FIELDS):
        value = raw.get(field)
        if not isinstance(value, dict) or element_id not in value:
            continue
        entry = _stable_clone(value.get(element_id))
        if entry is None:
            continue
        out[field] = entry
    return out


def _extract_edge_local_state(bpmn_meta: Any, edge_id: str) -> Dict[str, Any]:
    raw = bpmn_meta if isinstance(bpmn_meta, dict) else {}
    flow_meta = raw.get("flow_meta")
    if not isinstance(flow_meta, dict) or edge_id not in flow_meta:
        return {}
    entry = _stable_clone(flow_meta.get(edge_id))
    return entry if isinstance(entry, dict) else {}


def _extract_session_node(session_obj: Session, element_id: str) -> Optional[Dict[str, Any]]:
    for node in list(getattr(session_obj, "nodes", []) or []):
        if str(getattr(node, "id", "") or "").strip() != element_id:
            continue
        try:
            return copy.deepcopy(node.model_dump())
        except Exception:
            return _stable_clone(getattr(node, "__dict__", {}) or {})
    return None


def _extract_notes_entry(session_obj: Session, element_id: str) -> Any:
    notes_map = getattr(session_obj, "notes_by_element", {})
    if not isinstance(notes_map, dict) or element_id not in notes_map:
        return None
    return _stable_clone(notes_map.get(element_id))


def _node_extra_children(elem: ET.Element) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for child in list(elem):
        lname = local_name(child.tag)
        if lname in {"documentation", "extensionElements", "incoming", "outgoing"}:
            continue
        if str(getattr(child, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}") and lname in _SUPPORTED_SUBTREE_NODE_TYPES:
            continue
        if str(getattr(child, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}") and lname == "sequenceFlow":
            continue
        out.append(serialize_tree(child))
    return out


def _edge_extra_children(elem: ET.Element) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for child in list(elem):
        if local_name(child.tag) == "conditionExpression":
            continue
        out.append(serialize_tree(child))
    return out


def _node_bpmn_attributes(elem: ET.Element) -> Dict[str, Any]:
    from .xml_codec import attr_key

    return {
        attr_key(str(key)): str(value)
        for key, value in dict(elem.attrib).items()
        if str(key or "").strip() != "id"
    }


def _build_context(session_obj: Session, element_id: str, source_org_id: str) -> ClipboardContext:
    return ClipboardContext(
        source_session_id=str(getattr(session_obj, "id", "") or "").strip(),
        source_element_id=str(element_id or "").strip(),
        source_org_id=str(source_org_id or getattr(session_obj, "org_id", "") or "").strip(),
    )


def _tree_payload_ids(payload: Any) -> Set[str]:
    out: Set[str] = set()
    if not isinstance(payload, dict):
        return out
    attrs = payload.get("attributes")
    if isinstance(attrs, dict):
        payload_id = str(attrs.get("id") or "").strip()
        if payload_id:
            out.add(payload_id)
    for child in payload.get("children") if isinstance(payload.get("children"), list) else []:
        out.update(_tree_payload_ids(child))
    return out


def _iter_tree_ref_texts(payload: Any, *, path: Optional[List[str]] = None) -> List[tuple[str, str]]:
    if not isinstance(payload, dict):
        return []
    current_path = list(path or [])
    payload_type = str(payload.get("type") or "").strip()
    if payload_type:
        current_path.append(payload_type)
    out: List[tuple[str, str]] = []
    text_value = str(payload.get("text") or "").strip()
    if payload_type in _STRICT_EXTERNAL_AUXILIARY_REF_LOCALS and text_value:
        out.append((".".join(current_path), text_value))
    for child in payload.get("children") if isinstance(payload.get("children"), list) else []:
        out.extend(_iter_tree_ref_texts(child, path=current_path))
    return out


def _serialize_external_dependency(
    *,
    session_obj: Session,
    elem: ET.Element,
    old_id: str,
    shape_map: Dict[str, Dict[str, Any]],
) -> ClipboardExternalDependency:
    dependency_payload = _serialize_fragment_node(
        session_obj=session_obj,
        elem=elem,
        old_id=old_id,
        parent_old_id="",
        nesting_depth=0,
        shape_map=shape_map,
    )
    return ClipboardExternalDependency.model_validate(dependency_payload.model_dump())


def _collect_supported_external_datastore_dependencies(
    *,
    session_obj: Session,
    xml_root: ET.Element,
    root_payload: ClipboardFragmentNode,
    nodes: List[ClipboardFragmentNode],
    edges: List[ClipboardFragmentEdge],
    node_ids: Set[str],
    shape_map: Dict[str, Dict[str, Any]],
) -> List[ClipboardExternalDependency]:
    allowed_ids: Set[str] = set(node_ids)
    allowed_ids.update(str(edge.old_id or "").strip() for edge in list(edges or []))

    all_extra_children: List[Dict[str, Any]] = []
    for node in [root_payload, *list(nodes or [])]:
        all_extra_children.extend(list(node.extra_children or []))
    for edge in list(edges or []):
        all_extra_children.extend(list(edge.extra_children or []))

    for payload_tree in all_extra_children:
        allowed_ids.update(_tree_payload_ids(payload_tree))

    external_dependencies: Dict[str, ClipboardExternalDependency] = {}
    for payload_tree in all_extra_children:
        if str(payload_tree.get("type") or "").strip() not in _STRICT_EXTERNAL_AUXILIARY_REF_TYPES:
            continue
        for ref_path, ref_value in _iter_tree_ref_texts(payload_tree):
            safe_ref_value = str(ref_value or "").strip()
            if safe_ref_value in allowed_ids:
                continue
            dependency_elem = find_xml_element(xml_root, safe_ref_value)
            dependency_type = local_name(dependency_elem.tag) if dependency_elem is not None else ""
            if dependency_elem is not None and dependency_type == _SUPPORTED_EXTERNAL_DATASTORE_TYPE:
                if safe_ref_value not in external_dependencies:
                    external_dependencies[safe_ref_value] = _serialize_external_dependency(
                        session_obj=session_obj,
                        elem=dependency_elem,
                        old_id=safe_ref_value,
                        shape_map=shape_map,
                    )
                allowed_ids.add(safe_ref_value)
                for child_payload in list(external_dependencies[safe_ref_value].extra_children or []):
                    allowed_ids.update(_tree_payload_ids(child_payload))
                continue
            raise ClipboardSerializationError(
                "external_auxiliary_ref_outside_subtree",
                f"subprocess subtree contains auxiliary ref outside copied boundary: {ref_path} -> {safe_ref_value}",
            )
    return [external_dependencies[old_id] for old_id in sorted(external_dependencies)]


def _build_metadata(copied_by_user_id: str, copied_at: int) -> ClipboardMetadata:
    return ClipboardMetadata(
        copied_by_user_id=str(copied_by_user_id or "").strip(),
        copied_at=int(copied_at or 0),
    )


def _serialize_fragment_node(
    *,
    session_obj: Session,
    elem: ET.Element,
    old_id: str,
    parent_old_id: str,
    nesting_depth: int,
    shape_map: Dict[str, Dict[str, Any]],
) -> ClipboardFragmentNode:
    task_local_state = _extract_task_local_meta(getattr(session_obj, "bpmn_meta", {}), old_id)
    notes_entry = _extract_notes_entry(session_obj, old_id)
    if notes_entry is not None:
        task_local_state["notes_by_element"] = notes_entry
    shape_entry = shape_map.get(old_id) if isinstance(shape_map, dict) else {}
    di_bounds = None
    if isinstance(shape_entry, dict) and {"x", "y", "width", "height"} <= set(shape_entry.keys()):
        from .models import ClipboardDiBounds

        di_bounds = ClipboardDiBounds(
            x=float(shape_entry.get("x", 0.0) or 0.0),
            y=float(shape_entry.get("y", 0.0) or 0.0),
            width=float(shape_entry.get("width", 0.0) or 0.0),
            height=float(shape_entry.get("height", 0.0) or 0.0),
        )
    return ClipboardFragmentNode(
        old_id=old_id,
        parent_old_id=str(parent_old_id or ""),
        nesting_depth=int(nesting_depth or 0),
        element_type=local_name(elem.tag),
        name=str(elem.attrib.get("name") or "").strip(),
        documentation=extract_documentation(elem),
        bpmn_attributes=_node_bpmn_attributes(elem),
        extension_elements=serialize_extension_elements(elem),
        session_node=_extract_session_node(session_obj, old_id),
        task_local_state=task_local_state,
        extra_children=_node_extra_children(elem),
        di_bounds=di_bounds,
        di_shape_attributes=(
            dict(shape_entry.get("shape_attributes") or {})
            if isinstance(shape_entry, dict) and isinstance(shape_entry.get("shape_attributes"), dict)
            else {}
        ),
    )


def _serialize_fragment_edge(
    *,
    session_obj: Session,
    elem: ET.Element,
    old_id: str,
    parent_old_id: str,
    edge_map: Dict[str, Dict[str, Any]],
) -> ClipboardFragmentEdge:
    from .models import ClipboardDiWaypoint

    edge_entry = edge_map.get(old_id) if isinstance(edge_map, dict) else {}
    waypoints = []
    for point in edge_entry.get("waypoints") if isinstance(edge_entry, dict) and isinstance(edge_entry.get("waypoints"), list) else []:
        if not isinstance(point, dict):
            continue
        waypoints.append(
            ClipboardDiWaypoint(
                x=float(point.get("x", 0.0) or 0.0),
                y=float(point.get("y", 0.0) or 0.0),
            )
        )
    condition_expression = ""
    for child in list(elem):
        if local_name(child.tag) == "conditionExpression":
            condition_expression = str("".join(child.itertext()) or "").strip()
            break
    from .xml_codec import attr_key

    return ClipboardFragmentEdge(
        old_id=old_id,
        parent_old_id=str(parent_old_id or ""),
        source_old_id=str(elem.attrib.get("sourceRef") or "").strip(),
        target_old_id=str(elem.attrib.get("targetRef") or "").strip(),
        name=str(elem.attrib.get("name") or "").strip(),
        bpmn_attributes={
            attr_key(str(key)): str(value)
            for key, value in dict(elem.attrib).items()
            if str(key or "").strip() not in {"id", "sourceRef", "targetRef"}
        },
        condition_expression=condition_expression,
        edge_local_state=_extract_edge_local_state(getattr(session_obj, "bpmn_meta", {}), old_id),
        extra_children=_edge_extra_children(elem),
        di_waypoints=waypoints,
        di_edge_attributes=(
            dict(edge_entry.get("edge_attributes") or {})
            if isinstance(edge_entry, dict) and isinstance(edge_entry.get("edge_attributes"), dict)
            else {}
        ),
    )


def _serialize_task_payload(
    *,
    session_obj: Session,
    elem: ET.Element,
    element_id: str,
    copied_by_user_id: str,
    copied_at: int,
    source_org_id: str,
) -> ClipboardTaskPayload:
    safe_element_id = str(element_id or "").strip()
    if local_name(elem.tag) not in _SUPPORTED_TASK_TYPES:
        raise ClipboardSerializationError(
            "unsupported_element_type",
            "only single task-like BPMN elements are supported in clipboard v1",
        )
    task_local_state = _extract_task_local_meta(getattr(session_obj, "bpmn_meta", {}), safe_element_id)
    notes_entry = _extract_notes_entry(session_obj, safe_element_id)
    if notes_entry is not None:
        task_local_state["notes_by_element"] = notes_entry
    return ClipboardTaskPayload(
        context=_build_context(session_obj, safe_element_id, source_org_id),
        metadata=_build_metadata(copied_by_user_id, copied_at),
        element=ClipboardTaskElement(
            element_type=local_name(elem.tag),
            name=str(elem.attrib.get("name") or "").strip(),
            documentation=extract_documentation(elem),
            bpmn_attributes=_node_bpmn_attributes(elem),
            extension_elements=serialize_extension_elements(elem),
            session_node=_extract_session_node(session_obj, safe_element_id),
            task_local_state=task_local_state,
            extra_children=_node_extra_children(elem),
        ),
    )


def _serialize_subprocess_payload(
    *,
    session_obj: Session,
    root_elem: ET.Element,
    element_id: str,
    copied_by_user_id: str,
    copied_at: int,
    source_org_id: str,
) -> ClipboardSubprocessPayload:
    if local_name(root_elem.tag) not in _SUPPORTED_SUBPROCESS_ROOT_TYPES:
        raise ClipboardSerializationError("unsupported_element_type", "clipboard v2 supports only subprocess subtree root")
    xml_root = _load_xml_root(str(getattr(session_obj, "bpmn_xml", "") or ""))
    root_old_id = str(element_id or "").strip()
    if not root_old_id:
        raise ClipboardSerializationError("validation_error", "element_id is required")
    main_shape_map, main_edge_map, _plane = collect_di_maps(xml_root)
    shape_map = dict(main_shape_map or {})
    edge_map = dict(main_edge_map or {})
    root_shape_entry = main_shape_map.get(root_old_id) if isinstance(main_shape_map, dict) else {}
    root_shape_attrs = dict(root_shape_entry.get("shape_attributes") or {}) if isinstance(root_shape_entry, dict) else {}
    root_is_collapsed = str(root_shape_attrs.get("isExpanded") or "").strip().lower() == "false"
    plane_shape_map, plane_edge_map, _subprocess_plane = collect_di_maps_for_bpmn_element(xml_root, root_old_id)
    plane_has_subtree_di = any(str(node_id or "").strip() != root_old_id for node_id in dict(plane_shape_map or {})) or bool(plane_edge_map)
    if root_is_collapsed or plane_has_subtree_di:
        for node_id, entry in dict(plane_shape_map or {}).items():
            if str(node_id or "").strip() == root_old_id:
                continue
            shape_map[str(node_id)] = entry
        edge_map.update(dict(plane_edge_map or {}))
        if plane_has_subtree_di and not root_is_collapsed:
            root_shape_attrs[_INTERNAL_DEDICATED_PLANE_MARKER] = "true"
            if isinstance(root_shape_entry, dict):
                root_shape_entry["shape_attributes"] = dict(root_shape_attrs)
                shape_map[root_old_id] = root_shape_entry

    node_ids: Set[str] = set()
    parent_by_id: Dict[str, str] = {}
    depth_by_id: Dict[str, int] = {}
    elem_by_id: Dict[str, ET.Element] = {}

    def walk(node: ET.Element, *, parent_old_id: str, depth: int) -> None:
        node_id = str(node.attrib.get("id") or "").strip()
        lname = local_name(node.tag)
        if (
            str(getattr(node, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}")
            and node_id
            and lname not in _SUPPORTED_SUBTREE_NODE_TYPES
            and lname not in _SUPPORTED_AUXILIARY_SUBTREE_ELEMENT_TYPES
            and lname != "sequenceFlow"
        ):
            raise ClipboardSerializationError(
                "unsupported_subprocess_topology",
                f"subprocess subtree contains unsupported BPMN node type: {lname}",
            )
        if node_id and lname in _SUPPORTED_SUBTREE_NODE_TYPES:
            node_ids.add(node_id)
            parent_by_id[node_id] = str(parent_old_id or "")
            depth_by_id[node_id] = int(depth or 0)
            elem_by_id[node_id] = node
            next_parent = node_id
            next_depth = depth + 1
        else:
            next_parent = parent_old_id
            next_depth = depth
        for child in list(node):
            if str(getattr(child, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}") and local_name(child.tag) == "sequenceFlow":
                continue
            walk(child, parent_old_id=next_parent, depth=next_depth)

    walk(root_elem, parent_old_id="", depth=0)
    if root_old_id not in node_ids:
        raise ClipboardSerializationError("unsupported_subprocess_topology", "subprocess root was not captured")

    nodes: List[ClipboardFragmentNode] = []
    root_payload: Optional[ClipboardFragmentNode] = None
    for node_id in sorted(node_ids):
        fragment_node = _serialize_fragment_node(
            session_obj=session_obj,
            elem=elem_by_id[node_id],
            old_id=node_id,
            parent_old_id=parent_by_id.get(node_id, ""),
            nesting_depth=depth_by_id.get(node_id, 0),
            shape_map=shape_map,
        )
        if node_id == root_old_id:
            root_payload = fragment_node
        else:
            nodes.append(fragment_node)

    if root_payload is None:
        raise ClipboardSerializationError("unsupported_subprocess_topology", "subprocess root payload missing")

    edges: List[ClipboardFragmentEdge] = []

    def walk_edges(container: ET.Element, *, parent_old_id: str) -> None:
        container_id = str(container.attrib.get("id") or "").strip() or parent_old_id
        for child in list(container):
            lname = local_name(child.tag)
            if str(getattr(child, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}") and lname == "sequenceFlow":
                old_id = str(child.attrib.get("id") or "").strip()
                src = str(child.attrib.get("sourceRef") or "").strip()
                dst = str(child.attrib.get("targetRef") or "").strip()
                if not old_id or src not in node_ids or dst not in node_ids:
                    raise ClipboardSerializationError(
                        "unsupported_subprocess_topology",
                        "subprocess subtree contains sequenceFlow refs outside supported subtree",
                    )
                edges.append(
                    _serialize_fragment_edge(
                        session_obj=session_obj,
                        elem=child,
                        old_id=old_id,
                        parent_old_id=container_id,
                        edge_map=edge_map,
                    )
                )
                continue
            if str(getattr(child, "tag", "") or "").startswith(f"{{{_BPMN_NS}}}") and local_name(child.tag) == "subProcess":
                walk_edges(child, parent_old_id=str(child.attrib.get("id") or "").strip())

    walk_edges(root_elem, parent_old_id=root_old_id)

    external_dependencies = _collect_supported_external_datastore_dependencies(
        session_obj=session_obj,
        xml_root=xml_root,
        root_payload=root_payload,
        nodes=nodes,
        edges=edges,
        node_ids=node_ids,
        shape_map=shape_map,
    )

    return ClipboardSubprocessPayload(
        context=_build_context(session_obj, root_old_id, source_org_id),
        metadata=_build_metadata(copied_by_user_id, copied_at),
        root=root_payload,
        fragment=ClipboardFragment(nodes=nodes, edges=edges),
        external_dependencies=external_dependencies,
    )


def serialize_clipboard_payload(
    *,
    session_obj: Session,
    element_id: str,
    copied_by_user_id: str,
    copied_at: int,
    source_org_id: str = "",
) -> ClipboardPayload:
    safe_element_id = str(element_id or "").strip()
    if not safe_element_id:
        raise ClipboardSerializationError("validation_error", "element_id is required")
    xml_root = _load_xml_root(str(getattr(session_obj, "bpmn_xml", "") or ""))
    elem = find_xml_element(xml_root, safe_element_id)
    if elem is None:
        raise ClipboardSerializationError("element_not_found", "element not found in BPMN XML")
    lname = local_name(elem.tag)
    if lname in _SUPPORTED_TASK_TYPES:
        return _serialize_task_payload(
            session_obj=session_obj,
            elem=elem,
            element_id=safe_element_id,
            copied_by_user_id=copied_by_user_id,
            copied_at=copied_at,
            source_org_id=source_org_id,
        )
    if lname in _SUPPORTED_SUBPROCESS_ROOT_TYPES:
        return _serialize_subprocess_payload(
            session_obj=session_obj,
            root_elem=elem,
            element_id=safe_element_id,
            copied_by_user_id=copied_by_user_id,
            copied_at=copied_at,
            source_org_id=source_org_id,
        )
    raise ClipboardSerializationError(
        "unsupported_element_type",
        "clipboard supports task-like BPMN elements and subprocess subtree roots only",
    )


def serialize_task_clipboard_payload(
    *,
    session_obj: Session,
    element_id: str,
    copied_by_user_id: str,
    copied_at: int,
    source_org_id: str = "",
) -> ClipboardTaskPayload:
    payload = serialize_clipboard_payload(
        session_obj=session_obj,
        element_id=element_id,
        copied_by_user_id=copied_by_user_id,
        copied_at=copied_at,
        source_org_id=source_org_id,
    )
    if not isinstance(payload, ClipboardTaskPayload):
        raise ClipboardSerializationError("unsupported_element_type", "selected element is not a task-like BPMN element")
    return payload
