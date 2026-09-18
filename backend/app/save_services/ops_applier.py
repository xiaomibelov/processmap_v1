"""Серверный applier батчей diagram-ops (feature/async-save-pipeline-step1).

Применяет whitelisted ops (API.md §5) к stored BPMN XML через ElementTree:
семантика + bpmndi, семантика удаления инцидентных connection — как в bpmn-js.
Ошибки применения — типизированные OperationApplyError (opId/type/reason),
route маппит их в 422 OPERATION_UNSUPPORTED с откатом всего батча.

Retention session_applied_ops — TTL 30 дней: cleanup-функция (celery-джоба
`processmap.session_applied_ops.cleanup_task` + lazy-fallback ~1/200 из handler).
"""

from __future__ import annotations

import logging
import random
import re
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"

KNOWN_NAMESPACES = {
    "bpmn": BPMN_NS,
    "bpmndi": BPMNDI_NS,
    "di": DI_NS,
    "dc": DC_NS,
    "xsi": "http://www.w3.org/2001/XMLSchema-instance",
}

OP_SOURCE_VALUES = ("user", "agent", "e2e", "replay")
OP_SOURCE_DEFAULT = "user"

APPLIED_OPS_RETENTION_SECONDS = 30 * 24 * 3600
LAZY_CLEANUP_PROBABILITY = 1.0 / 200.0
CLEANUP_BATCH_SIZE = 500
CLEANUP_MAX_BATCHES = 200

_XMLNS_DECL_RE = re.compile(r'xmlns:([A-Za-z_][\w.\-]*)="([^"]+)"')
_XMLNS_DEFAULT_RE = re.compile(r'xmlns="([^"]+)"')

# bpmn-js delete semantics: при удалении shape удаляются инцидентные connection.
_INCIDENT_REF_TAGS = ("incoming", "outgoing")

# Типы-артефакты, которые ops-pipeline не умеет создавать безопасно (template
# round-trip): op с таким типом → явный код ошибки full_save_required_for_bpmn_type,
# клиент обязан уйти в full-save fallback (потеря правок запрещена).
_UNSAFE_FULL_SAVE_ONLY_BPMN_TYPES = {
    f"{{{BPMN_NS}}}participant",
    f"{{{BPMN_NS}}}lane",
    f"{{{BPMN_NS}}}dataStoreReference",
    f"{{{BPMN_NS}}}dataObjectReference",
    f"{{{BPMN_NS}}}dataInputAssociation",
    f"{{{BPMN_NS}}}dataOutputAssociation",
    f"{{{BPMN_NS}}}association",
    f"{{{BPMN_NS}}}textAnnotation",
}


class OperationApplyError(Exception):
    """Типизированная ошибка применения одной op — route маппит в 422."""

    def __init__(self, op_id: str, op_type: str, reason: str):
        super().__init__(reason)
        self.op_id = str(op_id or "")
        self.op_type = str(op_type or "")
        self.reason = str(reason or "")


# ---------------------------------------------------------------------------
# namespace / parse / serialize


def _register_namespaces(xml_text: str) -> None:
    """Регистрация prefix→URI из документа, чтобы re-serialize сохранил префиксы."""
    seen = set()
    for match in _XMLNS_DECL_RE.finditer(xml_text):
        prefix, uri = match.group(1), match.group(2)
        if (prefix, uri) in seen:
            continue
        seen.add((prefix, uri))
        try:
            ET.register_namespace(prefix, uri)
        except ValueError:
            # Зарезервированные/автогенерированные префиксы (ns0, xml, ...) —
            # ET сам назначит замену, семантика не пострадает.
            continue
    default_match = _XMLNS_DEFAULT_RE.search(xml_text)
    if default_match:
        try:
            ET.register_namespace("", default_match.group(1))
        except ValueError:
            pass


def _parse_document(xml_text: str, op_id: str = "", op_type: str = "") -> ET.Element:
    try:
        return ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise OperationApplyError(op_id, op_type, f"bpmn_xml_parse_error: {exc}") from exc


