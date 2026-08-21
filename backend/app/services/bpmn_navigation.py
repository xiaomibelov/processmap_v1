from __future__ import annotations
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional


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


def get_element_name(xml_text: str, element_id: str) -> Optional[str]:
    """Return the BPMN element's human-readable name (attrib['name'])."""
    if not xml_text or not element_id:
        return None
    try:
        el = find_bpmn_element(xml_text, element_id)
    except Exception:
        return None
    if el is None:
        return None
    name = str(el.attrib.get("name") or "").strip()
    return name or None


def assert_unique_element_id(xml_text: str, element_id: str) -> None:
    """Raise ValueError if element_id occurs more than once in the XML.

    BPMN requires globally unique element ids. Duplicate ids break drill-in
    navigation because the viewer and the backend may resolve the same id to
    different elements.
    """
    if not xml_text or not element_id:
        return
    root = ET.fromstring(xml_text)
    count = sum(1 for el in root.iter() if _element_id(el) == element_id)
    if count > 1:
        raise ValueError(
            f"BPMN element id {element_id!r} is not unique ({count} occurrences); "
            "subprocess navigation requires unique ids."
        )


def element_type(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    return _local_tag(el.tag) if el is not None else None


def called_element_id(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    if el is None:
        return None
    called = str(el.attrib.get("calledElement") or "").strip()
    return called or None


def find_subprocess_elements(xml_text: str) -> List[Dict[str, Optional[str]]]:
    """Return top-level bpmn:subProcess elements (not nested inside another subprocess)."""
    if not xml_text:
        return []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []
    parent_map = {child: parent for parent in root.iter() for child in parent}
    out = []
    tag_subprocess = f"{{{BPMN_NS}}}subProcess"
    for el in root.iter(tag_subprocess):
        parent = parent_map.get(el)
        if parent is not None and _local_tag(parent.tag) == "subprocess":
            continue
        element_id = _element_id(el)
        if not element_id:
            continue
        name = str(el.attrib.get("name") or "").strip() or None
        out.append({"id": element_id, "name": name})
    return out


def find_child_session_element_ids(xml_text: str) -> List[str]:
    """Return ids of ALL elements for which child sessions can materialize.

    Child sessions are created for bpmn:subProcess (import-time materialization)
    AND bpmn:callActivity (lazy creation via navigate_to_subprocess), so a
    soft-delete keep-list must cover both types. Ids are collected at ANY
    depth (not only top-level) on purpose: the keep-list is a deletion guard,
    and a conservative (superset) keep-list can only ever delete less.
    Returns [] on empty/unparseable input — callers must gate on parseability
    before using the result for deletion decisions.
    """
    if not xml_text:
        return []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []
    out = []
    for el in root.iter():
        if _local_tag(el.tag) in {"subprocess", "callactivity"}:
            element_id = _element_id(el)
            if element_id:
                out.append(element_id)
    return out


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


def _shape_bounds(shape_el: ET.Element):
    bounds = shape_el.find(".//{http://www.omg.org/spec/DD/20100524/DC}Bounds")
    if bounds is None:
        return None
    return {k: bounds.attrib.get(k) for k in ["x", "y", "width", "height"]}


def _bounds_contained(inner, outer, tolerance: float = 0.0) -> bool:
    ix = float(inner["x"])
    iy = float(inner["y"])
    iw = float(inner["width"])
    ih = float(inner["height"])
    ox = float(outer["x"])
    oy = float(outer["y"])
    ow = float(outer["width"])
    oh = float(outer["height"])
    return (
        ix + tolerance >= ox
        and iy + tolerance >= oy
        and ix + iw - tolerance <= ox + ow
        and iy + ih - tolerance <= oy + oh
    )


_GRID_STEP_X = 120.0
_GRID_STEP_Y = 80.0


def preserve_existing_di(new_xml: str, old_xml: str) -> Optional[str]:
    """Merge preserved DI from old_xml into new_xml.

    - Shapes/edges whose element id exists in old_xml keep old bounds/waypoints.
    - New shapes are placed in a free area to the right/bottom of preserved ones
      using the same grid step as ``_generate_di_for_process``.
    - New edges get straight waypoints between the final centers of their
      source/target shapes.
    - Returns ``new_xml`` unchanged if old_xml is unparseable or contains no DI.
    - Returns ``None`` if new_xml is unparseable.
    """
    if not new_xml or not old_xml:
        return None
    try:
        new_root = ET.fromstring(new_xml)
    except Exception:
        return None
    try:
        old_root = ET.fromstring(old_xml)
    except Exception:
        return new_xml

    new_plane = None
    for diagram in new_root.iter():
        if _local_tag(diagram.tag) == "bpmndiagram":
            for plane in diagram:
                if _local_tag(plane.tag) == "bpmnplane":
                    new_plane = plane
                    break
            break
    if new_plane is None:
        return new_xml

    old_shapes: Dict[str, ET.Element] = {}
    old_edges: Dict[str, ET.Element] = {}
    for diagram in old_root.iter():
        if _local_tag(diagram.tag) != "bpmndiagram":
            continue
        for plane in diagram:
            if _local_tag(plane.tag) != "bpmnplane":
                continue
            for shape in plane:
                tag = _local_tag(shape.tag)
                if tag == "bpmnshape":
                    eid = shape.attrib.get("bpmnElement")
                    if eid:
                        old_shapes[eid] = shape
                elif tag == "bpmnedge":
                    eid = shape.attrib.get("bpmnElement")
                    if eid:
                        old_edges[eid] = shape

    if not old_shapes and not old_edges:
        return new_xml

    # Phase 1: preserve bounds for shapes that existed before.
    new_shapes: List[ET.Element] = []
    final_bounds: Dict[str, Tuple[float, float, float, float]] = {}
    for shape in new_plane:
        if _local_tag(shape.tag) != "bpmnshape":
            continue
        eid = shape.attrib.get("bpmnElement")
        if not eid:
            continue
        bounds_el = shape.find(".//{http://www.omg.org/spec/DD/20100524/DC}Bounds")
        if bounds_el is None:
            continue
        if eid in old_shapes:
            old_bounds = _shape_bounds(old_shapes[eid])
            if old_bounds:
                for k, v in old_bounds.items():
                    bounds_el.attrib[k] = str(v)
        else:
            new_shapes.append(shape)
        final_bounds[eid] = tuple(
            float(bounds_el.attrib.get(k, 0)) for k in ("x", "y", "width", "height")
        )

    # Phase 2: place new shapes in a free area using the same grid step.
    max_x = 0.0
    max_y = 0.0
    for x, y, w, h in final_bounds.values():
        max_x = max(max_x, x + w)
        max_y = max(max_y, y + h)

    anchor_x = max_x + _GRID_STEP_X
    anchor_y = max_y + _GRID_STEP_Y

    for idx, shape in enumerate(new_shapes):
        eid = shape.attrib.get("bpmnElement")
        bounds_el = shape.find(".//{http://www.omg.org/spec/DD/20100524/DC}Bounds")
        if bounds_el is None:
            continue
        w = float(bounds_el.attrib.get("width", 100))
        h = float(bounds_el.attrib.get("height", 80))
        x = anchor_x + (idx % 3) * _GRID_STEP_X
        y = anchor_y + (idx // 3) * _GRID_STEP_Y
        bounds_el.attrib["x"] = str(int(x))
        bounds_el.attrib["y"] = str(int(y))
        bounds_el.attrib["width"] = str(int(w))
        bounds_el.attrib["height"] = str(int(h))
        final_bounds[eid] = (x, y, w, h)

    # Phase 3: preserve old edge waypoints; recalculate new edges from final bounds.
    for edge in list(new_plane):
        if _local_tag(edge.tag) != "bpmnedge":
            continue
        eid = edge.attrib.get("bpmnElement")
        if not eid:
            continue

        # Remove existing waypoints.
        for wp in list(edge):
            if _local_tag(wp.tag) == "waypoint":
                edge.remove(wp)

        if eid in old_edges:
            for wp in old_edges[eid]:
                if _local_tag(wp.tag) == "waypoint":
                    ET.SubElement(edge, _ns("waypoint", DI_NS), wp.attrib)
            continue

        source_id = edge.attrib.get("sourceElement")
        target_id = edge.attrib.get("targetElement")
        if not source_id or not target_id:
            flow_el = next((e for e in new_root.iter() if _element_id(e) == eid), None)
            if flow_el is not None:
                source_id = flow_el.attrib.get("sourceRef")
                target_id = flow_el.attrib.get("targetRef")

        if source_id in final_bounds and target_id in final_bounds:
            sx, sy = _center(final_bounds[source_id])
            tx, ty = _center(final_bounds[target_id])
            ET.SubElement(edge, _ns("waypoint", DI_NS), {"x": str(sx), "y": str(sy)})
            ET.SubElement(edge, _ns("waypoint", DI_NS), {"x": str(tx), "y": str(ty)})

    return ET.tostring(new_root, encoding="utf-8", xml_declaration=True).decode("utf-8")


def _recursive_copy_translate(src: ET.Element, dst_parent: ET.Element, offset_x: float, offset_y: float) -> None:
    new = ET.SubElement(dst_parent, src.tag, dict(src.attrib))
    if _local_tag(new.tag) in ("bounds", "waypoint"):
        if "x" in new.attrib:
            new.attrib["x"] = str(float(new.attrib["x"]) - offset_x)
        if "y" in new.attrib:
            new.attrib["y"] = str(float(new.attrib["y"]) - offset_y)
    for child in src:
        _recursive_copy_translate(child, new, offset_x, offset_y)


def _find_expanded_subprocess_shape(root: ET.Element, process_id: str):
    """Find an expanded BPMNShape for the given process inside any parent plane."""
    for diagram in root.iter():
        if _local_tag(diagram.tag) != "bpmndiagram":
            continue
        for plane in diagram:
            if _local_tag(plane.tag) != "bpmnplane":
                continue
            for shape in plane:
                if (
                    _local_tag(shape.tag) == "bpmnshape"
                    and shape.attrib.get("bpmnElement") == process_id
                    and shape.attrib.get("isExpanded") == "true"
                ):
                    return shape, plane
    return None, None


def _extract_di_from_expanded_shape(source_root: ET.Element, outer_shape: ET.Element, plane: ET.Element, process_id: str) -> Optional[ET.Element]:
    """Extract inner shapes/edges from an expanded subprocess shape, translating coordinates."""
    outer_bounds = _shape_bounds(outer_shape)
    if not outer_bounds:
        return None
    ox = float(outer_bounds["x"])
    oy = float(outer_bounds["y"])

    new_diagram = ET.Element(_ns("BPMNDiagram", BPMNDI_NS), {"id": "BPMNDiagram_1"})
    new_plane = ET.SubElement(new_diagram, _ns("BPMNPlane", BPMNDI_NS), {"id": "BPMNPlane_1", "bpmnElement": process_id})

    inner_semantic_ids = set()
    for shape in plane:
        if _local_tag(shape.tag) != "bpmnshape":
            continue
        if shape is outer_shape:
            continue
        bounds = _shape_bounds(shape)
        if not bounds:
            continue
        if not _bounds_contained(bounds, outer_bounds, tolerance=1.0):
            continue
        _recursive_copy_translate(shape, new_plane, ox, oy)
        inner_semantic_ids.add(shape.attrib.get("bpmnElement"))

    if not inner_semantic_ids:
        return None

    for edge in plane:
        if _local_tag(edge.tag) != "bpmnedge":
            continue
        flow_id = edge.attrib.get("bpmnElement")
        if not flow_id:
            continue
        flow_el = next((e for e in source_root.iter() if _element_id(e) == flow_id), None)
        if flow_el is None:
            continue
        src = flow_el.attrib.get("sourceRef")
        dst = flow_el.attrib.get("targetRef")
        if src in inner_semantic_ids and dst in inner_semantic_ids:
            _recursive_copy_translate(edge, new_plane, ox, oy)

    return new_diagram


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
        # Fallback 1: the subprocess may be drawn as an expanded shape inside another plane.
        outer_shape, plane = _find_expanded_subprocess_shape(source_root, process_id)
        if outer_shape is not None and plane is not None:
            expanded_diagram = _extract_di_from_expanded_shape(source_root, outer_shape, plane, process_id)
            if expanded_diagram is not None:
                defs.append(expanded_diagram)
            else:
                defs.append(_generate_di_for_process(new_process, process_id))
        else:
            # Fallback 2: generate a minimal grid layout.
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


def re_embed_child_xml_into_parent(parent_xml: str, element_id: str, child_xml: str) -> Optional[str]:
    """Replace the contents of a parent <subProcess> with the child process contents.

    The parent element is identified by `element_id`.  The child XML is expected to
    be a standalone BPMN document (as produced by `extract_subprocess_xml`) whose
    first <process> contains the edited subprocess contents.

    Returns the updated parent XML or None when:
    - the parent element is not a <subProcess> (callActivity is intentionally skipped),
    - the element cannot be found,
    - parsing fails.
    """
    if not parent_xml or not child_xml or not element_id:
        return None
    try:
        parent_root = ET.fromstring(parent_xml)
    except Exception:
        return None

    parent_el = None
    for el in parent_root.iter():
        if _element_id(el) == element_id:
            parent_el = el
            break
    if parent_el is None:
        return None

    if _local_tag(parent_el.tag) != "subprocess":
        # callActivity references an external process; do not inline it.
        return None

    try:
        child_root = ET.fromstring(child_xml)
    except Exception:
        return None

    child_process = None
    for el in child_root.iter():
        if _local_tag(el.tag) == "process":
            child_process = el
            break
    if child_process is None:
        return None

    child_name = str(child_process.attrib.get("name") or "").strip()
    if child_name:
        parent_el.attrib["name"] = child_name

    # Replace semantic children of the parent subprocess with the child contents.
    for child in list(parent_el):
        parent_el.remove(child)
    for child in child_process:
        parent_el.append(child)

    return ET.tostring(parent_root, encoding="utf-8", xml_declaration=True).decode("utf-8")
