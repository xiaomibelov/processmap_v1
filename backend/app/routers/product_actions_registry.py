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

router = APIRouter(tags=["product-actions-registry"])

_ALLOWED_SCOPES = {"workspace", "project", "session"}
_REQUIRED_BUSINESS_FIELDS = ("product_name", "product_group", "action_type", "action_object")
_EXPORT_COLUMNS = [
    "workspace_title",
    "project_title",
    "project_id",
    "session_title",
    "session_id",
    "product_group",
    "product_name",
    "action_type",
    "action_stage",
    "action_object_category",
    "action_object",
    "action_method",
    "role",
    "step_label",
    "step_id",
    "bpmn_element_id",
    "work_duration_sec",
    "wait_duration_sec",
    "source",
    "confidence",
    "completeness",
    "updated_at",
]
_FILTER_MAP = {
    "product_groups": "product_group",
    "products": "product_name",
    "action_types": "action_type",
    "stages": "action_stage",
    "object_categories": "action_object_category",
    "roles": "role",
}


class ProductActionsRegistryFilters(BaseModel):
    product_groups: List[str] = Field(default_factory=list)
    products: List[str] = Field(default_factory=list)
    action_types: List[str] = Field(default_factory=list)
    stages: List[str] = Field(default_factory=list)
    object_categories: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    completeness: str = "all"


class ProductActionsRegistryQueryIn(BaseModel):
    scope: str = "workspace"
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    project_ids: List[str] = Field(default_factory=list)
    session_ids: List[str] = Field(default_factory=list)
    filters: ProductActionsRegistryFilters = Field(default_factory=ProductActionsRegistryFilters)
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


def _completeness(row: Dict[str, Any]) -> tuple[str, List[str]]:
    missing = [key for key in _REQUIRED_BUSINESS_FIELDS if not _text(row.get(key))]
    return ("incomplete" if missing else "complete", missing)


def _registry_row(source: Dict[str, Any], action_raw: Any, index: int = 0) -> Dict[str, Any]:
    action = action_raw if isinstance(action_raw, dict) else {}
    session_id = _text(source.get("session_id"))
    action_id = _text(action.get("id") or action.get("action_id")) or f"row_{int(index or 0) + 1}"
    bpmn_element_id = _text(action.get("bpmn_element_id") or action.get("node_id"))
    row = {
        "id": f"{session_id}::{action_id}",
        "registry_id": f"{session_id}::{action_id}",
        "org_id": _text(source.get("org_id")),
        "workspace_id": _text(source.get("workspace_id")),
        "workspace_title": _text(source.get("workspace_title")),
        "project_id": _text(source.get("project_id")),
        "project_title": _text(source.get("project_title")),
        "session_id": session_id,
        "session_title": _text(source.get("session_title")) or "Без названия",
        "action_id": action_id,
        "raw_action_id": action_id,
        "product_group": _text(action.get("product_group")),
        "product_name": _text(action.get("product_name")),
        "action_type": _text(action.get("action_type")),
        "action_stage": _text(action.get("action_stage")),
        "action_object_category": _text(action.get("action_object_category")),
        "action_object": _text(action.get("action_object")),
        "action_method": _text(action.get("action_method")),
        "role": _text(action.get("role")),
        "step_id": _text(action.get("step_id")),
        "step_label": _text(action.get("step_label")),
        "node_id": _text(action.get("node_id")),
        "bpmn_element_id": bpmn_element_id,
        "work_duration_sec": action.get("work_duration_sec"),
        "wait_duration_sec": action.get("wait_duration_sec"),
        "source": _text(action.get("source")) or "manual",
        "confidence": action.get("confidence"),
        "updated_at": _text(action.get("updated_at")) or str(source.get("updated_at") or ""),
        "diagram_state_version": int(source.get("diagram_state_version") or 0),
    }
    completeness, missing = _completeness(row)
    row["completeness"] = completeness
    row["missing_fields"] = missing
    return row


def _matches_filters(row: Dict[str, Any], filters: ProductActionsRegistryFilters) -> bool:
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


