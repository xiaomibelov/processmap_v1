from __future__ import annotations

import hashlib
import re
import uuid
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional


def deduplicate_camunda_extension_properties(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Preserve all Camunda extension property rows, including duplicate names.

    Previously this helper collapsed duplicate property names to a single value.
    The importer now stores every ``camunda:property`` row as an array entry so
    that multiple values for the same name (e.g. ``container_tara=дежа`` and
    ``container_tara=бункер``) are retained. This function is kept as a
    pass-through for backward compatibility with callers that expect normalized
    meta.
    """
    if not isinstance(meta, dict):
        return meta
    return meta


_CAMUNDA_NS = "http://camunda.org/schema/1.0/bpmn"
_ZEEBE_NS = "http://camunda.org/schema/zeebe/1.0"
_PM_NS = "http://processmap.ai/schema/bpmn/1.0"

_ETREE_NAMESPACE_PREFIXES = {
    _CAMUNDA_NS: "camunda",
    _ZEEBE_NS: "zeebe",
    _PM_NS: "pm",
    "http://www.omg.org/spec/BPMN/20100524/MODEL": "bpmn",
    "http://www.w3.org/2001/XMLSchema-instance": "xsi",
}


def _register_xml_prefixes() -> None:
    for uri, prefix in _ETREE_NAMESPACE_PREFIXES.items():
        try:
            ET.register_namespace(prefix, uri)
        except Exception:
            pass


_register_xml_prefixes()


def _local_name(tag: str) -> str:
    if tag.startswith("{") and "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _namespace_uri(tag: str) -> str:
    if tag.startswith("{") and "}" in tag:
        return tag[1:].split("}", 1)[0]
    return ""


def _is_managed_properties_node(child: ET.Element) -> bool:
    ns = _namespace_uri(child.tag)
    local = _local_name(child.tag)
    if local.lower() != "properties":
        return False
    return ns in {_CAMUNDA_NS, _ZEEBE_NS}


def _parse_property_id(name: Any = "", value: Any = "", ordinal: int = 0) -> str:
    # Deterministic id derived from position + exact row value so equal
    # camunda:property rows can survive import without sharing editor ids.
    digest = hashlib.sha256(f"{ordinal}\x00{name}\x00{value}".encode("utf-8")).hexdigest()
    return f"prop_{digest[:8]}"


def _parse_listener_id() -> str:
    return f"listener_{uuid.uuid4().hex[:8]}"


def _normalize_property_name(value: Any) -> str:
    return str(value) if value is not None else ""


def _normalize_property_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _parse_extension_properties(properties_node: ET.Element, expected_ns: str) -> Optional[List[Dict[str, Any]]]:
    """Parse a <camunda:properties> or <zeebe:properties> block.

    Returns a list of normalized property rows only if every child is a plain
    property element in the expected namespace. Otherwise returns None so the
    block is treated as preserved raw XML.
    """
    rows: List[Dict[str, Any]] = []
    for child in properties_node:
        if not isinstance(child.tag, str):
            continue
        if _namespace_uri(child.tag) != expected_ns:
            return None
        if _local_name(child.tag).lower() != "property":
            return None
        name = _normalize_property_name(child.get("name"))
        if not name.strip():
            continue
        value = _normalize_property_value(child.get("value"))
        rows.append({
            "id": _parse_property_id(name, value, len(rows)),
            "name": name,
            "value": value,
        })
    return rows


def _parse_execution_listener(listener_node: ET.Element) -> Optional[Dict[str, Any]]:
    """Parse a <camunda:executionListener> element.

    Returns a normalized listener row if exactly one of class/expression/
    delegateExpression is present, the event is known, and the node has no
    element children. Otherwise returns None.
    """
    event = str(listener_node.get("event") or "").strip()
    if event not in {"start", "end"}:
        return None

    candidates = []
    for attr, typ in (("class", "class"), ("expression", "expression"), ("delegateExpression", "delegateExpression")):
        val = str(listener_node.get(attr) or "").strip()
        if val:
            candidates.append((typ, val))
    if len(candidates) != 1:
        return None

    for child in listener_node:
        if isinstance(child.tag, str):
            return None

    typ, val = candidates[0]
    return {
        "id": _parse_listener_id(),
        "event": event,
        "type": typ,
        "value": val,
    }


def _serialize_child_to_preserved_raw(child: ET.Element) -> Optional[str]:
    """Serialize a child extension element to a raw XML fragment.

    Uses registered namespace prefixes so common namespaces appear with their
    canonical prefixes rather than generated ``ns0``.
    """
    try:
        raw = ET.tostring(child, encoding="unicode")
        return raw.strip() or None
    except Exception:
        return None


def _has_element_children(node: ET.Element) -> bool:
    for child in node:
        if isinstance(child.tag, str):
            return True
    return False


def _execution_platform_preference(root: ET.Element) -> str:
    """Return "cloud" | "platform" | "" based on the definitions executionPlatform.

    Camunda Modeler writes e.g. ``ns1:executionPlatform="Camunda Cloud"`` (C8 /
    Zeebe) or ``"Camunda Platform"`` (C7). The attribute may live in any
    namespace, so it is matched by local name.
    """
    try:
        attrib = root.attrib or {}
    except Exception:
        return ""
    for attr_name, attr_value in attrib.items():
        if _local_name(str(attr_name)).lower() != "executionplatform":
            continue
        value = str(attr_value or "").strip().lower()
        if "cloud" in value or "zeebe" in value:
            return "cloud"
        if "platform" in value:
            return "platform"
    return ""


def _active_properties_namespace(
    extension_elements_node: ET.Element,
    platform_preference: str,
) -> Optional[str]:
    """Choose which properties namespace is authoritative for one element.

    Camunda Cloud exports may carry two parallel blocks: ``zeebe:properties``
    (live, written by the modeler) and legacy ``camunda:properties`` (C7, often
    stale). When both exist, exactly one namespace wins:

    - platform_preference == "platform" -> camunda: wins (legacy C7 files);
    - otherwise ("cloud" or no marker) -> zeebe: wins.

    Returns None when the element has no properties blocks at all.
    """
    has_zeebe = False
    has_camunda = False
    for child in extension_elements_node:
        if not isinstance(child.tag, str):
            continue
        if _local_name(child.tag).lower() != "properties":
            continue
        ns = _namespace_uri(child.tag)
        if ns == _ZEEBE_NS:
            has_zeebe = True
        elif ns == _CAMUNDA_NS:
            has_camunda = True
    if platform_preference == "platform":
        if has_camunda:
            return _CAMUNDA_NS
        if has_zeebe:
            return _ZEEBE_NS
        return None
    if has_zeebe:
        return _ZEEBE_NS
    if has_camunda:
        return _CAMUNDA_NS
    return None


def extract_camunda_extensions_from_bpmn_xml(xml_text: str) -> Dict[str, Any]:
    """Derive the normalized Camunda extension state map from BPMN XML.

    Walks every element with an ``<extensionElements>`` child, extracts managed
    ``camunda:properties`` / ``zeebe:properties`` blocks and
    ``camunda:executionListener`` elements, skips ``pm:RobotMeta`` elements,
    and preserves all other extension children as raw XML fragments.

    The returned shape matches the frontend ``camundaExtensionsByElementId``
    normalized state::

        {
            "elementId": {
                "properties": {
                    "extensionProperties": [{id, name, value}, ...],
                    "extensionListeners": [{id, event, type, value}, ...],
                },
                "preservedExtensionElements": ["<raw-xml/>", ...],
            }
        }
    """
    raw = str(xml_text or "").strip()
    if not raw:
        return {}
    try:
        root = ET.fromstring(raw.encode("utf-8"))
    except Exception:
        return {}

    platform_preference = _execution_platform_preference(root)

    result: Dict[str, Any] = {}
    for element in root.iter():
        element_id = str(element.get("id") or "").strip()
        if not element_id:
            continue

        extension_elements_node: Optional[ET.Element] = None
        for child in element:
            if not isinstance(child.tag, str):
                continue
            if _local_name(child.tag).lower() == "extensionelements":
                extension_elements_node = child
                break
        if extension_elements_node is None or not _has_element_children(extension_elements_node):
            continue

        active_props_ns = _active_properties_namespace(extension_elements_node, platform_preference)

        managed_properties: List[Dict[str, Any]] = []
        managed_listeners: List[Dict[str, Any]] = []
        preserved_raw: List[str] = []

        for child in extension_elements_node:
            if not isinstance(child.tag, str):
                continue
            ns = _namespace_uri(child.tag)
            local = _local_name(child.tag).lower()

            if ns == _PM_NS and local == "robotmeta":
                continue

            if _is_managed_properties_node(child):
                if active_props_ns is not None and ns != active_props_ns:
                    # Shadowed legacy namespace (see _active_properties_namespace):
                    # not read as managed properties, but kept as a preserved raw
                    # fragment so the user's data survives projection round-trips.
                    raw_fragment = _serialize_child_to_preserved_raw(child)
                    if raw_fragment:
                        preserved_raw.append(raw_fragment)
                    continue
                parsed = _parse_extension_properties(child, ns)
                if parsed is not None:
                    managed_properties.extend(parsed)
                    continue

            if ns == _CAMUNDA_NS and local == "executionlistener":
                parsed = _parse_execution_listener(child)
                if parsed is not None:
                    managed_listeners.append(parsed)
                    continue

            raw_fragment = _serialize_child_to_preserved_raw(child)
            if raw_fragment:
                preserved_raw.append(raw_fragment)

        if not managed_properties and not managed_listeners and not preserved_raw:
            continue

        # Deduplicate raw fragments by exact string; order is preserved.
        seen_raw: set = set()
        unique_raw: List[str] = []
        for fragment in preserved_raw:
            if fragment in seen_raw:
                continue
            seen_raw.add(fragment)
            unique_raw.append(fragment)

        result[element_id] = {
            "properties": {
                "extensionProperties": managed_properties,
                "extensionListeners": managed_listeners,
            },
            "preservedExtensionElements": unique_raw,
        }
    return result


def detect_camunda_namespace_divergence(xml_text: str) -> List[Dict[str, Any]]:
    """Return elements whose camunda: and zeebe: properties blocks diverge.

    For every element that carries BOTH a ``camunda:properties`` and a
    ``zeebe:properties`` block (and both blocks are cleanly parseable), the
    property multisets are compared. Diverging elements are reported as::

        [{"element_id": ..., "camunda_only": [{"name", "value"}], "zeebe_only": [...]}]

    ``camunda_only`` rows are stale legacy values that the parser now ignores
    in favour of ``zeebe:`` (unless executionPlatform says otherwise).
    """
    raw = str(xml_text or "").strip()
    if not raw:
        return []
    try:
        root = ET.fromstring(raw.encode("utf-8"))
    except Exception:
        return []

    diverged: List[Dict[str, Any]] = []
    for element in root.iter():
        element_id = str(element.get("id") or "").strip()
        if not element_id:
            continue
        extension_elements_node: Optional[ET.Element] = None
        for child in element:
            if not isinstance(child.tag, str):
                continue
            if _local_name(child.tag).lower() == "extensionelements":
                extension_elements_node = child
                break
        if extension_elements_node is None:
            continue

        camunda_rows: List[Dict[str, Any]] = []
        zeebe_rows: List[Dict[str, Any]] = []
        for child in extension_elements_node:
            if not isinstance(child.tag, str):
                continue
            ns = _namespace_uri(child.tag)
            if ns not in {_CAMUNDA_NS, _ZEEBE_NS}:
                continue
            if _local_name(child.tag).lower() != "properties":
                continue
            parsed = _parse_extension_properties(child, ns)
            if parsed is None:
                continue
            if ns == _CAMUNDA_NS:
                camunda_rows.extend(parsed)
            else:
                zeebe_rows.extend(parsed)

        if not camunda_rows and not zeebe_rows:
            continue
        camunda_keys = sorted({(r["name"], r["value"]) for r in camunda_rows})
        zeebe_keys = sorted({(r["name"], r["value"]) for r in zeebe_rows})
        if not camunda_keys or not zeebe_keys:
            # Element has only one namespace block -> nothing to diverge.
            continue
        if camunda_keys == zeebe_keys:
            continue
        camunda_only = [
            {"name": name, "value": value}
            for name, value in camunda_keys
            if (name, value) not in set(zeebe_keys)
        ]
        zeebe_only = [
            {"name": name, "value": value}
            for name, value in zeebe_keys
            if (name, value) not in set(camunda_keys)
        ]
        diverged.append({
            "element_id": element_id,
            "camunda_only": camunda_only,
            "zeebe_only": zeebe_only,
        })
    return diverged