def _serialize(root: ET.Element) -> str:
    body = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body


# ---------------------------------------------------------------------------
# helpers


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _ns(tag: str) -> str:
    return tag[1:].split("}", 1)[0] if tag.startswith("{") else ""


def _find_semantic(root: ET.Element, element_id: str) -> Optional[ET.Element]:
    """Поиск семантического элемента по id; элементы BPMN-неймспейса предпочтительнее."""
    fallback: Optional[ET.Element] = None
    for el in root.iter():
        if el.get("id") != element_id:
            continue
        if _ns(el.tag) == BPMN_NS:
            return el
        if fallback is None:
            fallback = el
    return fallback


def _doc_prefix_map(xml_text: str) -> Dict[str, str]:
    prefixes = dict(KNOWN_NAMESPACES)
    for match in _XMLNS_DECL_RE.finditer(xml_text):
        prefixes.setdefault(match.group(1), match.group(2))
    return prefixes


def _resolve_bpmn_type(xml_text: str, bpmn_type: str, op: Dict[str, Any]) -> str:
    """'bpmn:Task' → Clark-notation для создания семантического элемента.

    Моддл-типы bpmn-js капитализированы, XML-теги — camelCase с малой буквы
    (bpmn:Task → <bpmn:task>, bpmn:UserTask → <bpmn:userTask>).
    """
    raw = str(bpmn_type or "").strip()
    if ":" not in raw:
        raise OperationApplyError(_op_id(op), _op_type(op), f"invalid_bpmn_type: {raw!r}")
    prefix, local = raw.split(":", 1)
    uri = _doc_prefix_map(xml_text).get(prefix)
    if not uri or uri != BPMN_NS or not local:
        raise OperationApplyError(_op_id(op), _op_type(op), f"unsupported_bpmn_type: {raw!r}")
    tag_local = local[0].lower() + local[1:] if local[0].isupper() else local
    return f"{{{BPMN_NS}}}{tag_local}"


def _di_plane(root: ET.Element) -> Optional[ET.Element]:
    for el in root.iter():
        if _ns(el.tag) == BPMNDI_NS and _local(el.tag) == "BPMNPlane":
            return el
    return None


def _di_shapes_for(root: ET.Element, element_id: str) -> List[ET.Element]:
    return [
        el for el in root.iter()
        if _ns(el.tag) == BPMNDI_NS and _local(el.tag) == "BPMNShape"
        and el.get("bpmnElement") == element_id
    ]


def _di_edges_for(root: ET.Element, element_id: str) -> List[ET.Element]:
    return [
        el for el in root.iter()
        if _ns(el.tag) == BPMNDI_NS and _local(el.tag) == "BPMNEdge"
        and el.get("bpmnElement") == element_id
    ]


def _shape_bounds(shape: ET.Element) -> Optional[ET.Element]:
    for ch in shape:
        if _ns(ch.tag) == DC_NS and _local(ch.tag) == "Bounds":
            return ch
    return None


def _edge_waypoints(edge: ET.Element) -> List[ET.Element]:
    return [ch for ch in edge if _ns(ch.tag) == DI_NS and _local(ch.tag) == "waypoint"]


def _op_id(op: Dict[str, Any]) -> str:
    return str((op or {}).get("opId") or "")


def _op_type(op: Dict[str, Any]) -> str:
    return str((op or {}).get("type") or "")


def _require_field(op: Dict[str, Any], field: str) -> Any:
    value = (op or {}).get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        raise OperationApplyError(_op_id(op), _op_type(op), f"missing_{field}")
    return value


def _require_number(op: Dict[str, Any], field: str) -> float:
    value = _require_field(op, field)
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise OperationApplyError(_op_id(op), _op_type(op), f"invalid_{field}: {value!r}") from exc


