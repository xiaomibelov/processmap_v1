from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
PM_NS = "http://processmap.local/schema/v0.3"
CAMUNDA_NS = "http://camunda.org/schema/1.0/bpmn"

# Operation catalog (v0.3). package_meal is explicitly forbidden.
ALLOWED_OPERATION_CODES = {
    "get_from_storage",
    "move",
    "hold",
    "open_equipment",
    "close_equipment",
    "set_equipment",
    "start_equipment",
    "wait",
    "open_container",
    "close_container",
    "transfer",
    "measure_temperature",
    "check",
    "publish_event",
}
FORBIDDEN_OPERATION_CODES = {"package_meal"}

# Only plain bpmn:task is allowed in v0.3; these legacy task types are errors.
LEGACY_TASK_TYPES = {
    "userTask",
    "manualTask",
    "receiveTask",
    "serviceTask",
    "sendTask",
    "scriptTask",
    "businessRuleTask",
}

# Flow node types parsed into ui_model nodes (lossless).
_EVENT_TYPES = {"startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent"}
_GATEWAY_TYPES = {"exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway"}

# Legacy v0.2 fields that must be flagged for removal/replacement.
LEGACY_METADATA_FIELDS = {
    "validator_profile_id",
    "actor_kind",
    "equipment_type_id",
    "equipment_id",
    "robot_id",
    "serial_number",
    "opcua_node_id",
    "coordinates",
    "pose",
    "trajectory_id",
}

_ENTITY_CATEGORIES = ("containers", "equipment", "zones")

_DOLLAR_RE = re.compile(r"\$\{[^}]*\}")
_SNAKE_CASE_RE = re.compile(r"^[a-z][a-z0-9_]*$")


class BpmnImportError(ValueError):
    """Raised when the BPMN XML cannot be parsed at all."""


@dataclass
class ImportResult:
    ui_model: Dict[str, Any]
    report: Dict[str, Any]
    draft_entities: List[Dict[str, Any]] = field(default_factory=list)


class _ReportBuilder:
    def __init__(self) -> None:
        self.findings: List[Dict[str, Any]] = []

    def add(
        self,
        severity: str,
        code: str,
        element_id: str,
        message: str,
        recommendation: str = "",
        element_name: str = "",
    ) -> None:
        self.findings.append(
            {
                "severity": severity,
                "code": code,
                "element_id": element_id or "",
                "element_name": element_name or "",
                "message": message,
                "recommendation": recommendation,
            }
        )

    def error(self, code: str, element_id: str, message: str, recommendation: str = "", element_name: str = "") -> None:
        self.add("error", code, element_id, message, recommendation, element_name)

    def warning(self, code: str, element_id: str, message: str, recommendation: str = "", element_name: str = "") -> None:
        self.add("warning", code, element_id, message, recommendation, element_name)

    def counts(self) -> Tuple[int, int]:
        errors = sum(1 for f in self.findings if f["severity"] == "error")
        warnings = sum(1 for f in self.findings if f["severity"] == "warning")
        return errors, warnings


