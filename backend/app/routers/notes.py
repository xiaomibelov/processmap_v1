from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import storage
from ..auth import list_users
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
    mention_user_ids: List[str] = Field(default_factory=list)


class AddNoteCommentBody(BaseModel):
    body: str
    mention_user_ids: List[str] = Field(default_factory=list)


class PatchNoteThreadBody(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    requires_attention: Optional[bool] = None


class SessionNoteAggregatesBody(BaseModel):
    session_ids: List[str] = Field(default_factory=list)


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
    thread = storage.get_note_thread(thread_id, org_id=org_id, viewer_user_id=user_id)
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


def _dedupe_session_ids(raw_session_ids: List[str], *, limit: int = 100) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for raw in raw_session_ids or []:
        sid = str(raw or "").strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        out.append(sid)
        if len(out) >= limit:
            break
    return out


def _user_label(row: Dict[str, Any]) -> str:
    return str(row.get("full_name") or row.get("name") or row.get("email") or row.get("id") or "").strip()


def _mentionable_users_for_session(sess: Any, org_id: str) -> List[Dict[str, str]]:
    users_by_id = {
        str(row.get("id") or "").strip(): row
        for row in list_users()
        if str(row.get("id") or "").strip() and bool(row.get("is_active", True))
    }
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    membership_rows = storage.list_project_memberships(org_id, project_id=project_id) if project_id else []
    if not membership_rows:
        membership_rows = storage.list_org_memberships(org_id)
    out: List[Dict[str, str]] = []
    seen: set[str] = set()
    for membership in membership_rows:
        user_id = str(membership.get("user_id") or "").strip()
        user = users_by_id.get(user_id)
        if not user or user_id in seen:
            continue
        seen.add(user_id)
        out.append({
            "user_id": user_id,
            "label": _user_label(user),
            "email": str(user.get("email") or "").strip(),
            "full_name": str(user.get("full_name") or "").strip(),
            "job_title": str(user.get("job_title") or "").strip(),
        })
    out.sort(key=lambda item: (item.get("label") or item.get("user_id") or "").lower())
    return out


def _resolve_mention_targets(sess: Any, org_id: str, mention_user_ids: List[str]) -> List[Dict[str, str]]:
    requested = []
    seen: set[str] = set()
    for raw in mention_user_ids or []:
        user_id = str(raw or "").strip()
        if user_id and user_id not in seen:
            seen.add(user_id)
            requested.append(user_id)
    if not requested:
        return []
    mentionable = {item["user_id"]: item for item in _mentionable_users_for_session(sess, org_id)}
    missing = [user_id for user_id in requested if user_id not in mentionable]
    if missing:
        raise ValueError("invalid mention user")
    return [{"user_id": user_id, "label": mentionable[user_id]["label"]} for user_id in requested]


@router.get("/api/sessions/{session_id}/note-aggregate")
def get_session_note_aggregate(session_id: str, request: Request) -> Dict[str, Any]:
    _sess, org_id, user_id = _load_session_for_notes(request, session_id, write=False)
    aggregate = storage.get_session_open_notes_aggregate(session_id, org_id=org_id, viewer_user_id=user_id)
    return {"scope_type": "session", "session_id": session_id, **aggregate}


@router.post("/api/sessions/note-aggregates")
def get_session_note_aggregates(body: SessionNoteAggregatesBody, request: Request) -> Dict[str, Any]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    session_ids = _dedupe_session_ids(body.session_ids)
    if not session_ids:
        return {"scope_type": "sessions", "items": [], "aggregates": {}}
    st = storage.get_storage()
    for sid in session_ids:
        sess = st.load(sid, org_id=org_id, is_admin=True)
        if not sess:
            raise HTTPException(status_code=404, detail="session not found")
        project_id = str(getattr(sess, "project_id", "") or "").strip()
        if project_id and not project_access_allowed(request, org_id, project_id):
            raise HTTPException(status_code=404, detail="session not found")
    aggregate_by_session = storage.get_sessions_open_notes_aggregates(
        session_ids,
        org_id=org_id,
        viewer_user_id=user_id,
    )
    items = [
        {
            "scope_type": "session",
            "session_id": sid,
            **(aggregate_by_session.get(sid) or {
                "open_notes_count": 0,
                "has_open_notes": False,
                "attention_discussions_count": 0,
                "has_attention_discussions": False,
                "personal_discussions_count": 0,
                "has_personal_discussions": False,
            }),
        }
        for sid in session_ids
    ]
    return {
        "scope_type": "sessions",
        "items": items,
        "aggregates": {sid: item for sid, item in zip(session_ids, items)},
    }


@router.get("/api/projects/{project_id}/note-aggregate")
def get_project_note_aggregate(project_id: str, request: Request) -> Dict[str, Any]:
    _project, org_id, user_id = _load_project_for_notes(request, project_id)
    aggregate = storage.get_project_open_notes_aggregate(project_id, org_id=org_id, viewer_user_id=user_id)
    return {"scope_type": "project", "project_id": project_id, **aggregate}


@router.get("/api/folders/{folder_id}/note-aggregate")
def get_folder_note_aggregate(folder_id: str, request: Request, workspace_id: str) -> Dict[str, Any]:
    _folder, org_id, wid, user_id, allowed_project_ids = _load_folder_for_notes(request, folder_id, workspace_id)
    aggregate = storage.get_folder_open_notes_aggregate(
        folder_id,
        org_id=org_id,
        workspace_id=wid,
        allowed_project_ids=allowed_project_ids,
        viewer_user_id=user_id,
    )
    return {"scope_type": "folder", "folder_id": folder_id, "workspace_id": wid, **aggregate}


@router.get("/api/sessions/{session_id}/mentionable-users")
def list_session_mentionable_users(session_id: str, request: Request) -> Dict[str, Any]:
    sess, org_id, user_id = _load_session_for_notes(request, session_id, write=False)
    items = [item for item in _mentionable_users_for_session(sess, org_id) if item.get("user_id") != user_id]
    return {"items": items, "count": len(items)}


@router.get("/api/note-mentions")
def list_my_note_mentions(request: Request, limit: int = 20) -> Dict[str, Any]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    raw_items = storage.list_active_note_mentions_for_user(user_id, org_id=org_id, limit=limit)
    items = [
        item for item in raw_items
        if not str(item.get("project_id") or "").strip() or project_access_allowed(request, org_id, str(item.get("project_id") or "").strip())
    ]
    return {"items": items, "count": len(items)}


@router.post("/api/sessions/{session_id}/note-threads", status_code=201)
def create_session_note_thread(session_id: str, body: CreateNoteThreadBody, request: Request) -> Dict[str, Any]:
    sess, org_id, user_id = _load_session_for_notes(request, session_id, write=True)
    try:
        mention_targets = _resolve_mention_targets(sess, org_id, body.mention_user_ids)
        thread = storage.create_note_thread(
            sess,
            scope_type=body.scope_type,
            scope_ref=body.scope_ref,
            body=body.body,
            priority=body.priority,
            requires_attention=body.requires_attention,
            mention_targets=mention_targets,
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
    _sess, org_id, user_id = _load_session_for_notes(request, session_id, write=False)
    try:
        items = storage.list_note_threads(
            session_id,
            org_id=org_id,
            status=status,
            scope_type=scope_type,
            element_id=element_id,
            viewer_user_id=user_id,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    return {"items": items, "count": len(items)}


@router.post("/api/note-threads/{thread_id}/comments", status_code=201)
def add_note_thread_comment(thread_id: str, body: AddNoteCommentBody, request: Request) -> Dict[str, Any]:
    _thread, sess, org_id, user_id = _load_thread_session_for_notes(request, thread_id, write=True)
    try:
        mention_targets = _resolve_mention_targets(sess, org_id, body.mention_user_ids)
        thread = storage.add_note_comment(
            thread_id,
            body=body.body,
            mention_targets=mention_targets,
            actor_user_id=user_id,
            org_id=org_id,
        )
    except ValueError as exc:
        raise _validation_error(exc) from exc
    if not thread:
        raise HTTPException(status_code=404, detail="note thread not found")
    return {"thread": thread}


@router.post("/api/note-mentions/{mention_id}/acknowledge")
def acknowledge_note_mention(mention_id: str, request: Request) -> Dict[str, Any]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    mention = storage.acknowledge_note_mention(mention_id, actor_user_id=user_id, org_id=org_id)
    if not mention:
        raise HTTPException(status_code=404, detail="mention not found")
    return {"mention": mention}


@router.post("/api/note-threads/{thread_id}/attention-acknowledgement")
def acknowledge_note_thread_attention(thread_id: str, request: Request) -> Dict[str, Any]:
    _thread, _sess, org_id, user_id = _load_thread_session_for_notes(request, thread_id, write=False)
    thread = storage.acknowledge_note_thread_attention(thread_id, actor_user_id=user_id, org_id=org_id)
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