def _require_waypoints(op: Dict[str, Any]) -> List[Tuple[float, float]]:
    raw = _require_field(op, "waypoints")
    if not isinstance(raw, list) or len(raw) < 2:
        raise OperationApplyError(_op_id(op), _op_type(op), "invalid_waypoints: need >= 2 points")
    points: List[Tuple[float, float]] = []
    for point in raw:
        # Две формы: пары [x, y] (API.md) и объекты {x, y} (wire bpmn-js).
        if isinstance(point, dict):
            px, py = point.get("x"), point.get("y")
        elif isinstance(point, (list, tuple)) and len(point) == 2:
            px, py = point[0], point[1]
        else:
            raise OperationApplyError(_op_id(op), _op_type(op), f"invalid_waypoint: {point!r}")
        try:
            points.append((float(px), float(py)))
        except (TypeError, ValueError) as exc:
            raise OperationApplyError(_op_id(op), _op_type(op), f"invalid_waypoint: {point!r}") from exc
    return points


def _bounds_payload(op: Dict[str, Any]) -> Dict[str, Any]:
    """bounds-объект (wire bpmn-js) или плоские поля (API.md)."""
    bounds = op.get("bounds")
    if isinstance(bounds, dict):
        return bounds
    return {key: op.get(key) for key in ("x", "y", "width", "height") if op.get(key) is not None}


def _require_bounds(op: Dict[str, Any], fields: Tuple[str, ...]) -> Dict[str, float]:
    bounds = _bounds_payload(op)
    out: Dict[str, float] = {}
    for field in fields:
        value = bounds.get(field)
        if value is None:
            raise OperationApplyError(_op_id(op), _op_type(op), f"missing_{field}")
        try:
            out[field] = float(value)
        except (TypeError, ValueError) as exc:
            raise OperationApplyError(_op_id(op), _op_type(op), f"invalid_{field}: {value!r}") from exc
    return out


def _op_bpmn_type(op: Dict[str, Any]) -> str:
    """bpmnType (API.md) или elementType (wire commandToOps)."""
    return str(op.get("bpmnType") or op.get("elementType") or "").strip()


def _op_connection_id(op: Dict[str, Any]) -> str:
    """connectionId (API.md) или elementId (wire commandToOps несёт id в elementId).

    Опциональный client-generated `id` (step2, API.md §5.5) принимается наряду
    с ними — create-op replay при 409-rebase должен воспроизводить тот же id.
    """
    return str(op.get("connectionId") or op.get("elementId") or op.get("id") or "").strip()


def _as_str(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def normalize_op_source(raw: Any) -> str:
    source = str(raw or "").strip().lower()
    return source if source in OP_SOURCE_VALUES else OP_SOURCE_DEFAULT


# ---------------------------------------------------------------------------
# per-type appliers


def _apply_update_properties(root: ET.Element, op: Dict[str, Any]) -> None:
    element_id = str(_require_field(op, "elementId")).strip()
    properties = _require_field(op, "properties")
    if not isinstance(properties, dict):
        raise OperationApplyError(_op_id(op), _op_type(op), "invalid_properties")
    element = _find_semantic(root, element_id)
    if element is None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"element_not_found: {element_id}")
    for key, value in properties.items():
        name = str(key or "").strip()
        if not name:
            continue
        # Смена id элемента опом недопустима (клиент такого не шлёт; защита
        # от повреждения ссылок DI/incoming/outgoing — review NIT-4).
        if name == "id":
            raise OperationApplyError(_op_id(op), _op_type(op), "protected_property: id")
        if value is None:
            element.attrib.pop(name, None)
            continue
        if name == "documentation":
            _set_documentation(element, str(value))
            continue
        element.set(name, _as_str(value))


def _set_documentation(element: ET.Element, text: str) -> None:
    for ch in list(element):
        if _ns(ch.tag) == BPMN_NS and _local(ch.tag) == "documentation":
            element.remove(ch)
    doc = ET.Element(f"{{{BPMN_NS}}}documentation")
    doc.text = text
    element.insert(0, doc)