def _sort_key(row: Dict[str, Any]) -> tuple[str, str, str, str, str, str]:
    return (
        _text(row.get("product_group")).lower(),
        _text(row.get("product_name")).lower(),
        _text(row.get("session_title")).lower(),
        _text(row.get("step_label")).lower(),
        _text(row.get("action_stage")).lower(),
        _text(row.get("action_type")).lower(),
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


def _session_summary(source: Dict[str, Any]) -> Dict[str, Any]:
    actions: List[Dict[str, Any]] = []
    for index, action in enumerate(source.get("product_actions") or []):
        actions.append(_registry_row(source, action, index))
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
    """Keep the response invariant: each action row belongs to a returned session summary."""
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


def _registry_payload(inp: ProductActionsRegistryQueryIn, request: Request, *, paginate: bool = True) -> Dict[str, Any]:
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

    sources = get_storage().list_product_action_registry_sources(
        org_id=org_id,
        workspace_id=workspace_id if scope == "workspace" else "",
        project_ids=project_ids,
        session_ids=session_ids,
        limit_sessions=10000,
        is_admin=True,
    )
    sources = _with_workspace_titles(sources, org_id, workspace_id)
    session_summaries = [_session_summary(source) for source in sources]
    rows: List[Dict[str, Any]] = []
    for source in sources:
        for index, action in enumerate(source.get("product_actions") or []):
            rows.append(_registry_row(source, action, index))
    session_summaries = _reconcile_session_summaries_with_rows(session_summaries, rows)
    rows = [row for row in rows if _matches_filters(row, inp.filters)]
    rows.sort(key=_sort_key)

    limit = _normalize_limit(inp.limit)
    offset = _normalize_offset(inp.offset)
    total = len(rows)
    page_rows = rows[offset:offset + limit] if paginate else rows
    return {
        "ok": True,
        "scope": scope,
        "rows": page_rows,
        "summary": _summary(rows),
        "sessions": session_summaries,
        "session_summary": _session_summary_totals(session_summaries),
        "page": {
            "limit": limit,
            "offset": offset,
            "total": total,
            "has_more": offset + limit < total,
        },
    }


def _export_filename(scope: str, extension: str) -> str:
    safe_scope = _normalize_scope(scope)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return f"product-actions-{safe_scope}-{stamp}.{extension}"


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
        for index, width in enumerate([18, 22, 18, 24, 18, 18, 22, 18, 18, 22, 22, 18, 18, 24, 18, 18, 16, 16, 14, 12, 14, 22], start=1)
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
            '<sheets><sheet name="Product actions" sheetId="1" r:id="rId1"/></sheets>'
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


def _session_filter_options(rows: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    options: Dict[str, Set[str]] = {
        "product_groups": set(),
        "products": set(),
        "action_types": set(),
        "stages": set(),
        "object_categories": set(),
        "roles": set(),
    }
    for row in rows:
        if _text(row.get("product_group")):
            options["product_groups"].add(_text(row.get("product_group")))
        if _text(row.get("product_name")):
            options["products"].add(_text(row.get("product_name")))
        if _text(row.get("action_type")):
            options["action_types"].add(_text(row.get("action_type")))
        if _text(row.get("action_stage")):
            options["stages"].add(_text(row.get("action_stage")))
        if _text(row.get("action_object_category")):
            options["object_categories"].add(_text(row.get("action_object_category")))
        if _text(row.get("role")):
            options["roles"].add(_text(row.get("role")))
    return {k: sorted(v) for k, v in options.items()}


def _session_metrics(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    complete = sum(1 for row in rows if row.get("completeness") == "complete")
    incomplete = len(rows) - complete
    return {
        "total_rows": len(rows),
        "complete": complete,
        "incomplete": incomplete,
    }


def _session_empty_state(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows:
        return {"kind": "no_actions", "scope": "session", "message_key": "registry.empty.no_actions"}
    return {"kind": "not_empty", "scope": "session", "message_key": "registry.empty.not_empty"}


def _session_source_state(session: Any, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    bpmn_xml = _text(getattr(session, "bpmn_xml", ""))
    bpmn_elements_count = 0
    if bpmn_xml:
        import xml.etree.ElementTree as ET
        try:
            root = ET.fromstring(bpmn_xml)
            bpmn_elements_count = sum(1 for _ in root.iter())
        except Exception:
            pass
    return {
        "source": "process_analysis_session_view_model",
        "namespace": "/api/sessions/{session_id}/analysis/view-model",
        "heavy_payload_excluded": True,
        "mutation_allowed": False,
        "interview_loaded": bool(getattr(session, "interview", {})),
        "bpmn_meta_loaded": bool(getattr(session, "bpmn_meta", {})),
        "bpmn_elements_count": bpmn_elements_count,
        "source_contract_version": "v1",
    }


def _step_action_counts(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for row in rows:
        step_id = _text(row.get("step_id"))
        if step_id:
            counts[step_id] = counts.get(step_id, 0) + 1
    return counts


@router.get("/api/sessions/{session_id}/analysis/view-model")
def get_session_analysis_view_model(session_id: str, request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)

    storage = get_storage()
    session = storage.load(session_id, org_id=org_id, is_admin=True)
    if session is None:
        raise HTTPException(status_code=404, detail="not_found")

    project_id = _text(getattr(session, "project_id", ""))
    if project_id and not project_access_allowed(request, org_id, project_id):
        raise HTTPException(status_code=404, detail="not_found")

    project_title = ""
    workspace_id = ""
    if project_id:
        project = get_project_storage().load(project_id, org_id=org_id, is_admin=True)
        if project is not None:
            project_title = _text(getattr(project, "title", ""))
            workspace_id = _text(getattr(project, "workspace_id", ""))

    interview = getattr(session, "interview", {}) or {}
    analysis = interview.get("analysis") if isinstance(interview, dict) else {}
    if not isinstance(analysis, dict):
        analysis = {}
    product_actions_raw = analysis.get("product_actions") if isinstance(analysis, dict) else []
    if not isinstance(product_actions_raw, list):
        product_actions_raw = []

    source = {
        "session_id": session_id,
        "session_title": _text(getattr(session, "title", "")) or "Без названия",
        "project_id": project_id,
        "project_title": project_title,
        "workspace_id": workspace_id,
        "org_id": org_id,
        "updated_at": getattr(session, "updated_at", 0),
        "diagram_state_version": getattr(session, "diagram_state_version", 0),
    }

    rows: List[Dict[str, Any]] = []
    for index, action in enumerate(product_actions_raw):
        rows.append(_registry_row(source, action, index))

    summary = {
        "total": len(rows),
        "complete": sum(1 for row in rows if row.get("completeness") == "complete"),
        "incomplete": sum(1 for row in rows if row.get("completeness") == "incomplete"),
    }

    filter_options = _session_filter_options(rows)
    metrics = _session_metrics(rows)
    empty_state = _session_empty_state(rows)
    source_state = _session_source_state(session, rows)
    step_counts = _step_action_counts(rows)

    interview_state = {
        "status": _text(interview.get("status")) or "draft",
        "stage": _text(interview.get("stage")) or "",
        "updated_at": int(getattr(session, "updated_at", 0) or 0),
    }

    return {
        "ok": True,
        "session_id": session_id,
        "session_title": source["session_title"],
        "project_id": project_id,
        "project_title": project_title,
        "workspace_id": workspace_id,
        "analysis": {
            "product_actions": {
                "rows": rows,
                "summary": summary,
                "filter_options": filter_options,
                "applied_filters": {},
                "metrics": metrics,
                "empty_state": empty_state,
                "source_state": source_state,
            },
            "derived": {
                "step_action_counts": step_counts,
            },
        },
        "interview_state": interview_state,
    }


@router.post("/api/analysis/product-actions/registry/query")
def query_product_actions_registry(inp: ProductActionsRegistryQueryIn, request: Request) -> Dict[str, Any]:
    return _registry_payload(inp, request, paginate=True)


@router.post("/api/analysis/product-actions/registry/export.csv")
def export_product_actions_registry_csv(inp: ProductActionsRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, paginate=True)
    filename = _export_filename(str(payload.get("scope") or inp.scope), "csv")
    return Response(
        content=_csv_bytes(payload.get("rows") or []),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/analysis/product-actions/registry/export.xlsx")
def export_product_actions_registry_xlsx(inp: ProductActionsRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, paginate=True)
    filename = _export_filename(str(payload.get("scope") or inp.scope), "xlsx")
    return Response(
        content=_xlsx_bytes(payload.get("rows") or []),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
