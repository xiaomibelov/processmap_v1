from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List
import html
import re
import xml.etree.ElementTree as ET


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
        if k in n and n[k]:
            return _text(n[k])
    return _text(n.get("id") or "Task")


def _node_kind(n: Dict[str, Any]) -> str:
    t = (n.get("type") or n.get("kind") or "").lower()
    if "start" in t:
        return "start"
    if "end" in t or "finish" in t:
        return "end"
    if "gateway" in t or "decision" in t:
        return "gateway"
    return "task"


def export_session_to_bpmn_xml(session: Any) -> str:
    """Minimal BPMN 2.0 export from session graph. Never raises."""
    try:
        data: Dict[str, Any]
        if is_dataclass(session):
            data = asdict(session)
        elif hasattr(session, "model_dump"):  # pydantic v2
            data = session.model_dump()
        elif hasattr(session, "dict"):  # pydantic v1
            data = session.dict()
        elif isinstance(session, dict):
            data = session
        else:
            data = dict(session)  # type: ignore[arg-type]

        nodes: List[Dict[str, Any]] = list(data.get("nodes") or [])
        edges: List[Dict[str, Any]] = list(data.get("edges") or [])
        title = _text(data.get("title") or data.get("name") or "Process")

        ns = {
            "bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL",
        }

        definitions = ET.Element(
            "{%s}definitions" % ns["bpmn"],
            attrib={
                "id": "Definitions_1",
                "targetNamespace": "http://bpmn.io/schema/bpmn",
            },
        )

        proc = ET.SubElement(
            definitions,
            "{%s}process" % ns["bpmn"],
            attrib={"id": "Process_1", "name": title, "isExecutable": "false"},
        )

        # lanes by role (optional)
        role_to_lane: Dict[str, str] = {}
        for n in nodes:
            role = _text(n.get("role") or n.get("actor") or "")
            if role and role not in role_to_lane:
                role_to_lane[role] = f"Lane_{_safe_id(role)}"
        lane_set = None
        if role_to_lane:
            lane_set = ET.SubElement(proc, "{%s}laneSet" % ns["bpmn"], attrib={"id": "LaneSet_1"})
            for role, lane_id in role_to_lane.items():
                ET.SubElement(lane_set, "{%s}lane" % ns["bpmn"], attrib={"id": lane_id, "name": role})

        node_id_map: Dict[str, str] = {}
        for n in nodes:
            raw_id = _text(n.get("id") or "")
            nid = _safe_id(raw_id or f"node_{len(node_id_map)+1}")
            node_id_map[raw_id or nid] = nid

            kind = _node_kind(n)
            label = _node_label(n)

            if kind == "start":
                ET.SubElement(proc, "{%s}startEvent" % ns["bpmn"], attrib={"id": nid, "name": label})
            elif kind == "end":
                ET.SubElement(proc, "{%s}endEvent" % ns["bpmn"], attrib={"id": nid, "name": label})
            elif kind == "gateway":
                ET.SubElement(proc, "{%s}exclusiveGateway" % ns["bpmn"], attrib={"id": nid, "name": label})
            else:
                ET.SubElement(proc, "{%s}task" % ns["bpmn"], attrib={"id": nid, "name": label})

            role = _text(n.get("role") or n.get("actor") or "")
            if lane_set is not None and role and role in role_to_lane:
                lane_id = role_to_lane[role]
                lane = lane_set.find(f".//{{{ns['bpmn']}}}lane[@id='{lane_id}']")
                if lane is not None:
                    ET.SubElement(lane, "{%s}flowNodeRef" % ns["bpmn"]).text = nid

        for idx, e in enumerate(edges):
            src_raw = _text(e.get("from") or e.get("source") or e.get("src") or "")
            dst_raw = _text(e.get("to") or e.get("target") or e.get("dst") or "")
            if not src_raw or not dst_raw:
                continue
            src = node_id_map.get(src_raw, _safe_id(src_raw))
            dst = node_id_map.get(dst_raw, _safe_id(dst_raw))
            fid = f"Flow_{idx+1}"
            flow = ET.SubElement(
                proc,
                "{%s}sequenceFlow" % ns["bpmn"],
                attrib={"id": fid, "sourceRef": src, "targetRef": dst},
            )
            name = _text(e.get("label") or e.get("name") or "")
            if name:
                flow.set("name", name)

        xml = ET.tostring(definitions, encoding="utf-8", xml_declaration=True)
        return xml.decode("utf-8", errors="replace")
    except Exception as ex:
        msg = html.escape(str(ex))
        return f'<?xml version="1.0" encoding="UTF-8"?><error>{msg}</error>'
