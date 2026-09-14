"""Общее ядро registry-роутеров (PPR/PAR).

Контур refactor/registry-core-v1: идентичные клон-блоки двух роутеров
(авторизация scope, валидация project/session id, фильтрация, сортировка,
метрики, session summaries, CSV/XLSX-экспорт) собраны здесь; роутеры
остаются тонкими адаптерами с конфигурацией (RegistryCoreConfig).

Byte-совместимость экспорта обязательна: BOM "\\ufeff", разделитель ";",
quotechar '"', lineterminator "\\r\\n", utf-8; XLSX — inlineStr
SpreadsheetML через zipfile (НЕ xlsxwriter).
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set
from xml.sax.saxutils import escape as xml_escape
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, Request
from fastapi.responses import Response

from ..legacy.request_context import (
    require_authenticated_user,
    request_active_org_id,
)
from ..services.org_workspace import (
    project_access_allowed,
    project_scope_for_request,
    require_org_member_for_enterprise,
)
from ..storage import (
    get_project_storage,
    get_storage,
    get_workspace_record,
)

_ALLOWED_SCOPES = {"workspace", "project", "session"}

RegistryRow = Dict[str, Any]
RegistrySource = Dict[str, Any]


@dataclass(frozen=True)
class RegistryCoreConfig:
    """Пер-реестровая конфигурация адаптера."""

    export_columns: List[str]
    filter_map: Dict[str, str]  # атрибут filters-модели -> ключ строки row (_matches_filters)
    filter_option_map: Dict[str, str]  # атрибут filters-модели -> ключ строки row (_filter_options)
    filename_prefix: str
    xlsx_sheet_name: str
    xlsx_column_widths: List[int]
    source_label: str  # source_state.source
    source_namespace: str  # source_state.namespace
    source_contract_version: Optional[str] = None  # PPR добавляет "v1", PAR — нет
    sort_key: Callable[[RegistryRow], Any] = field(default=lambda row: ())
    completeness: Callable[[RegistryRow], Any] = field(default=lambda row: "")
    load_sources: Callable[..., List[RegistrySource]] = field(default=lambda **_: [])
    extract_rows: Callable[[RegistrySource], List[RegistryRow]] = field(default=lambda source: [])


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


def _matches_filters(config: RegistryCoreConfig, row: RegistryRow, filters: Any) -> bool:
    completeness = _text(getattr(filters, "completeness", None) or "all").lower() or "all"
    if completeness not in {"all", "complete", "incomplete"}:
        raise HTTPException(status_code=422, detail="invalid completeness filter")
    if completeness != "all" and _text(row.get("completeness")) != completeness:
        return False
    for filter_key, row_key in config.filter_map.items():
        wanted = set(_texts(getattr(filters, filter_key, [])))
        if wanted and _text(row.get(row_key)) not in wanted:
            return False
    return True


def _summary(rows: List[RegistryRow]) -> Dict[str, int]:
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


def _filter_options(config: RegistryCoreConfig, rows: List[RegistryRow]) -> Dict[str, List[str]]:
    options: Dict[str, Set[str]] = {key: set() for key in config.filter_option_map}
    options["completeness"] = {"all", "complete", "incomplete"}
    for row in rows:
        for filter_key, row_key in config.filter_option_map.items():
            if _text(row.get(row_key)):
                options[filter_key].add(_text(row.get(row_key)))
    return {k: sorted(v) for k, v in options.items()}


def _applied_filters(config: RegistryCoreConfig, filters: Any) -> Dict[str, Any]:
    completeness = _text(getattr(filters, "completeness", None) or "all").lower() or "all"
    if completeness not in {"all", "complete", "incomplete"}:
        raise HTTPException(status_code=422, detail="invalid completeness filter")
    out: Dict[str, Any] = {
        filter_key: _texts(getattr(filters, filter_key, []))
        for filter_key in config.filter_option_map
    }
    out["completeness"] = completeness
    return out


def _metrics(
    all_rows: List[RegistryRow],
    filtered_rows: List[RegistryRow],
    page_rows: List[RegistryRow],
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
    config: RegistryCoreConfig,
    scope: str,
    all_rows: List[RegistryRow],
    filtered_rows: List[RegistryRow],
    session_summaries: List[Dict[str, Any]],
    applied_filters: Dict[str, Any],
) -> Dict[str, Any]:
    has_filters = any(
        applied_filters.get(k) for k in config.filter_option_map
    ) or applied_filters.get("completeness") not in (None, "", "all")
    if not session_summaries:
        return {"kind": "no_sessions", "scope": scope, "message_key": "registry.empty.no_sessions"}
    if all_rows and not filtered_rows and has_filters:
        return {"kind": "no_filtered_rows", "scope": scope, "message_key": "registry.empty.no_filtered_rows"}
    if not all_rows:
        return {"kind": "no_actions", "scope": scope, "message_key": "registry.empty.no_actions"}
    return {"kind": "not_empty", "scope": scope, "message_key": "registry.empty.not_empty"}


def _source_state(
    config: RegistryCoreConfig,
    session_summaries: List[Dict[str, Any]],
    all_rows: List[RegistryRow],
    sources: List[RegistrySource],
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
    out: Dict[str, Any] = {
        "source": config.source_label,
        "namespace": config.source_namespace,
        "heavy_payload_excluded": True,
        "mutation_allowed": False,
        "session_summary_source": session_summary_source,
        "sessions_scanned": sessions_scanned,
        "actions_scanned": actions_scanned,
    }
    if config.source_contract_version:
        out["source_contract_version"] = config.source_contract_version
    return out


def _session_summary(config: RegistryCoreConfig, source: RegistrySource) -> Dict[str, Any]:
    actions = config.extract_rows(source)
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
    rows: List[RegistryRow],
) -> List[Dict[str, Any]]:
    by_session_id: Dict[str, Dict[str, Any]] = {
        _text(item.get("session_id")): item
        for item in sessions
        if _text(item.get("session_id"))
    }
    rows_by_session_id: Dict[str, List[RegistryRow]] = {}
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


def _with_workspace_titles(sources: List[RegistrySource], org_id: str, fallback_workspace_id: str = "") -> List[RegistrySource]:
    titles: Dict[str, str] = {}
    out: List[RegistrySource] = []
    for source_raw in sources:
        source = dict(source_raw or {})
        workspace_id = _text(source.get("workspace_id")) or fallback_workspace_id
        if workspace_id and workspace_id not in titles:
            titles[workspace_id] = _workspace_title(workspace_id, org_id)
        source["workspace_id"] = workspace_id
        source["workspace_title"] = titles.get(workspace_id, "")
        out.append(source)
    return out


def build_registry_payload(config: RegistryCoreConfig, inp: Any, request: Request, *, paginate: bool = True) -> Dict[str, Any]:
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

    sources = config.load_sources(
        org_id=org_id,
        workspace_id=workspace_id if scope == "workspace" else "",
        project_ids=project_ids,
        session_ids=session_ids,
        limit_sessions=10000,
        is_admin=True,
    )
    sources = _with_workspace_titles(sources, org_id, workspace_id)
    session_summaries = [_session_summary(config, source) for source in sources]
    all_rows: List[RegistryRow] = []
    for source in sources:
        all_rows.extend(config.extract_rows(source))
    session_summaries = _reconcile_session_summaries_with_rows(session_summaries, all_rows)

    applied_filters = _applied_filters(config, inp.filters)
    filter_options = _filter_options(config, all_rows)

    filtered_rows = [row for row in all_rows if _matches_filters(config, row, inp.filters)]
    filtered_rows.sort(key=config.sort_key)

    limit = _normalize_limit(inp.limit)
    offset = _normalize_offset(inp.offset)
    total = len(filtered_rows)
    page_rows = filtered_rows[offset:offset + limit] if paginate else filtered_rows

    metrics = _metrics(all_rows, filtered_rows, page_rows, limit, offset, session_summaries)
    empty_state = _empty_state(config, scope, all_rows, filtered_rows, session_summaries, applied_filters)
    source_state = _source_state(config, session_summaries, all_rows, sources)

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


# --- Экспорт (byte-совместимость с baseline обязательна) ---


def export_filename(config: RegistryCoreConfig, scope: str, extension: str) -> str:
    safe_scope = _normalize_scope(scope)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return f"{config.filename_prefix}-{safe_scope}-{stamp}.{extension}"


def _export_cell(row: Dict[str, Any], column: str) -> str:
    value = row.get(column)
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def csv_bytes(columns: List[str], rows: List[Dict[str, Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", quotechar='"', lineterminator="\r\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_export_cell(row, column) for column in columns])
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


def xlsx_bytes_for(
    columns: List[str],
    rows: List[Dict[str, Any]],
    *,
    sheet_name: str,
    column_widths: List[int],
) -> bytes:
    output = io.BytesIO()
    sheet_rows = []
    all_rows = [columns] + [[_export_cell(row, column) for column in columns] for row in rows]
    for row_index, values in enumerate(all_rows, start=1):
        cells = "".join(_xlsx_inline_cell(value, row_index, column_index) for column_index, value in enumerate(values, start=1))
        sheet_rows.append(f'<row r="{row_index}">{cells}</row>')
    widths = "".join(
        f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
        for index, width in enumerate(column_widths, start=1)
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
            f'<sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets>'
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


def xlsx_bytes(config: RegistryCoreConfig, rows: List[Dict[str, Any]]) -> bytes:
    return xlsx_bytes_for(
        config.export_columns,
        rows,
        sheet_name=config.xlsx_sheet_name,
        column_widths=config.xlsx_column_widths,
    )


# --- Фабрики POST-эндпоинтов (Response media_type, Content-Disposition, paginate=True) ---
#
# Аннотация inp подставляется реальная (pydantic-модель адаптера), чтобы FastAPI
# продолжил резолвить её как body-параметр — duck-typed контракт сохраняется.


def _with_endpoint_signature(fn: Callable[..., Any], name: str, model: type, return_type: Any) -> Callable[..., Any]:
    fn.__name__ = name
    fn.__annotations__ = {"inp": model, "request": Request, "return": return_type}
    return fn


def make_query_endpoint(config: RegistryCoreConfig, name: str, model: type) -> Callable[..., Dict[str, Any]]:
    def query_registry_endpoint(inp: Any, request: Request) -> Dict[str, Any]:
        return build_registry_payload(config, inp, request, paginate=True)

    return _with_endpoint_signature(query_registry_endpoint, name, model, Dict[str, Any])


def make_export_csv_endpoint(config: RegistryCoreConfig, name: str, model: type) -> Callable[..., Response]:
    def export_registry_csv_endpoint(inp: Any, request: Request) -> Response:
        payload = build_registry_payload(config, inp, request, paginate=True)
        filename = export_filename(config, str(payload.get("scope") or inp.scope), "csv")
        return Response(
            content=csv_bytes(config.export_columns, payload.get("rows") or []),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return _with_endpoint_signature(export_registry_csv_endpoint, name, model, Response)


def make_export_xlsx_endpoint(config: RegistryCoreConfig, name: str, model: type) -> Callable[..., Response]:
    def export_registry_xlsx_endpoint(inp: Any, request: Request) -> Response:
        payload = build_registry_payload(config, inp, request, paginate=True)
        filename = export_filename(config, str(payload.get("scope") or inp.scope), "xlsx")
        return Response(
            content=xlsx_bytes(config, payload.get("rows") or []),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return _with_endpoint_signature(export_registry_xlsx_endpoint, name, model, Response)
