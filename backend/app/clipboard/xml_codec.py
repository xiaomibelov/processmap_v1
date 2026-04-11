from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from typing import Any, Dict, Iterable, List, Optional, Tuple

_BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
_BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
_DC_NS = "http://www.omg.org/spec/DD/20100524/DC"
_DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
_TREE_TEXT_ID_REF_LOCALS = {
    "attachedToRef",
    "bpmnElement",
    "calledElement",
    "dataObjectRef",
    "dataStoreRef",
    "default",
    "errorRef",
    "escalationRef",
    "eventDefinitionRef",
    "flowNodeRef",
    "inputDataRef",
    "itemSubjectRef",
    "messageRef",
    "operationRef",
    "outputDataRef",
    "processRef",
    "signalRef",
    "sourceRef",
    "targetRef",
}


def split_tag(tag: Any) -> Tuple[str, str]:
    text = str(tag or "")
    if text.startswith("{") and "}" in text:
        ns, local = text[1:].split("}", 1)
        return ns, local
    return "", text


def local_name(tag: Any) -> str:
    return str(split_tag(tag)[1] or "")


def attr_key(key: str) -> str:
    ns, local = split_tag(key)
    if not ns:
        return local
    return f"{ns}::{local}"


def attr_name_from_key(key: str) -> str:
    src = str(key or "").strip()
    if "::" not in src:
        return src
    ns, local = src.split("::", 1)
    return f"{{{ns}}}{local}"


