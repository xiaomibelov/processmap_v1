from __future__ import annotations

import json
import math
import time
from typing import Any, Dict, List, Set

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from ..legacy.request_context import request_active_org_id
from ..schemas.analytics import AnalyticsActionsQuery, AnalyticsDashboardOut, AnalyticsPropertiesQuery
from ..services.analytics_authz import require_analytics_scope
from ..storage import _connect, get_storage
from ..analytics_read_model import (
    refresh_analytics_for_session,
    refresh_project_analytics_snapshot,
    refresh_workspace_analytics_snapshot,
)
from ..routers.process_properties_registry import _extract_camunda_rows, _text
from ..routers.product_actions_registry import _registry_row
from ..analytics_cache import (
    ANALYTICS_CACHE_TTL_SEC,
    cached_analytics,
    invalidate_analytics_scope,
)

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
        base = {
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
    elif scope_type == "project":
        base = {
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
    elif scope_type == "workspace":
        base = {
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
    else:
        raise HTTPException(status_code=400, detail="invalid scope_type")

    base.update(_compute_dashboard_extras(scope_type, scope_id, org_id, base))
    return base


def _session_rows_for_scope(scope_type: str, scope_id: str, org_id: str) -> List[Dict[str, Any]]:
    with _connect() as con:
        if scope_type == "session":
            rows = con.execute(
                "SELECT id, title, project_id, created_at, updated_at FROM sessions WHERE id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchall()
        elif scope_type == "project":
            rows = con.execute(
                "SELECT id, title, project_id, created_at, updated_at FROM sessions WHERE project_id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchall()
        elif scope_type == "workspace":
            rows = con.execute(
                "SELECT s.id, s.title, s.project_id, s.created_at, s.updated_at "
                "FROM sessions s JOIN projects p ON p.id=s.project_id "
                "WHERE p.workspace_id=? AND s.org_id=?",
                (scope_id, org_id),
            ).fetchall()
        else:
            rows = []
    return [dict(r) for r in rows]


def _session_snapshots_for_scope(scope_type: str, scope_id: str, org_id: str) -> List[Dict[str, Any]]:
    with _connect() as con:
        if scope_type == "session":
            rows = con.execute(
                "SELECT session_id, total_duration_min, actions_total, actions_by_type_json, computed_at AS created_at "
                "FROM analytics_session_snapshots WHERE session_id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchall()
        elif scope_type == "project":
            rows = con.execute(
                "SELECT session_id, total_duration_min, actions_total, actions_by_type_json, computed_at AS created_at "
                "FROM analytics_session_snapshots WHERE project_id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchall()
        elif scope_type == "workspace":
            rows = con.execute(
                "SELECT session_id, total_duration_min, actions_total, actions_by_type_json, computed_at AS created_at "
                "FROM analytics_session_snapshots WHERE workspace_id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchall()
        else:
            rows = []
    return [dict(r) for r in rows]


def _project_titles_for_scope(scope_type: str, scope_id: str, org_id: str) -> Dict[str, str]:
    with _connect() as con:
        if scope_type == "project":
            row = con.execute(
                "SELECT id, title FROM projects WHERE id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchone()
            return {row["id"]: row["title"]} if row else {}
        elif scope_type == "workspace":
            rows = con.execute(
                "SELECT id, title FROM projects WHERE workspace_id=? AND org_id=?",
                (scope_id, org_id),
            ).fetchall()
            return {r["id"]: r["title"] for r in rows}
    return {}


def _compute_dashboard_extras(scope_type: str, scope_id: str, org_id: str, base: Dict[str, Any]) -> Dict[str, Any]:
    sessions_count = int(base.get("sessions_count") or 0)
    actions_total = int(base.get("actions_total") or 0)
    avg_duration = (
        int(base.get("total_duration_min") or 0)
        if scope_type == "session"
        else int(round(base.get("avg_duration_min") or 0))
    )
    projects_count = int(base.get("projects_count") or 0)
    project_id = str(base.get("project_id") or "")

    session_rows = _session_rows_for_scope(scope_type, scope_id, org_id)
    now = int(time.time())
    cutoff = now - 3600
    active_now = sum(1 for s in session_rows if int(s.get("updated_at") or 0) >= cutoff)

    if scope_type == "workspace":
        unique_processes = projects_count
    elif scope_type == "project":
        unique_processes = 1
    elif scope_type == "session" and project_id:
        unique_processes = 1
    else:
        unique_processes = 0

    kpi = {
        "total_sessions": sessions_count,
        "total_tasks": actions_total,
        "active_now": active_now,
        "avg_session_duration_min": avg_duration,
        "unique_processes": unique_processes,
    }

    snapshots = _session_snapshots_for_scope(scope_type, scope_id, org_id)

    by_type = base.get("actions_by_type") or {}
    if not by_type:
        for snap in snapshots:
            snap_by_type = json.loads(snap.get("actions_by_type_json") or "{}")
            for k, v in snap_by_type.items():
                by_type[k] = by_type.get(k, 0) + int(v)
    completed = int(by_type.get("step") or 0)
    active = sum(int(by_type.get(k) or 0) for k in ("decision", "fork", "join"))
    pending = sum(int(by_type.get(k) or 0) for k in ("timer", "message"))
    failed = int(by_type.get("loss_event") or 0)
    task_statuses = {
        "completed": completed,
        "active": active,
        "failed": failed,
        "pending": pending,
    }

    points_map: Dict[str, int] = {}
    heatmap_hour = [0] * 24
    heatmap_weekday = [0] * 7
    for s in session_rows:
        created_at = int(s.get("created_at") or 0)
        updated_at = int(s.get("updated_at") or 0)
        if created_at > 0:
            day = time.strftime("%Y-%m-%d", time.gmtime(created_at))
            points_map[day] = points_map.get(day, 0) + 1
        if updated_at > 0:
            t = time.gmtime(updated_at)
            heatmap_hour[t.tm_hour] += 1
            heatmap_weekday[t.tm_wday] += 1

    points = [{"period": d, "sessions": points_map[d]} for d in sorted(points_map.keys())]
    if scope_type == "session":
        points = []

    element_types = {"task": 0, "gateway": 0, "event": 0, "subprocess": 0}
    for snap in snapshots:
        snap_by_type = json.loads(snap.get("actions_by_type_json") or "{}")
        element_types["task"] += int(snap_by_type.get("step") or 0)
        element_types["gateway"] += sum(int(snap_by_type.get(k) or 0) for k in ("decision", "fork", "join"))
        element_types["event"] += sum(int(snap_by_type.get(k) or 0) for k in ("loss_event", "timer", "message"))

    project_titles = _project_titles_for_scope(scope_type, scope_id, org_id)
    session_project_map = {s["id"]: s.get("project_id") or "" for s in session_rows}
    process_durations: Dict[str, Dict[str, Any]] = {}
    for snap in snapshots:
        sid = snap.get("session_id")
        pid = session_project_map.get(sid, "")
        title = project_titles.get(pid) or snap.get("session_id") or "—"
        info = process_durations.setdefault(title, {"durations": [], "sessions_count": 0})
        info["durations"].append(int(snap.get("total_duration_min") or 0))
        info["sessions_count"] += 1

    process_duration_list = []
    for title, info in process_durations.items():
        durations = info["durations"]
        avg = int(round(sum(durations) / max(len(durations), 1)))
        process_duration_list.append({
            "process_title": title,
            "avg_duration_min": avg,
            "sessions_count": info["sessions_count"],
        })
    process_duration_list.sort(key=lambda x: x["avg_duration_min"], reverse=True)
    process_duration_list = process_duration_list[:5]

    return {
        "kpi": kpi,
        "task_statuses": task_statuses,
        "session_trend": {"granularity": "day", "points": points},
        "bpmn_element_types": element_types,
        "process_duration": process_duration_list,
        "activity_heatmap": {"by_hour": heatmap_hour, "by_weekday": heatmap_weekday},
    }


@router.get("/dashboard")
def get_dashboard(
    request: Request,
    scope: str = Query(..., pattern="^(workspace|project|session)$"),
    scope_id: str = Query(..., min_length=1),
    org_id: str | None = Query(None),
):
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)

    def _compute():
        data = _load_snapshot(scope, scope_id, oid)
        return _ok(data, {"scope_type": scope, "scope_id": scope_id, "computed_at": data.get("computed_at", 0)})

    return cached_analytics("dashboard", scope, scope_id, oid, compute=_compute)


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

    def _compute():
        data = _load_snapshot(scope, scope_id, oid)
        return _ok(data, {"scope_type": scope, "scope_id": scope_id, "computed_at": data.get("computed_at", 0)})

    return cached_analytics("dashboard", scope, scope_id, oid, compute=_compute)


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
    session_counts: Dict[tuple, Set[str]] = {}
    for source in sources:
        session_id = source.get("session_id") or ""
        for r in _extract_camunda_rows(source):
            key = (r.get("element_id"), r.get("property_name"), r.get("property_value"))
            counts[key] = counts.get(key, 0) + 1
            session_counts.setdefault(key, set()).add(session_id)
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "bpmn_id": r.get("element_id") or "",
                "bpmn_name": r.get("element_title") or "",
                "name": r.get("property_name") or "",
                "value": r.get("property_value") or "",
                "type": r.get("property_type") or "",
                "category": r.get("property_group") or "",
                "source": r.get("source") or "",
                "element_type": r.get("element_type") or "",
                "section": "",
                "role": "",
                "usage_count": 1,
                "session_count": 1,
            })

    for row in rows:
        row["usage_count"] = counts.get((row["bpmn_id"], row["name"], row["value"]), 1)
        row["session_count"] = len(session_counts.get((row["bpmn_id"], row["name"], row["value"]), set())) or 1
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


_DURATION_SUFFIXES = ("мин", "ч", "с")


def _is_visual_property(name: str) -> bool:
    return str(name or "").lower().startswith("fpc-")


def _infer_property_value_type(name: str, value: Any) -> str:
    """Infer value_type from property name and raw value."""
    name_lower = str(name or "").lower()
    value_str = str(value or "")

    if name_lower.startswith("fpc-"):
        return "ui_config"
    if any(name_lower.find(token) != -1 for token in ("duration", "work", "mode")):
        return "duration"
    if value_str.endswith(_DURATION_SUFFIXES):
        return "duration"
    try:
        parsed = json.loads(value_str)
        if isinstance(parsed, (dict, list)):
            return "json"
    except Exception:
        pass
    try:
        float(value_str.replace(",", ".").replace(" ", ""))
        return "number"
    except Exception:
        pass
    return "string"


def _infer_property_family(name: str, value_type: str) -> str:
    """Map property name/value_type to a product-family bucket."""
    name_lower = str(name or "").lower()
    if name_lower.startswith("fpc-"):
        return "ui_config"
    if "ingredient" in name_lower:
        return "ingredient"
    if "equipment" in name_lower:
        return "equipment"
    if "container" in name_lower:
        return "container"
    if any(token in name_lower for token in ("duration", "work", "mode")) or value_type == "duration":
        return "duration"
    if value_type == "json":
        return "structured"
    return "other"


def _properties_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_category: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    by_value_type: Dict[str, int] = {}
    by_family: Dict[str, int] = {}
    usable_rows: List[Dict[str, Any]] = []

    for r in rows:
        name = r.get("name", "")
        if _is_visual_property(name):
            continue
        value_type = _infer_property_value_type(name, r.get("value"))
        family = _infer_property_family(name, value_type)
        row = dict(r)
        row["value_type"] = value_type
        row["property_family"] = family
        usable_rows.append(row)
        by_category[row.get("category") or "Не задана"] = by_category.get(row.get("category") or "Не задана", 0) + 1
        by_type[row.get("type") or "Не задан"] = by_type.get(row.get("type") or "Не задан", 0) + 1
        by_value_type[value_type] = by_value_type.get(value_type, 0) + 1
        by_family[family] = by_family.get(family, 0) + 1

    top_used = sorted(
        usable_rows,
        key=lambda r: (r.get("usage_count") or 0, r.get("name") or ""),
        reverse=True,
    )[:20]

    def _sort_items(d: Dict[str, int]) -> List[Dict[str, Any]]:
        return sorted([{"label": k, "count": v} for k, v in d.items()], key=lambda x: (-x["count"], x["label"]))

    return {
        "total": len(usable_rows),
        "by_category": _sort_items(by_category),
        "by_type": _sort_items(by_type),
        "by_value_type": _sort_items(by_value_type),
        "by_family": _sort_items(by_family),
        "top_used": [
            {
                "name": r.get("name", ""),
                "value": r.get("value", ""),
                "type": r.get("type", ""),
                "category": r.get("category", ""),
                "value_type": r.get("value_type", ""),
                "property_family": r.get("property_family", ""),
                "usage_count": r.get("usage_count") or 0,
            }
            for r in top_used
        ],
    }


def _actions_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_role: Dict[str, int] = {}
    by_section: Dict[str, int] = {}
    by_type: Dict[str, int] = {}

    for r in rows:
        role = str(r.get("role") or "Без роли")
        section = str(r.get("section") or "Без секции")
        action_type = str(r.get("type") or "Без типа")
        by_role[role] = by_role.get(role, 0) + 1
        by_section[section] = by_section.get(section, 0) + 1
        by_type[action_type] = by_type.get(action_type, 0) + 1

    def _sort_items(d: Dict[str, int]) -> List[Dict[str, Any]]:
        return sorted([{"label": k, "count": v} for k, v in d.items()], key=lambda x: (-x["count"], x["label"]))

    return {
        "total": len(rows),
        "by_role": _sort_items(by_role),
        "by_section": _sort_items(by_section),
        "by_type": _sort_items(by_type),
    }


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
    cache_params = {
        "page": page,
        "limit": limit,
        "type_filter": sorted(type_filter),
        "category_filter": sorted(category_filter),
        "source_filter": sorted(source_filter),
    }

    def _compute():
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

    return cached_analytics("properties", scope, scope_id, oid, params=cache_params, compute=_compute)


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
    cache_params = {
        "page": page,
        "limit": limit,
        "section_filter": sorted(section_filter),
        "role_filter": sorted(role_filter),
        "type_filter": sorted(type_filter),
    }

    def _compute():
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

    return cached_analytics("actions", scope, scope_id, oid, params=cache_params, compute=_compute)


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
        ["bpmn_id", "bpmn_name", "name", "value", "type", "category", "source", "element_type", "session_count", "usage_count"],
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


def _xlsx_response(
    rows: List[Dict[str, Any]],
    filename: str,
    columns: List[tuple],
    column_formats: Dict[str, Dict[str, Any]] | None = None,
) -> Response:
    import io

    import xlsxwriter

    out = io.BytesIO()
    workbook = xlsxwriter.Workbook(out, {"in_memory": True})
    worksheet = workbook.add_worksheet()

    header_format = workbook.add_format({
        "bold": True,
        "bg_color": "#4F46E5",
        "font_color": "#FFFFFF",
        "border": 1,
        "align": "center",
        "valign": "vcenter",
    })
    cell_format = workbook.add_format({"border": 1, "valign": "vcenter"})

    per_col_format = {}
    if column_formats:
        for key, fmt_kwargs in column_formats.items():
            per_col_format[key] = workbook.add_format({"border": 1, "valign": "vcenter", **fmt_kwargs})

    for col_idx, (_, label) in enumerate(columns):
        worksheet.write(0, col_idx, label, header_format)

    for row_idx, row in enumerate(rows, start=1):
        for col_idx, (key, _) in enumerate(columns):
            value = row.get(key)
            if value is None:
                value = ""
            fmt = per_col_format.get(key, cell_format)
            worksheet.write(row_idx, col_idx, value, fmt)

    # Auto-width
    for col_idx, (key, label) in enumerate(columns):
        max_len = len(str(label))
        for row in rows:
            max_len = max(max_len, len(str(row.get(key) or "")))
        worksheet.set_column(col_idx, col_idx, min(max_len + 3, 60))

    worksheet.autofilter(0, 0, len(rows), len(columns) - 1)
    workbook.close()
    out.seek(0)

    return Response(
        content=out.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )



_EE_TIME_KEY = "ee_time"
_INGREDIENT_VALUE_KEY = "ingredient_value"
_RECALC_REQUIRED_KEYS = {_EE_TIME_KEY, _INGREDIENT_VALUE_KEY}


def _parse_recalc_number(value: Any) -> float | None:
    """Parse a numeric string, allowing commas as decimal separators."""
    raw = _text(value).replace(",", ".")
    if raw in ("", "—"):
        return None
    try:
        return float(raw)
    except Exception:
        return None


def _build_recalculated_rows(rows: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    """Group Camunda properties by BPMN element and compute ee_time * ingredient_value."""
    by_element: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        name = _text(row.get("name"))
        if name not in _RECALC_REQUIRED_KEYS:
            continue
        bpmn_id = _text(row.get("bpmn_id"))
        if not bpmn_id:
            continue
        element = by_element.setdefault(bpmn_id, {
            "bpmn_id": bpmn_id,
            "bpmn_name": _text(row.get("bpmn_name")),
            _EE_TIME_KEY: None,
            _INGREDIENT_VALUE_KEY: None,
        })
        element[name] = _text(row.get("value"))

    out_rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    for element in by_element.values():
        ee_raw = element.get(_EE_TIME_KEY)
        ing_raw = element.get(_INGREDIENT_VALUE_KEY)
        ee_val = _parse_recalc_number(ee_raw)
        ing_val = _parse_recalc_number(ing_raw)

        reasons: List[str] = []
        if ee_raw is None:
            reasons.append("отсутствует ee_time")
        elif ee_val is None:
            reasons.append(f"некорректное значение ee_time: {ee_raw}")
        if ing_raw is None:
            reasons.append("отсутствует ingredient_value")
        elif ing_val is None:
            reasons.append(f"некорректное значение ingredient_value: {ing_raw}")

        if reasons:
            errors.append({
                "bpmn_id": element["bpmn_id"],
                "bpmn_name": element["bpmn_name"],
                "ingredient_value": ing_raw if ing_raw is not None else "",
                "reason": "; ".join(reasons),
            })
            continue

        result = round(ee_val * ing_val, 2)  # type: ignore[arg-type]
        out_rows.append({
            "bpmn_id": element["bpmn_id"],
            "bpmn_name": element["bpmn_name"],
            _EE_TIME_KEY: ee_val,
            _INGREDIENT_VALUE_KEY: ing_val,
            "result": result,
        })

    return out_rows, errors


@router.get("/properties/export-recalculated.xlsx")
def export_properties_recalculated_xlsx(
    request: Request,
    scope: str = Query(..., pattern="^(workspace|project|session)$"),
    scope_id: str = Query(..., min_length=1),
    org_id: str | None = Query(None),
):
    oid = org_id or _org_id_from_request(request)
    require_analytics_scope(request, scope, scope_id, oid)
    rows = _properties_rows(scope, scope_id, oid)
    recalc_rows, errors = _build_recalculated_rows(rows)
    if errors:
        return JSONResponse(status_code=400, content={"errors": errors})
    columns = [
        ("bpmn_id", "BPMN ID"),
        ("bpmn_name", "BPMN Name"),
        (_EE_TIME_KEY, "ee_time"),
        (_INGREDIENT_VALUE_KEY, "ingredient_value"),
        ("result", "Результат"),
    ]
    formats = {
        _EE_TIME_KEY: {"num_format": "0.00"},
        _INGREDIENT_VALUE_KEY: {"num_format": "0.00"},
        "result": {"num_format": "0.00"},
    }
    return _xlsx_response(recalc_rows, f"properties-recalculated-{scope}-{scope_id}.xlsx", columns, formats)


@router.get("/properties/export.xlsx")
def export_properties_xlsx(
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
    columns = [
        ("bpmn_id", "BPMN ID"),
        ("bpmn_name", "BPMN Name"),
        ("name", "Свойство"),
        ("value", "Значение"),
        ("type", "Тип"),
        ("category", "Категория"),
        ("source", "Источник"),
        ("element_type", "Тип элемента"),
        ("session_count", "Использовано в сессиях"),
        ("usage_count", "Использований"),
    ]
    formats = {
        "bpmn_name": {"bold": True},
        "session_count": {"num_format": "0"},
    }
    return _xlsx_response(rows, f"properties-{scope}-{scope_id}.xlsx", columns, formats)


@router.get("/actions/export.xlsx")
def export_actions_xlsx(
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
    columns = [
        ("bpmn_id", "BPMN ID"),
        ("name", "Действие"),
        ("section", "Секция"),
        ("role", "Роль"),
        ("type", "Тип"),
        ("product_group", "Группа"),
        ("product_name", "Продукт"),
        ("source", "Источник"),
    ]
    return _xlsx_response(rows, f"actions-{scope}-{scope_id}.xlsx", columns)


@router.get("/properties/summary")
def get_properties_summary(
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
    cache_params = {
        "type_filter": sorted(type_filter),
        "category_filter": sorted(category_filter),
        "source_filter": sorted(source_filter),
    }

    def _compute():
        rows = _properties_rows(scope, scope_id, oid)
        rows = _apply_filters(rows, type_filter, category_filter, source_filter, [], [])
        return _ok(
            _properties_summary(rows),
            {"scope_type": scope, "scope_id": scope_id, "computed_at": int(time.time())},
        )

    return cached_analytics("properties_summary", scope, scope_id, oid, params=cache_params, compute=_compute)


@router.get("/actions/summary")
def get_actions_summary(
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
    cache_params = {
        "section_filter": sorted(section_filter),
        "role_filter": sorted(role_filter),
        "type_filter": sorted(type_filter),
    }

    def _compute():
        rows = _actions_rows(scope, scope_id, oid)
        rows = _apply_filters(rows, type_filter, [], [], section_filter, role_filter)
        return _ok(
            _actions_summary(rows),
            {"scope_type": scope, "scope_id": scope_id, "computed_at": int(time.time())},
        )

    return cached_analytics("actions_summary", scope, scope_id, oid, params=cache_params, compute=_compute)
