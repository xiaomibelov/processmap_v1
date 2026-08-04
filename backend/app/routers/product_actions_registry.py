from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

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
from ..services.org_workspace import (
    project_access_allowed,
    require_org_member_for_enterprise,
)
from ..storage import get_project_storage, get_storage

router = APIRouter(tags=["product-actions-registry"])

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


def _extract_action_rows(source: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        _registry_row(source, action, index)
        for index, action in enumerate(source.get("product_actions") or [])
    ]


def _list_registry_sources(**kwargs: Any) -> List[Dict[str, Any]]:
    return get_storage().list_product_action_registry_sources(**kwargs)


_SPEC = RegistrySpec(
    filter_map=_FILTER_MAP,
    sort_keys=("product_group", "product_name", "session_title", "step_label", "action_stage", "action_type"),
    list_sources=_list_registry_sources,
    extract_rows=_extract_action_rows,
    export_file_prefix="product-actions",
    xlsx_column_widths=[18, 22, 18, 24, 18, 18, 22, 18, 18, 22, 22, 18, 18, 24, 18, 18, 16, 16, 14, 12, 14, 22],
    xlsx_sheet_name="Product actions",
    source_state_source="product_actions_registry_backend",
    source_state_namespace="/api/analysis/product-actions/registry",
)


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
    return _registry_payload(inp, request, _SPEC, paginate=True)


@router.post("/api/analysis/product-actions/registry/export.csv")
def export_product_actions_registry_csv(inp: ProductActionsRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, _SPEC, paginate=True)
    filename = _export_filename(_SPEC.export_file_prefix, str(payload.get("scope") or inp.scope), "csv")
    return Response(
        content=_csv_bytes(payload.get("rows") or [], _EXPORT_COLUMNS),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/analysis/product-actions/registry/export.xlsx")
def export_product_actions_registry_xlsx(inp: ProductActionsRegistryQueryIn, request: Request) -> Response:
    payload = _registry_payload(inp, request, _SPEC, paginate=True)
    filename = _export_filename(_SPEC.export_file_prefix, str(payload.get("scope") or inp.scope), "xlsx")
    return Response(
        content=_xlsx_bytes(payload.get("rows") or [], _EXPORT_COLUMNS, _SPEC.xlsx_column_widths, _SPEC.xlsx_sheet_name),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
