from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"
DI_NS = "http://www.omg.org/spec/DD/20100524/DI"
PM_NS = "http://processmap.local/schema/v0.3"
CAMUNDA_NS = "http://camunda.org/schema/1.0/bpmn"

# E6.1 REFACTOR: правила валидации вынесены в app/validation/service.py.
# Импорт занимается ПАРСИНГОМ XML и import-специфичными dialect/legacy
# findings (LEGACY_*, DOLLAR_SUBSTITUTION, RECIPE_CONTEXT_PREFIX,
# UNKNOWN_CAMUNDA_PROPERTY, EMPTY_DISPLAY_NAME, MISSING_PROCESS_METADATA,
# MISSING_RECIPE_CONTEXT, MULTIPLE_PROCESSES, PLACEHOLDER_VALUE для не-params
# camunda-ключей); проверки правил R1/R3/R5 (operation_code из каталога,
# *_ref объявлены, условия шлюзов из outputs) делегированы сервису
# (check_reachability=False: импорт исторически не проверяет достижимость —
# это делает dry-run endpoint E6). Имена ре-экспортируются для совместимости
# (transformation/pipeline импортирует их отсюда).
from ..camunda_meta_utils import extract_camunda_extensions_from_bpmn_xml
from ..validation.service import (  # noqa: E402
    ALLOWED_OPERATION_CODES,
    FORBIDDEN_OPERATION_CODES,
    LEGACY_TASK_TYPES,
    _DOLLAR_RE,
    _condition_identifiers,
    _declared_refs,
    _guess_category,
    validate_ui_model,
)

# Flow node types parsed into ui_model nodes (lossless).
_EVENT_TYPES = {"startEvent", "endEvent", "intermediateCatchEvent", "intermediateThrowEvent"}
_GATEWAY_TYPES = {"exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway"}

# camunda:property keys that encode v0.3 semantics (produce NO findings).
#   operation_code, params.<key>, outputs.<key>, recipe_params
_CAMUNDA_RECOGNIZED_EXACT = {"operation_code", "recipe_params"}
_CAMUNDA_RECOGNIZED_PREFIXES = ("params.", "outputs.")

# camunda:property keys from legacy v0.2 dialect -> LEGACY_CAMUNDA_PROPERTY error.
CAMUNDA_LEGACY_KEYS = {
    "actor_role",
    "duration_min",
    "equipment",
    "section",
    "validator_profile_id",
    "actor_kind",
    "equipment_type_id",
    "seal_method",
    "dish_sku_id",
    "grasp_object",
    "equipment_id",
    "robot_id",
    "serial_number",
    "opcua_node_id",
    "coordinates",
    "pose",
    "trajectory_id",
    "operation_id",
}

# Legacy v0.2 fields that must be flagged inside pm:metadata JSON.
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


def _parse_camunda_properties(
    element: ET.Element,
    element_id: str,
    element_name: str,
    report: _ReportBuilder,
) -> Dict[str, str]:
    """Collect camunda:property name->value, flagging legacy/unknown keys.

    Recognized v0.3 keys (operation_code, params.*, outputs.*, recipe_params)
    produce no findings. Known-legacy keys are errors; anything else is a warning.
    """
    props: Dict[str, str] = {}
    for ext in element.findall(f"{{{BPMN_NS}}}extensionElements"):
        for container in ext.findall(f"{{{CAMUNDA_NS}}}properties"):
            for prop in container.findall(f"{{{CAMUNDA_NS}}}property"):
                name = prop.get("name") or ""
                value = prop.get("value") or ""
                if not name:
                    continue
                props[name] = value
                recognized = (
                    name in _CAMUNDA_RECOGNIZED_EXACT
                    or name.startswith(_CAMUNDA_RECOGNIZED_PREFIXES)
                    or name.endswith("_ref")
                )
                # value-level checks apply to non-param keys (params.*/outputs.*
                # values are validated downstream with full context)
                if not name.startswith(_CAMUNDA_RECOGNIZED_PREFIXES):
                    if value.strip() == "-":
                        report.error(
                            "PLACEHOLDER_VALUE",
                            element_id,
                            f"camunda:property '{name}' содержит заглушку '-'",
                            "заполнить значение или удалить свойство",
                            element_name,
                        )
                    elif _DOLLAR_RE.search(value):
                        report.error(
                            "DOLLAR_SUBSTITUTION",
                            element_id,
                            f"${{...}}-подстановка в значении camunda:property '{name}': {value}",
                            "удалить/заменить на имя переменной recipe_context",
                            element_name,
                        )
                if recognized:
                    continue
                if name in CAMUNDA_LEGACY_KEYS:
                    report.error(
                        "LEGACY_CAMUNDA_PROPERTY",
                        element_id,
                        f"camunda:property '{name}' не используется в v0.3",
                        "удалить/заменить",
                        element_name,
                    )
                else:
                    report.warning(
                        "UNKNOWN_CAMUNDA_PROPERTY",
                        element_id,
                        f"нераспознанная camunda:property '{name}'",
                        "проверить: переименовать в params.*/outputs.* или удалить",
                        element_name,
                    )
    return props


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


