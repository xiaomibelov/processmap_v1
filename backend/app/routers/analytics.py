from __future__ import annotations

import json
import math
import time
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from ..legacy.request_context import request_active_org_id
from ..schemas.analytics import AnalyticsActionsQuery, AnalyticsDashboardOut, AnalyticsPropertiesQuery
from ..services.analytics_authz import require_analytics_scope
from ..storage import _connect, get_storage
from ..analytics_read_model import (
    refresh_analytics_for_session,
    refresh_project_analytics_snapshot,
    refresh_workspace_analytics_snapshot,
)
from ..routers.process_properties_registry import _extract_camunda_rows
from ..routers.product_actions_registry import _registry_row

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _org_id_from_request(request: Request) -> str:
    return request_active_org_id(request)


def _ok(data: Any, meta: Dict[str, Any]) -> Dict[str, Any]:
    return {"success": True, "data": data, "meta": meta}


def _refresh_snapshot(scope_type: str, scope_id: str, org_id: str) -> bool:
    try:
        if scope_type == "session":
            refresh_analytics_for_session(scope_id, org_id)
        elif scope_type == "project":
            refresh_project_analytics_snapshot(scope_id, org_id)
        elif scope_type == "workspace":
            refresh_workspace_analytics_snapshot(scope_id, org_id)
        else:
            return False
        return True
    except Exception:
        return False


def _load_snapshot(scope_type: str, scope_id: str, org_id: str) -> Dict[str, Any]:
    def _row(scope_type: str, scope_id: str, org_id: str):
        with _connect() as con:
            if scope_type == "session":
                return con.execute(
                    "SELECT * FROM analytics_session_snapshots WHERE session_id=? AND org_id=?",
                    (scope_id, org_id),
                ).fetchone()
            if scope_type == "project":
                return con.execute(
                    "SELECT * FROM analytics_project_snapshots WHERE project_id=? AND org_id=?",
                    (scope_id, org_id),
                ).fetchone()
            if scope_type == "workspace":
                return con.execute(
                    "SELECT * FROM analytics_workspace_snapshots WHERE workspace_id=? AND org_id=?",
                    (scope_id, org_id),
                ).fetchone()
        return None

    row = _row(scope_type, scope_id, org_id)
    if not row:
        _refresh_snapshot(scope_type, scope_id, org_id)
        row = _row(scope_type, scope_id, org_id)
    if not row:
        return {"scope_type": scope_type, "scope_id": scope_id, "computed_at": 0}

    if scope_type == "session":
        return {
            "scope_type": scope_type,
            "scope_id": scope_id,
            "project_id": row["project_id"] or "",
            "workspace_id": row["workspace_id"] or "",
            "total_duration_min": row["total_duration_min"] or 0,
            "critical_path_min": row["critical_path_min"],
            "actions_total": row["actions_total"] or 0,
            "actions_by_role": json.loads(row["actions_by_role_json"] or "{}"),
            "actions_by_section": json.loads(row["actions_by_section_json"] or "{}"),
            "actions_by_type": json.loads(row["actions_by_type_json"] or "{}"),
            "handoffs_count": row["handoffs_count"] or 0,
            "open_questions": row["open_questions"] or 0,
            "critical_questions": row["critical_questions"] or 0,
            "sessions_count": 1,
            "projects_count": 0,
            "computed_at": row["computed_at"] or 0,
        }
    if scope_type == "project":
        return {
            "scope_type": scope_type,
            "scope_id": scope_id,
            "workspace_id": row["workspace_id"] or "",
            "total_duration_min": int(round(row["avg_duration_min"] or 0)) * (row["sessions_count"] or 0),
            "critical_path_min": None,
            "actions_total": row["total_actions"] or 0,
            "actions_by_role": {},
            "actions_by_section": {},
            "actions_by_type": {},
            "handoffs_count": row["handoffs_count"] or 0,
            "open_questions": 0,
            "critical_questions": row["total_critical_questions"] or 0,
            "sessions_count": row["sessions_count"] or 0,
            "projects_count": 1,
            "computed_at": row["computed_at"] or 0,
        }
    if scope_type == "workspace":
        return {
            "scope_type": scope_type,
            "scope_id": scope_id,
            "total_duration_min": int(round(row["avg_duration_min"] or 0)) * (row["sessions_count"] or 0),
            "critical_path_min": None,
            "actions_total": row["total_actions"] or 0,
            "actions_by_role": {},
            "actions_by_section": {},
            "actions_by_type": {},
            "handoffs_count": row["handoffs_count"] or 0,
            "open_questions": 0,
            "critical_questions": row["total_critical_questions"] or 0,
            "sessions_count": row["sessions_count"] or 0,
            "projects_count": row["projects_count"] or 0,
            "computed_at": row["computed_at"] or 0,
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
    if scope_type == "session":
        return [scope_id]
    with _connect() as con:
        if scope_type == "project":
            rows = con.execute(
                "SELECT id FROM sessions WHERE project_id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchall()
            return [r["id"] for r in rows]
        if scope_type == "workspace":
            rows = con.execute(
                "SELECT s.id FROM sessions s JOIN projects p ON p.id=s.project_id "
                "WHERE p.workspace_id=? AND s.org_id=?",
                (scope_id, org_id),
            ).fetchall()
            return [r["id"] for r in rows]
    return []


def _properties_rows(scope_type: str, scope_id: str, org_id: str) -> List[Dict[str, Any]]:
    storage = get_storage()
    if scope_type == "session":
        sources = storage.list_process_properties_registry_sources(
            org_id=org_id, session_ids=[scope_id], is_admin=True
        )
    elif scope_type == "project":
        sources = storage.list_process_properties_registry_sources(
            org_id=org_id, project_ids=[scope_id], is_admin=True
        )
    else:
        sources = storage.list_process_properties_registry_sources(
            org_id=org_id, workspace_id=scope_id, is_admin=True
        )

    rows: List[Dict[str, Any]] = []
    seen = set()
    counts: Dict[tuple, int] = {}
    for source in sources:
        for r in _extract_camunda_rows(source):
            key = (r.get("element_id"), r.get("property_name"), r.get("property_value"))
            counts[key] = counts.get(key, 0) + 1
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "bpmn_id": r.get("element_id") or "",
                "name": r.get("property_name") or "",
                "value": r.get("property_value") or "",
                "type": r.get("property_type") or "",
                "category": r.get("property_group") or "",
                "source": r.get("source") or "",
                "element_type": r.get("element_type") or "",
                "section": "",
                "role": "",
                "usage_count": 1,
            })

    for row in rows:
        row["usage_count"] = counts.get((row["bpmn_id"], row["name"], row["value"]), 1)
    return rows


