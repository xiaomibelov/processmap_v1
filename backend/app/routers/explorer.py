"""
Workspace Explorer API  (cache-aside edition)
=============================================
Read paths: cache-aside with Redis.  Source of truth: DB/storage layer.
Write paths: DB first, then targeted cache invalidation.

GET  /api/workspaces                        – list workspaces for selected org
POST /api/workspaces                        – create workspace inside selected org
PATCH /api/workspaces/{workspace_id}        – rename workspace metadata
GET  /api/explorer                          – explorer page: context + crumbs + items
POST /api/workspaces/{workspace_id}/folders – create folder
GET  /api/folders/{folder_id}               – get folder info
PATCH /api/folders/{folder_id}              – rename folder
POST  /api/folders/{folder_id}/move         – move folder
DELETE /api/folders/{folder_id}             – delete folder
POST /api/folders/{folder_id}/projects      – create project in folder
POST /api/projects/{project_id}/move        – move project to folder
GET  /api/projects/{project_id}/explorer    – project detail + sessions
POST /api/projects/{project_id}/explorer/sessions – create session in project
POST /api/backfill/workspace-folders        – admin repair: fix orphan projects
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..legacy.request_context import require_authenticated_user, request_active_org_id, request_is_admin
from .. import storage
from ..redis_cache import (
    explorer_get_memberships, explorer_set_memberships,
    explorer_get_children,    explorer_set_children,
    explorer_get_breadcrumb,  explorer_set_breadcrumb,
    explorer_get_sessions,    explorer_set_sessions,
    explorer_invalidate_memberships,
    explorer_invalidate_children,
    explorer_invalidate_breadcrumb,
    explorer_invalidate_all_breadcrumbs_for_workspace,
    explorer_invalidate_sessions,
    explorer_invalidate_org_children,
)
from ..services.org_workspace import (
    build_assignable_user_payload,
    can_edit_workspace,
    can_manage_workspace,
    normalize_context_status,
    project_scope_for_request,
    require_org_member_for_enterprise,
    validate_org_user_assignable,
)

router = APIRouter(tags=["explorer"])
logger = logging.getLogger(__name__)


# ─── Request / workspace helpers ─────────────────────────────────────────────

def _resolve_selected_org(request: Request) -> str:
    oid = str(request_active_org_id(request) or "").strip()
    if not oid:
        raise HTTPException(status_code=422, detail="org_id required")
    return oid


def _require_org_access(request: Request, org_id: str) -> str:
    user_id = require_authenticated_user(request)
    try:
        require_org_member_for_enterprise(request, org_id)
    except HTTPException as exc:
        if exc.status_code in {403, 404}:
            raise HTTPException(status_code=403, detail="not a workspace member") from exc
        raise
    return user_id


def _resolve_workspace(request: Request, workspace_id: str) -> Dict[str, Any]:
    wid = str(workspace_id or "").strip()
    if not wid:
        raise HTTPException(status_code=422, detail="workspace_id required")
    oid = _resolve_selected_org(request)
    _require_org_access(request, oid)
    workspace = storage.get_workspace_record(wid, org_id=oid)
    if not workspace:
        raise HTTPException(status_code=404, detail="workspace not found")
    return workspace


# ─── Timing helper ────────────────────────────────────────────────────────────

def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


# ─── Response models ──────────────────────────────────────────────────────────

class WorkspaceOut(BaseModel):
    id: str
    org_id: str = ""
    name: str
    role: str = "member"
    created_at: int = 0


class FolderItem(BaseModel):
    id: str
    type: str = "folder"
    name: str
    parent_id: str = ""
    child_folder_count: int = 0
    child_project_count: int = 0
    responsible_user_id: Optional[str] = None
    responsible_user: Optional[Dict[str, Any]] = None
    context_status: str = "none"
    responsible_assigned_at: Optional[float] = None
    responsible_assigned_by: Optional[str] = None
    updated_at: int = 0


class OwnerOut(BaseModel):
    id: str
    name: str = ""


class ProjectItem(BaseModel):
    id: str
    type: str = "project"
    name: str
    folder_id: str = ""
    sessions_count: int = 0
    owner: Optional[OwnerOut] = None
    executor_user_id: Optional[str] = None
    executor: Optional[Dict[str, Any]] = None
    dod_percent: int = 0
    attention_count: int = 0
    reports_count: int = 0
    status: str = "active"
    description: str = ""
    updated_at: int = 0


class ContextFolder(BaseModel):
    id: str
    name: str


class ContextOut(BaseModel):
    organization: Dict[str, Any]
    workspace: Dict[str, Any]
    folder: Optional[ContextFolder] = None


class BreadcrumbItem(BaseModel):
    type: str
    id: str
    name: str


class ExplorerPage(BaseModel):
    context: ContextOut
    breadcrumbs: List[BreadcrumbItem]
    items: List[Dict[str, Any]]


class SessionItem(BaseModel):
    id: str
    name: str
    project_id: str = ""
    owner: Optional[OwnerOut] = None
    status: str = "draft"
    stage: str = ""
    dod_percent: int = 0
    attention_count: int = 0
    reports_count: int = 0
    updated_at: int = 0
    created_at: int = 0


class ProjectPage(BaseModel):
    project: ProjectItem
    sessions: List[SessionItem]


# ─── Request bodies ───────────────────────────────────────────────────────────

class CreateFolderBody(BaseModel):
    name: str
    parent_id: str = ""
    sort_order: int = 0
    responsible_user_id: Optional[str] = None
    context_status: Optional[str] = None


class RenameFolderBody(BaseModel):
    name: Optional[str] = None
    responsible_user_id: Optional[str] = None
    context_status: Optional[str] = None


class MoveFolderBody(BaseModel):
    new_parent_id: str = ""


class MoveProjectBody(BaseModel):
    folder_id: str


class CreateProjectBody(BaseModel):
    name: str
    description: str = ""
    owner_user_id: str = ""
    executor_user_id: Optional[str] = None


class CreateSessionBody(BaseModel):
    name: str
    roles: List[str] = Field(default_factory=list)
    start_role: str = ""
    mode: str = "quick_skeleton"


class CreateWorkspaceBody(BaseModel):
    name: str


# ─── User name lookup (best-effort) ──────────────────────────────────────────

def _lookup_user_name(user_id: str) -> str:
    if not user_id:
        return ""
    try:
        from ..auth import find_user_by_id
        u = find_user_by_id(user_id)
        if u:
            return str(u.get("email", "") or user_id)
    except Exception:
        pass
    return user_id


def _owner_out(user_id: str) -> Optional[OwnerOut]:
    if not user_id:
        return None
    return OwnerOut(id=user_id, name=_lookup_user_name(user_id))


def _assignable_out(user_id: str) -> Optional[Dict[str, str]]:
    return build_assignable_user_payload(user_id)


def _enrich_folder_out(folder_raw: Dict[str, Any]) -> Dict[str, Any]:
    folder = dict(folder_raw or {})
    responsible_id = str(folder.get("responsible_user_id") or "").strip()
    folder["responsible_user_id"] = responsible_id or None
    folder["responsible_user"] = _assignable_out(responsible_id)
    folder["context_status"] = normalize_context_status(folder.get("context_status") or "none")
    return folder


def _executor_out(user_id: str) -> Optional[Dict[str, str]]:
    return build_assignable_user_payload(user_id)


# ─── Cached read helpers ──────────────────────────────────────────────────────

def _cached_memberships(user_id: str, is_admin: bool) -> List[Dict[str, Any]]:
    """Return workspace memberships with cache-aside.
    Cache miss uses read_user_org_memberships_fast — pure SELECT, no writes.
    Falls back to write-capable path only if the fast read returns nothing
    (first-login bootstrap hasn't run yet for this user).
    """
    t0 = time.perf_counter()

    cached = explorer_get_memberships(user_id)
    if cached is not None:
        logger.debug("explorer cache HIT memberships user=%s %dms", user_id, _ms(t0))
        return cached  # type: ignore[return-value]

    # Fast read-only path: pure SELECT, no INSERT/UPDATE/commit
    rows = storage.read_user_org_memberships_fast(user_id, is_admin=is_admin)

    if not rows:
        # First-login: bootstrap hasn't written the membership yet.
        # Delegate to the write-capable version (auth middleware usually does
        # this, but be defensive here).
        rows = storage.list_user_org_memberships(user_id, is_admin=is_admin)

    result = [
        {
            "org_id": str(m.get("org_id", "") or ""),
            "name":   str(m.get("org_name", m.get("name", "")) or ""),
            "role":   str(m.get("role", "member") or "member"),
            "created_at": int(m.get("created_at", 0) or 0),
        }
        for m in rows
    ]
    explorer_set_memberships(user_id, result)
    logger.debug("explorer cache MISS memberships user=%s db=%dms", user_id, _ms(t0))
    return result


def _cached_children(org_id: str, workspace_id: str, folder_id: str) -> Dict[str, Any]:
    """Return folder children (folders + projects) with cache-aside."""
    t0 = time.perf_counter()
    fid = str(folder_id or "").strip()

    cached = explorer_get_children(org_id, workspace_id, fid)
    if cached is not None:
        logger.debug("explorer cache HIT children org=%s workspace=%s folder=%s %dms",
                     org_id, workspace_id, fid or "root", _ms(t0))
        return cached  # type: ignore[return-value]

    data = storage.list_workspace_folder_children(org_id, workspace_id, fid)
    explorer_set_children(org_id, workspace_id, fid, data)
    logger.debug("explorer cache MISS children org=%s workspace=%s folder=%s db=%dms",
                 org_id, workspace_id, fid or "root", _ms(t0))
    return data


def _cached_breadcrumb(org_id: str, workspace_id: str, folder_id: str) -> List[Dict[str, Any]]:
    """Return breadcrumb path with cache-aside.  Empty list for root."""
    fid = str(folder_id or "").strip()
    if not fid:
        return []

    t0 = time.perf_counter()
    cached = explorer_get_breadcrumb(org_id, workspace_id, fid)
    if cached is not None:
        logger.debug("explorer cache HIT breadcrumb org=%s workspace=%s folder=%s %dms",
                     org_id, workspace_id, fid, _ms(t0))
        return cached  # type: ignore[return-value]

    crumbs = storage.get_workspace_folder_breadcrumb(org_id, workspace_id, fid)
    explorer_set_breadcrumb(org_id, workspace_id, fid, crumbs)
    logger.debug("explorer cache MISS breadcrumb org=%s workspace=%s folder=%s db=%dms",
                 org_id, workspace_id, fid, _ms(t0))
    return crumbs


def _cached_project_sessions(org_id: str, project_id: str) -> List[Dict[str, Any]]:
    """Return project sessions with cache-aside."""
    pid = str(project_id or "").strip()
    t0 = time.perf_counter()

    cached = explorer_get_sessions(pid)
    if cached is not None:
        logger.debug("explorer cache HIT sessions project=%s %dms", pid, _ms(t0))
        return cached  # type: ignore[return-value]

    rows = storage.list_project_sessions_for_explorer(org_id, pid)
    explorer_set_sessions(pid, rows)
    logger.debug("explorer cache MISS sessions project=%s db=%dms", pid, _ms(t0))
    return rows


def _invalidate_children_for_folder_chain(org_id: str, workspace_id: str, folder_id: str) -> None:
    """Invalidate explorer children cache for a folder and all ancestor parent lists."""
    oid = str(org_id or "").strip()
    wid = str(workspace_id or "").strip()
    fid = str(folder_id or "").strip()
    targets: List[str] = []
    seen = set()

    def _add(raw: Any) -> None:
        key = str(raw or "").strip()
        if key in seen:
            return
        seen.add(key)
        targets.append(key)

    if fid:
        _add(fid)
        crumbs = storage.get_workspace_folder_breadcrumb(oid, wid, fid)
        parent_by_id = {
            str(item.get("id") or ""): str(item.get("parent_id") or "")
            for item in crumbs
            if str(item.get("id") or "").strip()
        }
        cursor = fid
        while cursor:
            parent_id = str(parent_by_id.get(cursor) or "")
            _add(parent_id)
            if not parent_id:
                break
            cursor = parent_id
    else:
        _add("")
    if "" not in seen:
        _add("")
    for target_folder_id in targets:
        explorer_invalidate_children(oid, wid, target_folder_id)


def _invalidate_children_for_project_rollup(org_id: str, project_id: str) -> None:
    targets = storage.get_project_explorer_invalidation_targets(org_id, project_id)
    if not targets:
        return
    oid = str(targets.get("org_id") or org_id or "").strip()
    wid = str(targets.get("workspace_id") or "").strip()
    for folder_id in (targets.get("children_folder_ids") or []):
        explorer_invalidate_children(oid, wid, str(folder_id or ""))


# ─── GET /api/workspaces ──────────────────────────────────────────────────────

@router.get("/api/workspaces", response_model=List[WorkspaceOut])
def list_workspaces(request: Request) -> List[WorkspaceOut]:
    t0 = time.perf_counter()
    user_id = require_authenticated_user(request)
    is_admin = request_is_admin(request)
    selected_org_id = _resolve_selected_org(request)
    require_org_member_for_enterprise(request, selected_org_id)
    role = str(storage.get_user_org_role(user_id, selected_org_id, is_admin=is_admin) or "member")
    workspaces = storage.list_org_workspaces(selected_org_id)
    result = [
        WorkspaceOut(
            id=str(item.get("id", "") or ""),
            org_id=str(item.get("org_id", selected_org_id) or selected_org_id),
            name=str(item.get("name", "Workspace") or "Workspace"),
            role=role,
            created_at=int(item.get("created_at", 0) or 0),
        )
        for item in workspaces
    ]
    logger.info("explorer /workspaces user=%s org=%s count=%d total=%dms",
                user_id, selected_org_id, len(result), _ms(t0))
    return result


# ─── POST /api/workspaces ─────────────────────────────────────────────────────

@router.post("/api/workspaces", status_code=201)
def create_workspace(body: CreateWorkspaceBody, request: Request) -> Dict[str, Any]:
    user_id = require_authenticated_user(request)
    org_id = _resolve_selected_org(request)
    _require_org_access(request, org_id)
    if not can_manage_workspace(request, org_id):
        raise HTTPException(status_code=403, detail="forbidden")
    name = str(body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    try:
        workspace = storage.create_workspace_record(org_id, name, created_by=user_id)
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        if "exists" in marker:
            raise HTTPException(status_code=409, detail="workspace name already exists") from exc
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "id": workspace["id"],
        "org_id": workspace["org_id"],
        "name": workspace["name"],
        "role": str(storage.get_user_org_role(user_id, org_id, is_admin=request_is_admin(request)) or "member"),
        "created_at": workspace.get("created_at", 0),
    }


@router.patch("/api/workspaces/{workspace_id}")
def rename_workspace(workspace_id: str, body: CreateWorkspaceBody, request: Request) -> Dict[str, Any]:
    user_id = require_authenticated_user(request)
    workspace = _resolve_workspace(request, workspace_id)
    org_id = str(workspace.get("org_id") or "")
    if not can_manage_workspace(request, org_id):
        raise HTTPException(status_code=403, detail="forbidden")
    name = str(body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name required")
    try:
        updated = storage.rename_workspace_record(org_id, workspace_id, name)
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        if "exists" in marker:
            raise HTTPException(status_code=409, detail="workspace name already exists") from exc
        if "not found" in marker:
            raise HTTPException(status_code=404, detail="workspace not found") from exc
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "id": updated["id"],
        "org_id": updated["org_id"],
        "name": updated["name"],
        "updated_at": updated.get("updated_at", 0),
        "updated_by": user_id,
    }


# ─── GET /api/explorer ────────────────────────────────────────────────────────

@router.get("/api/explorer", response_model=ExplorerPage)
def get_explorer_page(
    request: Request,
    workspace_id: str = Query(...),
    folder_id: str = Query(default=""),
) -> ExplorerPage:
    t0 = time.perf_counter()
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    user_id = _require_org_access(request, oid)
    fid = str(folder_id or "").strip()
    ws_id = str(workspace.get("id") or "")
    ws_name = str(workspace.get("name") or ws_id or "Workspace")
    org_name = oid
    for item in _cached_memberships(user_id, request_is_admin(request)):
        if str(item.get("org_id") or "") == oid:
            org_name = str(item.get("name") or oid)
            break

    # Breadcrumbs (cached per folder)
    raw_crumbs = _cached_breadcrumb(oid, ws_id, fid)
    breadcrumbs: List[BreadcrumbItem] = [
        BreadcrumbItem(type="workspace", id=ws_id, name=ws_name)
    ]
    context_folder: Optional[ContextFolder] = None

    for c in raw_crumbs:
        breadcrumbs.append(BreadcrumbItem(type="folder", id=c["id"], name=c["name"]))
    if raw_crumbs:
        last = raw_crumbs[-1]
        context_folder = ContextFolder(id=last["id"], name=last["name"])

    context = ContextOut(
        organization={"id": oid, "name": org_name},
        workspace={"id": ws_id, "name": ws_name},
        folder=context_folder,
    )

    # Children (cached per folder/root)
    children = _cached_children(oid, ws_id, fid)

    items: List[Dict[str, Any]] = []
    for f in children.get("folders", []):
        folder_out = _enrich_folder_out(f)
        items.append({
            "id": folder_out["id"], "type": "folder", "name": folder_out["name"],
            "parent_id": folder_out.get("parent_id", ""),
            "child_folder_count": folder_out.get("child_folder_count", 0),
            "child_project_count": folder_out.get("child_project_count", 0),
            "responsible_user_id": folder_out.get("responsible_user_id"),
            "responsible_user": folder_out.get("responsible_user"),
            "context_status": folder_out.get("context_status", "none"),
            "responsible_assigned_at": folder_out.get("responsible_assigned_at"),
            "responsible_assigned_by": folder_out.get("responsible_assigned_by"),
            "descendant_projects_count": folder_out.get("descendant_projects_count", 0),
            "descendant_sessions_count": folder_out.get("descendant_sessions_count", 0),
            "self_activity_at": folder_out.get("self_activity_at", folder_out.get("updated_at", 0)),
            "rollup_activity_at": folder_out.get("rollup_activity_at", folder_out.get("updated_at", 0)),
            "last_activity_source_type": folder_out.get("last_activity_source_type", "folder"),
            "last_activity_source_id": folder_out.get("last_activity_source_id", folder_out.get("id", "")),
            "last_activity_source_title": folder_out.get("last_activity_source_title", folder_out.get("name", "")),
            "rollup_dod_percent": folder_out.get("rollup_dod_percent"),
            "created_at": folder_out.get("created_at", 0),
            "updated_at": folder_out.get("updated_at", 0),
        })
    for p in children.get("projects", []):
        owner_uid = str(p.get("owner_user_id", "") or "")
        executor_uid = str(p.get("executor_user_id", "") or "")
        items.append({
            "id": p["id"], "type": "project",
            "name": p.get("title", ""),
            "folder_id": p.get("folder_id", ""),
            "sessions_count": p.get("sessions_count", 0),
            "owner": {"id": owner_uid, "name": _lookup_user_name(owner_uid)} if owner_uid else None,
            "executor_user_id": executor_uid or None,
            "executor": _executor_out(executor_uid),
            "dod_percent": p.get("dod_percent", 0),
            "attention_count": p.get("attention_count", 0),
            "reports_count": p.get("reports_count", 0),
            "status": p.get("status", "active"),
            "description": p.get("description", ""),
            "self_activity_at": p.get("self_activity_at", p.get("updated_at", 0)),
            "rollup_activity_at": p.get("rollup_activity_at", p.get("updated_at", 0)),
            "last_activity_source_type": p.get("last_activity_source_type", "project"),
            "last_activity_source_id": p.get("last_activity_source_id", p.get("id", "")),
            "last_activity_source_title": p.get("last_activity_source_title", p.get("title", "")),
            "descendant_sessions_count": p.get("descendant_sessions_count", p.get("sessions_count", 0)),
            "rollup_dod_percent": p.get("rollup_dod_percent", p.get("dod_percent", 0)),
            "created_at": p.get("created_at", 0),
            "updated_at": p.get("updated_at", 0),
        })

    logger.info("explorer /explorer org=%s workspace=%s folder=%s items=%d total=%dms",
                oid, ws_id, fid or "root", len(items), _ms(t0))
    return ExplorerPage(context=context, breadcrumbs=breadcrumbs, items=items)


@router.get("/api/explorer/search")
def search_explorer(
    request: Request,
    workspace_id: str = Query(...),
    q: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=100),
) -> Dict[str, Any]:
    t0 = time.perf_counter()
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    ws_id = str(workspace.get("id") or "")
    query = str(q or "").strip()
    scope = project_scope_for_request(request, oid)
    allowed_project_ids: Optional[List[str]] = None
    if str(scope.get("mode") or "") != "all":
        allowed_project_ids = [
            str(item or "").strip()
            for item in (scope.get("project_ids") or [])
            if str(item or "").strip()
        ]
    raw = storage.search_workspace_explorer(
        oid,
        ws_id,
        query,
        limit=limit,
        allowed_project_ids=allowed_project_ids,
    )

    def enrich(item: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(item or {})
        responsible_id = str(out.get("responsible_user_id") or "").strip()
        executor_id = str(out.get("executor_user_id") or "").strip()
        out["responsible_user"] = _assignable_out(responsible_id)
        out["executor_user"] = _executor_out(executor_id)
        return out

    groups_in = raw.get("groups") if isinstance(raw, dict) else {}
    groups = {
        "sections": [enrich(item) for item in (groups_in or {}).get("sections", [])],
        "folders": [enrich(item) for item in (groups_in or {}).get("folders", [])],
        "projects": [enrich(item) for item in (groups_in or {}).get("projects", [])],
        "sessions": [enrich(item) for item in (groups_in or {}).get("sessions", [])],
    }
    items = [item for key in ("sections", "folders", "projects", "sessions") for item in groups.get(key, [])]
    logger.info("explorer /explorer/search org=%s workspace=%s query_len=%d items=%d total=%dms",
                oid, ws_id, len(query), len(items), _ms(t0))
    return {
        "ok": True,
        "workspace_id": ws_id,
        "query": query,
        "limit": int(raw.get("limit") or limit),
        "groups": groups,
        "items": items,
    }


# ─── POST /api/workspaces/{workspace_id}/folders ──────────────────────────────
# Invalidation: parent folder children + org breadcrumbs (new folder may be
# navigated to, so we pre-warm nothing, just drop stale parent listing).

@router.post("/api/workspaces/{workspace_id}/folders", status_code=201)
def create_folder(workspace_id: str, body: CreateFolderBody, request: Request) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    user_id = _require_org_access(request, oid)
    if not can_edit_workspace(request, oid):
        raise HTTPException(status_code=403, detail="forbidden")
    parent_id = str(body.parent_id or "").strip()
    try:
        responsible_user_id = validate_org_user_assignable(oid, body.responsible_user_id)
        context_status = normalize_context_status(body.context_status)
        folder = storage.create_workspace_folder(
            oid, wid, body.name,
            parent_id=parent_id,
            user_id=user_id,
            sort_order=body.sort_order,
            responsible_user_id=responsible_user_id,
            context_status=context_status,
        )
    except ValueError as e:
        msg = str(e)
        if "already exists" in msg:
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=422, detail=msg)

    # ── invalidation ──────────────────────────────────────────────────────────
    # parent's children listing is now stale (new folder appeared)
    _invalidate_children_for_folder_chain(oid, wid, parent_id)
    return _enrich_folder_out(folder)


# ─── GET /api/folders/{folder_id} ────────────────────────────────────────────

@router.get("/api/folders/{folder_id}")
def get_folder(folder_id: str, request: Request, workspace_id: str = Query(...)) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    _require_org_access(request, oid)
    folder = storage.get_workspace_folder(oid, wid, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="folder not found")
    return _enrich_folder_out(folder)


# ─── PATCH /api/folders/{folder_id} ──────────────────────────────────────────
# Invalidation: parent children (name changed in list), folder breadcrumb
# (breadcrumb shows folder name), all descendant breadcrumbs (they show
# ancestor names in path).

@router.patch("/api/folders/{folder_id}")
def rename_folder(
    folder_id: str, body: RenameFolderBody, request: Request,
    workspace_id: str = Query(...),
) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    user_id = _require_org_access(request, oid)
    if not can_edit_workspace(request, oid):
        raise HTTPException(status_code=403, detail="forbidden")
    try:
        payload = body.model_dump(exclude_unset=True)
        has_name = "name" in payload and payload.get("name") is not None
        has_responsible = "responsible_user_id" in payload
        has_context_status = "context_status" in payload
        if not (has_name or has_responsible or has_context_status):
            raise HTTPException(status_code=422, detail="no folder fields to update")
        if has_name:
            folder = storage.rename_workspace_folder(oid, wid, folder_id, str(payload.get("name") or ""), user_id=user_id)
        else:
            folder = storage.get_workspace_folder(oid, wid, folder_id)
            if not folder:
                raise HTTPException(status_code=404, detail="folder not found")
        if has_responsible or has_context_status:
            responsible_user_id = validate_org_user_assignable(oid, payload.get("responsible_user_id")) if has_responsible else None
            context_status = normalize_context_status(payload.get("context_status")) if has_context_status else None
            folder = storage.update_workspace_folder_business_fields(
                oid,
                wid,
                folder_id,
                responsible_user_id=responsible_user_id,
                update_responsible=has_responsible,
                context_status=context_status,
                update_context_status=has_context_status,
                user_id=user_id,
            )
    except ValueError as e:
        msg = str(e)
        if "already exists" in msg:
            raise HTTPException(status_code=409, detail=msg)
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=422, detail=msg)

    # ── invalidation ──────────────────────────────────────────────────────────
    parent_id = str(folder.get("parent_id", "") or "")
    _invalidate_children_for_folder_chain(oid, wid, parent_id)  # parent list + ancestors
    explorer_invalidate_all_breadcrumbs_for_workspace(oid, wid)      # breadcrumbs: folder name changed
    return _enrich_folder_out(folder)


# ─── POST /api/folders/{folder_id}/move ───────────────────────────────────────
# Invalidation: old parent children, new parent children, all breadcrumbs for
# org (ancestors of moved folder changed for all descendants).

@router.post("/api/folders/{folder_id}/move")
def move_folder(
    folder_id: str, body: MoveFolderBody, request: Request,
    workspace_id: str = Query(...),
) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    user_id = _require_org_access(request, oid)
    if not can_edit_workspace(request, oid):
        raise HTTPException(status_code=403, detail="forbidden")

    # Snapshot old parent before the move
    old_folder = storage.get_workspace_folder(oid, wid, folder_id)
    old_parent_id = str((old_folder or {}).get("parent_id", "") or "")
    new_parent_id = str(body.new_parent_id or "").strip()

    try:
        folder = storage.move_workspace_folder(oid, wid, folder_id, new_parent_id, user_id=user_id)
    except ValueError as e:
        msg = str(e)
        if "descendant" in msg or "itself" in msg:
            raise HTTPException(status_code=422, detail=msg)
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        if "already exists" in msg:
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=422, detail=msg)

    # ── invalidation ──────────────────────────────────────────────────────────
    _invalidate_children_for_folder_chain(oid, wid, old_parent_id)
    _invalidate_children_for_folder_chain(oid, wid, new_parent_id)
    explorer_invalidate_all_breadcrumbs_for_workspace(oid, wid)      # breadcrumbs fully reshuffled
    return folder


# ─── DELETE /api/folders/{folder_id} ─────────────────────────────────────────
# Invalidation: parent children, all org breadcrumbs (safe nuclear option for
# deletes since subtree disappears).

@router.delete("/api/folders/{folder_id}")
def delete_folder(
    folder_id: str, request: Request,
    workspace_id: str = Query(...),
    cascade: bool = Query(default=False),
) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    user_id = _require_org_access(request, oid)
    if not can_manage_workspace(request, oid):
        raise HTTPException(status_code=403, detail="forbidden")

    # Snapshot parent before delete
    folder_before = storage.get_workspace_folder(oid, wid, folder_id)
    parent_id = str((folder_before or {}).get("parent_id", "") or "")

    try:
        deleted = storage.delete_workspace_folder(oid, wid, folder_id, cascade=cascade, user_id=user_id)
    except ValueError as e:
        msg = str(e)
        if "folder_not_empty" in msg:
            raise HTTPException(status_code=409,
                                detail="folder is not empty; use ?cascade=true to delete with contents")
        raise HTTPException(status_code=422, detail=msg)
    if not deleted:
        raise HTTPException(status_code=404, detail="folder not found")

    # ── invalidation ──────────────────────────────────────────────────────────
    _invalidate_children_for_folder_chain(oid, wid, parent_id)
    explorer_invalidate_all_breadcrumbs_for_workspace(oid, wid)      # subtree breadcrumbs gone
    return {"ok": True}


# ─── POST /api/folders/{folder_id}/projects ───────────────────────────────────
# Invalidation: folder children (project count + new row in list).

@router.post("/api/folders/{folder_id}/projects", status_code=201)
def create_project_in_folder(
    folder_id: str, body: CreateProjectBody, request: Request,
    workspace_id: str = Query(...),
) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    user_id = _require_org_access(request, oid)
    if not can_edit_workspace(request, oid):
        raise HTTPException(status_code=403, detail="forbidden")
    fid = str(folder_id or "").strip()
    passport: Dict[str, Any] = {}
    if body.description:
        passport["description"] = body.description
    if body.owner_user_id:
        passport["owner_user_id"] = body.owner_user_id
    executor_user_id = validate_org_user_assignable(oid, body.executor_user_id)
    try:
        pid = storage.create_project_in_folder(oid, wid, fid, body.name,
                                               user_id=user_id, passport=passport,
                                               executor_user_id=executor_user_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # ── invalidation ──────────────────────────────────────────────────────────
    _invalidate_children_for_folder_chain(oid, wid, fid)
    return {
        "id": pid, "name": body.name, "folder_id": fid,
        "workspace_id": wid, "status": "active", "created_by": user_id,
        "executor_user_id": executor_user_id or None,
        "executor": _executor_out(executor_user_id),
    }


# ─── POST /api/backfill/workspace-folders ─────────────────────────────────────

@router.post("/api/backfill/workspace-folders")
def backfill_workspace_folders(
    request: Request, force: bool = Query(default=False),
) -> Dict[str, Any]:
    """Admin/repair endpoint: move orphan projects into 'Импортировано' folder."""
    user_id = require_authenticated_user(request)
    if not request_is_admin(request):
        raise HTTPException(status_code=403, detail="admin only")
    result = storage.run_workspace_folder_backfill(force=force)
    return result


# ─── Project cross-org fallback ───────────────────────────────────────────────

def _load_project_cross_org(proj_storage: Any, pid: str, oid: str) -> Any:
    """
    Load project — tries org_id first, then falls back to no-filter so legacy
    projects with drifted org_id are still accessible.
    Caller has already verified workspace membership.
    """
    proj = proj_storage.load(pid, org_id=oid, is_admin=True)
    if proj:
        return proj
    return proj_storage.load(pid, org_id="", is_admin=True)


# ─── POST /api/projects/{project_id}/move ────────────────────────────────────
# Invalidation: old folder children and new folder children.  Ancestors are also
# invalidated via folder-chain helper so Explorer rollups stay fresh.

@router.post("/api/projects/{project_id}/move")
def move_project(
    project_id: str, body: MoveProjectBody, request: Request,
    workspace_id: str = Query(...),
) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    user_id = _require_org_access(request, oid)
    if not can_edit_workspace(request, oid):
        raise HTTPException(status_code=403, detail="forbidden")

    pid = str(project_id or "").strip()
    target_folder_id = str(body.folder_id or "").strip()
    before = storage.get_project_workspace_details(oid, pid)
    if not before or str(before.get("workspace_id") or "") != wid:
        raise HTTPException(status_code=404, detail="project not found")
    old_folder_id = str(before.get("folder_id") or "")

    try:
        project = storage.move_project_to_folder(
            oid,
            wid,
            pid,
            target_folder_id,
            user_id=user_id,
        )
    except ValueError as e:
        msg = str(e)
        if "project not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        if "target folder not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=422, detail=msg)

    new_folder_id = str(getattr(project, "folder_id", "") or "")
    _invalidate_children_for_folder_chain(oid, wid, old_folder_id)
    _invalidate_children_for_folder_chain(oid, wid, new_folder_id)
    return {
        "ok": True,
        "project": {
            "id": str(getattr(project, "id", "") or ""),
            "name": str(getattr(project, "title", "") or ""),
            "folder_id": new_folder_id,
            "workspace_id": str(getattr(project, "workspace_id", "") or wid),
            "updated_at": int(getattr(project, "updated_at", 0) or 0),
        },
    }


# ─── GET /api/projects/{project_id}/explorer ──────────────────────────────────

@router.get("/api/projects/{project_id}/explorer", response_model=ProjectPage)
def get_project_explorer(
    project_id: str, request: Request, workspace_id: str = Query(...),
) -> ProjectPage:
    t0 = time.perf_counter()
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    _require_org_access(request, oid)
    pid = str(project_id or "").strip()

    details = storage.get_project_workspace_details(oid, pid)
    if details and str(details.get("workspace_id") or "") != wid:
        raise HTTPException(status_code=404, detail="project not found")

    proj_storage = storage.get_project_storage()
    proj = _load_project_cross_org(proj_storage, pid, oid)
    if not proj:
        raise HTTPException(status_code=404, detail="project not found")

    passport = dict(proj.passport or {})
    proj_item = ProjectItem(
        id=proj.id,
        name=proj.title,
        folder_id=str(getattr(proj, "folder_id", "") or ""),
        owner=_owner_out(proj.owner_user_id),
        executor_user_id=str(getattr(proj, "executor_user_id", "") or "") or None,
        executor=_executor_out(str(getattr(proj, "executor_user_id", "") or "")),
        status=str(passport.get("status", "active") or "active"),
        dod_percent=int(passport.get("dod_percent", 0) or 0),
        attention_count=int(passport.get("attention_count", 0) or 0),
        reports_count=int(passport.get("reports_count", 0) or 0),
        description=str(passport.get("description", "") or ""),
        updated_at=proj.updated_at,
    )

    # Sessions: cache-aside
    session_rows = _cached_project_sessions(oid, pid)
    sessions = [
        SessionItem(
            id=s["id"],
            name=s.get("title", ""),
            project_id=s.get("project_id", ""),
            owner=_owner_out(s.get("owner_user_id", "")),
            status=s.get("status", "draft"),
            stage=s.get("stage", ""),
            dod_percent=s.get("dod_percent", 0),
            attention_count=s.get("attention_count", 0),
            reports_count=s.get("reports_count", 0),
            updated_at=s.get("updated_at", 0),
            created_at=s.get("created_at", 0),
        )
        for s in session_rows
    ]

    logger.info("explorer /projects/%s org=%s workspace=%s sessions=%d total=%dms",
                pid, oid, wid, len(sessions), _ms(t0))
    return ProjectPage(project=proj_item, sessions=sessions)


# ─── POST /api/projects/{project_id}/explorer/sessions ────────────────────────
# Invalidation: project sessions list (new session appeared).

@router.post("/api/projects/{project_id}/explorer/sessions", status_code=201)
def create_session_in_project(
    project_id: str, body: CreateSessionBody, request: Request,
    workspace_id: str = Query(...),
) -> Dict[str, Any]:
    workspace = _resolve_workspace(request, workspace_id)
    oid = str(workspace.get("org_id") or "")
    wid = str(workspace.get("id") or "")
    user_id = _require_org_access(request, oid)
    if not can_edit_workspace(request, oid):
        raise HTTPException(status_code=403, detail="forbidden")
    pid = str(project_id or "").strip()

    details = storage.get_project_workspace_details(oid, pid)
    if details and str(details.get("workspace_id") or "") != wid:
        raise HTTPException(status_code=404, detail="project not found")

    proj_storage = storage.get_project_storage()
    proj = _load_project_cross_org(proj_storage, pid, oid)
    if not proj:
        raise HTTPException(status_code=404, detail="project not found")

    sess_storage = storage.get_storage()
    roles = [str(r).strip() for r in (body.roles or []) if str(r).strip()]
    start_role = str(body.start_role or "").strip()
    if start_role and start_role not in roles:
        roles = [start_role] + roles
    if not roles:
        roles = ["Участник"]
    if not start_role:
        start_role = roles[0]

    sid = sess_storage.create(
        title=str(body.name or "").strip() or "Сессия",
        roles=roles,
        start_role=start_role,
        project_id=pid,
        mode=str(body.mode or "quick_skeleton"),
        user_id=user_id,
        org_id=oid,
    )

    # ── invalidation ──────────────────────────────────────────────────────────
    explorer_invalidate_sessions(pid)                     # session list is now stale
    _invalidate_children_for_project_rollup(oid, pid)     # project/folder rollups changed
    return {"id": sid, "name": body.name, "project_id": pid,
            "workspace_id": wid, "status": "draft"}
