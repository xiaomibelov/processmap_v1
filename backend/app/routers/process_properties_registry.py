from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
import xml.etree.ElementTree as ET

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ._registry_common import (
    RegistrySpec,
    _csv_bytes,
    _export_filename,
    _registry_payload,
    _text,
    _xlsx_bytes,
)
from ..legacy.request_context import (
    require_authenticated_user,
    request_active_org_id,
)
from ..services.org_workspace import require_org_member_for_enterprise
from ..storage import (
    get_storage,
    list_process_property_metadata,
    list_reference_options,
)

router = APIRouter(tags=["process-properties-registry"])

_EXPORT_COLUMNS = [
    "workspace_title",
    "project_title",
    "project_id",
    "session_title",
    "session_id",
    "element_id",
    "element_title",
    "element_type",
    "property_name",
    "property_value",
    "property_type",
    "property_group",
    "source",
    "source_kind",
    "status",
    "completeness",
    "updated_at",
]
_FILTER_MAP = {
    "property_types": "property_type",
    "groups": "property_group",
    "sources": "source",
    "processes": "source",
    "element_types": "element_type",
}


class ProcessPropertiesRegistryFilters(BaseModel):
    property_types: List[str] = Field(default_factory=list)
    groups: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    processes: List[str] = Field(default_factory=list)
    element_types: List[str] = Field(default_factory=list)
    completeness: str = "all"


class ProcessPropertiesRegistryQueryIn(BaseModel):
    scope: str = "workspace"
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    project_ids: List[str] = Field(default_factory=list)
    session_ids: List[str] = Field(default_factory=list)
    filters: ProcessPropertiesRegistryFilters = Field(default_factory=ProcessPropertiesRegistryFilters)
    limit: int = 100
    offset: int = 0


def _completeness(row: Dict[str, Any]) -> str:
    value = _text(row.get("property_value"))
    return "complete" if value and value != "—" else "incomplete"


