from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import JSONResponse

import app._legacy_main as _legacy_main
from ..services import session_service as _svc
from ..schemas.legacy_api import (
    AiQuestionsIn,
    AnswerIn,
    BpmnMetaPatchIn,
    BpmnRestoreIn,
    BpmnXmlIn,
    CreateEdgeIn,
    CreateNodeIn,
    CreateSessionIn,
    InferRtiersIn,
    NodePatchIn,
    NotesExtractionApplyIn,
    NotesExtractionPreviewIn,
    NotesIn,
    OrgReportBuildIn,
    SessionPresenceTouchIn,
    UpdateSessionIn,
)

router = APIRouter()


def _request_user_meta(request: Request | None):
    user = _legacy_main._request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    return user_id, is_admin


def _org_role_for_request(request: Request | None, org_id: str) -> str:
    user_id, is_admin = _request_user_meta(request)
    if not user_id and not is_admin:
        return ""
    return str(_legacy_main.get_user_org_role(user_id, org_id, is_admin=is_admin) or "")


def _require_can_edit_workspace(request: Request | None, org_id: str):
    role = _org_role_for_request(request, org_id)
    _, is_admin = _request_user_meta(request)
    if not _legacy_main._can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")


def _legacy_load_session_scoped(session_id: str, request: Request | None):
    return _legacy_main._legacy_load_session_scoped(session_id, request)


def _require_session_edit(session_id: str, request: Request | None):
    sess, oid, _scope = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="not found")
    _require_can_edit_workspace(request, oid)
    return sess


@router.post('/api/sessions')
def create_session(inp: CreateSessionIn, request: Request = None):
    org_id = _legacy_main._request_active_org_id(request) if request is not None else _legacy_main.get_default_org_id()
    _require_can_edit_workspace(request, org_id)
    user_id, is_admin = _request_user_meta(request)
    return _svc.create_session(
        title=str(getattr(inp, "title", "") or "").strip() or "process",
        roles=getattr(inp, "roles", None),
        start_role=getattr(inp, "start_role", None),
        prep_questions=getattr(inp, "ai_prep_questions", None),
        user_id=user_id or None,
        org_id=org_id or None,
        is_admin=is_admin or None,
    )


@router.get('/api/projects/{project_id}/sessions')
def list_project_sessions(project_id: str, mode: str | None = None, view: str | None = None, request: Request = None):
    return _svc.list_project_sessions(
        project_id=project_id,
        mode=mode,
        view=view or "full",
        request=request,
    )


@router.post('/api/projects/{project_id}/sessions')
def create_project_session(project_id: str, inp: CreateSessionIn, mode: str | None = Query(default='quick_skeleton'), request: Request = None):
    return _svc.create_project_session(project_id, inp, mode, request)


@router.get('/api/sessions')
def list_sessions(q: Optional[str] = None, limit: int = 200, request: Request = None):
    return _svc.list_sessions(query=q, limit=limit, request=request)


@router.get('/api/sessions/{session_id}')
def get_session(session_id: str, request: Request = None):
    return _svc.get_session(session_id, request=request)


@router.post('/api/sessions/{session_id}/presence')
def touch_session_presence_api(session_id: str, inp: SessionPresenceTouchIn, request: Request = None):
    return _svc.touch_session_presence(session_id, inp, request)


@router.delete('/api/sessions/{session_id}/presence')
def leave_session_presence_api(session_id: str, inp: SessionPresenceTouchIn, request: Request = None):
    return _svc.leave_session_presence(session_id, inp, request)


@router.get('/api/sessions/{session_id}/tldr')
def get_session_tldr(session_id: str, request: Request = None):
    return _svc.get_session_tldr(session_id, request)


@router.get('/api/sessions/{session_id}/analytics')
def get_session_analytics(session_id: str, request: Request = None):
    return _svc.get_session_analytics(session_id, request)


@router.patch('/api/sessions/{session_id}')
def patch_session(session_id: str, inp: UpdateSessionIn, request: Request = None):
    return _svc.patch_session(session_id, inp, request)


@router.delete('/api/sessions/{session_id}')
def delete_session_api(session_id: str, request: Request = None):
    _svc.delete_session(session_id, request=request)
    return {"ok": True}


@router.put('/api/sessions/{session_id}')
def put_session(session_id: str, inp: UpdateSessionIn, request: Request = None):
    return _svc.put_session(session_id, inp, request)


@router.post('/api/sessions/{session_id}/recompute')
def recompute(session_id: str, request: Request = None):
    sess, _oid, _scope = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="not found")
    return _svc.recompute_session(session_id, request)