def _iter_process_flow_nodes(process: ET.Element) -> List[Tuple[ET.Element, str]]:
    """Return all importable BPMN flow nodes, including nodes inside subProcess."""
    out: List[Tuple[ET.Element, str]] = []

    def walk(parent: ET.Element, parent_subprocess_id: str = "") -> None:
        for child in parent:
            if _ns(str(child.tag)) != BPMN_NS:
                continue
            local = _local_name(str(child.tag))
            if local == "subProcess":
                walk(child, child.get("id") or parent_subprocess_id)
                continue
            is_task_like = local == "task" or local in LEGACY_TASK_TYPES
            if is_task_like or local in _EVENT_TYPES or local in _GATEWAY_TYPES:
                out.append((child, parent_subprocess_id))
            walk(child, parent_subprocess_id)

    walk(process)
    return out


def _iter_process_sequence_flows(process: ET.Element) -> List[ET.Element]:
    """Return sequence flows from the process and nested subprocesses."""
    return [
        el
        for el in process.iter()
        if _ns(str(el.tag)) == BPMN_NS and _local_name(str(el.tag)) == "sequenceFlow"
    ]


def _extract_bpmn_meta(raw_xml: str) -> Dict[str, Any]:
    extensions = extract_camunda_extensions_from_bpmn_xml(raw_xml)
    normalized: Dict[str, Any] = {}
    for element_id, entry in extensions.items():
        if not isinstance(entry, dict):
            continue
        next_entry = dict(entry)
        props_block = dict(next_entry.get("properties") or {})
        rows = []
        for row in props_block.get("extensionProperties") or []:
            if not isinstance(row, dict):
                continue
            key = str(row.get("key") or row.get("name") or "")
            rows.append({**row, "key": key, "name": str(row.get("name") or key)})
        props_block["extensionProperties"] = rows
        next_entry["properties"] = props_block
        normalized[element_id] = next_entry
    if not normalized:
        return {}
    return {"camunda_extensions_by_element_id": normalized}


