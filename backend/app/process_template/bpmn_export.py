"""E7.1 — BPMN 2.0 XML generator: ui_model → BPMN-XML string.

Inverse of ``bpmn_import.parse_bpmn`` for the v0.3 camunda:properties dialect
(locked decision: entity refs — camunda:property params.*, pm:metadata отложен
до v0.4):

  - bpmn:definitions + collaboration + participant;
  - bpmn:task с camunda:properties (operation_code, params.*, outputs.*,
    recipe_params через '; ');
  - шлюзы с conditionExpression xsi:type="bpmn:tFormalExpression"
    (условия вида ``${var == true}``);
  - start/end/intermediate catch/throw + message/link event definitions
    (из node.event_definitions, если есть);
  - laneSet + flowNodeRef из ui_model.lanes;
  - DI: BPMNDiagram/BPMNPlane/BPMNShape (dc:Bounds из x/y/w/h), BPMNEdge
    (di:waypoint из flow.waypoints, иначе прямая 2-точечная линия между
    центрами блоков);
  - textAnnotation для process_entities + recipe_params (как в приёмочном
    v0.3; размещены внутри bpmn:process — валидный BPMN 2.0, парсер их
    игнорирует, на round-trip не влияет).

Генерируемый XML well-formed и re-parseable через parse_bpmn.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
CAMUNDA_NS = "http://camunda.org/schema/1.0/bpmn"

for _prefix, _uri in (
    ("bpmn", BPMN_NS),
    ("bpmndi", BPMNDI_NS),
    ("dc", DC_NS),
    ("di", DI_NS),
    ("xsi", XSI_NS),
    ("camunda", CAMUNDA_NS),
):
    ET.register_namespace(_prefix, _uri)

_EVENT_TYPES = {"startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent"}
_GATEWAY_TYPES = {"exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway"}
_FLOW_NODE_TYPES = _EVENT_TYPES | _GATEWAY_TYPES | {"task"}

# известные event definitions (локальные имена, из parse_bpmn)
_EVENT_DEFS = {"messageEventDefinition", "linkEventDefinition", "timerEventDefinition", "signalEventDefinition"}

_DEFAULT_SIZE = {
    "task": (140.0, 70.0),
    "startEvent": (36.0, 36.0),
    "endEvent": (36.0, 36.0),
    "intermediateCatchEvent": (36.0, 36.0),
    "intermediateThrowEvent": (36.0, 36.0),
    "exclusiveGateway": (50.0, 50.0),
    "parallelGateway": (50.0, 50.0),
    "inclusiveGateway": (50.0, 50.0),
    "eventBasedGateway": (50.0, 50.0),
}

_ENTITY_CATEGORIES = ("containers", "equipment", "zones")


def _q(ns: str, tag: str) -> str:
    return f"{{{ns}}}{tag}"


def _b(tag: str) -> str:
    return _q(BPMN_NS, tag)


def _scalar(value: Any) -> str:
    """camunda:property value → строка (bool lowercase, остальное str)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    return str(value)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fmt(value: float) -> str:
    return str(int(value)) if float(value) == int(value) else str(round(value, 2))


def _node_bounds(node: Dict[str, Any]) -> Tuple[float, float, float, float]:
    bpmn_type = str(node.get("bpmn_type") or "task")
    dw, dh = _DEFAULT_SIZE.get(bpmn_type, (100.0, 80.0))
    x = _num(node.get("x"), 0.0)
    y = _num(node.get("y"), 0.0)
    w = _num(node.get("width"), 0.0) or dw
    h = _num(node.get("height"), 0.0) or dh
    return x, y, w, h


def _camunda_extension_state(ui_model: Dict[str, Any], node_id: str) -> Optional[Dict[str, Any]]:
    meta = ui_model.get("bpmn_meta") or {}
    if not isinstance(meta, dict):
        return None
    by_id = meta.get("camunda_extensions_by_element_id") or {}
    if not isinstance(by_id, dict):
        return None
    entry = by_id.get(node_id)
    return entry if isinstance(entry, dict) else None


