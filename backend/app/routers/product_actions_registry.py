from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, HTTPException, Request
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


@router.post("/api/analysis/product-actions/registry/query")
def query_product_actions_registry(inp: ProductActionsRegistryQueryIn, request: Request) -> Dict[str, Any]:
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
    session_summaries = [_session_summary(source) for source in sources]
    rows: List[Dict[str, Any]] = []
    for source in sources:
        for index, action in enumerate(source.get("product_actions") or []):
            rows.append(_registry_row(source, action, index))
    rows = [row for row in rows if _matches_filters(row, inp.filters)]
    rows.sort(key=_sort_key)

    limit = _normalize_limit(inp.limit)
    offset = _normalize_offset(inp.offset)
    total = len(rows)
    page_rows = rows[offset:offset + limit]
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
