from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Tuple
import html as _html
import re
import xml.etree.ElementTree as ET


NS_BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
NS_BPMNDI = "http://www.omg.org/spec/BPMN/20100524/DI"
NS_DC = "http://www.omg.org/spec/DD/20100524/DC"
NS_DI = "http://www.omg.org/spec/DD/20100524/DI"


def _safe_id(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_\-]", "_", s or "")
    if not s:
        s = "id"
    if not re.match(r"^[A-Za-z_]", s):
        s = "id_" + s
    return s


def _text(v: Any) -> str:
    if v is None:
        return ""
    return str(v)


def _node_label(n: Dict[str, Any]) -> str:
    for k in ("title", "label", "name", "text"):
        if n.get(k):
            return _text(n.get(k))
    return _text(n.get("id") or "Task")


def _node_kind(n: Dict[str, Any]) -> str:
    t = (_text(n.get("type") or n.get("kind") or "")).lower()
    if t in ("decision",):
        return "gateway_xor"
    if t in ("fork", "join"):
        return "gateway_parallel"
    # everything else as task (timer/message/loss_event/step)
    return "task"


def _node_role(n: Dict[str, Any]) -> str:
    return _text(
        n.get("actor_role")
        or n.get("role")
        or n.get("actor")
        or ""
    ).strip()


def _edge_src_dst(e: Dict[str, Any]) -> Tuple[str, str]:
    src = _text(e.get("from_id") or e.get("from") or e.get("source") or e.get("src") or "")
    dst = _text(e.get("to_id") or e.get("to") or e.get("target") or e.get("dst") or "")
    return src, dst


def _as_dict(obj: Any) -> Dict[str, Any]:
    if obj is None:
        return {}
    if is_dataclass(obj):
        return asdict(obj)
    if hasattr(obj, "model_dump"):  # pydantic v2
        return obj.model_dump()
    if hasattr(obj, "dict"):  # pydantic v1
        return obj.dict()
    if isinstance(obj, dict):
        return obj
    try:
        return dict(obj)  # type: ignore[arg-type]
    except Exception:
        return {}