@router.post('/api/sessions/{session_id}/ai/questions')
def ai_questions(session_id: str, inp: AiQuestionsIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.ai_questions(session_id, inp, request)


@router.post('/api/sessions/{session_id}/notes')
def post_notes(session_id: str, inp: NotesIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.post_notes(session_id, inp, request)


@router.post('/api/sessions/{session_id}/notes/extraction-apply')
def post_notes_extraction_apply(session_id: str, inp: NotesExtractionApplyIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.post_notes_extraction_apply(session_id, inp, request)


@router.post('/api/sessions/{session_id}/notes/extraction-preview')
def post_notes_extraction_preview(session_id: str, inp: NotesExtractionPreviewIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.post_notes_extraction_preview(session_id, inp, request)


@router.post('/api/sessions/{session_id}/answer')
def answer(session_id: str, inp: AnswerIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.answer(session_id, inp, request)


@router.post('/api/sessions/{session_id}/answers')
def answer_v2(session_id: str, inp: AnswerIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.answer_v2(session_id, inp, request)


@router.post('/api/sessions/{session_id}/nodes/{node_id}')
def patch_node(session_id: str, node_id: str, inp: NodePatchIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.patch_node(session_id, node_id, inp, request)


@router.post('/api/sessions/{session_id}/nodes')
def add_node(session_id: str, inp: CreateNodeIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.add_node(session_id, inp, request)


@router.delete('/api/sessions/{session_id}/nodes/{node_id}')
def delete_node(session_id: str, node_id: str, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.delete_node(session_id, node_id, request)


@router.post('/api/sessions/{session_id}/edges')
def add_edge(session_id: str, inp: CreateEdgeIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.add_edge(session_id, inp, request)


@router.delete('/api/sessions/{session_id}/edges')
def delete_edge(session_id: str, inp: CreateEdgeIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.delete_edge(session_id, inp, request)


@router.get('/api/sessions/{session_id}/bpmn_meta')
def session_bpmn_meta_get(session_id: str, request: Request = None):
    sess, _oid, _scope = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="not found")
    return _svc.bpmn_meta_get(session_id, request)


@router.patch('/api/sessions/{session_id}/bpmn_meta')
def session_bpmn_meta_patch(session_id: str, inp: BpmnMetaPatchIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.bpmn_meta_patch(session_id, inp, request)


@router.post('/api/sessions/{session_id}/bpmn_meta/infer_rtiers')
def session_bpmn_meta_infer_rtiers(session_id: str, inp: InferRtiersIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.bpmn_meta_infer_rtiers(session_id, inp, request)


@router.get('/api/sessions/{session_id}/bpmn')
def session_bpmn_export(session_id: str, raw: int = Query(0), include_overlay: int = Query(1), zoom: float = Query(1.0), pan_x: float = Query(0.0), pan_y: float = Query(0.0), request: Request = None):
    return _svc.bpmn_export(session_id, raw=raw, include_overlay=include_overlay, zoom=zoom, pan_x=pan_x, pan_y=pan_y, request=request)


@router.get('/api/sessions/{session_id}/overlays')
def session_overlays(session_id: str, request: Request = None):
    return _svc.overlays(session_id, request)


@router.put('/api/sessions/{session_id}/bpmn')
def session_bpmn_save(session_id: str, inp: BpmnXmlIn, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.bpmn_save(session_id, inp, request)


@router.get('/api/sessions/{session_id}/bpmn/versions')
def session_bpmn_versions_list(session_id: str, request: Request = None, limit: int = Query(100), include_xml: int = Query(0)):
    return _svc.bpmn_versions_list(session_id, request=request, limit=limit, include_xml=include_xml)


@router.get('/api/sessions/{session_id}/bpmn/versions/{version_id}')
def session_bpmn_version_detail(session_id: str, version_id: str, request: Request = None):
    return _svc.bpmn_version_detail(session_id, version_id, request)


@router.post('/api/sessions/{session_id}/bpmn/restore/{version_id}')
def session_bpmn_restore(session_id: str, version_id: str, inp: BpmnRestoreIn | None = None, request: Request = None):
    return _svc.bpmn_restore(session_id, version_id, request)


@router.delete('/api/sessions/{session_id}/bpmn')
def session_bpmn_clear(session_id: str, request: Request = None):
    _require_session_edit(session_id, request)
    return _svc.bpmn_clear(session_id, request)


@router.get('/api/sessions/{session_id}/export')
def export(session_id: str, request: Request = None):
    sess, _oid, _scope = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="not found")
    return _svc.export(session_id, request)


@router.get('/api/sessions/{session_id}/export.zip')
def export_zip(session_id: str, request: Request = None):
    sess, _oid, _scope = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="not found")
    return _svc.export_zip(session_id, request)


@router.get('/api/orgs/{org_id}/sessions/{session_id}/reports/versions')
def list_org_session_report_versions(org_id: str, session_id: str, request: Request, path_id: str = '', steps_hash: str = ''):
    return _svc.list_org_session_report_versions(org_id, session_id, request, path_id, steps_hash)


@router.post('/api/orgs/{org_id}/sessions/{session_id}/reports/build')
def build_org_session_report(org_id: str, session_id: str, inp: OrgReportBuildIn, request: Request):
    return _svc.build_org_session_report(org_id, session_id, inp, request)


@router.get('/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}')
def get_org_session_report_version(org_id: str, session_id: str, version_id: str, request: Request, path_id: str = ''):
    return _svc.get_org_session_report_version(org_id, session_id, version_id, request, path_id)


@router.delete('/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}')
def delete_org_session_report_version(org_id: str, session_id: str, version_id: str, request: Request, path_id: str = ''):
    return _svc.delete_org_session_report_version(org_id, session_id, version_id, request, path_id)