def _props_from_extension_state(state: Optional[Dict[str, Any]]) -> Optional[List[Tuple[str, str]]]:
    if state is None:
        return None
    properties = state.get("properties") or {}
    if not isinstance(properties, dict):
        return []
    props: List[Tuple[str, str]] = []
    for row in properties.get("extensionProperties") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("key") or row.get("name") or "")
        if not name:
            continue
        props.append((name, _scalar(row.get("value"))))
    return props


def _preserved_extension_fragments(state: Optional[Dict[str, Any]]) -> List[ET.Element]:
    if state is None:
        return []
    fragments: List[ET.Element] = []
    for raw in state.get("preservedExtensionElements") or []:
        try:
            fragments.append(ET.fromstring(str(raw).encode("utf-8")))
        except Exception:
            continue
    return fragments


def _legacy_node_props(node: Dict[str, Any]) -> List[Tuple[str, str]]:
    props: List[Tuple[str, str]] = []
    op_code = str(node.get("operation_code") or "").strip()
    if op_code:
        props.append(("operation_code", op_code))
    params = node.get("params") or {}
    if isinstance(params, dict):
        for key, value in params.items():
            props.append((f"params.{key}", _scalar(value)))
    outputs = node.get("outputs") or {}
    if isinstance(outputs, dict):
        for key, value in outputs.items():
            props.append((f"outputs.{key}", _scalar(value)))
    recipe_params = [str(p).strip() for p in (node.get("recipe_params") or []) if str(p).strip()]
    if recipe_params:
        props.append(("recipe_params", "; ".join(recipe_params)))
    return props