def stable_json(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return None


def iter_local(root: ET.Element, local: str) -> Iterable[ET.Element]:
    q = str(local or "").strip().lower()
    for elem in root.iter():
        if local_name(elem.tag).lower() == q:
            yield elem


def find_xml_element(root: ET.Element, element_id: str) -> Optional[ET.Element]:
    safe_id = str(element_id or "").strip()
    if not safe_id:
        return None
    for elem in root.iter():
        if str(elem.attrib.get("id") or "").strip() == safe_id:
            return elem
    return None


def serialize_tree(elem: ET.Element) -> Dict[str, Any]:
    ns, local = split_tag(elem.tag)
    return {
        "namespace": ns,
        "type": local,
        "attributes": {attr_key(str(key)): str(value) for key, value in dict(elem.attrib).items()},
        "text": str("".join(elem.itertext()) or "").strip() if len(list(elem)) == 0 else str(elem.text or "").strip(),
        "children": [serialize_tree(child) for child in list(elem)],
    }


def _should_remap_tree_text(local: str) -> bool:
    name = str(local or "").strip()
    return bool(name) and (name in _TREE_TEXT_ID_REF_LOCALS or name.endswith("Ref"))


def build_tree(payload: Dict[str, Any], *, id_map: Optional[Dict[str, str]] = None) -> ET.Element:
    ns = str(payload.get("namespace") or "").strip()
    local = str(payload.get("type") or "").strip()
    tag = f"{{{ns}}}{local}" if ns else local
    elem = ET.Element(tag)
    attrs = payload.get("attributes")
    if isinstance(attrs, dict):
        for key, value in attrs.items():
            name = attr_name_from_key(str(key))
            text = str(value)
            if isinstance(id_map, dict) and text:
                text = str(id_map.get(text, text))
            elem.attrib[name] = text
    text = payload.get("text")
    if text not in (None, ""):
        text_value = str(text)
        if isinstance(id_map, dict) and text_value and _should_remap_tree_text(local):
            text_value = str(id_map.get(text_value, text_value))
        elem.text = text_value
    for child_payload in payload.get("children") if isinstance(payload.get("children"), list) else []:
        if not isinstance(child_payload, dict):
            continue
        elem.append(build_tree(child_payload, id_map=id_map))
    return elem


def extract_documentation(elem: ET.Element) -> str:
    for child in list(elem):
        ns, local = split_tag(child.tag)
        if ns == _BPMN_NS and local == "documentation":
            return str("".join(child.itertext()) or "").strip()
    return ""


def serialize_extension_elements(elem: ET.Element) -> Dict[str, Any]:
    extension_root: Optional[ET.Element] = None
    for child in list(elem):
        if local_name(child.tag) == "extensionElements":
            extension_root = child
            break
    if extension_root is None:
        return {}
    items = [serialize_tree(child) for child in list(extension_root)]
    camunda_properties: Dict[str, str] = {}
    for child in extension_root.iter():
        if child is extension_root:
            continue
        if local_name(child.tag) != "property":
            continue
        name = str(child.attrib.get("name") or "").strip()
        value = str(child.attrib.get("value") or "").strip()
        if name:
            camunda_properties[name] = value
    out: Dict[str, Any] = {}
    if items:
        out["items"] = items
    if camunda_properties:
        out["camunda_properties"] = camunda_properties
    return out


def build_extension_elements(payload: Dict[str, Any]) -> Optional[ET.Element]:
    if not isinstance(payload, dict):
        return None
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        return None
    ext = ET.Element(f"{{{_BPMN_NS}}}extensionElements")
    for item in items:
        if not isinstance(item, dict):
            continue
        ext.append(build_tree(item))
    return ext if len(list(ext)) > 0 else None


def find_bpmn_plane(root: ET.Element, *, bpmn_element_id: str = "") -> Optional[ET.Element]:
    safe_bpmn_element_id = str(bpmn_element_id or "").strip()
    for plane in iter_local(root, "BPMNPlane"):
        if safe_bpmn_element_id and str(plane.attrib.get("bpmnElement") or "").strip() != safe_bpmn_element_id:
            continue
        return plane
    return None


def collect_plane_di_maps(plane: Optional[ET.Element]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]], Optional[ET.Element]]:
    shape_map: Dict[str, Dict[str, Any]] = {}
    edge_map: Dict[str, Dict[str, Any]] = {}
    if plane is None:
        return shape_map, edge_map, None
    for child in list(plane):
        lname = local_name(child.tag)
        bpmn_element = str(child.attrib.get("bpmnElement") or "").strip()
        if not bpmn_element:
            continue
        if lname == "BPMNShape":
            bounds = next(iter_local(child, "Bounds"), None)
            if bounds is None:
                continue
            try:
                shape_map[bpmn_element] = {
                    "shape_attributes": {
                        key: str(value)
                        for key, value in dict(child.attrib).items()
                        if str(key or "").strip() not in {"id", "bpmnElement"}
                    },
                    "x": float(bounds.attrib.get("x", "0") or 0),
                    "y": float(bounds.attrib.get("y", "0") or 0),
                    "width": float(bounds.attrib.get("width", "0") or 0),
                    "height": float(bounds.attrib.get("height", "0") or 0),
                }
            except Exception:
                continue
        elif lname == "BPMNEdge":
            waypoints = []
            for point in iter_local(child, "waypoint"):
                try:
                    waypoints.append(
                        {
                            "x": float(point.attrib.get("x", "0") or 0),
                            "y": float(point.attrib.get("y", "0") or 0),
                        }
                    )
                except Exception:
                    continue
            edge_map[bpmn_element] = {
                "edge_attributes": {
                    key: str(value)
                    for key, value in dict(child.attrib).items()
                    if str(key or "").strip() not in {"id", "bpmnElement"}
                },
                "waypoints": waypoints,
            }
    return shape_map, edge_map, plane


def collect_di_maps(root: ET.Element) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]], Optional[ET.Element]]:
    return collect_plane_di_maps(find_bpmn_plane(root))


def collect_di_maps_for_bpmn_element(root: ET.Element, bpmn_element_id: str) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]], Optional[ET.Element]]:
    return collect_plane_di_maps(find_bpmn_plane(root, bpmn_element_id=bpmn_element_id))


__all__ = [
    "_BPMN_NS",
    "_BPMNDI_NS",
    "_DC_NS",
    "_DI_NS",
    "attr_key",
    "attr_name_from_key",
    "build_extension_elements",
    "build_tree",
    "collect_di_maps_for_bpmn_element",
    "collect_di_maps",
    "collect_plane_di_maps",
    "extract_documentation",
    "find_xml_element",
    "find_bpmn_plane",
    "iter_local",
    "local_name",
    "serialize_extension_elements",
    "serialize_tree",
    "split_tag",
    "stable_json",
]
