from __future__ import annotations
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple


def _local_tag(tag: str) -> str:
    return str(tag).rsplit("}", 1)[-1].lower() if "}" in str(tag) else str(tag).lower()


def find_bpmn_element(xml_text: str, element_id: str) -> Optional[ET.Element]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if str(el.attrib.get("id") or "").strip() == element_id:
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


def extract_embedded_process_xml(xml_text: str, process_id: str) -> Optional[str]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if _local_tag(el.tag) == "process" and str(el.attrib.get("id") or "").strip() == process_id:
            return ET.tostring(el, encoding="utf-8", xml_declaration=False).decode("utf-8")
    return None


def extract_subprocess_xml(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    if el is None:
        return None
    tag = _local_tag(el.tag)
    if tag == "subprocess":
        return ET.tostring(el, encoding="utf-8", xml_declaration=False).decode("utf-8")
    if tag == "callactivity":
        called = called_element_id(xml_text, element_id)
        if called:
            return extract_embedded_process_xml(xml_text, called)
    return None


def _first_element_by_tag(xml_text: str, tags: List[str]) -> Optional[str]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if _local_tag(el.tag) in tags:
            return str(el.attrib.get("id") or "").strip() or None
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