def _apply_shape_move(root: ET.Element, op: Dict[str, Any]) -> None:
    element_id = str(_require_field(op, "elementId")).strip()
    delta = op.get("delta")
    use_delta = isinstance(delta, dict) and delta.get("x") is not None and delta.get("y") is not None
    if use_delta:
        try:
            dx, dy = float(delta.get("x")), float(delta.get("y"))
        except (TypeError, ValueError) as exc:
            raise OperationApplyError(_op_id(op), _op_type(op), f"invalid_delta: {delta!r}") from exc
    else:
        dx = dy = None
        x = _require_number(op, "x")
        y = _require_number(op, "y")
    shapes = _di_shapes_for(root, element_id)
    if not shapes:
        raise OperationApplyError(_op_id(op), _op_type(op), f"di_shape_not_found: {element_id}")
    for shape in shapes:
        bounds = _shape_bounds(shape)
        if bounds is None:
            raise OperationApplyError(_op_id(op), _op_type(op), f"di_bounds_not_found: {element_id}")
        if use_delta:
            move_dx, move_dy = dx, dy
        else:
            move_dx = x - float(bounds.get("x") or 0)
            move_dy = y - float(bounds.get("y") or 0)
        if not use_delta:
            bounds.set("x", _fmt_num(x))
            bounds.set("y", _fmt_num(y))
        else:
            bounds.set("x", _fmt_num(float(bounds.get("x") or 0) + move_dx))
            bounds.set("y", _fmt_num(float(bounds.get("y") or 0) + move_dy))
        # Label сдвигается на тот же delta (семантика bpmn-js drag).
        for ch in shape:
            if _ns(ch.tag) == BPMNDI_NS and _local(ch.tag) == "BPMNLabel":
                label_bounds = _shape_bounds(ch)
                if label_bounds is not None:
                    label_bounds.set("x", _fmt_num(float(label_bounds.get("x") or 0) + move_dx))
                    label_bounds.set("y", _fmt_num(float(label_bounds.get("y") or 0) + move_dy))


def _apply_shape_resize(root: ET.Element, op: Dict[str, Any]) -> None:
    element_id = str(_require_field(op, "elementId")).strip()
    bounds_values = _require_bounds(op, ("width", "height"))
    # x/y опциональны: плоские поля или bounds-объект (wire bpmn-js).
    optionals = _bounds_payload(op)
    try:
        new_x = float(optionals["x"]) if optionals.get("x") is not None else None
        new_y = float(optionals["y"]) if optionals.get("y") is not None else None
    except (TypeError, ValueError) as exc:
        raise OperationApplyError(_op_id(op), _op_type(op), f"invalid_bounds: {optionals!r}") from exc
    shapes = _di_shapes_for(root, element_id)
    if not shapes:
        raise OperationApplyError(_op_id(op), _op_type(op), f"di_shape_not_found: {element_id}")
    for shape in shapes:
        bounds = _shape_bounds(shape)
        if bounds is None:
            raise OperationApplyError(_op_id(op), _op_type(op), f"di_bounds_not_found: {element_id}")
        if new_x is not None:
            bounds.set("x", _fmt_num(float(new_x)))
        if new_y is not None:
            bounds.set("y", _fmt_num(float(new_y)))
        bounds.set("width", _fmt_num(bounds_values["width"]))
        bounds.set("height", _fmt_num(bounds_values["height"]))


def _fmt_num(value: float) -> str:
    number = float(value)
    if number == int(number):
        return str(int(number))
    return repr(number)


def _validate_shape_create_op(root: ET.Element, xml_text: str, op: Dict[str, Any]) -> None:
    """Fail-safe: unsafe artifact types → full_save_required_for_bpmn_type до любой мутации."""
    tag = _resolve_bpmn_type(xml_text, _op_bpmn_type(op), op)
    if tag in _UNSAFE_FULL_SAVE_ONLY_BPMN_TYPES:
        raise OperationApplyError(_op_id(op), _op_type(op), "full_save_required_for_bpmn_type")


