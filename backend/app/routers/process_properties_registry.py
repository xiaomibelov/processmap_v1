from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from xml.sax.saxutils import escape as xml_escape
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..legacy.request_context import (
    require_authenticated_user,
    request_active_org_id,
)
from ..services.org_workspace import (
    project_access_allowed,
    project_scope_for_request,
    require_org_member_for_enterprise,
)
from ..storage import get_project_storage, get_storage, get_workspace_record

router = APIRouter(tags=["process-properties-registry"])

_ALLOWED_SCOPES = {"workspace", "project", "session"}
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
}


class ProcessPropertiesRegistryFilters(BaseModel):
    property_types: List[str] = Field(default_factory=list)
    groups: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    processes: List[str] = Field(default_factory=list)
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


def _text(value: Any) -> str:
    return str(value or "").strip()


def _texts(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    out: List[str] = []
    seen: Set[str] = set()
    for item in values:
        text = _text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _normalize_scope(value: Any) -> str:
    scope = _text(value).lower() or "workspace"
    if scope not in _ALLOWED_SCOPES:
        raise HTTPException(status_code=422, detail="invalid scope; allowed: workspace, project, session")
    return scope


def _normalize_limit(value: Any) -> int:
    try:
        limit = int(value)
    except Exception:
        limit = 100
    return min(max(limit, 1), 1000)


def _normalize_offset(value: Any) -> int:
    try:
        offset = int(value)
    except Exception:
        offset = 0
    return max(offset, 0)


def _load_project_or_404(project_id: str, org_id: str) -> Any:
    project = get_project_storage().load(project_id, org_id=org_id, is_admin=True)
    if project is None:
        raise HTTPException(status_code=404, detail="not_found")
    return project


def _validate_project_ids(request: Request, org_id: str, project_ids: List[str], *, workspace_id: str = "") -> List[str]:
    out: List[str] = []
    for project_id in project_ids:
        project = _load_project_or_404(project_id, org_id)
        if not project_access_allowed(request, org_id, project_id):
            raise HTTPException(status_code=404, detail="not_found")
        if workspace_id and _text(getattr(project, "workspace_id", "")) != workspace_id:
            raise HTTPException(status_code=404, detail="not_found")
        out.append(project_id)
    return out


def _validate_session_ids(request: Request, org_id: str, session_ids: List[str], *, workspace_id: str = "", project_ids: Optional[List[str]] = None) -> List[str]:
    allowed_projects = set(project_ids or [])
    out: List[str] = []
    storage = get_storage()
    for session_id in session_ids:
        session = storage.load(session_id, org_id=org_id, is_admin=True)
        if session is None:
            raise HTTPException(status_code=404, detail="not_found")
        project_id = _text(getattr(session, "project_id", ""))
        if project_id and not project_access_allowed(request, org_id, project_id):
            raise HTTPException(status_code=404, detail="not_found")
        if allowed_projects and project_id not in allowed_projects:
            raise HTTPException(status_code=404, detail="not_found")
        if workspace_id:
            if not project_id:
                raise HTTPException(status_code=404, detail="not_found")
            project = _load_project_or_404(project_id, org_id)
            if _text(getattr(project, "workspace_id", "")) != workspace_id:
                raise HTTPException(status_code=404, detail="not_found")
        out.append(session_id)
    return out


def _visible_project_ids_for_workspace(request: Request, org_id: str, explicit_ids: List[str], workspace_id: str) -> List[str]:
    if explicit_ids:
        return _validate_project_ids(request, org_id, explicit_ids, workspace_id=workspace_id)
    scope = project_scope_for_request(request, org_id)
    if _text(scope.get("mode")) == "all":
        return []
    out: List[str] = []
    for project_id in _texts(scope.get("project_ids")):
        project = get_project_storage().load(project_id, org_id=org_id, is_admin=True)
        if project is None:
            continue
        if _text(getattr(project, "workspace_id", "")) != workspace_id:
            continue
        if not project_access_allowed(request, org_id, project_id):
            continue
        out.append(project_id)
    return out


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
                "element_title": "",
                "element_type": "",
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
                "element_title": "",
                "element_type": "",
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


def _matches_filters(row: Dict[str, Any], filters: ProcessPropertiesRegistryFilters) -> bool:
    completeness = _text(filters.completeness or "all").lower() or "all"
    if completeness not in {"all", "complete", "incomplete"}:
        raise HTTPException(status_code=422, detail="invalid completeness filter")
    if completeness != "all" and _text(row.get("completeness")) != completeness:
        return False
    for filter_key, row_key in _FILTER_MAP.items():
        wanted = set(_texts(getattr(filters, filter_key, [])))
        if wanted and _text(row.get(row_key)) not in wanted:
            return False
    return True


def _sort_key(row: Dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        _text(row.get("property_group")).lower(),
        _text(row.get("property_type")).lower(),
        _text(row.get("session_title")).lower(),
        _text(row.get("element_id")).lower(),
        _text(row.get("property_name")).lower(),
    )


def _summary(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    projects = {_text(row.get("project_id")) for row in rows if _text(row.get("project_id"))}
    sessions = {_text(row.get("session_id")) for row in rows if _text(row.get("session_id"))}
    complete = sum(1 for row in rows if row.get("completeness") == "complete")
    incomplete = len(rows) - complete
    return {
        "projects_total": len(projects),
        "sessions_total": len(sessions),
        "actions_total": len(rows),
        "complete": complete,
        "incomplete": incomplete,
    }


def _filter_options(rows: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    options: Dict[str, Set[str]] = {
        "property_types": set(),
        "groups": set(),
        "sources": set(),
        "processes": set(),
        "completeness": {"all", "complete", "incomplete"},
    }
    for row in rows:
        if _text(row.get("property_type")):
            options["property_types"].add(_text(row.get("property_type")))
        if _text(row.get("property_group")):
            options["groups"].add(_text(row.get("property_group")))
        if _text(row.get("source")):
            options["sources"].add(_text(row.get("source")))
            options["processes"].add(_text(row.get("source")))
    return {k: sorted(v) for k, v in options.items()}


def _applied_filters(filters: ProcessPropertiesRegistryFilters) -> Dict[str, Any]:
    completeness = _text(filters.completeness or "all").lower() or "all"
    if completeness not in {"all", "complete", "incomplete"}:
        raise HTTPException(status_code=422, detail="invalid completeness filter")
    return {
        "property_types": _texts(filters.property_types),
        "groups": _texts(filters.groups),
        "sources": _texts(filters.sources),
        "processes": _texts(filters.processes),
        "completeness": completeness,
    }


def _metrics(
    all_rows: List[Dict[str, Any]],
    filtered_rows: List[Dict[str, Any]],
    page_rows: List[Dict[str, Any]],
    limit: int,
    offset: int,
    session_summaries: List[Dict[str, Any]],
) -> Dict[str, Any]:
    projects_all = {_text(row.get("project_id")) for row in all_rows if _text(row.get("project_id"))}
    sessions_all = {_text(row.get("session_id")) for row in all_rows if _text(row.get("session_id"))}
    complete_filtered = sum(1 for row in filtered_rows if row.get("completeness") == "complete")
    incomplete_filtered = len(filtered_rows) - complete_filtered
    total_complete = sum(1 for row in all_rows if row.get("completeness") == "complete")
    total_incomplete = len(all_rows) - total_complete
    return {
        "total_rows": len(all_rows),
        "filtered_rows": len(filtered_rows),
        "page_rows": len(page_rows),
        "projects_total": len(projects_all),
        "sessions_total": len(sessions_all),
        "sessions_with_actions": sum(1 for item in session_summaries if int(item.get("actions_total") or 0) > 0),
        "sessions_without_actions": sum(1 for item in session_summaries if int(item.get("actions_total") or 0) <= 0),
        "complete": complete_filtered,
        "incomplete": incomplete_filtered,
        "total_complete": total_complete,
        "total_incomplete": total_incomplete,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < len(filtered_rows),
    }


def _empty_state(
    scope: str,
    all_rows: List[Dict[str, Any]],
    filtered_rows: List[Dict[str, Any]],
    session_summaries: List[Dict[str, Any]],
    applied_filters: Dict[str, Any],
) -> Dict[str, Any]:
    has_filters = any(
        applied_filters.get(k)
        for k in ("property_types", "groups", "sources", "processes")
    ) or applied_filters.get("completeness") not in (None, "", "all")
    if not session_summaries:
        return {"kind": "no_sessions", "scope": scope, "message_key": "registry.empty.no_sessions"}
    if all_rows and not filtered_rows and has_filters:
        return {"kind": "no_filtered_rows", "scope": scope, "message_key": "registry.empty.no_filtered_rows"}
    if not all_rows:
        return {"kind": "no_actions", "scope": scope, "message_key": "registry.empty.no_actions"}
    return {"kind": "not_empty", "scope": scope, "message_key": "registry.empty.not_empty"}


def _source_state(
    session_summaries: List[Dict[str, Any]],
    all_rows: List[Dict[str, Any]],
    sources: List[Dict[str, Any]],
) -> Dict[str, Any]:
    sessions_scanned = len(sources)
    actions_scanned = len(all_rows)
    summary_sources: Set[str] = set()
    for s in session_summaries:
        src = s.get("summary_source")
        if src:
            summary_sources.add(str(src))
    if "rows_fallback" in summary_sources and "storage" in summary_sources:
        session_summary_source = "mixed"
    elif "rows_fallback" in summary_sources:
        session_summary_source = "rows_fallback"
    else:
        session_summary_source = "storage"
    return {
        "source": "process_properties_registry_backend",
        "namespace": "/api/analysis/properties/registry",
        "heavy_payload_excluded": True,
        "mutation_allowed": False,
        "session_summary_source": session_summary_source,
        "sessions_scanned": sessions_scanned,
        "actions_scanned": actions_scanned,
        "source_contract_version": "v1",
    }


def _session_summary(source: Dict[str, Any]) -> Dict[str, Any]:
    actions = _extract_camunda_rows(source)
    complete = sum(1 for row in actions if row.get("completeness") == "complete")
    incomplete = len(actions) - complete
    project_title = _text(source.get("project_title"))
    folder_title = _text(source.get("folder_title"))
    context_parts = [part for part in (folder_title, project_title) if part]
    return {
        "org_id": _text(source.get("org_id")),
        "workspace_id": _text(source.get("workspace_id")),
        "workspace_title": _text(source.get("workspace_title")),
        "project_id": _text(source.get("project_id")),
        "project_title": project_title,
        "folder_id": _text(source.get("folder_id")),
        "folder_title": folder_title,
        "path": " / ".join(context_parts),
        "session_id": _text(source.get("session_id")),
        "session_title": _text(source.get("session_title")) or "Без названия",
        "diagram_state_version": int(source.get("diagram_state_version") or 0),
        "updated_at": int(source.get("updated_at") or 0),
        "status": _text(source.get("status")) or "",
        "actions_total": len(actions),
        "complete": complete,
        "incomplete": incomplete,
    }


def _session_summary_totals(sessions: List[Dict[str, Any]]) -> Dict[str, int]:
    projects = {_text(item.get("project_id")) for item in sessions if _text(item.get("project_id"))}
    actions_total = sum(int(item.get("actions_total") or 0) for item in sessions)
    complete = sum(int(item.get("complete") or 0) for item in sessions)
    incomplete = sum(int(item.get("incomplete") or 0) for item in sessions)
    return {
        "projects_total": len(projects),
        "sessions_total": len(sessions),
        "sessions_with_actions": sum(1 for item in sessions if int(item.get("actions_total") or 0) > 0),
        "sessions_without_actions": sum(1 for item in sessions if int(item.get("actions_total") or 0) <= 0),
        "actions_total": actions_total,
        "complete": complete,
        "incomplete": incomplete,
    }


def _reconcile_session_summaries_with_rows(
    sessions: List[Dict[str, Any]],
    rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    by_session_id: Dict[str, Dict[str, Any]] = {
        _text(item.get("session_id")): item
        for item in sessions
        if _text(item.get("session_id"))
    }
    rows_by_session_id: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        session_id = _text(row.get("session_id"))
        if not session_id:
            continue
        rows_by_session_id.setdefault(session_id, []).append(row)

    out = list(sessions)
    for session_id, session_rows in rows_by_session_id.items():
        if session_id in by_session_id:
            continue
        complete = sum(1 for row in session_rows if row.get("completeness") == "complete")
        first = session_rows[0]
        fallback_summary = {
            "org_id": _text(first.get("org_id")),
            "workspace_id": _text(first.get("workspace_id")),
            "workspace_title": _text(first.get("workspace_title")),
            "project_id": _text(first.get("project_id")),
            "project_title": _text(first.get("project_title")),
            "folder_id": "",
            "folder_title": "",
            "path": _text(first.get("project_title")),
            "session_id": session_id,
            "session_title": _text(first.get("session_title")) or "Без названия",
            "diagram_state_version": int(first.get("diagram_state_version") or 0),
            "updated_at": 0,
            "status": "",
            "actions_total": len(session_rows),
            "complete": complete,
            "incomplete": len(session_rows) - complete,
            "summary_source": "rows_fallback",
        }
        out.append(fallback_summary)
        by_session_id[session_id] = fallback_summary
    return out


def _workspace_title(workspace_id: str, org_id: str) -> str:
    record = get_workspace_record(workspace_id, org_id=org_id)
    if not record:
        return ""
    return _text(record.get("name") or record.get("title"))


def _with_workspace_titles(sources: List[Dict[str, Any]], org_id: str, fallback_workspace_id: str = "") -> List[Dict[str, Any]]:
    titles: Dict[str, str] = {}
    out: List[Dict[str, Any]] = []
    for source_raw in sources:
        source = dict(source_raw or {})
        workspace_id = _text(source.get("workspace_id")) or fallback_workspace_id
        if workspace_id and workspace_id not in titles:
            titles[workspace_id] = _workspace_title(workspace_id, org_id)
        source["workspace_id"] = workspace_id
        source["workspace_title"] = titles.get(workspace_id, "")
        out.append(source)
    return out


def _registry_payload(inp: ProcessPropertiesRegistryQueryIn, request: Request, *, paginate: bool = True) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)

    scope = _normalize_scope(inp.scope)
    workspace_id = _text(inp.workspace_id)
    project_ids = _texts(inp.project_ids)
    session_ids = _texts(inp.session_ids)
    if inp.project_id:
        project_ids = _texts([inp.project_id, *project_ids])
    if inp.session_id:
        session_ids = _texts([inp.session_id, *session_ids])

    if scope == "workspace":
        if not workspace_id:
            raise HTTPException(status_code=422, detail="workspace_id required")
        if get_workspace_record(workspace_id, org_id=org_id) is None:
            raise HTTPException(status_code=404, detail="not_found")
        project_ids = _visible_project_ids_for_workspace(request, org_id, project_ids, workspace_id)
        if session_ids:
            session_ids = _validate_session_ids(request, org_id, session_ids, workspace_id=workspace_id, project_ids=project_ids or None)
    elif scope == "project":
        if not project_ids:
            raise HTTPException(status_code=422, detail="project_id required")
        project_ids = _validate_project_ids(request, org_id, project_ids)
        if session_ids:
            session_ids = _validate_session_ids(request, org_id, session_ids, project_ids=project_ids)
    else:
        if not session_ids:
            raise HTTPException(status_code=422, detail="session_id required")
        session_ids = _validate_session_ids(request, org_id, session_ids)
        if not project_ids:
            loaded_projects: List[str] = []
            storage = get_storage()
            for session_id in session_ids:
                session = storage.load(session_id, org_id=org_id, is_admin=True)
                project_id = _text(getattr(session, "project_id", "")) if session is not None else ""
                if project_id:
                    loaded_projects.append(project_id)
            project_ids = sorted(set(loaded_projects))

    sources = get_storage().list_process_properties_registry_sources(
        org_id=org_id,
        workspace_id=workspace_id if scope == "workspace" else "",
        project_ids=project_ids,
        session_ids=session_ids,
        limit_sessions=10000,
        is_admin=True,
    )
    sources = _with_workspace_titles(sources, org_id, workspace_id)
    session_summaries = [_session_summary(source) for source in sources]
    all_rows: List[Dict[str, Any]] = []
    for source in sources:
        all_rows.extend(_extract_camunda_rows(source))
    session_summaries = _reconcile_session_summaries_with_rows(session_summaries, all_rows)

    applied_filters = _applied_filters(inp.filters)
    filter_options = _filter_options(all_rows)

    filtered_rows = [row for row in all_rows if _matches_filters(row, inp.filters)]
    filtered_rows.sort(key=_sort_key)

    limit = _normalize_limit(inp.limit)
    offset = _normalize_offset(inp.offset)
    total = len(filtered_rows)
    page_rows = filtered_rows[offset:offset + limit] if paginate else filtered_rows

    metrics = _metrics(all_rows, filtered_rows, page_rows, limit, offset, session_summaries)
    empty_state = _empty_state(scope, all_rows, filtered_rows, session_summaries, applied_filters)
    source_state = _source_state(session_summaries, all_rows, sources)

    return {
        "ok": True,
        "scope": scope,
        "rows": page_rows,
        "summary": _summary(filtered_rows),
        "sessions": session_summaries,
        "session_summary": _session_summary_totals(session_summaries),
        "page": {
            "limit": limit,
            "offset": offset,
            "total": total,
            "has_more": offset + limit < total,
        },
        "filter_options": filter_options,
        "applied_filters": applied_filters,
        "metrics": metrics,
        "empty_state": empty_state,
        "source_state": source_state,
    }


def _export_filename(scope: str, extension: str) -> str:
    safe_scope = _normalize_scope(scope)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return f"process-properties-{safe_scope}-{stamp}.{extension}"


def _export_cell(row: Dict[str, Any], column: str) -> str:
    value = row.get(column)
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def _csv_bytes(rows: List[Dict[str, Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", quotechar='"', lineterminator="\r\n")
    writer.writerow(_EXPORT_COLUMNS)
    for row in rows:
        writer.writerow([_export_cell(row, column) for column in _EXPORT_COLUMNS])
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def _column_name(index: int) -> str:
    name = ""
    current = index
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _xlsx_inline_cell(value: Any, row_index: int, column_index: int) -> str:
    ref = f"{_column_name(column_index)}{row_index}"
    text = xml_escape(str(value if value is not None else ""))
    return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'


def _xlsx_bytes(rows: List[Dict[str, Any]]) -> bytes:
    output = io.BytesIO()
    sheet_rows = []
    all_rows = [_EXPORT_COLUMNS] + [[_export_cell(row, column) for column in _EXPORT_COLUMNS] for row in rows]
    for row_index, values in enumerate(all_rows, start=1):
        cells = "".join(_xlsx_inline_cell(value, row_index, column_index) for column_index, value in enumerate(values, start=1))
        sheet_rows.append(f'<row r="{row_index}">{cells}</row>')
    widths = "".join(
        f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
        for index, width in enumerate([18, 22, 18, 24, 18, 18, 18, 16, 22, 22, 22, 18, 18, 18, 16, 12], start=1)
    )
    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<cols>{widths}</cols>"
        f"<sheetData>{''.join(sheet_rows)}</sheetData>"
        "</worksheet>"
    )
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>"
        ))
        archive.writestr("_rels/.rels", (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ))
        archive.writestr("xl/workbook.xml", (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Process properties" sheetId="1" r:id="rId1"/></sheets>'
            "</workbook>"
        ))
        archive.writestr("xl/_rels/workbook.xml.rels", (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>"
        ))
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)
    return output.getvalue()


@router.post("/api/analysis/properties/registry/query")
def query_process_properties_registry(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Dict[str, Any]:
    return _registry_payload(inp, request, paginate=True)


@router.post("/api/analysis/properties/registry/export.csv")
def export_process_properties_registry_csv(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, paginate=True)
    filename = _export_filename(str(payload.get("scope") or inp.scope), "csv")
    return Response(
        content=_csv_bytes(payload.get("rows") or []),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/analysis/properties/registry/export.xlsx")
def export_process_properties_registry_xlsx(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, paginate=True)
    filename = _export_filename(str(payload.get("scope") or inp.scope), "xlsx")
    return Response(
        content=_xlsx_bytes(payload.get("rows") or []),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
