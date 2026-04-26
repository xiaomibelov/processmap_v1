from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import storage
from ..legacy.request_context import require_authenticated_user, request_active_org_id
from ..services.org_workspace import (
    can_edit_workspace,
    project_access_allowed,
    project_scope_for_request,
    require_org_member_for_enterprise,
)

router = APIRouter(tags=["notes"])


class CreateNoteThreadBody(BaseModel):
    scope_type: str
    scope_ref: Dict[str, Any] = Field(default_factory=dict)
    body: str
    priority: str = "normal"
    requires_attention: bool = False


class AddNoteCommentBody(BaseModel):
    body: str


class PatchNoteThreadBody(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    requires_attention: Optional[bool] = None


def _load_project_for_notes(request: Request, project_id: str) -> tuple[Any, str, str]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    pid = str(project_id or "").strip()
    if not pid:
        raise HTTPException(status_code=404, detail="project not found")
    if not project_access_allowed(request, org_id, pid):
        raise HTTPException(status_code=404, detail="project not found")
    project = storage.get_project_storage().load(pid, org_id=org_id, is_admin=True)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")
    return project, org_id, user_id


def _load_folder_for_notes(request: Request, folder_id: str, workspace_id: str) -> tuple[Dict[str, Any], str, str, str, Optional[list[str]]]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    wid = str(workspace_id or "").strip()
    if not wid:
        raise HTTPException(status_code=422, detail="workspace_id required")
    folder = storage.get_workspace_folder(org_id, wid, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="folder not found")
    scope = project_scope_for_request(request, org_id)
    allowed_project_ids = None
    if str((scope or {}).get("mode") or "") != "all":
        allowed_project_ids = [
            str(item or "").strip()
            for item in ((scope or {}).get("project_ids") or [])
            if str(item or "").strip()
        ]
    return folder, org_id, wid, user_id, allowed_project_ids


def _load_session_for_notes(request: Request, session_id: str, *, write: bool) -> tuple[Any, str, str]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    st = storage.get_storage()
    sess = st.load(session_id, org_id=org_id, is_admin=True)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if project_id and not project_access_allowed(request, org_id, project_id):
        raise HTTPException(status_code=404, detail="session not found")
    if write and not can_edit_workspace(request, org_id):
        raise HTTPException(status_code=403, detail="forbidden")
    return sess, org_id, user_id


def _load_thread_session_for_notes(request: Request, thread_id: str, *, write: bool) -> tuple[Dict[str, Any], Any, str, str]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    thread = storage.get_note_thread(thread_id, org_id=org_id)
    if not thread:
        raise HTTPException(status_code=404, detail="note thread not found")
    st = storage.get_storage()
    sess = st.load(str(thread.get("session_id") or ""), org_id=org_id, is_admin=True)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if project_id and not project_access_allowed(request, org_id, project_id):
        raise HTTPException(status_code=404, detail="note thread not found")
    if write and not can_edit_workspace(request, org_id):
        raise HTTPException(status_code=403, detail="forbidden")
    return thread, sess, org_id, user_id


def _validation_error(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc) or "validation error")


@router.get("/api/sessions/{session_id}/note-aggregate")
def get_session_note_aggregate(session_id: str, request: Request) -> Dict[str, Any]:
    _sess, org_id, _user_id = _load_session_for_notes(request, session_id, write=False)
    aggregate = storage.get_session_open_notes_aggregate(session_id, org_id=org_id)
    return {"scope_type": "session", "session_id": session_id, **aggregate}


@router.get("/api/projects/{project_id}/note-aggregate")
def get_project_note_aggregate(project_id: str, request: Request) -> Dict[str, Any]:
    _project, org_id, _user_id = _load_project_for_notes(request, project_id)
    aggregate = storage.get_project_open_notes_aggregate(project_id, org_id=org_id)
    return {"scope_type": "project", "project_id": project_id, **aggregate}


@router.get("/api/folders/{folder_id}/note-aggregate")
def get_folder_note_aggregate(folder_id: str, request: Request, workspace_id: str) -> Dict[str, Any]:
    _folder, org_id, wid, _user_id, allowed_project_ids = _load_folder_for_notes(request, folder_id, workspace_id)
    aggregate = storage.get_folder_open_notes_aggregate(
        folder_id,
        org_id=org_id,
        workspace_id=wid,
        allowed_project_ids=allowed_project_ids,
    )
    return {"scope_type": "folder", "folder_id": folder_id, "workspace_id": wid, **aggregate}


@router.post("/api/sessions/{session_id}/note-threads", status_code=201)
def create_session_note_thread(session_id: str, body: CreateNoteThreadBody, request: Request) -> Dict[str, Any]:
    sess, org_id, user_id = _load_session_for_notes(request, session_id, write=True)
    try:
        thread = storage.create_note_thread(
            sess,
            scope_type=body.scope_type,
            scope_ref=body.scope_ref,
            body=body.body,
            priority=body.priority,
            requires_attention=body.requires_attention,
            actor_user_id=user_id,
            org_id=org_id,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    return {"thread": thread}


@router.get("/api/sessions/{session_id}/note-threads")
def list_session_note_threads(
    session_id: str,
    request: Request,
    status: Optional[str] = None,
    scope_type: Optional[str] = None,
    element_id: Optional[str] = None,
) -> Dict[str, Any]:
    _sess, org_id, _user_id = _load_session_for_notes(request, session_id, write=False)
    try:
        items = storage.list_note_threads(
            session_id,
            org_id=org_id,
            status=status,
            scope_type=scope_type,
            element_id=element_id,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    return {"items": items, "count": len(items)}


@router.post("/api/note-threads/{thread_id}/comments", status_code=201)
def add_note_thread_comment(thread_id: str, body: AddNoteCommentBody, request: Request) -> Dict[str, Any]:
    _thread, _sess, org_id, user_id = _load_thread_session_for_notes(request, thread_id, write=True)
    try:
        thread = storage.add_note_comment(thread_id, body=body.body, actor_user_id=user_id, org_id=org_id)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    if not thread:
        raise HTTPException(status_code=404, detail="note thread not found")
    return {"thread": thread}


@router.patch("/api/note-threads/{thread_id}")
def patch_note_thread(thread_id: str, body: PatchNoteThreadBody, request: Request) -> Dict[str, Any]:
    _thread, _sess, org_id, user_id = _load_thread_session_for_notes(request, thread_id, write=True)
    fields_set = getattr(body, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(body, "__fields_set__", set())
    patch: Dict[str, Any] = {}
    for key in ("status", "priority", "requires_attention"):
        if key in fields_set:
            patch[key] = getattr(body, key)
    try:
        thread = storage.patch_note_thread(thread_id, actor_user_id=user_id, org_id=org_id, **patch)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    if not thread:
        raise HTTPException(status_code=404, detail="note thread not found")
    return {"thread": thread}
