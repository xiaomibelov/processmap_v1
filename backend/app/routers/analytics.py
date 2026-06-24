from __future__ import annotations

import json
import math
import time
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..legacy.request_context import request_active_org_id
from ..schemas.analytics import AnalyticsActionsQuery, AnalyticsDashboardOut, AnalyticsPropertiesQuery
from ..services.analytics_authz import require_analytics_scope
from ..storage import get_storage

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _org_id_from_request(request: Request) -> str:
    return request_active_org_id(request)


def _ok(data: Any, meta: Dict[str, Any]) -> Dict[str, Any]:
    return {"success": True, "data": data, "meta": meta}


def _load_snapshot(scope_type: str, scope_id: str, org_id: str) -> Dict[str, Any]:
    st = get_storage()
    if scope_type == "session":
        rows = st._query(
            "SELECT * FROM analytics_session_snapshots WHERE session_id=? AND org_id=?",
            (scope_id, org_id),
        )
        if not rows:
            return {"scope_type": scope_type, "scope_id": scope_id, "computed_at": 0}
        cols = [d[0] for d in st._cursor_description()]
        row = dict(zip(cols, rows[0]))
        return {
            "scope_type": scope_type,
            "scope_id": scope_id,
            "total_duration_min": row.get("total_duration_min", 0) or 0,
            "critical_path_min": row.get("critical_path_min"),
            "actions_total": row.get("actions_total", 0) or 0,
            "actions_by_role": json.loads(row.get("actions_by_role_json") or "{}"),
            "actions_by_section": json.loads(row.get("actions_by_section_json") or "{}"),
            "actions_by_type": json.loads(row.get("actions_by_type_json") or "{}"),
            "handoffs_count": row.get("handoffs_count", 0) or 0,
            "open_questions": row.get("open_questions", 0) or 0,
            "critical_questions": row.get("critical_questions", 0) or 0,
            "sessions_count": 1,
            "projects_count": 0,
            "computed_at": row.get("computed_at", 0) or 0,
        }
    if scope_type == "project":
        rows = st._query(
            "SELECT * FROM analytics_project_snapshots WHERE project_id=? AND org_id=?",
            (scope_id, org_id),
        )
        if not rows:
            return {"scope_type": scope_type, "scope_id": scope_id, "computed_at": 0}
        cols = [d[0] for d in st._cursor_description()]
        row = dict(zip(cols, rows[0]))
        return {
            "scope_type": scope_type,
            "scope_id": scope_id,
            "total_duration_min": int(round(row.get("avg_duration_min", 0) or 0)) * (row.get("sessions_count", 0) or 0),
            "critical_path_min": None,
            "actions_total": row.get("total_actions", 0) or 0,
            "actions_by_role": {},
            "actions_by_section": {},
            "actions_by_type": {},
            "handoffs_count": row.get("handoffs_count", 0) or 0,
            "open_questions": 0,
            "critical_questions": row.get("total_critical_questions", 0) or 0,
            "sessions_count": row.get("sessions_count", 0) or 0,
            "projects_count": 1,
            "computed_at": row.get("computed_at", 0) or 0,
        }
    if scope_type == "workspace":
        rows = st._query(
            "SELECT * FROM analytics_workspace_snapshots WHERE workspace_id=? AND org_id=?",
            (scope_id, org_id),
        )
        if not rows:
            return {"scope_type": scope_type, "scope_id": scope_id, "computed_at": 0}
        cols = [d[0] for d in st._cursor_description()]
        row = dict(zip(cols, rows[0]))
        return {
            "scope_type": scope_type,
            "scope_id": scope_id,
            "total_duration_min": int(round(row.get("avg_duration_min", 0) or 0)) * (row.get("sessions_count", 0) or 0),
            "critical_path_min": None,
            "actions_total": row.get("total_actions", 0) or 0,
            "actions_by_role": {},
            "actions_by_section": {},
            "actions_by_type": {},
            "handoffs_count": row.get("handoffs_count", 0) or 0,
            "open_questions": 0,
            "critical_questions": row.get("total_critical_questions", 0) or 0,
            "sessions_count": row.get("sessions_count", 0) or 0,
            "projects_count": row.get("projects_count", 0) or 0,
            "computed_at": row.get("computed_at", 0) or 0,
        }
    raise HTTPException(status_code=400, detail="invalid scope_type")


@router.get("/dashboard")
def get_dashboard(
    request: Request,
    scope: str = Query(..., pattern="^(workspace|project|session)$"),
    scope_id: str = Query(..., min_length=1),
    org_id: str | None = Query(None),
):
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)
    data = _load_snapshot(scope, scope_id, oid)
    return _ok(data, {"scope_type": scope, "scope_id": scope_id, "computed_at": data.get("computed_at", 0)})


@router.get("/{scope}/{scope_id}/dashboard")
def get_dashboard_path(
    request: Request,
    scope: str,
    scope_id: str,
    org_id: str | None = Query(None),
):
    if scope not in ("workspace", "project", "session"):
        raise HTTPException(status_code=400, detail="invalid scope_type")
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)
    data = _load_snapshot(scope, scope_id, oid)
    return _ok(data, {"scope_type": scope, "scope_id": scope_id, "computed_at": data.get("computed_at", 0)})