def _extract_camunda_rows(source: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract property rows from bpmn_meta.camunda_extensions_by_element_id."""
    bpmn_meta = source.get("bpmn_meta") or {}
    if not isinstance(bpmn_meta, dict):
        bpmn_meta = {}
    camunda_map = bpmn_meta.get("camunda_extensions_by_element_id") or {}
    if not isinstance(camunda_map, dict):
        camunda_map = {}

    rows: List[Dict[str, Any]] = []
    session_id = _text(source.get("session_id"))
    session_title = _text(source.get("session_title")) or "Без названия"
    workspace_id = _text(source.get("workspace_id"))
    project_id = _text(source.get("project_id"))
    project_title = _text(source.get("project_title"))
    org_id = _text(source.get("org_id"))
    updated_at = int(source.get("updated_at") or 0)
    diagram_state_version = int(source.get("diagram_state_version") or 0)

    # Build element_id -> {type, title} lookup from BPMN XML when needed
    bpmn_xml = _text(source.get("bpmn_xml"))
    element_lookup: Dict[str, Dict[str, str]] = {}
    if camunda_map and bpmn_xml:
        try:
            root = ET.fromstring(bpmn_xml)
            for elem in root.iter():
                eid = _text(elem.get("id"))
                if not eid:
                    continue
                tag = elem.tag
                if tag.startswith("{"):
                    tag = tag.split("}", 1)[1]
                element_lookup[eid] = {
                    "type": tag,
                    "title": _text(elem.get("name")),
                }
        except Exception:
            pass

    for element_id_raw, element_state_raw in camunda_map.items():
        element_id = _text(element_id_raw)
        if not element_id:
            continue
        element_state = element_state_raw if isinstance(element_state_raw, dict) else {}

        # Handle normalized format: { properties: { extensionProperties: [...], extensionListeners: [...] } }
        properties_container = element_state.get("properties") or {}
        if isinstance(properties_container, dict):
            extension_properties = properties_container.get("extensionProperties") or []
            extension_listeners = properties_container.get("extensionListeners") or []
        elif isinstance(properties_container, list):
            # Legacy flat array under properties key
            extension_properties = properties_container
            extension_listeners = []
        else:
            extension_properties = []
            extension_listeners = []

        # Also support legacy top-level array on element state
        if not extension_properties and not extension_listeners and isinstance(element_state_raw, list):
            extension_properties = element_state_raw

        if not isinstance(extension_properties, list):
            extension_properties = []
        if not isinstance(extension_listeners, list):
            extension_listeners = []

        elem_info = element_lookup.get(element_id) or {}
        element_title = _text(elem_info.get("title"))
        element_type = _text(elem_info.get("type"))

        for prop in extension_properties:
            if not isinstance(prop, dict):
                continue
            prop_name = _text(prop.get("name"))
            if not prop_name:
                continue
            prop_value = _text(prop.get("value")) or "—"
            row = {
                "id": f"{session_id}::{element_id}::property::{prop_name}",
                "registry_id": f"{session_id}::{element_id}::property::{prop_name}",
                "org_id": org_id,
                "workspace_id": workspace_id,
                "workspace_title": _text(source.get("workspace_title")),
                "project_id": project_id,
                "project_title": project_title,
                "session_id": session_id,
                "session_title": session_title,
                "element_id": element_id,
                "element_title": element_title,
                "element_type": element_type,
                "property_name": prop_name,
                "property_value": prop_value,
                "property_type": "Camunda property",
                "property_group": "extensionProperties",
                "source": session_title,
                "source_kind": "bpmn_meta.camunda_extensions_by_element_id",
                "status": "Полная" if prop_value != "—" else "Неполная",
                "updated_at": updated_at,
                "diagram_state_version": diagram_state_version,
            }
            row["completeness"] = _completeness(row)
            rows.append(row)

        for listener in extension_listeners:
            if not isinstance(listener, dict):
                continue
            event = _text(listener.get("event"))
            ltype = _text(listener.get("type"))
            lvalue = _text(listener.get("value")) or "—"
            if not event or not ltype:
                continue
            listener_name = f"{event} / {ltype}"
            row = {
                "id": f"{session_id}::{element_id}::listener::{listener_name}",
                "registry_id": f"{session_id}::{element_id}::listener::{listener_name}",
                "org_id": org_id,
                "workspace_id": workspace_id,
                "workspace_title": _text(source.get("workspace_title")),
                "project_id": project_id,
                "project_title": project_title,
                "session_id": session_id,
                "session_title": session_title,
                "element_id": element_id,
                "element_title": element_title,
                "element_type": element_type,
                "property_name": listener_name,
                "property_value": lvalue,
                "property_type": "Camunda listener",
                "property_group": "extensionListeners",
                "source": session_title,
                "source_kind": "bpmn_meta.camunda_extensions_by_element_id",
                "status": "Полная" if lvalue != "—" else "Неполная",
                "updated_at": updated_at,
                "diagram_state_version": diagram_state_version,
            }
            row["completeness"] = _completeness(row)
            rows.append(row)

    return rows


def _list_registry_sources(**kwargs: Any) -> List[Dict[str, Any]]:
    return get_storage().list_process_properties_registry_sources(**kwargs)


_SPEC = RegistrySpec(
    filter_map=_FILTER_MAP,
    sort_keys=("property_group", "property_type", "session_title", "element_id", "property_name"),
    list_sources=_list_registry_sources,
    extract_rows=_extract_camunda_rows,
    export_file_prefix="process-properties",
    xlsx_column_widths=[18, 22, 18, 24, 18, 18, 18, 16, 22, 22, 22, 18, 18, 18, 16, 12],
    xlsx_sheet_name="Process properties",
    source_state_source="process_properties_registry_backend",
    source_state_namespace="/api/analysis/properties/registry",
    source_contract_version="v1",
)


def _parse_json_text(text: Any) -> Any:
    raw = str(text or "")
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if parsed is None:
            return None
        return parsed
    except Exception:
        return None


def _compute_usage_counts(sessions: List[Dict[str, Any]]) -> Dict[str, int]:
    elements_by_name: Dict[str, Set[str]] = {}
    for session in sessions:
        if not isinstance(session, dict):
            continue
        bpmn_meta = session.get("bpmn_meta") or {}
        if not isinstance(bpmn_meta, dict):
            continue
        camunda_map = bpmn_meta.get("camunda_extensions_by_element_id") or {}
        if not isinstance(camunda_map, dict):
            continue
        for element_id_raw, element_state_raw in camunda_map.items():
            element_id = _text(element_id_raw)
            if not element_id:
                continue
            element_state = element_state_raw if isinstance(element_state_raw, dict) else {}
            properties_container = element_state.get("properties") or {}
            if isinstance(properties_container, dict):
                extension_properties = properties_container.get("extensionProperties") or []
            elif isinstance(properties_container, list):
                extension_properties = properties_container
            else:
                extension_properties = []
            if not extension_properties and isinstance(element_state_raw, list):
                extension_properties = element_state_raw
            if not isinstance(extension_properties, list):
                continue
            for prop in extension_properties:
                if not isinstance(prop, dict):
                    continue
                name = _text(prop.get("name"))
                if not name:
                    continue
                elements_by_name.setdefault(name, set()).add(element_id)
    return {name: len(elements) for name, elements in elements_by_name.items()}


def _enrich_metadata(
    meta: Dict[str, Any],
    usage_counts: Dict[str, int],
    include_reference_options: bool,
    org_id: Optional[str],
) -> Dict[str, Any]:
    value_range = _parse_json_text(meta.get("value_range")) or {}
    validation_rules = _parse_json_text(meta.get("validation_rules")) or []
    applicable_to = _parse_json_text(meta.get("applicable_to")) or []
    visible_in = _parse_json_text(meta.get("visible_in")) or []
    reference_options: List[Dict[str, Any]] = []
    if include_reference_options and meta.get("property_type") == "reference":
        ref_source = value_range.get("reference_source")
        if ref_source and str(ref_source).startswith("table:"):
            table_name = str(ref_source).split(":", 1)[1]
            reference_options = list_reference_options(table_name, org_id=org_id or None, limit=100)
    return {
        "id": meta.get("id"),
        "display_name": meta.get("display_name"),
        "property_type": meta.get("property_type"),
        "applicable_to": applicable_to,
        "default_value": meta.get("default_value"),
        "value_range": value_range,
        "validation_rules": validation_rules,
        "source": meta.get("source"),
        "editable": bool(meta.get("editable")),
        "visible_in": visible_in,
        "category": meta.get("category"),
        "inheritance": meta.get("inheritance"),
        "version": int(meta.get("version") or 1),
        "created_at": meta.get("created_at"),
        "updated_at": meta.get("updated_at"),
        "usage_count": usage_counts.get(meta.get("id"), 0),
        "reference_options": reference_options,
    }


@router.get("/api/analysis/properties/registry/query")
def query_property_registry_metadata(
    request: Request,
    category: str = "all",
    applicable_to: str = "",
    source: str = "",
    editable: str = "all",
    search: str = "",
    include_usage: bool = True,
    include_reference_options: bool = True,
) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request) or ""
    if org_id:
        require_org_member_for_enterprise(request, org_id)

    metadata_rows = list_process_property_metadata(org_id=org_id or None, include_global=True)

    usage_counts: Dict[str, int] = {}
    if include_usage:
        sessions = get_storage().list(org_id=org_id or None, is_admin=True, limit=500)
        usage_counts = _compute_usage_counts(sessions)

    wanted_sources = [s.strip() for s in source.split(",") if s.strip()]
    wanted_applicable = [s.strip() for s in applicable_to.split(",") if s.strip()]
    search_lower = search.strip().lower()

    filtered: List[Dict[str, Any]] = []
    for meta in metadata_rows:
        if category != "all" and _text(meta.get("category")) != category:
            continue
        if wanted_sources and _text(meta.get("source")) not in wanted_sources:
            continue
        if editable != "all":
            if bool(meta.get("editable")) != (editable.lower() == "true"):
                continue
        if wanted_applicable:
            meta_applicable = _parse_json_text(meta.get("applicable_to")) or []
            if not isinstance(meta_applicable, list):
                meta_applicable = []
            meta_applicable_set = {str(item).strip() for item in meta_applicable if str(item or "").strip()}
            if not any(wanted in meta_applicable_set for wanted in wanted_applicable):
                continue
        if search_lower:
            haystack = " ".join([
                _text(meta.get("id")).lower(),
                _text(meta.get("display_name")).lower(),
                _text(meta.get("category")).lower(),
            ])
            if search_lower not in haystack:
                continue
        filtered.append(meta)

    out = [
        _enrich_metadata(meta, usage_counts, include_reference_options, org_id or None)
        for meta in filtered
    ]
    return {"ok": True, "properties": out, "rows": out, "count": len(out)}


@router.get("/api/analysis/properties/registry/export")
def export_property_registry(
    request: Request,
    format: str = "csv",
    category: str = "all",
    applicable_to: str = "",
    source: str = "",
    editable: str = "all",
    include_usage: bool = True,
):
    require_authenticated_user(request)
    org_id = request_active_org_id(request) or ""
    if org_id:
        require_org_member_for_enterprise(request, org_id)

    data = query_property_registry_metadata(
        request,
        category=category,
        applicable_to=applicable_to,
        source=source,
        editable=editable,
        include_usage=include_usage,
        include_reference_options=False,
    )
    properties = data.get("properties", [])

    headers = [
        "Идентификатор", "Название", "Тип", "Применимо к", "Значение по умолчанию",
        "Диапазон значений", "Правила валидации", "Источник", "Редактируемо",
        "Видимость", "Категория", "Наследование", "Версия", "Создано", "Обновлено", "Использований",
    ]

    rows = []
    for p in properties:
        rows.append([
            p["id"],
            p["display_name"],
            p["property_type"],
            "|".join(p.get("applicable_to", [])),
            p.get("default_value") or "",
            json.dumps(p.get("value_range") or {}, ensure_ascii=False),
            json.dumps(p.get("validation_rules") or [], ensure_ascii=False),
            p["source"],
            "true" if p.get("editable") else "false",
            "|".join(p.get("visible_in", [])),
            p["category"],
            p["inheritance"],
            str(p["version"]),
            p.get("created_at") or "",
            p.get("updated_at") or "",
            str(p.get("usage_count", 0)),
        ])

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
        output.write("\ufeff")
        writer.writerow(headers)
        writer.writerows(rows)
        body = output.getvalue().encode("utf-8-sig")
        return Response(
            content=body,
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f'attachment; filename="property-registry-{timestamp}.csv"'},
        )

    if format == "xlsx":
        import xlsxwriter
        buf = io.BytesIO()
        workbook = xlsxwriter.Workbook(buf, {"in_memory": True})
        worksheet = workbook.add_worksheet("Свойства")
        bold = workbook.add_format({"bold": True})
        for col, h in enumerate(headers):
            worksheet.write(0, col, h, bold)
        for row_idx, row in enumerate(rows, start=1):
            for col_idx, value in enumerate(row):
                worksheet.write(row_idx, col_idx, value)
        worksheet.freeze_panes(1, 0)
        worksheet.autofilter(0, 0, len(rows), len(headers) - 1)
        widths = [20, 25, 15, 20, 18, 20, 20, 15, 12, 20, 15, 15, 10, 18, 18, 12]
        for i, w in enumerate(widths):
            worksheet.set_column(i, i, w)
        workbook.close()
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="property-registry-{timestamp}.xlsx"'},
        )

    raise HTTPException(status_code=422, detail="unsupported format")


@router.post("/api/analysis/properties/registry/query")
def query_process_properties_registry(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Dict[str, Any]:
    return _registry_payload(inp, request, _SPEC, paginate=True)


@router.post("/api/analysis/properties/registry/export.csv")
def export_process_properties_registry_csv(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, _SPEC, paginate=True)
    filename = _export_filename(_SPEC.export_file_prefix, str(payload.get("scope") or inp.scope), "csv")
    return Response(
        content=_csv_bytes(payload.get("rows") or [], _EXPORT_COLUMNS),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/analysis/properties/registry/export.xlsx")
def export_process_properties_registry_xlsx(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, _SPEC, paginate=True)
    filename = _export_filename(_SPEC.export_file_prefix, str(payload.get("scope") or inp.scope), "xlsx")
    return Response(
        content=_xlsx_bytes(payload.get("rows") or [], _EXPORT_COLUMNS, _SPEC.xlsx_column_widths, _SPEC.xlsx_sheet_name),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