def _apply_shape_create(root: ET.Element, xml_text: str, op: Dict[str, Any]) -> None:
    _validate_shape_create_op(root, xml_text, op)
    # Client-generated id (API.md §5.5): клиент присылает `id`, элемент создаётся
    # с ним без регенерации — replay create при 409-rebase безопасен.
    element_id = str(op.get("elementId") or op.get("id") or "").strip()
    if not element_id:
        raise OperationApplyError(_op_id(op), _op_type(op), "missing_elementId")
    bpmn_type = _op_bpmn_type(op)
    if not bpmn_type:
        raise OperationApplyError(_op_id(op), _op_type(op), "missing_bpmnType")
    bounds_values = _require_bounds(op, ("x", "y", "width", "height"))
    parent_id = str(op.get("parentId") or "").strip()
    if _find_semantic(root, element_id) is not None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"element_already_exists: {element_id}")
    parent = _find_semantic(root, parent_id) if parent_id else None
    if parent is not None and _local(parent.tag) == "participant":
        # Wire bpmn-js может нести parentId=participant (контекст createShape) —
        # flow node внутри bpmn:participant невалидна и bpmn-js дропает её при
        # импорте. Размещаем в processRef участника (паритет с connection.create,
        # который уже опирается на parent source-элемента).
        process_ref = str(parent.get("processRef") or "").strip()
        if process_ref:
            process = _find_semantic(root, process_ref)
            if process is not None:
                parent = process
    if parent is None:
        # Fallback (wire может не нести parentId): первый bpmn:process.
        for el in root.iter():
            if el.tag == f"{{{BPMN_NS}}}process":
                parent = el
                break
    if parent is None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"parent_not_found: {parent_id}")
    tag = _resolve_bpmn_type(xml_text, bpmn_type, op)
    element = ET.Element(tag)
    element.set("id", element_id)
    name = str(op.get("name") or "").strip()
    if name:
        element.set("name", name)
    parent.append(element)
    _create_di_shape(
        root, element_id,
        bounds_values["x"], bounds_values["y"], bounds_values["width"], bounds_values["height"],
        op,
    )


def _create_di_shape(root: ET.Element, element_id: str, x: float, y: float,
                     width: float, height: float, op: Dict[str, Any]) -> None:
    plane = _di_plane(root)
    if plane is None:
        raise OperationApplyError(_op_id(op), _op_type(op), "di_plane_not_found")
    shape = ET.Element(f"{{{BPMNDI_NS}}}BPMNShape")
    shape.set("id", f"{element_id}_di")
    shape.set("bpmnElement", element_id)
    bounds = ET.SubElement(shape, f"{{{DC_NS}}}Bounds")
    bounds.set("x", _fmt_num(x))
    bounds.set("y", _fmt_num(y))
    bounds.set("width", _fmt_num(width))
    bounds.set("height", _fmt_num(height))
    plane.append(shape)


def _create_di_edge(root: ET.Element, connection_id: str,
                    waypoints: List[Tuple[float, float]], op: Dict[str, Any]) -> None:
    plane = _di_plane(root)
    if plane is None:
        raise OperationApplyError(_op_id(op), _op_type(op), "di_plane_not_found")
    edge = ET.Element(f"{{{BPMNDI_NS}}}BPMNEdge")
    edge.set("id", f"{connection_id}_di")
    edge.set("bpmnElement", connection_id)
    for wx, wy in waypoints:
        waypoint = ET.SubElement(edge, f"{{{DI_NS}}}waypoint")
        waypoint.set("x", _fmt_num(wx))
        waypoint.set("y", _fmt_num(wy))
    plane.append(edge)


def _is_connection_element(element: ET.Element) -> bool:
    return "sourceRef" in element.attrib and "targetRef" in element.attrib