def _local_name(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[-1]
    return tag


def _ns(tag: str) -> str:
    if tag.startswith("{"):
        return tag[1:].split("}", 1)[0]
    return ""


def _parse_metadata_json(element: ET.Element) -> Optional[Dict[str, Any]]:
    """Extract the pm:metadata JSON payload from an element's extensionElements."""
    for ext in element.findall(f"{{{BPMN_NS}}}extensionElements"):
        for meta in ext.findall(f"{{{PM_NS}}}metadata"):
            text = (meta.text or "").strip()
            if not text:
                return {}
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                return None
            return data if isinstance(data, dict) else None
    return None


def _iter_metadata_strings(value: Any, path: str = "") -> List[Tuple[str, str]]:
    """Flatten all (path, string-value) pairs inside a metadata dict."""
    out: List[Tuple[str, str]] = []
    if isinstance(value, dict):
        for key, item in value.items():
            out.extend(_iter_metadata_strings(item, f"{path}.{key}" if path else str(key)))
    elif isinstance(value, list):
        for idx, item in enumerate(value):
            out.extend(_iter_metadata_strings(item, f"{path}[{idx}]"))
    elif isinstance(value, str):
        out.append((path, value))
    return out


def _iter_metadata_keys(value: Any) -> List[str]:
    keys: List[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            keys.append(str(key))
            keys.extend(_iter_metadata_keys(item))
    elif isinstance(value, list):
        for item in value:
            keys.extend(_iter_metadata_keys(item))
    return keys


def _declared_refs(process_entities: Dict[str, Any], recipe_context: Dict[str, Any]) -> set:
    refs = set()
    for category in _ENTITY_CATEGORIES:
        entries = process_entities.get(category) or {}
        if isinstance(entries, dict):
            refs.update(str(k) for k in entries.keys())
    refs.update(str(k) for k in (recipe_context or {}).keys())
    return refs


def _guess_category(param_key: str) -> str:
    key = param_key.lower()
    if "equipment" in key:
        return "equipment"
    if "container" in key or key in ("item_ref", "object_ref"):
        return "containers"
    if "zone" in key or key in ("target_ref", "source_ref"):
        return "zones"
    return "zones"


def _collect_di_layout(root: ET.Element) -> Tuple[Dict[str, Dict[str, float]], Dict[str, List[Dict[str, float]]]]:
    """Collect BPMNDI bounds for shapes and waypoints for edges."""
    shapes: Dict[str, Dict[str, float]] = {}
    edges: Dict[str, List[Dict[str, float]]] = {}
    for shape in root.iter(f"{{{BPMNDI_NS}}}BPMNShape"):
        element_ref = shape.get("bpmnElement") or ""
        bounds = shape.find(f"{{{DC_NS}}}Bounds")
        if element_ref and bounds is not None and element_ref not in shapes:
            shapes[element_ref] = {
                "x": float(bounds.get("x", 0) or 0),
                "y": float(bounds.get("y", 0) or 0),
                "width": float(bounds.get("width", 0) or 0),
                "height": float(bounds.get("height", 0) or 0),
            }
    for edge in root.iter(f"{{{BPMNDI_NS}}}BPMNEdge"):
        element_ref = edge.get("bpmnElement") or ""
        if not element_ref or element_ref in edges:
            continue
        waypoints = []
        for wp in edge.findall(f"{{{DI_NS}}}waypoint"):
            waypoints.append({"x": float(wp.get("x", 0) or 0), "y": float(wp.get("y", 0) or 0)})
        edges[element_ref] = waypoints
    return shapes, edges


def _check_camunda_properties(element: ET.Element, element_id: str, element_name: str, report: _ReportBuilder) -> None:
    for ext in element.findall(f"{{{BPMN_NS}}}extensionElements"):
        for props in ext.findall(f"{{{CAMUNDA_NS}}}properties"):
            for prop in props.findall(f"{{{CAMUNDA_NS}}}property"):
                prop_name = prop.get("name") or ""
                report.error(
                    "LEGACY_CAMUNDA_PROPERTY",
                    element_id,
                    f"camunda:property '{prop_name}' не используется в v0.3",
                    "удалить/заменить на pm:metadata",
                    element_name,
                )


def _check_metadata_strings(
    metadata: Optional[Dict[str, Any]],
    element_id: str,
    element_name: str,
    report: _ReportBuilder,
) -> None:
    if not metadata:
        return
    for key in _iter_metadata_keys(metadata):
        if key in LEGACY_METADATA_FIELDS:
            report.error(
                "LEGACY_FIELD",
                element_id,
                f"устаревшее поле v0.2 '{key}'",
                "удалить/заменить",
                element_name,
            )
    for path, value in _iter_metadata_strings(metadata):
        if _DOLLAR_RE.search(value):
            report.error(
                "DOLLAR_SUBSTITUTION",
                element_id,
                f"${{...}} подстановка в '{path}': {value}",
                "удалить/заменить на имя переменной recipe_context",
                element_name,
            )
        if value.startswith("recipe_context.") or "recipe_context." in value:
            report.error(
                "RECIPE_CONTEXT_PREFIX",
                element_id,
                f"префикс 'recipe_context.' в значении '{path}': {value}",
                "использовать имя переменной без префикса",
                element_name,
            )


def parse_bpmn(xml_text: str) -> ImportResult:
    """Parse a BPMN XML file into the UI model plus a mismatch report."""
    raw = str(xml_text or "").strip()
    if not raw:
        raise BpmnImportError("Empty BPMN payload")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise BpmnImportError(f"Unparseable BPMN XML: {exc}") from exc

    report = _ReportBuilder()
    shapes, _edges = _collect_di_layout(root)

    # --- legacy element-level tags ---------------------------------------
    definitions_id = root.get("id") or "definitions"
    for el in root.iter():
        local = _local_name(str(el.tag))
        ns = _ns(str(el.tag))
        if ns == BPMN_NS and local == "operation":
            report.error(
                "LEGACY_FIELD",
                el.get("id") or definitions_id,
                "элемент <bpmn:operation> не поддерживается в v0.3",
                "удалить/заменить",
            )
        if ns == PM_NS and local == "process_template":
            report.error(
                "LEGACY_FIELD",
                el.get("id") or definitions_id,
                "элемент <pm:process_template> не поддерживается в v0.3",
                "удалить/заменить на pm:metadata в bpmn:process",
            )

    # --- processes ---------------------------------------------------------
    processes = root.findall(f"{{{BPMN_NS}}}process")
    if len(processes) != 1:
        report.error(
            "MULTIPLE_PROCESSES",
            definitions_id,
            f"ожидается ровно один bpmn:process, найдено: {len(processes)}",
            "оставить один executable bpmn:process",
        )
    process = processes[0] if processes else None
    process_id = (process.get("id") if process is not None else "") or definitions_id

    # --- participant (single lane wrapper) ---------------------------------
    participant: Optional[Dict[str, Any]] = None
    for collab in root.findall(f"{{{BPMN_NS}}}collaboration"):
        for part in collab.findall(f"{{{BPMN_NS}}}participant"):
            if process is not None and part.get("processRef") != process.get("id"):
                continue
            bounds = shapes.get(part.get("id") or "", {})
            participant = {
                "id": part.get("id") or "",
                "name": part.get("name") or "",
                "process_ref": part.get("processRef") or "",
                "x": bounds.get("x", 0.0),
                "y": bounds.get("y", 0.0),
                "width": bounds.get("width", 0.0),
                "height": bounds.get("height", 0.0),
            }
            break

    # --- process-level metadata ---------------------------------------------
    process_template_id = ""
    process_entities: Dict[str, Any] = {}
    recipe_context: Dict[str, Any] = {}
    if process is not None:
        proc_meta = _parse_metadata_json(process)
        if proc_meta is None:
            report.error(
                "MISSING_PROCESS_METADATA",
                process_id,
                "отсутствует pm:metadata на уровне процесса",
                "добавить pm:metadata с process_template_id и process_entities",
            )
        else:
            process_template_id = str(proc_meta.get("process_template_id") or "")
            if not process_template_id:
                report.error(
                    "MISSING_PROCESS_METADATA",
                    process_id,
                    "pm:metadata не содержит process_template_id",
                    "добавить process_template_id",
                )
            entities = proc_meta.get("process_entities")
            if not isinstance(entities, dict) or not entities:
                report.error(
                    "MISSING_PROCESS_METADATA",
                    process_id,
                    "pm:metadata не содержит обязательный блок process_entities",
                    "добавить process_entities (containers/equipment/zones)",
                )
            else:
                process_entities = entities
            ctx = proc_meta.get("recipe_context")
            if not isinstance(ctx, dict) or not ctx:
                report.warning(
                    "MISSING_RECIPE_CONTEXT",
                    process_id,
                    "pm:metadata не содержит recipe_context",
                    "добавить recipe_context с переменными рецепта",
                )
            else:
                recipe_context = ctx
            _check_metadata_strings(proc_meta, process_id, process.get("name") or "", report)
        _check_camunda_properties(process, process_id, process.get("name") or "", report)

    declared = _declared_refs(process_entities, recipe_context)
    draft_index: Dict[str, Dict[str, Any]] = {}

    # --- flow nodes ----------------------------------------------------------
    nodes: List[Dict[str, Any]] = []
    if process is not None:
        for el in process:
            local = _local_name(str(el.tag))
            if _ns(str(el.tag)) != BPMN_NS:
                continue
            is_task_like = local == "task" or local in LEGACY_TASK_TYPES
            if not (is_task_like or local in _EVENT_TYPES or local in _GATEWAY_TYPES):
                continue

            element_id = el.get("id") or ""
            element_name = el.get("name") or ""
            bounds = shapes.get(element_id, {})

            operation_code: Optional[str] = None
            display_name: Optional[str] = None
            params: Dict[str, Any] = {}
            outputs: Dict[str, Any] = {}

            if local in LEGACY_TASK_TYPES:
                report.error(
                    "LEGACY_TASK_TYPE",
                    element_id,
                    f"устаревший тип задачи bpmn:{local}; в v0.3 допустим только bpmn:task",
                    "заменить на bpmn:task с operation_code",
                    element_name,
                )

            if is_task_like:
                _check_camunda_properties(el, element_id, element_name, report)
                meta = _parse_metadata_json(el)
                if meta is None:
                    report.error(
                        "UNKNOWN_OPERATION_CODE",
                        element_id,
                        "отсутствует pm:metadata или operation_code у задачи",
                        "добавить pm:metadata с operation_code из каталога",
                        element_name,
                    )
                else:
                    _check_metadata_strings(meta, element_id, element_name, report)
                    operation_code = meta.get("operation_code")
                    if not operation_code:
                        report.error(
                            "UNKNOWN_OPERATION_CODE",
                            element_id,
                            "operation_code отсутствует в pm:metadata",
                            "указать operation_code из каталога",
                            element_name,
                        )
                    elif operation_code in FORBIDDEN_OPERATION_CODES:
                        report.error(
                            "FORBIDDEN_OPERATION",
                            element_id,
                            f"операция '{operation_code}' запрещена в v0.3",
                            "заменить на допустимую операцию каталога",
                            element_name,
                        )
                    elif operation_code not in ALLOWED_OPERATION_CODES:
                        report.error(
                            "UNKNOWN_OPERATION_CODE",
                            element_id,
                            f"неизвестный operation_code '{operation_code}'",
                            "использовать operation_code из каталога",
                            element_name,
                        )
                    display_name = meta.get("display_name")
                    if not display_name or not str(display_name).strip():
                        report.warning(
                            "EMPTY_DISPLAY_NAME",
                            element_id,
                            "display_name пустой",
                            "заполнить display_name",
                            element_name,
                        )
                    raw_params = meta.get("params")
                    if isinstance(raw_params, dict):
                        params = raw_params
                    raw_outputs = meta.get("outputs")
                    if isinstance(raw_outputs, dict):
                        outputs = raw_outputs

                # validate *_ref params and build draft entities
                for key, value in params.items():
                    if not str(key).endswith("_ref"):
                        continue
                    if not isinstance(value, str) or not value:
                        continue
                    if _DOLLAR_RE.search(value) or value.startswith("recipe_context."):
                        continue  # already reported as substitution errors
                    if value not in declared:
                        report.error(
                            "UNDECLARED_ENTITY_REF",
                            element_id,
                            f"параметр '{key}' ссылается на необъявленную сущность '{value}'",
                            "объявить сущность в process_entities или recipe_context",
                            element_name,
                        )
                        draft = draft_index.setdefault(
                            value,
                            {"ref": value, "guessed_category": _guess_category(str(key)), "used_by": []},
                        )
                        if element_id not in draft["used_by"]:
                            draft["used_by"].append(element_id)

            nodes.append(
                {
                    "id": element_id,
                    "bpmn_type": local,
                    "name": element_name,
                    "operation_code": operation_code,
                    "display_name": display_name,
                    "params": params,
                    "outputs": outputs,
                    "x": bounds.get("x", 0.0),
                    "y": bounds.get("y", 0.0),
                    "width": bounds.get("width", 0.0),
                    "height": bounds.get("height", 0.0),
                }
            )

    # --- sequence flows -------------------------------------------------------
    flows: List[Dict[str, Any]] = []
    if process is not None:
        for flow in process.findall(f"{{{BPMN_NS}}}sequenceFlow"):
            flow_id = flow.get("id") or ""
            flow_name = flow.get("name") or ""
            condition = ""
            cond_el = flow.find(f"{{{BPMN_NS}}}conditionExpression")
            if cond_el is not None and cond_el.text:
                condition = cond_el.text.strip()
                if _DOLLAR_RE.search(condition):
                    report.error(
                        "DOLLAR_SUBSTITUTION",
                        flow_id,
                        f"${{...}} подстановка в conditionExpression: {condition}",
                        "удалить/заменить на plain-условие (например 'requires_sauce == true')",
                        flow_name,
                    )
            flows.append(
                {
                    "id": flow_id,
                    "source_ref": flow.get("sourceRef") or "",
                    "target_ref": flow.get("targetRef") or "",
                    "name": flow_name,
                    "condition": condition,
                }
            )

    errors, warnings = report.counts()
    ui_model = {
        "process_template_id": process_template_id,
        "recipe_context": recipe_context,
        "process_entities": process_entities,
        "nodes": nodes,
        "flows": flows,
        "participant": participant,
    }
    report_dict = {
        "summary": {
            "errors": errors,
            "warnings": warnings,
            "nodes": len(nodes),
            "flows": len(flows),
        },
        "findings": report.findings,
    }
    return ImportResult(ui_model=ui_model, report=report_dict, draft_entities=list(draft_index.values()))