def _extract_subprocess_meta(process: Optional[ET.Element]) -> List[Dict[str, str]]:
    if process is None:
        return []
    out: List[Dict[str, str]] = []
    for el in process.iter(f"{{{BPMN_NS}}}subProcess"):
        element_id = el.get("id") or ""
        if not element_id:
            continue
        out.append({"id": element_id, "name": el.get("name") or ""})
    return out


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
            report.warning(
                "MISSING_PROCESS_METADATA",
                process_id,
                "отсутствует pm:metadata на уровне процесса",
                "добавить pm:metadata с process_template_id и process_entities",
            )
        else:
            process_template_id = str(proc_meta.get("process_template_id") or "")
            if not process_template_id:
                report.warning(
                    "MISSING_PROCESS_METADATA",
                    process_id,
                    "pm:metadata не содержит process_template_id",
                    "добавить pm:metadata с process_template_id и process_entities",
                )
            entities = proc_meta.get("process_entities")
            if not isinstance(entities, dict) or not entities:
                report.warning(
                    "MISSING_PROCESS_METADATA",
                    process_id,
                    "pm:metadata не содержит блок process_entities",
                    "добавить pm:metadata с process_template_id и process_entities",
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
        _parse_camunda_properties(process, process_id, process.get("name") or "", report)

    # --- lanes ---------------------------------------------------------------
    lanes: List[Dict[str, Any]] = []
    if process is not None:
        for lane_set in process.findall(f"{{{BPMN_NS}}}laneSet"):
            for lane in lane_set.findall(f"{{{BPMN_NS}}}lane"):
                lane_id = lane.get("id") or ""
                bounds = shapes.get(lane_id, {})
                lanes.append(
                    {
                        "id": lane_id,
                        "name": lane.get("name") or "",
                        "flow_node_refs": [
                            (ref.text or "").strip()
                            for ref in lane.findall(f"{{{BPMN_NS}}}flowNodeRef")
                            if (ref.text or "").strip()
                        ],
                        "x": bounds.get("x", 0.0),
                        "y": bounds.get("y", 0.0),
                        "width": bounds.get("width", 0.0),
                        "height": bounds.get("height", 0.0),
                    }
                )

# --- flow nodes ----------------------------------------------------------
    nodes: List[Dict[str, Any]] = []
    if process is not None:
        for el, parent_subprocess_id in _iter_process_flow_nodes(process):
            local = _local_name(str(el.tag))
            is_task_like = local == "task" or local in LEGACY_TASK_TYPES

            element_id = el.get("id") or ""
            element_name = el.get("name") or ""
            bounds = shapes.get(element_id, {})

            operation_code: Optional[str] = None
            display_name: Optional[str] = None
            params: Dict[str, Any] = {}
            outputs: Dict[str, Any] = {}
            recipe_params: List[str] = []

            if local in LEGACY_TASK_TYPES:
                report.error(
                    "LEGACY_TASK_TYPE",
                    element_id,
                    f"устаревший тип задачи bpmn:{local}; в v0.3 допустим только bpmn:task",
                    "заменить на bpmn:task с operation_code",
                    element_name,
                )

            if is_task_like:
                camunda_props = _parse_camunda_properties(el, element_id, element_name, report)
                meta = _parse_metadata_json(el)
                if meta is not None:
                    _check_metadata_strings(meta, element_id, element_name, report)

                # operation_code: camunda property first, pm:metadata fallback
                operation_code = camunda_props.get("operation_code")
                if not operation_code and meta is not None:
                    operation_code = meta.get("operation_code")

                # params / outputs: pm:metadata merged with camunda params.*/outputs.*
                if meta is not None and isinstance(meta.get("params"), dict):
                    params.update(meta["params"])
                if meta is not None and isinstance(meta.get("outputs"), dict):
                    outputs.update(meta["outputs"])
                for key, value in camunda_props.items():
                    if key.startswith("params."):
                        params[key[len("params."):]] = value
                    elif key.startswith("outputs."):
                        outputs[key[len("outputs."):]] = value
                    elif key.endswith("_ref"):
                        # bare *_ref keys (v0.2 dialect) are entity references
                        params[key] = value
                raw_recipe_params = camunda_props.get("recipe_params") or ""
                recipe_params = [p.strip() for p in raw_recipe_params.split(";") if p.strip()]

                # display_name: pm:metadata, then BPMN name as fallback
                if meta is not None:
                    display_name = meta.get("display_name")
                    if "display_name" in meta and not str(meta.get("display_name") or "").strip():
                        report.warning(
                            "EMPTY_DISPLAY_NAME",
                            element_id,
                            "display_name пустой",
                            "заполнить display_name",
                            element_name,
                        )
                if not display_name or not str(display_name).strip():
                    display_name = element_name or None
                if display_name is None and meta is None and not camunda_props:
                    report.warning(
                        "EMPTY_DISPLAY_NAME",
                        element_id,
                        "display_name пустой",
                        "заполнить display_name",
                        element_name,
                    )

            # event definitions (linkEventDefinition и пр.) — для R6 сервиса
            event_definitions: List[str] = []
            if local in _EVENT_TYPES:
                for child in el:
                    child_local = _local_name(str(child.tag))
                    if child_local.endswith("EventDefinition"):
                        event_definitions.append(child_local)

            nodes.append(
                {
                    "id": element_id,
                    "bpmn_type": local,
                    "name": element_name,
                    "operation_code": operation_code,
                    "display_name": display_name,
                    "params": params,
                    "outputs": outputs,
                    "recipe_params": recipe_params,
                    "event_definitions": event_definitions,
                    "x": bounds.get("x", 0.0),
                    "y": bounds.get("y", 0.0),
                    "width": bounds.get("width", 0.0),
                    "height": bounds.get("height", 0.0),
                }
            )
            if parent_subprocess_id:
                nodes[-1]["parent_subprocess_id"] = parent_subprocess_id

    # --- sequence flows -------------------------------------------------------
    flows: List[Dict[str, Any]] = []
    if process is not None:
        for flow in _iter_process_sequence_flows(process):
            flow_id = flow.get("id") or ""
            flow_name = flow.get("name") or ""
            condition = ""
            cond_el = flow.find(f"{{{BPMN_NS}}}conditionExpression")
            if cond_el is not None and cond_el.text:
                condition = cond_el.text.strip()
            flows.append(
                {
                    "id": flow_id,
                    "source_ref": flow.get("sourceRef") or "",
                    "target_ref": flow.get("targetRef") or "",
                    "name": flow_name,
                    "condition": condition,
                }
            )

    ui_model = {
        "process_template_id": process_template_id,
        "recipe_context": recipe_context,
        "process_entities": process_entities,
        "nodes": nodes,
        "flows": flows,
        "participant": participant,
        "lanes": lanes,
    }
    bpmn_meta = _extract_bpmn_meta(raw)
    if bpmn_meta:
        ui_model["bpmn_meta"] = bpmn_meta
    subprocesses = _extract_subprocess_meta(process)
    if subprocesses:
        ui_model["subprocesses"] = subprocesses
    # E6.1: правила R1/R3/R5 — из validation service (импорт добавляет только
    # свои dialect/legacy findings выше). check_reachability=False: проверка
    # достижимости — ответственность dry-run endpoint'а (POST .../validate).
    validation = validate_ui_model(ui_model, catalog=None, check_reachability=False)
    report.findings.extend(validation["findings"])
    errors, warnings = report.counts()
    report_dict = {
        "summary": {
            "errors": errors,
            "warnings": warnings,
            "nodes": len(nodes),
            "flows": len(flows),
        },
        "findings": report.findings,
    }
    return ImportResult(ui_model=ui_model, report=report_dict, draft_entities=validation["draft_entities"])