def _incident_connection_ids(root: ET.Element, element_id: str) -> List[str]:
    """Все connection, инцидентные элементу (через incoming/outgoing и sourceRef/targetRef)."""
    ids: List[str] = []
    seen = set()
    element = _find_semantic(root, element_id)
    if element is not None:
        for ch in element:
            if _ns(ch.tag) == BPMN_NS and _local(ch.tag) in _INCIDENT_REF_TAGS:
                ref = str(ch.text or "").strip()
                if ref and ref not in seen:
                    seen.add(ref)
                    ids.append(ref)
    for el in root.iter():
        if el.get("sourceRef") == element_id or el.get("targetRef") == element_id:
            ref = str(el.get("id") or "").strip()
            if ref and ref not in seen:
                seen.add(ref)
                ids.append(ref)
    return ids


def _remove_connection_refs(root: ET.Element, connection_id: str) -> None:
    for el in root.iter():
        for ch in list(el):
            if _ns(ch.tag) == BPMN_NS and _local(ch.tag) in _INCIDENT_REF_TAGS:
                if str(ch.text or "").strip() == connection_id:
                    el.remove(ch)


def _delete_connection(root: ET.Element, connection_id: str) -> bool:
    element = _find_semantic(root, connection_id)
    removed = False
    if element is not None:
        parent = _find_parent(root, element)
        if parent is not None:
            parent.remove(element)
            removed = True
    for edge in _di_edges_for(root, connection_id):
        parent = _find_parent(root, edge)
        if parent is not None:
            parent.remove(edge)
    _remove_connection_refs(root, connection_id)
    return removed


def _find_parent(root: ET.Element, child: ET.Element) -> Optional[ET.Element]:
    for el in root.iter():
        for ch in el:
            if ch is child:
                return el
    return None


def _apply_shape_delete(root: ET.Element, op: Dict[str, Any]) -> None:
    element_id = str(_require_field(op, "elementId")).strip()
    element = _find_semantic(root, element_id)
    if element is None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"element_not_found: {element_id}")
    if _is_connection_element(element):
        _delete_connection(root, element_id)
        return
    # Семантика bpmn-js: shape.delete удаляет инцидентные connection.
    for connection_id in _incident_connection_ids(root, element_id):
        _delete_connection(root, connection_id)
    parent = _find_parent(root, element)
    if parent is not None:
        parent.remove(element)
    for shape in _di_shapes_for(root, element_id):
        shape_parent = _find_parent(root, shape)
        if shape_parent is not None:
            shape_parent.remove(shape)


def _validate_connection_create_op(root: ET.Element, xml_text: str, op: Dict[str, Any]) -> None:
    """Fail-safe: unsafe artifact connection-типы → full_save_required_for_bpmn_type до мутаций."""
    bpmn_type = _op_bpmn_type(op)
    if not bpmn_type:
        return  # дефолт bpmn:SequenceFlow безопасен
    tag = _resolve_bpmn_type(xml_text, bpmn_type, op)
    if tag in _UNSAFE_FULL_SAVE_ONLY_BPMN_TYPES:
        raise OperationApplyError(_op_id(op), _op_type(op), "full_save_required_for_bpmn_type")


def _apply_connection_create(root: ET.Element, xml_text: str, op: Dict[str, Any]) -> None:
    _validate_connection_create_op(root, xml_text, op)
    connection_id = _op_connection_id(op)
    if not connection_id:
        raise OperationApplyError(_op_id(op), _op_type(op), "missing_connectionId")
    bpmn_type = _op_bpmn_type(op) or "bpmn:SequenceFlow"
    source_id = str(_require_field(op, "sourceId")).strip()
    target_id = str(_require_field(op, "targetId")).strip()
    waypoints = _require_waypoints(op)
    if _find_semantic(root, connection_id) is not None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"element_already_exists: {connection_id}")
    source = _find_semantic(root, source_id)
    target = _find_semantic(root, target_id)
    if source is None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"source_not_found: {source_id}")
    if target is None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"target_not_found: {target_id}")
    tag = _resolve_bpmn_type(xml_text, bpmn_type, op)
    connection = ET.Element(tag)
    connection.set("id", connection_id)
    connection.set("sourceRef", source_id)
    connection.set("targetRef", target_id)
    name = str(op.get("name") or "").strip()
    if name:
        connection.set("name", name)
    parent = _find_parent(root, source) or root
    parent.append(connection)
    # bpmn-js поддерживает incoming/outgoing дочерние элементы.
    outgoing = ET.Element(f"{{{BPMN_NS}}}outgoing")
    outgoing.text = connection_id
    source.append(outgoing)
    incoming = ET.Element(f"{{{BPMN_NS}}}incoming")
    incoming.text = connection_id
    target.append(incoming)
    _create_di_edge(root, connection_id, waypoints, op)


