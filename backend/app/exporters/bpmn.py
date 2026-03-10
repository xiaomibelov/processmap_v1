from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Tuple, Optional
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
    p = n.get("parameters")
    if isinstance(p, dict):
        step_t = _text(p.get("interview_step_type") or "").strip().lower()
        if step_t in ("subprocess_collapsed", "subprocess_expanded", "adhoc_subprocess_collapsed", "adhoc_subprocess_expanded"):
            return step_t
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


def _norm_key(v: Any) -> str:
    return re.sub(r"\s+", " ", _text(v).strip().lower())


def _collect_interview_comments(data: Dict[str, Any], nodes: List[Dict[str, Any]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    interview = data.get("interview")
    if not isinstance(interview, dict):
        interview = {}
    steps = interview.get("steps")
    if not isinstance(steps, list):
        steps = []

    title_to_ids: Dict[str, List[str]] = {}
    for n in nodes:
        nid = _text(n.get("id")).strip()
        if not nid:
            continue
        key = _norm_key(n.get("title") or n.get("name") or n.get("label"))
        if not key:
            continue
        title_to_ids.setdefault(key, []).append(nid)

    for st in steps:
        if not isinstance(st, dict):
            continue
        comment = _text(st.get("comment") or st.get("note") or "").strip()
        if not comment:
            continue
        step_node_id = _text(st.get("node_id") or st.get("nodeId") or st.get("id") or "").strip()
        if step_node_id:
            lower_id = step_node_id.lower()
            if lower_id.startswith("startevent"):
                out["__start__"] = comment
            elif lower_id.startswith("endevent"):
                out["__end__"] = comment
            if step_node_id not in out:
                out[step_node_id] = comment
                continue
        action_key = _norm_key(st.get("action"))
        if not action_key:
            continue
        ids = title_to_ids.get(action_key) or []
        if len(ids) == 1 and ids[0] not in out:
            out[ids[0]] = comment

    for n in nodes:
        nid = _text(n.get("id")).strip()
        if not nid or nid in out:
            continue
        params = n.get("parameters")
        if not isinstance(params, dict):
            continue
        p_comment = _text(params.get("interview_comment") or "").strip()
        if p_comment:
            out[nid] = p_comment

    boundaries = data.get("interview") if isinstance(data.get("interview"), dict) else {}
    trigger_text = _text((boundaries or {}).get("boundaries", {}).get("trigger") if isinstance((boundaries or {}).get("boundaries"), dict) else "").strip()
    if trigger_text and "__start__" not in out:
        trigger_key = _norm_key(trigger_text)
        for st in steps:
            if not isinstance(st, dict):
                continue
            comment = _text(st.get("comment") or st.get("note") or "").strip()
            if not comment:
                continue
            if _norm_key(st.get("action")) == trigger_key:
                out["__start__"] = comment
                break

    return out


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


def _shape_size(kind: str) -> Tuple[float, float]:
    if kind.startswith("event_"):
        return 36.0, 36.0
    if kind.startswith("gateway_"):
        return 60.0, 60.0
    if kind in ("subprocess_collapsed", "adhoc_subprocess_collapsed"):
        return 200.0, 96.0
    if kind in ("subprocess_expanded", "adhoc_subprocess_expanded"):
        return 220.0, 132.0
    return 180.0, 80.0


def export_session_to_bpmn_xml(session: Any) -> str:
    """BPMN 2.0 XML export that is importable/renderable in bpmn-js.

    Goals:
    - Always returns XML (never raises).
    - Produces a "complete" diagram: collaboration+participant(pool), lanes, start/end events.
    - Uses session.nodes/session.edges when present; otherwise exports a minimal skeleton start->end.
    - Adds automatic flows: start->sources, sinks->end.
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
        interview_comment_by_raw_id = _collect_interview_comments(data, nodes)

        title = _text(data.get("title") or data.get("name") or "Process").strip() or "Process"
        roles_order: List[str] = [r for r in (data.get("roles") or []) if r]

        defs = ET.Element(
            f"{{{NS_BPMN}}}definitions",
            attrib={
                "id": "Definitions_1",
                "targetNamespace": "http://bpmn.io/schema/bpmn",
            },
        )

        collab = ET.SubElement(defs, f"{{{NS_BPMN}}}collaboration", attrib={"id": "Collaboration_1"})

        proc = ET.SubElement(
            defs,
            f"{{{NS_BPMN}}}process",
            attrib={"id": "Process_1", "name": title, "isExecutable": "false"},
        )

        # Keep participant (pool) name aligned with session/process title.
        participant_name = title
        part = ET.SubElement(
            collab,
            f"{{{NS_BPMN}}}participant",
            attrib={"id": "Participant_1", "name": participant_name, "processRef": "Process_1"},
        )

        # lanes
        role_to_lane_id: Dict[str, str] = {}
        lane_set = ET.SubElement(proc, f"{{{NS_BPMN}}}laneSet", attrib={"id": "LaneSet_1"})
        if roles_order:
            for i, role in enumerate(roles_order, start=1):
                lane_id = f"Lane_{i}"
                role_to_lane_id[role] = lane_id
                ET.SubElement(lane_set, f"{{{NS_BPMN}}}lane", attrib={"id": lane_id, "name": role})
        else:
            # keep a single lane so the diagram has a container even without roles
            role_to_lane_id["unassigned"] = "Lane_1"
            ET.SubElement(lane_set, f"{{{NS_BPMN}}}lane", attrib={"id": "Lane_1", "name": "unassigned"})

        # node ids mapping
        raw_to_bpmn_id: Dict[str, str] = {}
        used_ids: set[str] = set()

        def alloc_id(raw_id: str, fallback_prefix: str, idx: int) -> str:
            base = _safe_id(raw_id) if raw_id else f"{fallback_prefix}_{idx}"
            nid = base
            j = 1
            while nid in used_ids:
                j += 1
                nid = f"{base}_{j}"
            used_ids.add(nid)
            return nid

        # Start/End
        start_role = _text(data.get("start_role") or "").strip()
        if start_role and start_role not in role_to_lane_id:
            # if start_role exists but not in roles_order, still create lane for it
            lane_id = f"Lane_{len(role_to_lane_id) + 1}"
            role_to_lane_id[start_role] = lane_id
            ET.SubElement(lane_set, f"{{{NS_BPMN}}}lane", attrib={"id": lane_id, "name": start_role})

        start_id = alloc_id("StartEvent_1", "StartEvent", 1)
        end_id = alloc_id("EndEvent_1", "EndEvent", 1)

        start_el = ET.SubElement(proc, f"{{{NS_BPMN}}}startEvent", attrib={"id": start_id, "name": "Стартовое событие"})
        end_el = ET.SubElement(proc, f"{{{NS_BPMN}}}endEvent", attrib={"id": end_id, "name": "Процесс завершён"})

        # assign start/end to a lane
        start_lane_role = start_role or (roles_order[0] if roles_order else "unassigned")
        end_lane_role = start_lane_role
        if not nodes and roles_order:
            end_lane_role = roles_order[-1]
        if end_lane_role and end_lane_role not in role_to_lane_id:
            lane_id = f"Lane_{len(role_to_lane_id) + 1}"
            role_to_lane_id[end_lane_role] = lane_id
            ET.SubElement(lane_set, f"{{{NS_BPMN}}}lane", attrib={"id": lane_id, "name": end_lane_role})

        def lane_append_flow_ref(role: str, flow_node_id: str) -> None:
            lane_id = role_to_lane_id.get(role) or role_to_lane_id.get("unassigned") or "Lane_1"
            lane = lane_set.find(f".//{{{NS_BPMN}}}lane[@id='{lane_id}']")
            if lane is not None:
                ET.SubElement(lane, f"{{{NS_BPMN}}}flowNodeRef").text = flow_node_id

        lane_append_flow_ref(start_lane_role, start_id)
        lane_append_flow_ref(end_lane_role, end_id)

        # nodes
        node_kind_by_bpmn_id: Dict[str, str] = {}
        role_by_bpmn_id: Dict[str, str] = {}
        comment_by_bpmn_id: Dict[str, str] = {}
        start_note = _text(interview_comment_by_raw_id.get(start_id) or interview_comment_by_raw_id.get("StartEvent_1") or interview_comment_by_raw_id.get("__start__") or "").strip()
        if start_note:
            comment_by_bpmn_id[start_id] = start_note
        end_note = _text(interview_comment_by_raw_id.get(end_id) or interview_comment_by_raw_id.get("EndEvent_1") or interview_comment_by_raw_id.get("__end__") or "").strip()
        if end_note:
            comment_by_bpmn_id[end_id] = end_note
        fallback_role = start_lane_role if start_lane_role in role_to_lane_id else (roles_order[0] if roles_order else "unassigned")

        for i, n in enumerate(nodes, start=1):
            raw_id = _text(n.get("id") or f"node_{i}")
            nid = alloc_id(raw_id, "Task", i)
            raw_to_bpmn_id[raw_id] = nid

            kind = _node_kind(n)
            label = _node_label(n)

            if kind == "gateway_xor":
                ET.SubElement(proc, f"{{{NS_BPMN}}}exclusiveGateway", attrib={"id": nid, "name": label})
            elif kind == "gateway_parallel":
                ET.SubElement(proc, f"{{{NS_BPMN}}}parallelGateway", attrib={"id": nid, "name": label})
            elif kind in ("subprocess_collapsed", "subprocess_expanded"):
                ET.SubElement(proc, f"{{{NS_BPMN}}}subProcess", attrib={"id": nid, "name": label})
            elif kind in ("adhoc_subprocess_collapsed", "adhoc_subprocess_expanded"):
                ET.SubElement(proc, f"{{{NS_BPMN}}}adHocSubProcess", attrib={"id": nid, "name": label, "ordering": "Parallel"})
            else:
                ET.SubElement(proc, f"{{{NS_BPMN}}}task", attrib={"id": nid, "name": label})

            node_kind_by_bpmn_id[nid] = kind
            role = _node_role(n) or fallback_role
            if roles_order and role not in role_to_lane_id:
                # Keep swimlanes stable for configured actor set.
                role = fallback_role
            role_by_bpmn_id[nid] = role
            note = _text(interview_comment_by_raw_id.get(raw_id) or "").strip()
            if note:
                comment_by_bpmn_id[nid] = note
            if role not in role_to_lane_id:
                lane_id = f"Lane_{len(role_to_lane_id) + 1}"
                role_to_lane_id[role] = lane_id
                ET.SubElement(lane_set, f"{{{NS_BPMN}}}lane", attrib={"id": lane_id, "name": role})

            lane_append_flow_ref(role, nid)

        # edges -> sequenceFlow
        flows: List[Dict[str, Any]] = []
        flow_key: set[Tuple[str, str, str]] = set()

        def add_flow(src: str, dst: str, name: str = "") -> None:
            if not src or not dst or src == dst:
                return
            key = (src, dst, name or "")
            if key in flow_key:
                return
            flow_key.add(key)

            fid = alloc_id(f"Flow_{len(flows)+1}", "Flow", len(flows) + 1)
            el = ET.SubElement(
                proc,
                f"{{{NS_BPMN}}}sequenceFlow",
                attrib={"id": fid, "sourceRef": src, "targetRef": dst},
            )
            if name:
                el.set("name", name)
            flows.append({"id": fid, "src": src, "dst": dst})

        # explicit flows from edges
        for e in edges:
            src_raw, dst_raw = _edge_src_dst(e)
            if not src_raw or not dst_raw:
                continue
            src = raw_to_bpmn_id.get(src_raw, _safe_id(src_raw))
            dst = raw_to_bpmn_id.get(dst_raw, _safe_id(dst_raw))
            name = _text(e.get("when") or e.get("label") or e.get("name") or "").strip()
            add_flow(src, dst, name)

        # auto flows: start->sources, sinks->end
        bpmn_nodes = list(node_kind_by_bpmn_id.keys())

        if not bpmn_nodes:
            add_flow(start_id, end_id, "")
        else:
            incoming: Dict[str, int] = {nid: 0 for nid in bpmn_nodes}
            outgoing: Dict[str, int] = {nid: 0 for nid in bpmn_nodes}
            for f in flows:
                if f["dst"] in incoming:
                    incoming[f["dst"]] += 1
                if f["src"] in outgoing:
                    outgoing[f["src"]] += 1

            sources = [nid for nid in bpmn_nodes if incoming.get(nid, 0) == 0]
            sinks = [nid for nid in bpmn_nodes if outgoing.get(nid, 0) == 0]

            for nid in sources:
                add_flow(start_id, nid, "")
            for nid in sinks:
                add_flow(nid, end_id, "")

        # BPMNDI
        diagram = ET.SubElement(defs, f"{{{NS_BPMNDI}}}BPMNDiagram", attrib={"id": "BPMNDiagram_1"})
        plane = ET.SubElement(
            diagram,
            f"{{{NS_BPMNDI}}}BPMNPlane",
            attrib={"id": "BPMNPlane_1", "bpmnElement": "Collaboration_1"},
        )

        # layout strategy (lanes as horizontal rows)
        lane_order = [r for r in roles_order if r and r in role_to_lane_id]
        for r in list(role_to_lane_id.keys()):
            if r and r not in lane_order:
                lane_order.append(r)
        if not lane_order:
            lane_order = ["unassigned"]

        lane_idx_by_role = {r: i for i, r in enumerate(lane_order)}

        node_bounds: Dict[str, Dict[str, float]] = {}
        lane_col: Dict[str, int] = {r: 0 for r in lane_order}

        x0 = 240.0
        y0 = 120.0
        x_step = 240.0
        lane_h = 150.0

        def place_shape(bpmn_id: str, kind: str, role: str) -> None:
            w, h = _shape_size(kind)
            if role not in lane_idx_by_role:
                lane_idx_by_role[role] = len(lane_idx_by_role)
                lane_order.append(role)
                lane_col[role] = 0

            row = float(lane_idx_by_role[role])
            col = float(lane_col.get(role, 0))
            lane_col[role] = int(col) + 1

            x = x0 + col * x_step
            lane_top = y0 + row * lane_h
            y = lane_top + max((lane_h - h) / 2.0, 6.0)

            shape_attrs: Dict[str, str] = {"id": f"{bpmn_id}_di", "bpmnElement": bpmn_id}
            if kind in ("subprocess_collapsed", "adhoc_subprocess_collapsed"):
                shape_attrs["isExpanded"] = "false"
            elif kind in ("subprocess_expanded", "adhoc_subprocess_expanded"):
                shape_attrs["isExpanded"] = "true"
            shape = ET.SubElement(plane, f"{{{NS_BPMNDI}}}BPMNShape", attrib=shape_attrs)
            ET.SubElement(shape, f"{{{NS_DC}}}Bounds", attrib={"x": f"{x:.1f}", "y": f"{y:.1f}", "width": f"{w:.1f}", "height": f"{h:.1f}"})

            node_bounds[bpmn_id] = {"x": x, "y": y, "w": w, "h": h}

        # participant + lanes bounds (computed after placing nodes)
        # place start/end + nodes
        place_shape(start_id, "event_start", start_lane_role)

        for nid in bpmn_nodes:
            kind = node_kind_by_bpmn_id.get(nid) or "task"
            role = role_by_bpmn_id.get(nid) or "unassigned"
            place_shape(nid, kind, role)

        place_shape(end_id, "event_end", end_lane_role)

        # add text annotations from Interview comments and attach them to node shapes
        annotations: List[Dict[str, str]] = []
        annotation_targets = [start_id, *bpmn_nodes, end_id]
        for i, nid in enumerate(annotation_targets, start=1):
            note = _text(comment_by_bpmn_id.get(nid) or "").strip()
            if not note:
                continue
            ann_id = alloc_id(f"TextAnnotation_{i}", "TextAnnotation", i)
            assoc_id = alloc_id(f"Association_{i}", "Association", i)

            ann = ET.SubElement(proc, f"{{{NS_BPMN}}}textAnnotation", attrib={"id": ann_id})
            ET.SubElement(ann, f"{{{NS_BPMN}}}text").text = note
            ET.SubElement(proc, f"{{{NS_BPMN}}}association", attrib={"id": assoc_id, "sourceRef": nid, "targetRef": ann_id})
            annotations.append({"node_id": nid, "annotation_id": ann_id, "association_id": assoc_id, "text": note})

        for ann in annotations:
            nid = ann["node_id"]
            nb = node_bounds.get(nid)
            if not nb:
                continue
            text_len = max(len(ann.get("text", "")), 12)
            ann_w = float(min(max(text_len * 6.8, 180.0), 420.0))
            ann_h = 56.0
            ann_x = nb["x"] + nb["w"] + 40.0
            ann_y = max(nb["y"] - 6.0, 24.0)

            ashape = ET.SubElement(
                plane,
                f"{{{NS_BPMNDI}}}BPMNShape",
                attrib={"id": f"{ann['annotation_id']}_di", "bpmnElement": ann["annotation_id"]},
            )
            ET.SubElement(
                ashape,
                f"{{{NS_DC}}}Bounds",
                attrib={"x": f"{ann_x:.1f}", "y": f"{ann_y:.1f}", "width": f"{ann_w:.1f}", "height": f"{ann_h:.1f}"},
            )

            e_di = ET.SubElement(
                plane,
                f"{{{NS_BPMNDI}}}BPMNEdge",
                attrib={"id": f"{ann['association_id']}_di", "bpmnElement": ann["association_id"]},
            )
            sx = nb["x"] + nb["w"]
            sy = nb["y"] + nb["h"] / 2.0
            dx = ann_x
            dy = ann_y + ann_h / 2.0
            ET.SubElement(e_di, f"{{{NS_DI}}}waypoint", attrib={"x": f"{sx:.1f}", "y": f"{sy:.1f}"})
            ET.SubElement(e_di, f"{{{NS_DI}}}waypoint", attrib={"x": f"{dx:.1f}", "y": f"{dy:.1f}"})

        # edges DI
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

        # compute pool/lane bounds from node bounds + lane count (keep all lanes visible)
        lane_count = float(max(len(lane_order), 1))
        pool_y = y0 - 20.0
        pool_h = lane_h * lane_count + 40.0

        if node_bounds:
            min_x = min(b["x"] for b in node_bounds.values())
            max_x = max(b["x"] + b["w"] for b in node_bounds.values())
            pool_x = min(min_x - 120.0, 120.0)
            pool_w = max((max_x + 120.0) - pool_x, 780.0)
        else:
            pool_x = 120.0
            pool_w = 780.0

        # participant shape (pool)
        pshape = ET.SubElement(plane, f"{{{NS_BPMNDI}}}BPMNShape", attrib={"id": f"{part.get('id')}_di", "bpmnElement": part.get("id")})
        ET.SubElement(pshape, f"{{{NS_DC}}}Bounds", attrib={"x": f"{pool_x:.1f}", "y": f"{pool_y:.1f}", "width": f"{pool_w:.1f}", "height": f"{pool_h:.1f}"})

        # lane shapes as horizontal swimlanes (inset from participant label strip)
        lane_x = pool_x + 30.0
        lane_w = max(pool_w - 30.0, 120.0)
        for role in lane_order:
            lane_id = role_to_lane_id.get(role)
            if not lane_id:
                continue
            row = float(lane_idx_by_role.get(role, 0))
            lx = lane_x
            ly = pool_y + 20.0 + row * lane_h
            lshape = ET.SubElement(plane, f"{{{NS_BPMNDI}}}BPMNShape", attrib={"id": f"{lane_id}_di", "bpmnElement": lane_id, "isHorizontal": "true"})
            ET.SubElement(lshape, f"{{{NS_DC}}}Bounds", attrib={"x": f"{lx:.1f}", "y": f"{ly:.1f}", "width": f"{lane_w:.1f}", "height": f"{lane_h:.1f}"})

        xml = ET.tostring(defs, encoding="utf-8", xml_declaration=True)
        return xml.decode("utf-8", errors="replace")

    except Exception as ex:
        msg = _html.escape(str(ex))
        return f'<?xml version="1.0" encoding="UTF-8"?><error>{msg}</error>'
