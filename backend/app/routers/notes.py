from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import storage
from ..legacy.request_context import require_authenticated_user, request_active_org_id
from ..services.org_workspace import can_edit_workspace, project_access_allowed, require_org_member_for_enterprise

router = APIRouter(tags=["notes"])


class CreateNoteThreadBody(BaseModel):
    scope_type: str
    scope_ref: Dict[str, Any] = Field(default_factory=dict)
    body: str


class AddNoteCommentBody(BaseModel):
    body: str


class PatchNoteThreadBody(BaseModel):
    status: str


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


@router.post("/api/sessions/{session_id}/note-threads", status_code=201)
def create_session_note_thread(session_id: str, body: CreateNoteThreadBody, request: Request) -> Dict[str, Any]:
    sess, org_id, user_id = _load_session_for_notes(request, session_id, write=True)
    try:
        thread = storage.create_note_thread(
            sess,
            scope_type=body.scope_type,
            scope_ref=body.scope_ref,
            body=body.body,
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
    try:
        thread = storage.patch_note_thread_status(thread_id, status=body.status, actor_user_id=user_id, org_id=org_id)
    except ValueError as exc:
        raise _validation_error(exc) from exc
    if not thread:
        raise HTTPException(status_code=404, detail="note thread not found")
    return {"thread": thread}