def _filter_options(rows: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    return {
        "type": sorted({str(r.get("type", "")) for r in rows if r.get("type")}),
        "category": sorted({str(r.get("category", "")) for r in rows if r.get("category")}),
        "source": sorted({str(r.get("source", "")) for r in rows if r.get("source")}),
        "section": sorted({str(r.get("section", "")) for r in rows if r.get("section")}),
        "role": sorted({str(r.get("role", "")) for r in rows if r.get("role")}),
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
    storage = get_storage()
    if scope_type == "session":
        sources = storage.list_product_action_registry_sources(
            org_id=org_id, session_ids=[scope_id], is_admin=True
        )
    elif scope_type == "project":
        sources = storage.list_product_action_registry_sources(
            org_id=org_id, project_ids=[scope_id], is_admin=True
        )
    else:
        sources = storage.list_product_action_registry_sources(
            org_id=org_id, workspace_id=scope_id, is_admin=True
        )

    rows: List[Dict[str, Any]] = []
    seen = set()
    for source in sources:
        for index, action in enumerate(source.get("product_actions") or []):
            r = _registry_row(source, action, index)
            key = (
                r.get("action_object") or r.get("product_name") or r.get("action_id") or "",
                r.get("action_stage") or "",
                r.get("role") or "",
                r.get("action_type") or "",
                r.get("product_group") or "",
                r.get("product_name") or "",
            )
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "bpmn_id": r.get("bpmn_element_id") or r.get("node_id") or "",
                "name": r.get("action_object") or r.get("product_name") or r.get("action_id") or "",
                "value": "",
                "section": r.get("action_stage") or "",
                "role": r.get("role") or "",
                "type": r.get("action_type") or "",
                "product_group": r.get("product_group") or "",
                "product_name": r.get("product_name") or "",
                "source": r.get("source") or "",
            })
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


def _csv_response(rows: List[Dict[str, Any]], filename: str, fieldnames: List[str]) -> Response:
    import csv
    import io

    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/properties/export.csv")
def export_properties_csv(
    request: Request,
    scope: str = Query(..., pattern="^(workspace|project|session)$"),
    scope_id: str = Query(..., min_length=1),
    type_filter: List[str] = Query(default_factory=list),
    category_filter: List[str] = Query(default_factory=list),
    source_filter: List[str] = Query(default_factory=list),
    org_id: str | None = Query(None),
):
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)
    rows = _properties_rows(scope, scope_id, oid)
    rows = _apply_filters(rows, type_filter, category_filter, source_filter, [], [])
    return _csv_response(
        rows,
        f"properties-{scope}-{scope_id}.csv",
        ["bpmn_id", "name", "value", "type", "category", "source", "element_type", "section", "role", "usage_count"],
    )


@router.get("/actions/export.csv")
def export_actions_csv(
    request: Request,
    scope: str = Query(..., pattern="^(workspace|project|session)$"),
    scope_id: str = Query(..., min_length=1),
    section_filter: List[str] = Query(default_factory=list),
    role_filter: List[str] = Query(default_factory=list),
    type_filter: List[str] = Query(default_factory=list),
    org_id: str | None = Query(None),
):
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)
    rows = _actions_rows(scope, scope_id, oid)
    rows = _apply_filters(rows, type_filter, [], [], section_filter, role_filter)
    return _csv_response(
        rows,
        f"actions-{scope}-{scope_id}.csv",
        ["bpmn_id", "action_id", "name", "value", "section", "role", "action_type", "product_group", "product_name"],
    )