def _subprocess_specs(ui_model: Dict[str, Any], nodes: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    seen = set()
    specs: List[Dict[str, str]] = []
    for spec in ui_model.get("subprocesses") or []:
        if not isinstance(spec, dict):
            continue
        sid = str(spec.get("id") or "")
        if not sid or sid in seen:
            continue
        seen.add(sid)
        specs.append({"id": sid, "name": str(spec.get("name") or "")})
    for node in nodes:
        sid = str(node.get("parent_subprocess_id") or "")
        if sid and sid not in seen:
            seen.add(sid)
            specs.append({"id": sid, "name": ""})
    return specs


def _text_entities(ui_model: Dict[str, Any]) -> str:
    entities = ui_model.get("process_entities") or {}
    if not isinstance(entities, dict):
        return ""
    parts: List[str] = []
    for category in _ENTITY_CATEGORIES:
        items = entities.get(category) or {}
        if not isinstance(items, dict) or not items:
            continue
        entries = []
        for ref, spec in items.items():
            type_id = ""
            if isinstance(spec, dict):
                type_id = str(spec.get("type_id") or "")
            entries.append(f"{ref} ({type_id})" if type_id else str(ref))
        parts.append(f"{category}: {', '.join(entries)}")
    if not parts:
        return ""
    return "Справочник сущностей процесса (process_entities): " + "; ".join(parts) + "."


def _text_recipe(ui_model: Dict[str, Any]) -> str:
    ctx = ui_model.get("recipe_context") or {}
    keys = sorted(str(k) for k in ctx.keys()) if isinstance(ctx, dict) else []
    listing = ", ".join(keys) if keys else "(пусто)"
    return (
        "recipe_context (задаётся для SKU, подставляется при создании process_instance): "
        f"{listing}. Поле recipe_params в задачах — это ссылки на имена параметров "
        "recipe_context, без ${}-подстановок (v0.3)."
    )


def generate_bpmn(
    ui_model: Dict[str, Any],
    *,
    template_name: str = "",
    template_id: str = "",
    process_id: Optional[str] = None,
) -> str:
    """ui_model → BPMN 2.0 XML (well-formed, re-parseable через parse_bpmn)."""
    ui_model = ui_model or {}
    nodes: List[Dict[str, Any]] = [n for n in (ui_model.get("nodes") or []) if isinstance(n, dict)]
    flows: List[Dict[str, Any]] = [f for f in (ui_model.get("flows") or []) if isinstance(f, dict)]
    lanes: List[Dict[str, Any]] = [ln for ln in (ui_model.get("lanes") or []) if isinstance(ln, dict)]
    participant = ui_model.get("participant") or {}

    proc_id = (
        process_id
        or str(participant.get("process_ref") or "").strip()
        or ("Process_" + str(template_id).replace("-", "_")[:24] if template_id else "Process_1")
    )
    participant_id = str(participant.get("id") or "").strip() or "Participant_1"
    participant_name = str(participant.get("name") or "").strip() or (template_name or "Process")

    # --- incoming/outgoing для flow-нод -----------------------------------
    incoming: Dict[str, List[str]] = {}
    outgoing: Dict[str, List[str]] = {}
    for flow in flows:
        fid = str(flow.get("id") or "")
        src = str(flow.get("source_ref") or flow.get("sourceRef") or "")
        tgt = str(flow.get("target_ref") or flow.get("targetRef") or "")
        if src:
            outgoing.setdefault(src, []).append(fid)
        if tgt:
            incoming.setdefault(tgt, []).append(fid)

    # --- definitions -------------------------------------------------------
    definitions = ET.Element(
        _b("definitions"),
        {
            "id": "Definitions_" + (str(template_id).replace("-", "")[:12] or "1"),
            "targetNamespace": "http://bpmn.io/schema/bpmn",
            "exporter": "ProcessMap",
            "exporterVersion": "0.3",
        },
    )
    collaboration = ET.SubElement(definitions, _b("collaboration"), {"id": "Collaboration_1"})
    ET.SubElement(
        collaboration,
        _b("participant"),
        {"id": participant_id, "name": participant_name, "processRef": proc_id},
    )

    process = ET.SubElement(definitions, _b("process"), {"id": proc_id, "isExecutable": "false"})
    if template_name:
        doc = ET.SubElement(process, _b("documentation"))
        doc.text = f"{template_name} — сгенерировано ProcessMap (publish E7)."

    # --- textAnnotation (process_entities + recipe_params) -----------------
    annotations: List[Tuple[str, str]] = []
    entities_text = _text_entities(ui_model)
    if entities_text:
        annotations.append(("TA_entities", entities_text))
    annotations.append(("TA_recipe", _text_recipe(ui_model)))
    for ta_id, text in annotations:
        ta = ET.SubElement(process, _b("textAnnotation"), {"id": ta_id})
        ta_text = ET.SubElement(ta, _b("text"))
        ta_text.text = text

    # --- lanes --------------------------------------------------------------
    if lanes:
        lane_set = ET.SubElement(process, _b("laneSet"), {"id": "LaneSet_1"})
        for lane in lanes:
            lane_el = ET.SubElement(
                lane_set,
                _b("lane"),
                {"id": str(lane.get("id") or ""), "name": str(lane.get("name") or "")},
            )
            for ref in lane.get("flow_node_refs") or []:
                ref_el = ET.SubElement(lane_el, _b("flowNodeRef"))
                ref_el.text = str(ref)

    subprocess_specs = _subprocess_specs(ui_model, nodes)
    subprocess_ids = {spec["id"] for spec in subprocess_specs}
    subprocess_by_id: Dict[str, ET.Element] = {}
    node_parent_by_id = {
        str(node.get("id") or ""): str(node.get("parent_subprocess_id") or "")
        for node in nodes
        if str(node.get("id") or "")
    }

    def emit_node(container: ET.Element, node: Dict[str, Any]) -> None:
        node_id = str(node.get("id") or "")
        if not node_id:
            return
        bpmn_type = str(node.get("bpmn_type") or "task")
        if bpmn_type not in _FLOW_NODE_TYPES:
            bpmn_type = "task"
        el = ET.SubElement(container, _b(bpmn_type), {"id": node_id, "name": str(node.get("name") or "")})

        if bpmn_type == "task":
            state = _camunda_extension_state(ui_model, node_id)
            state_props = _props_from_extension_state(state)
            props = state_props if state_props is not None else _legacy_node_props(node)
            preserved_fragments = _preserved_extension_fragments(state)
            if props or preserved_fragments:
                ext = ET.SubElement(el, _b("extensionElements"))
                for fragment in preserved_fragments:
                    ext.append(fragment)
            if props:
                container_props = ET.SubElement(ext, _q(CAMUNDA_NS, "properties"))
                for name, value in props:
                    ET.SubElement(container_props, _q(CAMUNDA_NS, "property"), {"name": name, "value": value})

        if bpmn_type in _EVENT_TYPES:
            defs = [d for d in (node.get("event_definitions") or []) if str(d) in _EVENT_DEFS]
            for idx, definition in enumerate(defs):
                if definition == "linkEventDefinition":
                    ET.SubElement(el, _b(definition), {"id": f"LinkDef_{node_id}"})
                else:
                    ET.SubElement(el, _b(definition), {"id": f"{definition}_{node_id}_{idx + 1}"})

        for fid in incoming.get(node_id, []):
            inc = ET.SubElement(el, _b("incoming"))
            inc.text = fid
        for fid in outgoing.get(node_id, []):
            out = ET.SubElement(el, _b("outgoing"))
            out.text = fid

    def flow_container(flow: Dict[str, Any]) -> ET.Element:
        source_id = str(flow.get("source_ref") or flow.get("sourceRef") or "")
        target_id = str(flow.get("target_ref") or flow.get("targetRef") or "")
        source_parent = node_parent_by_id.get(source_id, "")
        target_parent = node_parent_by_id.get(target_id, "")
        if source_parent and source_parent == target_parent:
            container = subprocess_by_id.get(source_parent)
            return container if container is not None else process
        return process

    def emit_flow(container: ET.Element, flow: Dict[str, Any]) -> None:
        flow_id = str(flow.get("id") or "")
        if not flow_id:
            return
        attrs = {
            "id": flow_id,
            "sourceRef": str(flow.get("source_ref") or flow.get("sourceRef") or ""),
            "targetRef": str(flow.get("target_ref") or flow.get("targetRef") or ""),
        }
        flow_name = str(flow.get("name") or "")
        if flow_name:
            attrs["name"] = flow_name
        flow_el = ET.SubElement(container, _b("sequenceFlow"), attrs)
        condition = str(flow.get("condition") or "").strip()
        if condition:
            cond = ET.SubElement(
                flow_el,
                _b("conditionExpression"),
                {_q(XSI_NS, "type"): "bpmn:tFormalExpression"},
            )
            cond.text = condition

    # --- flow nodes ----------------------------------------------------------
    for spec in subprocess_specs:
        attrs = {"id": spec["id"]}
        if spec.get("name"):
            attrs["name"] = spec["name"]
        subprocess_by_id[spec["id"]] = ET.SubElement(process, _b("subProcess"), attrs)
    for node in nodes:
        parent_id = str(node.get("parent_subprocess_id") or "")
        target_container = subprocess_by_id.get(parent_id) if parent_id in subprocess_ids else process
        emit_node(target_container if target_container is not None else process, node)

    # --- sequence flows ------------------------------------------------------
    for flow in flows:
        emit_flow(flow_container(flow), flow)

    # --- DI ------------------------------------------------------------------
    node_by_id = {str(n.get("id") or ""): n for n in nodes if str(n.get("id") or "")}

    # participant bounds: из ui_model или по рамке всех нод
    px = _num(participant.get("x"), 0.0)
    py = _num(participant.get("y"), 0.0)
    pw = _num(participant.get("width"), 0.0)
    ph = _num(participant.get("height"), 0.0)
    if not pw or not ph:
        if nodes:
            bounds = [_node_bounds(n) for n in nodes]
            min_x = min(b[0] for b in bounds)
            min_y = min(b[1] for b in bounds)
            max_x = max(b[0] + b[2] for b in bounds)
            max_y = max(b[1] + b[3] for b in bounds)
            px, py = min_x - 80.0, min_y - 60.0
            pw, ph = (max_x - min_x) + 160.0, (max_y - min_y) + 120.0
        else:
            px, py, pw, ph = 60.0, 80.0, 900.0, 200.0

    diagram = ET.SubElement(definitions, _q(BPMNDI_NS, "BPMNDiagram"), {"id": "BPMNDiagram_1"})
    plane = ET.SubElement(
        diagram,
        _q(BPMNDI_NS, "BPMNPlane"),
        {"id": "BPMNPlane_1", "bpmnElement": "Collaboration_1"},
    )

    def add_shape(shape_id: str, element_ref: str, x: float, y: float, w: float, h: float, **extra: str) -> None:
        shape = ET.SubElement(
            plane,
            _q(BPMNDI_NS, "BPMNShape"),
            {"id": shape_id, "bpmnElement": element_ref, **{k: v for k, v in extra.items() if v}},
        )
        ET.SubElement(
            shape,
            _q(DC_NS, "Bounds"),
            {"x": _fmt(x), "y": _fmt(y), "width": _fmt(w), "height": _fmt(h)},
        )

    add_shape(f"{participant_id}_di", participant_id, px, py, pw, ph, isHorizontal="true")

    for idx, lane in enumerate(lanes):
        lane_id = str(lane.get("id") or "")
        if not lane_id:
            continue
        lw = _num(lane.get("width"), 0.0)
        lh = _num(lane.get("height"), 0.0)
        if not lw or not lh:
            # без координат: равные горизонтальные полосы внутри participant
            lx = px + 30.0
            lh = ph / max(len(lanes), 1)
            ly = py + idx * lh
            lw = pw - 30.0
        else:
            lx = _num(lane.get("x"), px + 30.0)
            ly = _num(lane.get("y"), py)
        add_shape(f"{lane_id}_di", lane_id, lx, ly, lw, lh, isHorizontal="true")

    for spec in subprocess_specs:
        children = [node for node in nodes if str(node.get("parent_subprocess_id") or "") == spec["id"]]
        if children:
            child_bounds = [_node_bounds(node) for node in children]
            sx = min(b[0] for b in child_bounds) - 30.0
            sy = min(b[1] for b in child_bounds) - 30.0
            sw = max(b[0] + b[2] for b in child_bounds) - sx + 30.0
            sh = max(b[1] + b[3] for b in child_bounds) - sy + 30.0
        else:
            sx, sy, sw, sh = px + 40.0, py + 40.0, 220.0, 140.0
        add_shape(f"{spec['id']}_di", spec["id"], sx, sy, sw, sh, isExpanded="true")

    for node in nodes:
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        x, y, w, h = _node_bounds(node)
        add_shape(f"{node_id}_di", node_id, x, y, w, h)

    for idx, (ta_id, _text) in enumerate(annotations):
        add_shape(f"{ta_id}_di", ta_id, px, py + ph + 30.0 + idx * 100.0, 320.0, 90.0)

    def center(element_ref: str) -> Tuple[float, float]:
        node = node_by_id.get(element_ref)
        if node is None:
            return (px + 30.0, py + ph / 2.0)
        x, y, w, h = _node_bounds(node)
        return (x + w / 2.0, y + h / 2.0)

    for flow in flows:
        flow_id = str(flow.get("id") or "")
        if not flow_id:
            continue
        edge = ET.SubElement(
            plane,
            _q(BPMNDI_NS, "BPMNEdge"),
            {"id": f"{flow_id}_di", "bpmnElement": flow_id},
        )
        waypoints = flow.get("waypoints")
        points: List[Tuple[float, float]] = []
        if isinstance(waypoints, list) and waypoints:
            for wp in waypoints:
                if isinstance(wp, dict):
                    points.append((_num(wp.get("x")), _num(wp.get("y"))))
        if len(points) < 2:
            points = [
                center(str(flow.get("source_ref") or flow.get("sourceRef") or "")),
                center(str(flow.get("target_ref") or flow.get("targetRef") or "")),
            ]
        for wx, wy in points:
            ET.SubElement(edge, _q(DI_NS, "waypoint"), {"x": _fmt(wx), "y": _fmt(wy)})

    ET.indent(definitions, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(definitions, encoding="unicode")
