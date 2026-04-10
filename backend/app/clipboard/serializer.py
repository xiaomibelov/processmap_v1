from __future__ import annotations

import copy
import json
import xml.etree.ElementTree as ET
from typing import Any, Dict, Optional, Set, Tuple

from ..models import Session
from .models import (
    ClipboardTaskContext,
    ClipboardTaskElement,
    ClipboardTaskMetadata,
    ClipboardTaskPayload,
)

_BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
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


def _split_tag(tag: Any) -> Tuple[str, str]:
    text = str(tag or "")
    if text.startswith("{") and "}" in text:
        ns, local = text[1:].split("}", 1)
        return ns, local
    return "", text


def _attr_key(key: str) -> str:
    ns, local = _split_tag(key)
    if not ns:
        return local
    return f"{ns}::{local}"


def _stable_json(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return None


def _extract_documentation(elem: ET.Element) -> str:
    for child in list(elem):
        ns, local = _split_tag(child.tag)
        if ns == _BPMN_NS and local == "documentation":
            return str("".join(child.itertext()) or "").strip()
    return ""


def _extract_extension_elements(elem: ET.Element) -> Dict[str, Any]:
    extension_root: Optional[ET.Element] = None
    for child in list(elem):
        _, local = _split_tag(child.tag)
        if local == "extensionElements":
            extension_root = child
            break
    if extension_root is None:
        return {}

    camunda_properties: Dict[str, str] = {}
    raw_entries = []
    for child in extension_root.iter():
        if child is extension_root:
            continue
        ns, local = _split_tag(child.tag)
        attrs = {_attr_key(str(key)): str(value) for key, value in dict(child.attrib).items()}
        if local == "property":
            name = str(child.attrib.get("name") or attrs.get("name") or "").strip()
            value = str(child.attrib.get("value") or attrs.get("value") or "").strip()
            if name:
                camunda_properties[name] = value
        raw_entries.append(
            {
                "type": local,
                "namespace": ns,
                "attributes": attrs,
                "text": str("".join(child.itertext()) or "").strip(),
            }
        )
    out: Dict[str, Any] = {}
    if camunda_properties:
        out["camunda_properties"] = camunda_properties
    if raw_entries:
        out["raw"] = raw_entries
    return out


def _extract_task_local_meta(bpmn_meta: Any, element_id: str) -> Dict[str, Any]:
    raw = bpmn_meta if isinstance(bpmn_meta, dict) else {}
    out: Dict[str, Any] = {}
    for field in sorted(_TASK_LOCAL_META_FIELDS):
        value = raw.get(field)
        if not isinstance(value, dict):
            continue
        if element_id not in value:
            continue
        entry = _stable_json(value.get(element_id))
        if entry is None:
            continue
        out[field] = entry
    return out


def _extract_session_node(session_obj: Session, element_id: str) -> Optional[Dict[str, Any]]:
    for node in list(getattr(session_obj, "nodes", []) or []):
        if str(getattr(node, "id", "") or "").strip() != element_id:
            continue
        try:
            return copy.deepcopy(node.model_dump())
        except Exception:
            return _stable_json(getattr(node, "__dict__", {}) or {})
    return None


def _find_xml_element(bpmn_xml: str, element_id: str) -> ET.Element:
    xml_text = str(bpmn_xml or "").strip()
    if not xml_text:
        raise ClipboardSerializationError("empty_bpmn_xml", "BPMN XML is empty")
    try:
        root = ET.fromstring(xml_text)
    except Exception as exc:
        raise ClipboardSerializationError("invalid_bpmn_xml", f"invalid BPMN XML: {exc}") from exc
    for elem in root.iter():
        if str(elem.attrib.get("id") or "").strip() == element_id:
            return elem
    raise ClipboardSerializationError("element_not_found", "element not found in BPMN XML")


def _validate_supported_type(elem: ET.Element) -> str:
    ns, local = _split_tag(elem.tag)
    if ns != _BPMN_NS or local not in _SUPPORTED_TASK_TYPES:
        raise ClipboardSerializationError(
            "unsupported_element_type",
            "only single task-like BPMN elements are supported in clipboard v1",
        )
    return local


def serialize_task_clipboard_payload(
    *,
    session_obj: Session,
    element_id: str,
    copied_by_user_id: str,
    copied_at: int,
    source_org_id: str = "",
) -> ClipboardTaskPayload:
    safe_element_id = str(element_id or "").strip()
    if not safe_element_id:
        raise ClipboardSerializationError("validation_error", "element_id is required")

    elem = _find_xml_element(str(getattr(session_obj, "bpmn_xml", "") or ""), safe_element_id)
    element_type = _validate_supported_type(elem)
    documentation = _extract_documentation(elem)
    bpmn_attributes = {
        _attr_key(str(key)): str(value)
        for key, value in dict(elem.attrib).items()
        if str(key or "").strip() != "id"
    }
    name = str(elem.attrib.get("name") or "").strip()

    notes_map = getattr(session_obj, "notes_by_element", {})
    notes_entry = None
    if isinstance(notes_map, dict) and safe_element_id in notes_map:
        notes_entry = _stable_json(notes_map.get(safe_element_id))

    task_local_state = _extract_task_local_meta(getattr(session_obj, "bpmn_meta", {}), safe_element_id)
    if notes_entry is not None:
        task_local_state["notes_by_element"] = notes_entry

    payload = ClipboardTaskPayload(
        context=ClipboardTaskContext(
            source_session_id=str(getattr(session_obj, "id", "") or "").strip(),
            source_element_id=safe_element_id,
            source_org_id=str(source_org_id or getattr(session_obj, "org_id", "") or "").strip(),
        ),
        metadata=ClipboardTaskMetadata(
            copied_by_user_id=str(copied_by_user_id or "").strip(),
            copied_at=int(copied_at or 0),
        ),
        element=ClipboardTaskElement(
            element_type=element_type,
            name=name,
            documentation=documentation,
            bpmn_attributes=bpmn_attributes,
            extension_elements=_extract_extension_elements(elem),
            session_node=_extract_session_node(session_obj, safe_element_id),
            task_local_state=task_local_state,
        ),
    )
    return payload
