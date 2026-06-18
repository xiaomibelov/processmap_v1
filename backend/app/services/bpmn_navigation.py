from __future__ import annotations
import xml.etree.ElementTree as ET
from typing import List, Optional


BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"

ET.register_namespace("bpmn", BPMN_NS)
ET.register_namespace("bpmndi", BPMNDI_NS)
ET.register_namespace("dc", DC_NS)
ET.register_namespace("di", DI_NS)
ET.register_namespace("xsi", XSI_NS)


def _local_tag(tag: str) -> str:
    return str(tag).rsplit("}", 1)[-1].lower() if "}" in str(tag) else str(tag).lower()


def _element_id(el: ET.Element) -> str:
    return str(el.attrib.get("id") or "").strip()


def find_bpmn_element(xml_text: str, element_id: str) -> Optional[ET.Element]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if _element_id(el) == element_id:
            return el
    return None


def element_type(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    return _local_tag(el.tag) if el is not None else None


def called_element_id(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    if el is None:
        return None
    called = str(el.attrib.get("calledElement") or "").strip()
    return called or None


def _ns(tag: str, ns: str = BPMN_NS) -> str:
    return f"{{{ns}}}{tag}"


_SHAPE_ELEMENT_TYPES = {
    "task", "usertask", "servicetask", "sendtask", "receivetask", "manualtask",
    "businessruletask", "scripttask", "callactivity",
    "startevent", "intermediatethrowevent", "intermediatecatchevent", "endevent",
    "exclusivegateway", "parallelgateway", "inclusivegateway", "eventbasedgateway",
    "subprocess", "dataobjectreference", "datastorereference", "textannotation",
}


def _is_shape_element(el: ET.Element) -> bool:
    return _local_tag(el.tag) in _SHAPE_ELEMENT_TYPES


def _default_size_for_element(el: ET.Element):
    tag = _local_tag(el.tag)
    if "event" in tag:
        return (36, 36)
    if "gateway" in tag:
        return (50, 50)
    if tag in ("dataobjectreference", "datastorereference"):
        return (36, 50)
    if tag == "textannotation":
        return (100, 30)
    return (100, 80)


def _center(bounds):
    return (bounds[0] + bounds[2] / 2.0, bounds[1] + bounds[3] / 2.0)


def _generate_di_for_process(process_el: ET.Element, process_id: str) -> ET.Element:
    """Generate a minimal grid layout BPMNDiagram for a process without DI."""
    diagram = ET.Element(_ns("BPMNDiagram", BPMNDI_NS), {"id": "BPMNDiagram_1"})
    plane = ET.SubElement(diagram, _ns("BPMNPlane", BPMNDI_NS), {"id": "BPMNPlane_1", "bpmnElement": process_id})

    children = list(process_el)
    shape_els = [c for c in children if _is_shape_element(c)]

    def _sort_key(el: ET.Element):
        tag = _local_tag(el.tag)
        if "startevent" in tag:
            return (0, 0)
        if "endevent" in tag:
            return (2, 0)
        return (1, 0)

    shape_els_sorted = sorted(shape_els, key=_sort_key)

    positions = {}
    start_set = False
    end_set = False
    for idx, el in enumerate(shape_els_sorted):
        tag = _local_tag(el.tag)
        if "startevent" in tag and not start_set:
            x, y = 50, 50
            start_set = True
        elif "endevent" in tag and not end_set:
            x, y = 250, 200
            end_set = True
        else:
            x = 50 + (idx % 3) * 120
            y = 50 + (idx // 3) * 80
        positions[_element_id(el)] = (x, y)

    bounds_by_id = {}
    for el in shape_els_sorted:
        eid = _element_id(el)
        x, y = positions.get(eid, (50, 50))
        w, h = _default_size_for_element(el)
        shape = ET.SubElement(plane, _ns("BPMNShape", BPMNDI_NS), {"id": f"{eid}_di", "bpmnElement": eid})
        ET.SubElement(shape, _ns("Bounds", DC_NS), {"x": str(x), "y": str(y), "width": str(w), "height": str(h)})
        bounds_by_id[eid] = (x, y, w, h)

    for el in children:
        tag = _local_tag(el.tag)
        if tag not in ("sequenceflow", "association"):
            continue
        eid = _element_id(el)
        source = el.attrib.get("sourceRef")
        target = el.attrib.get("targetRef")
        if not source or not target:
            continue
        if source not in bounds_by_id or target not in bounds_by_id:
            continue
        edge = ET.SubElement(
            plane,
            _ns("BPMNEdge", BPMNDI_NS),
            {"id": f"{eid}_di", "bpmnElement": eid, "sourceElement": source, "targetElement": target},
        )
        sx, sy = _center(bounds_by_id[source])
        tx, ty = _center(bounds_by_id[target])
        ET.SubElement(edge, _ns("waypoint", DI_NS), {"x": str(sx), "y": str(sy)})
        ET.SubElement(edge, _ns("waypoint", DI_NS), {"x": str(tx), "y": str(ty)})

    return diagram


def _count_shapes_in_diagram(diagram_el: ET.Element) -> int:
    count = 0
    for plane in diagram_el:
        if _local_tag(plane.tag) != "bpmnplane":
            continue
        for shape in plane:
            if _local_tag(shape.tag) in ("bpmnshape", "bpmnedge"):
                count += 1
    return count


def _copy_diagram_for_process(root: ET.Element, process_id: str) -> Optional[ET.Element]:
    """Extract BPMNDiagram/BPMNPlane and shapes/edges that belong to the given process."""
    for el in root.iter():
        if _local_tag(el.tag) != "bpmndiagram":
            continue
        for plane in el:
            if _local_tag(plane.tag) != "bpmnplane":
                continue
            if str(plane.attrib.get("bpmnElement") or "").strip() == process_id:
                return el
    return None


def _copy_diagram_element(diagram_el: ET.Element, defs: ET.Element) -> None:
    """Copy a BPMNDiagram element into a new definitions tree, rewriting namespaces."""
    new_diagram = ET.SubElement(defs, _ns("BPMNDiagram", BPMNDI_NS), diagram_el.attrib)
    for plane in diagram_el:
        if _local_tag(plane.tag) != "bpmnplane":
            continue
        new_plane = ET.SubElement(new_diagram, _ns("BPMNPlane", BPMNDI_NS), plane.attrib)
        for shape in plane:
            tag = _local_tag(shape.tag)
            if tag in ("bpmnshape", "bpmnedge"):
                new_shape = ET.SubElement(
                    new_plane,
                    _ns(tag.capitalize().replace("Bpmnshape", "BPMNShape").replace("Bpmnedge", "BPMNEdge"), BPMNDI_NS),
                    shape.attrib,
                )
                for waypoint in shape:
                    wp_tag = _local_tag(waypoint.tag)
                    if wp_tag == "waypoint":
                        ET.SubElement(new_shape, _ns("waypoint", DI_NS), waypoint.attrib)
                    elif wp_tag == "bounds":
                        ET.SubElement(new_shape, _ns("Bounds", DC_NS), waypoint.attrib)


def _wrap_process_fragment(process_el: ET.Element, source_root: ET.Element) -> str:
    """Wrap a <process> fragment into a full <bpmn:definitions> document."""
    process_id = _element_id(process_el)

    attribs = {
        "id": "Definitions_subprocess",
        "targetNamespace": "http://bpmn.io/schema/bpmn",
    }

    defs = ET.Element(_ns("definitions"), attribs)

    # Copy the process element into new tree, preserving tag and attributes.
    # Embedded <bpmn:subProcess> fragments are normalized to <bpmn:process> so the
    # resulting document can be rendered by a standalone BPMN viewer.
    original_tag = _local_tag(process_el.tag)
    process_tag = _ns("process") if original_tag == "subprocess" else process_el.tag
    new_process = ET.SubElement(defs, process_tag, process_el.attrib)
    for child in process_el:
        new_process.append(child)

    # Try to copy diagram for this process.
    diagram_el = _copy_diagram_for_process(source_root, process_id)
    if diagram_el is not None and _count_shapes_in_diagram(diagram_el) > 0:
        _copy_diagram_element(diagram_el, defs)
    else:
        # Generate a minimal grid layout so bpmn-js can render the subprocess contents.
        defs.append(_generate_di_for_process(new_process, process_id))

    return ET.tostring(defs, encoding="utf-8", xml_declaration=True).decode("utf-8")


def extract_embedded_process_xml(xml_text: str, process_id: str) -> Optional[str]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if _local_tag(el.tag) == "process" and _element_id(el) == process_id:
            return _wrap_process_fragment(el, root)
    return None


def extract_subprocess_xml(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    if el is None:
        return None
    tag = _local_tag(el.tag)
    if tag == "subprocess":
        return _wrap_process_fragment(el, ET.fromstring(xml_text))
    if tag == "callactivity":
        called = str(el.attrib.get("calledElement") or "").strip()
        if called:
            return extract_embedded_process_xml(xml_text, called)
    return None


def _first_element_by_tag(xml_text: str, tags: List[str]) -> Optional[str]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if _local_tag(el.tag) in tags:
            return _element_id(el) or None
    return None


def auto_target_element_id(xml_text: str) -> Optional[str]:
    target = _first_element_by_tag(xml_text, ["usertask"])
    if target:
        return target
    return _first_element_by_tag(xml_text, ["task"])


def resolve_target_element_id(xml_text: str, explicit_target_id: Optional[str] = None) -> Optional[str]:
    if explicit_target_id:
        el = find_bpmn_element(xml_text, explicit_target_id)
        if el is not None:
            return explicit_target_id
    return auto_target_element_id(xml_text)
