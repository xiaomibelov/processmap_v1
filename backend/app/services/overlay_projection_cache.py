from __future__ import annotations

import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, Iterable, List

from ..redis_cache import cache_get_json, cache_set_json, session_open_cache_ttl_sec

logger = logging.getLogger(__name__)

CAMUNDA_NAMESPACE_URI = "http://camunda.org/schema/1.0/bpmn"
PM_NAMESPACE_URI = "http://foodproc.ai/schema/pm"


def _as_object(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_whitespace(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _clamp_inline_text(value: Any, *, limit: int = 96) -> str:
    text = _normalize_whitespace(value)
    if not text:
        return ""
    if len(text) <= limit:
        return text
    boundary = max(12, int(limit) - 1)
    return f"{text[:boundary].rstrip()}…"


def _canonical_json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    except Exception:
        return "{}"


def _fnv1a_hex_js_compatible(value: str) -> str:
    # Mirrors JS charCodeAt-based FNV-1a used in frontend App.jsx.
    h = 0x811C9DC5
    text = str(value or "")
    for ch in text:
        code = ord(ch)
        if code > 0xFFFF:
            code -= 0x10000
            units = [0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF)]
        else:
            units = [code]
        for unit in units:
            h ^= int(unit)
            h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def _source_hash_for_extension_state(extension_state_raw: Any) -> str:
    return _fnv1a_hex_js_compatible(_canonical_json(extension_state_raw if isinstance(extension_state_raw, dict) else {}))


def _local_name(tag: Any) -> str:
    text = str(tag or "")
    if text.startswith("{") and "}" in text:
        return text.split("}", 1)[1]
    return text


def _namespace(tag: Any) -> str:
    text = str(tag or "")
    if text.startswith("{") and "}" in text:
        return text[1:].split("}", 1)[0]
    return ""


def _element_children(node: ET.Element) -> List[ET.Element]:
    return [child for child in list(node or []) if isinstance(getattr(child, "tag", None), str)]


def _parse_extension_fragment_node(raw_xml: Any) -> ET.Element | None:
    text = str(raw_xml or "").strip()
    if not text:
        return None
    wrapped = (
        f'<root xmlns:camunda="{CAMUNDA_NAMESPACE_URI}" '
        f'xmlns:pm="{PM_NAMESPACE_URI}">{text}</root>'
    )
    try:
        doc = ET.fromstring(wrapped)
    except Exception:
        return None
    for child in list(doc):
        if isinstance(getattr(child, "tag", None), str):
            return child
    return None


def _collect_camunda_input_output_nodes(root_node: ET.Element | None) -> List[ET.Element]:
    if root_node is None:
        return []
    out: List[ET.Element] = []
    if _namespace(root_node.tag) == CAMUNDA_NAMESPACE_URI and _local_name(root_node.tag) == "inputOutput":
        out.append(root_node)
    for node in root_node.iter():
        if node is root_node:
            continue
        if _namespace(node.tag) == CAMUNDA_NAMESPACE_URI and _local_name(node.tag) == "inputOutput":
            out.append(node)
    return out


def _collect_camunda_parameter_nodes(io_node: ET.Element | None, *, direction: str = "input") -> List[ET.Element]:
    if io_node is None:
        return []
    local = "outputParameter" if direction == "output" else "inputParameter"
    return [
        child
        for child in _element_children(io_node)
        if _namespace(child.tag) == CAMUNDA_NAMESPACE_URI and _local_name(child.tag) == local
    ]


def _inner_xml(node: ET.Element) -> str:
    if node is None:
        return ""
    raw = "".join(ET.tostring(child, encoding="unicode") for child in _element_children(node)).strip()
    return raw


def _classify_camunda_io_parameter(param_node: ET.Element) -> Dict[str, str]:
    children = _element_children(param_node)
    if not children:
        text = str(param_node.text or "").strip()
        if not text:
            return {"shape": "empty", "value": "", "scriptFormat": ""}
        if re.match(r"^\$\{[\s\S]*\}$", text):
            return {"shape": "expression", "value": text, "scriptFormat": ""}
        return {"shape": "text", "value": text, "scriptFormat": ""}

    first = children[0]
    if (
        len(children) == 1
        and _namespace(first.tag) == CAMUNDA_NAMESPACE_URI
        and _local_name(first.tag) == "script"
    ):
        return {
            "shape": "script",
            "value": "".join(first.itertext()),
            "scriptFormat": _as_text(first.attrib.get("scriptFormat")),
        }

    return {
        "shape": "nested",
        "value": _inner_xml(param_node),
        "scriptFormat": "",
    }


def _build_io_overlay_rows(extension_state_raw: Any) -> List[Dict[str, str]]:
    state = _as_object(extension_state_raw)
    preserved = _as_list(state.get("preservedExtensionElements"))
    rows: List[Dict[str, str]] = []

    for fragment in preserved:
        root = _parse_extension_fragment_node(fragment)
        if root is None:
            continue
        io_nodes = _collect_camunda_input_output_nodes(root)
        for io_node in io_nodes:
            for direction in ("input", "output"):
                direction_label = "OUT" if direction == "output" else "IN"
                for param_node in _collect_camunda_parameter_nodes(io_node, direction=direction):
                    name = _as_text(param_node.attrib.get("name"))
                    if not name:
                        continue
                    parsed = _classify_camunda_io_parameter(param_node)
                    shape = str(parsed.get("shape") or "")
                    raw_value = str(parsed.get("value") or "")
                    preview_value = ""
                    if shape == "script":
                        script_format = _as_text(parsed.get("scriptFormat")) or "script"
                        script_text = _clamp_inline_text(raw_value, limit=72)
                        preview_value = f"{script_format}: {script_text}" if script_text else f"{script_format}: script"
                    elif shape == "nested":
                        preview_value = _clamp_inline_text(raw_value, limit=72) or "[nested]"
                    else:
                        preview_value = _clamp_inline_text(raw_value, limit=72)
                    if not preview_value:
                        continue
                    rows.append(
                        {
                            "key": f"{direction_label}:{name}",
                            "label": f"{direction_label} {name}",
                            "value": preview_value,
                        }
                    )
    return rows


def _build_extension_property_rows(extension_state_raw: Any) -> List[Dict[str, str]]:
    state = _as_object(extension_state_raw)
    properties = _as_object(state.get("properties"))
    ext_rows = _as_list(properties.get("extensionProperties"))
    rows: List[Dict[str, str]] = []
    for row_raw in ext_rows:
        row = _as_object(row_raw)
        name = _as_text(row.get("name"))
        value = _as_text(row.get("value"))
        if not name or not value:
            continue
        rows.append(
            {
                "key": name,
                "label": name,
                "value": value,
            }
        )
    return rows


def _dedupe_overlay_rows_by_visual_signature(rows_raw: Iterable[Dict[str, str]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen: set[str] = set()
    for row_raw in rows_raw:
        row = _as_object(row_raw)
        label = str(row.get("label") or "")
        value = str(row.get("value") or "")
        signature = f"{label}\u241f{value}"
        if signature in seen:
            continue
        seen.add(signature)
        out.append({
            "key": str(row.get("key") or ""),
            "label": label,
            "value": value,
        })
    return out


def _build_preview_for_extension_state(element_id: str, extension_state_raw: Any, *, visible_limit: int = 4) -> Dict[str, Any]:
    rows: List[Dict[str, str]] = []
    rows.extend(_build_io_overlay_rows(extension_state_raw))
    rows.extend(_build_extension_property_rows(extension_state_raw))
    normalized = _dedupe_overlay_rows_by_visual_signature(rows)
    limit = max(1, min(5, int(visible_limit or 4)))
    items = normalized[:limit]
    hidden_count = max(len(normalized) - len(items), 0)
    enabled = len(items) > 0
    return {
        "enabled": enabled,
        "elementId": str(element_id or "").strip(),
        "items": items,
        "hiddenCount": int(hidden_count),
        "totalCount": int(len(normalized)),
    }


def build_properties_overlay_projection(bpmn_meta_raw: Any, *, visible_limit: int = 4) -> Dict[str, Any]:
    bpmn_meta = _as_object(bpmn_meta_raw)
    extension_map = _as_object(bpmn_meta.get("camunda_extensions_by_element_id"))
    entries_by_element_id: Dict[str, Dict[str, Any]] = {}

    for raw_element_id, extension_state_raw in extension_map.items():
        element_id = _as_text(raw_element_id)
        if not element_id:
            continue
        preview = _build_preview_for_extension_state(element_id, extension_state_raw, visible_limit=visible_limit)
        entries_by_element_id[element_id] = {
            "source_hash": _source_hash_for_extension_state(extension_state_raw),
            **preview,
        }

    return {
        "schema": "properties_overlay_projection_v1",
        "visible_limit": int(max(1, min(5, int(visible_limit or 4)))),
        "entries_by_element_id": entries_by_element_id,
        "entry_count": int(len(entries_by_element_id)),
    }


def overlay_projection_cache_key(session_id: Any, version_token: Any) -> str:
    sid = _as_text(session_id) or "unknown"
    token = _as_text(version_token) or "0.0.0"
    return f"pm:cache:overlay_projection:session:{sid}:v:{token}:v1"


def get_or_build_properties_overlay_projection_cached(
    *,
    session_id: Any,
    version_token: Any,
    bpmn_meta_raw: Any,
    visible_limit: int = 4,
) -> Dict[str, Any]:
    sid = _as_text(session_id)
    token = _as_text(version_token)
    cache_key = overlay_projection_cache_key(sid, token)

    cached = cache_get_json(cache_key)
    if isinstance(cached, dict) and isinstance(cached.get("entries_by_element_id"), dict):
        return cached

    projection = build_properties_overlay_projection(bpmn_meta_raw, visible_limit=visible_limit)
    payload = {
        **projection,
        "session_id": sid,
        "version_token": token,
        "generated_at": int(time.time()),
    }
    ok = cache_set_json(cache_key, payload, ttl_sec=session_open_cache_ttl_sec())
    if not ok:
        logger.warning("overlay_projection_cache: failed write session_id=%s version=%s", sid, token)
    return payload