def _apply_connection_delete(root: ET.Element, op: Dict[str, Any]) -> None:
    connection_id = _op_connection_id(op)
    if not connection_id:
        raise OperationApplyError(_op_id(op), _op_type(op), "missing_connectionId")
    if not _delete_connection(root, connection_id):
        raise OperationApplyError(_op_id(op), _op_type(op), f"connection_not_found: {connection_id}")


def _remove_incident_ref(root: ET.Element, element_id: str, connection_id: str) -> None:
    """Убрать incoming/outgoing-ссылку на connection у конкретного элемента."""
    if not element_id or element_id == connection_id:
        return
    element = _find_semantic(root, element_id)
    if element is None:
        return
    for ch in list(element):
        if _ns(ch.tag) == BPMN_NS and _local(ch.tag) in _INCIDENT_REF_TAGS:
            if str(ch.text or "").strip() == connection_id:
                element.remove(ch)


def _append_incident_ref(element: ET.Element, tag_local: str, connection_id: str) -> None:
    for ch in element:
        if _ns(ch.tag) == BPMN_NS and _local(ch.tag) == tag_local:
            if str(ch.text or "").strip() == connection_id:
                return
    ref = ET.Element(f"{{{BPMN_NS}}}{tag_local}")
    ref.text = connection_id
    element.append(ref)


def _apply_connection_reconnect(root: ET.Element, op: Dict[str, Any]) -> None:
    """Rewrite sourceRef/targetRef connection + перелинковка incoming/outgoing.

    DI-edge не трогаем: id connection не меняется, waypoints сохраняются
    (DI-only миграция краёв, API.md §5.4). Rules-движок bpmn-js не дублируется —
    валидация минимальная: source/target существуют в XML.
    """
    connection_id = _op_connection_id(op)
    if not connection_id:
        raise OperationApplyError(_op_id(op), _op_type(op), "missing_connectionId")
    source_id = str(_require_field(op, "source")).strip()
    target_id = str(_require_field(op, "target")).strip()
    connection = _find_semantic(root, connection_id)
    if connection is None or not _is_connection_element(connection):
        raise OperationApplyError(_op_id(op), _op_type(op), f"connection_not_found: {connection_id}")
    if _find_semantic(root, source_id) is None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"source_not_found: {source_id}")
    if _find_semantic(root, target_id) is None:
        raise OperationApplyError(_op_id(op), _op_type(op), f"target_not_found: {target_id}")
    old_source = str(connection.get("sourceRef") or "").strip()
    old_target = str(connection.get("targetRef") or "").strip()
    if old_source == source_id and old_target == target_id:
        return
    connection.set("sourceRef", source_id)
    connection.set("targetRef", target_id)
    _remove_incident_ref(root, old_source, connection_id)
    _remove_incident_ref(root, old_target, connection_id)
    new_source = _find_semantic(root, source_id)
    new_target = _find_semantic(root, target_id)
    if new_source is not None:
        _append_incident_ref(new_source, "outgoing", connection_id)
    if new_target is not None:
        _append_incident_ref(new_target, "incoming", connection_id)