def _session_ids_for_scope(scope_type: str, scope_id: str, org_id: str) -> List[str]:
    st = get_storage()
    if scope_type == "session":
        return [scope_id]
    if scope_type == "project":
        rows = st._query(
            "SELECT id FROM sessions WHERE project_id=? AND org_id=?",
            (scope_id, org_id),
        )
        return [r[0] for r in rows]
    if scope_type == "workspace":
        rows = st._query(
            "SELECT s.id FROM sessions s JOIN projects p ON p.id=s.project_id "
            "JOIN workspace_projects wp ON wp.project_id=p.id "
            "WHERE wp.workspace_id=? AND s.org_id=?",
            (scope_id, org_id),
        )
        return [r[0] for r in rows]
    return []


def _properties_rows(scope_type: str, scope_id: str, org_id: str) -> List[Dict[str, Any]]:
    from .._legacy_main import list_process_properties_registry_sources

    rows: List[Dict[str, Any]] = []
    seen = set()
    for sid in _session_ids_for_scope(scope_type, scope_id, org_id):
        for r in list_process_properties_registry_sources(sid):
            key = (r.get("bpmn_id"), r.get("name"), r.get("value"))
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
    return rows


def _filter_options(rows: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    types = sorted({str(r.get("type", "")) for r in rows if r.get("type")})
    categories = sorted({str(r.get("category", "")) for r in rows if r.get("category")})
    sources = sorted({str(r.get("source", "")) for r in rows if r.get("source")})
    sections = sorted({str(r.get("section", "")) for r in rows if r.get("section")})
    roles = sorted({str(r.get("role", "")) for r in rows if r.get("role")})
    return {
        "types": types,
        "categories": categories,
        "sources": sources,
        "sections": sections,
        "roles": roles,
    }


def _apply_filters(
    rows: List[Dict[str, Any]],
    type_filter: List[str],
    category_filter: List[str],
    source_filter: List[str],
    section_filter: List[str],
    role_filter: List[str],
) -> List[Dict[str, Any]]:
    def match(r: Dict[str, Any]) -> bool:
        if type_filter and str(r.get("type", "")) not in type_filter:
            return False
        if category_filter and str(r.get("category", "")) not in category_filter:
            return False
        if source_filter and str(r.get("source", "")) not in source_filter:
            return False
        if section_filter and str(r.get("section", "")) not in section_filter:
            return False
        if role_filter and str(r.get("role", "")) not in role_filter:
            return False
        return True

    return [r for r in rows if match(r)]


@router.get("/properties")
def get_properties(
    request: Request,
    scope: str = Query(..., pattern="^(workspace|project|session)$"),
    scope_id: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    type_filter: List[str] = Query(default_factory=list),
    category_filter: List[str] = Query(default_factory=list),
    source_filter: List[str] = Query(default_factory=list),
    org_id: str | None = Query(None),
):
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)
    rows = _properties_rows(scope, scope_id, oid)
    rows = _apply_filters(rows, type_filter, category_filter, source_filter, [], [])
    total = len(rows)
    start = (page - 1) * limit
    end = start + limit
    paged = rows[start:end]
    options = _filter_options(rows)
    return _ok(
        {"rows": paged, "total": total, "page": page, "limit": limit, "filter_options": options},
        {"scope_type": scope, "scope_id": scope_id, "computed_at": int(time.time())},
    )


def _actions_rows(scope_type: str, scope_id: str, org_id: str) -> List[Dict[str, Any]]:
    from .._legacy_main import list_product_action_registry_sources

    rows: List[Dict[str, Any]] = []
    seen = set()
    for sid in _session_ids_for_scope(scope_type, scope_id, org_id):
        for r in list_product_action_registry_sources(sid, None):
            key = (r.get("bpmn_id"), r.get("name"), r.get("value"), r.get("section"), r.get("role"))
            if key in seen:
                continue
            seen.add(key)
            rows.append(r)
    return rows


@router.get("/actions")
def get_actions(
    request: Request,
    scope: str = Query(..., pattern="^(workspace|project|session)$"),
    scope_id: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    section_filter: List[str] = Query(default_factory=list),
    role_filter: List[str] = Query(default_factory=list),
    type_filter: List[str] = Query(default_factory=list),
    org_id: str | None = Query(None),
):
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)
    rows = _actions_rows(scope, scope_id, oid)
    rows = _apply_filters(rows, type_filter, [], [], section_filter, role_filter)
    total = len(rows)
    start = (page - 1) * limit
    end = start + limit
    paged = rows[start:end]
    options = _filter_options(rows)
    return _ok(
        {"rows": paged, "total": total, "page": page, "limit": limit, "filter_options": options},
        {"scope_type": scope, "scope_id": scope_id, "computed_at": int(time.time())},
    )