def export_session_to_bpmn_xml(session: Any) -> str:
    """Minimal BPMN 2.0 XML export that is importable in bpmn-js.

    - Always returns XML (never raises).
    - Includes minimal BPMNDI so bpmn-js can render a diagram.
    """
    try:
        ET.register_namespace("bpmn", NS_BPMN)
        ET.register_namespace("bpmndi", NS_BPMNDI)
        ET.register_namespace("dc", NS_DC)
        ET.register_namespace("di", NS_DI)

        data = _as_dict(session)
        nodes_in = list(data.get("nodes") or [])
        edges_in = list(data.get("edges") or [])

        nodes: List[Dict[str, Any]] = [_as_dict(n) for n in nodes_in]
        edges: List[Dict[str, Any]] = [_as_dict(e) for e in edges_in]

        title = _text(data.get("title") or data.get("name") or "Process").strip() or "Process"

        defs = ET.Element(
            f"{{{NS_BPMN}}}definitions",
            attrib={
                "id": "Definitions_1",
                "targetNamespace": "http://bpmn.io/schema/bpmn",
            },
        )

        proc = ET.SubElement(
            defs,
            f"{{{NS_BPMN}}}process",
            attrib={"id": "Process_1", "name": title, "isExecutable": "false"},
        )

        # lanes (optional)
        roles_order: List[str] = [r for r in (data.get("roles") or []) if r]
        role_to_lane_id: Dict[str, str] = {}
        lane_set = None
        if roles_order:
            lane_set = ET.SubElement(proc, f"{{{NS_BPMN}}}laneSet", attrib={"id": "LaneSet_1"})
            for i, role in enumerate(roles_order, start=1):
                lane_id = f"Lane_{i}"
                role_to_lane_id[role] = lane_id
                ET.SubElement(lane_set, f"{{{NS_BPMN}}}lane", attrib={"id": lane_id, "name": role})

        # nodes
        raw_to_bpmn_id: Dict[str, str] = {}
        bpmn_ids: List[str] = []
        for i, n in enumerate(nodes, start=1):
            raw_id = _text(n.get("id") or f"node_{i}")
            nid = _safe_id(raw_id)
            # avoid collisions
            if nid in bpmn_ids:
                nid = f"{nid}_{i}"
            raw_to_bpmn_id[raw_id] = nid
            bpmn_ids.append(nid)

            kind = _node_kind(n)
            label = _node_label(n)

            if kind == "gateway_xor":
                el = ET.SubElement(proc, f"{{{NS_BPMN}}}exclusiveGateway", attrib={"id": nid, "name": label})
            elif kind == "gateway_parallel":
                el = ET.SubElement(proc, f"{{{NS_BPMN}}}parallelGateway", attrib={"id": nid, "name": label})
            else:
                el = ET.SubElement(proc, f"{{{NS_BPMN}}}task", attrib={"id": nid, "name": label})

            role = _node_role(n)
            if lane_set is not None and role and role in role_to_lane_id:
                lane_id = role_to_lane_id[role]
                lane = lane_set.find(f".//{{{NS_BPMN}}}lane[@id='{lane_id}']")
                if lane is not None:
                    ET.SubElement(lane, f"{{{NS_BPMN}}}flowNodeRef").text = nid

        # edges
        flows: List[Dict[str, Any]] = []
        for idx, e in enumerate(edges, start=1):
            src_raw, dst_raw = _edge_src_dst(e)
            if not src_raw or not dst_raw:
                continue
            src = raw_to_bpmn_id.get(src_raw, _safe_id(src_raw))
            dst = raw_to_bpmn_id.get(dst_raw, _safe_id(dst_raw))
            fid = f"Flow_{idx}"
            flow = ET.SubElement(
                proc,
                f"{{{NS_BPMN}}}sequenceFlow",
                attrib={"id": fid, "sourceRef": src, "targetRef": dst},
            )
            name = _text(e.get("when") or e.get("label") or e.get("name") or "").strip()
            if name:
                flow.set("name", name)
            flows.append({"id": fid, "src": src, "dst": dst})

        # BPMNDI (minimal)
        diagram = ET.SubElement(defs, f"{{{NS_BPMNDI}}}BPMNDiagram", attrib={"id": "BPMNDiagram_1"})
        plane = ET.SubElement(diagram, f"{{{NS_BPMNDI}}}BPMNPlane", attrib={"id": "BPMNPlane_1", "bpmnElement": "Process_1"})

        # simple layout: lanes in columns, nodes stacked vertically
        lane_order = roles_order[:] if roles_order else []
        lane_order.append("unassigned")
        lane_idx_by_role = {r: i for i, r in enumerate(lane_order)}

        node_bounds: Dict[str, Dict[str, float]] = {}
        lane_y: Dict[str, int] = {r: 0 for r in lane_order}
        w = 180.0
        h = 80.0
        x0 = 160.0
        y0 = 80.0
        x_step = 260.0
        y_step = 140.0

        for i, n in enumerate(nodes, start=1):
            raw_id = _text(n.get("id") or f"node_{i}")
            nid = raw_to_bpmn_id.get(raw_id) or _safe_id(raw_id)

            role = _node_role(n) or "unassigned"
            if role not in lane_idx_by_role:
                lane_idx_by_role[role] = len(lane_idx_by_role)
                lane_order.append(role)
                lane_y[role] = 0

            col = float(lane_idx_by_role[role])
            row = float(lane_y[role])
            lane_y[role] += 1

            x = x0 + col * x_step
            y = y0 + row * y_step

            shape = ET.SubElement(plane, f"{{{NS_BPMNDI}}}BPMNShape", attrib={"id": f"{nid}_di", "bpmnElement": nid})
            ET.SubElement(shape, f"{{{NS_DC}}}Bounds", attrib={"x": f"{x:.1f}", "y": f"{y:.1f}", "width": f"{w:.1f}", "height": f"{h:.1f}"})

            node_bounds[nid] = {"x": x, "y": y, "w": w, "h": h}

        for f in flows:
            fid = f["id"]
            src = f["src"]
            dst = f["dst"]
            sb = node_bounds.get(src)
            db = node_bounds.get(dst)
            if not sb or not db:
                continue

            sx = sb["x"] + sb["w"]
            sy = sb["y"] + sb["h"] / 2.0
            dx = db["x"]
            dy = db["y"] + db["h"] / 2.0

            e_di = ET.SubElement(plane, f"{{{NS_BPMNDI}}}BPMNEdge", attrib={"id": f"{fid}_di", "bpmnElement": fid})
            ET.SubElement(e_di, f"{{{NS_DI}}}waypoint", attrib={"x": f"{sx:.1f}", "y": f"{sy:.1f}"})
            ET.SubElement(e_di, f"{{{NS_DI}}}waypoint", attrib={"x": f"{dx:.1f}", "y": f"{dy:.1f}"})

        xml = ET.tostring(defs, encoding="utf-8", xml_declaration=True)
        return xml.decode("utf-8", errors="replace")

    except Exception as ex:
        msg = _html.escape(str(ex))
        return f'<?xml version="1.0" encoding="UTF-8"?><error>{msg}</error>'