def _apply_update_di(root: ET.Element, op: Dict[str, Any]) -> None:
    element_id = str(_require_field(op, "elementId")).strip()
    waypoints = op.get("waypoints")
    if waypoints is not None:
        points = _require_waypoints(op)
        edges = _di_edges_for(root, element_id)
        if not edges:
            raise OperationApplyError(_op_id(op), _op_type(op), f"di_edge_not_found: {element_id}")
        for edge in edges:
            for waypoint in _edge_waypoints(edge):
                edge.remove(waypoint)
            for wx, wy in points:
                waypoint = ET.SubElement(edge, f"{{{DI_NS}}}waypoint")
                waypoint.set("x", _fmt_num(wx))
                waypoint.set("y", _fmt_num(wy))
        return
    bounds_fields = [field for field in ("x", "y", "width", "height")
                     if _bounds_payload(op).get(field) is not None]
    if not bounds_fields:
        raise OperationApplyError(_op_id(op), _op_type(op), "missing_di_payload")
    shapes = _di_shapes_for(root, element_id)
    if not shapes:
        raise OperationApplyError(_op_id(op), _op_type(op), f"di_shape_not_found: {element_id}")
    values = _require_bounds(op, tuple(bounds_fields))
    for shape in shapes:
        bounds = _shape_bounds(shape)
        if bounds is None:
            raise OperationApplyError(_op_id(op), _op_type(op), f"di_bounds_not_found: {element_id}")
        for field in bounds_fields:
            bounds.set(field, _fmt_num(values[field]))


_APPLIERS = {
    "element.updateProperties": _apply_update_properties,
    "shape.move": _apply_shape_move,
    "shape.resize": _apply_shape_resize,
    "shape.create": None,  # требует xml_text для resolve префиксов
    "shape.delete": _apply_shape_delete,
    "connection.create": None,
    "connection.delete": _apply_connection_delete,
    "connection.reconnect": _apply_connection_reconnect,
    "element.updateDi": _apply_update_di,
}

SUPPORTED_OP_TYPES = tuple(_APPLIERS.keys())


def apply_one(root: ET.Element, xml_text: str, op: Dict[str, Any]) -> None:
    op_type = _op_type(op)
    if op_type not in _APPLIERS:
        raise OperationApplyError(_op_id(op), op_type, f"unsupported_op_type: {op_type}")
    if op_type == "shape.create":
        _apply_shape_create(root, xml_text, op)
    elif op_type == "connection.create":
        _apply_connection_create(root, xml_text, op)
    else:
        _APPLIERS[op_type](root, op)


def apply_operations(xml_text: str, operations: List[Dict[str, Any]]) -> str:
    """Применить батч ops к XML. Ошибка любой op → OperationApplyError (батч не применяется)."""
    root = _parse_document(xml_text)
    _register_namespaces(xml_text)
    for op in operations or []:
        apply_one(root, xml_text, op if isinstance(op, dict) else {})
    return _serialize(root)


# ---------------------------------------------------------------------------
# retention cleanup (TTL 30 дней, API.md §4)


def cleanup_applied_ops(now_ts: Optional[float] = None,
                        retention_seconds: int = APPLIED_OPS_RETENTION_SECONDS,
                        batch_size: int = CLEANUP_BATCH_SIZE) -> int:
    """Удалить session_applied_ops строки старше retention. Идемпотентно."""
    from ..storage import get_storage

    now = int(now_ts if now_ts is not None else time.time())
    cutoff = now - int(retention_seconds)
    try:
        return int(get_storage().cleanup_applied_ops(cutoff_ts=cutoff, batch_size=batch_size) or 0)
    except Exception as exc:
        logger.warning("session_applied_ops cleanup failed: %s", exc)
        return 0


def maybe_cleanup_applied_ops() -> None:
    """Lazy-fallback cleanup (~1/200 вызовов), когда celery-джоба недоступна."""
    try:
        if random.random() >= LAZY_CLEANUP_PROBABILITY:
            return
        cleanup_applied_ops()
    except Exception as exc:
        logger.warning("session_applied_ops lazy cleanup failed: %s", exc)
