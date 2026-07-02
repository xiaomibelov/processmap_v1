from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

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

@router.post('/api/sessions')
def create_session(inp: CreateSessionIn):
    return _svc.create_session(inp)

@router.get('/api/projects/{project_id}/sessions')
def list_project_sessions(project_id: str, mode=None, view=None, request: Request = None):
    return _svc.list_project_sessions(project_id, mode, view)

@router.post('/api/projects/{project_id}/sessions')
def create_project_session(project_id: str, inp: CreateSessionIn, mode, request: Request = None):
    return _svc.create_project_session(project_id, inp, mode)

@router.get('/api/sessions')
def list_sessions(q: Optional[str] = None, limit: int = 200, request: Request = None):
    return _svc.list_sessions(q, limit)

@router.get('/api/sessions/{session_id}')
def get_session(session_id: str, request: Request = None):
    return _svc.get_session(session_id, request=request)

@router.post('/api/sessions/{session_id}/presence')
def touch_session_presence_api(session_id: str, inp: SessionPresenceTouchIn, request: Request = None):
    return _svc.touch_session_presence_api(session_id, inp)

@router.delete('/api/sessions/{session_id}/presence')
def leave_session_presence_api(session_id: str, inp: SessionPresenceTouchIn, request: Request = None):
    return _svc.leave_session_presence_api(session_id, inp)

@router.get('/api/sessions/{session_id}/tldr')
def get_session_tldr(session_id: str, request: Request = None):
    return _svc.get_session_tldr(session_id)

@router.get('/api/sessions/{session_id}/analytics')
def get_session_analytics(session_id: str, request: Request = None):
    return _svc.get_session_analytics(session_id)

@router.patch('/api/sessions/{session_id}')
def patch_session(session_id: str, inp: UpdateSessionIn, request: Request = None):
    return _svc.patch_session(session_id, inp, request)

@router.delete('/api/sessions/{session_id}')
def delete_session_api(session_id: str, request: Request = None):
    return _svc.delete_session_api(session_id, request)

@router.put('/api/sessions/{session_id}')
def put_session(session_id: str, inp: UpdateSessionIn, request: Request = None):
    return _svc.put_session(session_id, inp, request)

@router.post('/api/sessions/{session_id}/recompute')
def recompute(session_id: str):
    return _svc.recompute(session_id)

@router.post('/api/sessions/{session_id}/ai/questions')
def ai_questions(session_id: str, inp: AiQuestionsIn, request: Request = None):
    return _svc.ai_questions(session_id, inp)

@router.post('/api/sessions/{session_id}/notes')
def post_notes(session_id: str, inp: NotesIn, request: Request = None):
    return _svc.post_notes(session_id, inp)

@router.post('/api/sessions/{session_id}/notes/extraction-apply')
def post_notes_extraction_apply(session_id: str, inp: NotesExtractionApplyIn, request: Request = None):
    return _svc.post_notes_extraction_apply(session_id, inp)

@router.post('/api/sessions/{session_id}/notes/extraction-preview')
def post_notes_extraction_preview(session_id: str, inp: NotesExtractionPreviewIn, request: Request = None):
    return _svc.post_notes_extraction_preview(session_id, inp)

@router.post('/api/sessions/{session_id}/answer')
def answer(session_id: str, inp: AnswerIn, request: Request = None):
    return _svc.answer(session_id, inp)

@router.post('/api/sessions/{session_id}/answers')
def answer_v2(session_id: str, inp: AnswerIn, request: Request = None):
    return _svc.answer_v2(session_id, inp)

@router.post('/api/sessions/{session_id}/nodes/{node_id}')
def patch_node(session_id: str, node_id: str, inp: NodePatchIn, request: Request = None):
    return _svc.patch_node(session_id, node_id, inp)

@router.post('/api/sessions/{session_id}/nodes')
def add_node(session_id: str, inp: CreateNodeIn, request: Request = None):
    return _svc.add_node(session_id, inp)

@router.delete('/api/sessions/{session_id}/nodes/{node_id}')
def delete_node(session_id: str, node_id: str, request: Request = None):
    return _svc.delete_node(session_id, node_id)

@router.post('/api/sessions/{session_id}/edges')
def add_edge(session_id: str, inp: CreateEdgeIn, request: Request = None):
    return _svc.add_edge(session_id, inp)

@router.delete('/api/sessions/{session_id}/edges')
def delete_edge(session_id: str, inp: CreateEdgeIn, request: Request = None):
    return _svc.delete_edge(session_id, inp)

@router.get('/api/sessions/{session_id}/bpmn_meta')
def session_bpmn_meta_get(session_id: str):
    return _svc.session_bpmn_meta_get(session_id)

@router.patch('/api/sessions/{session_id}/bpmn_meta')
def session_bpmn_meta_patch(session_id: str, inp: BpmnMetaPatchIn, request: Request = None):
    return _svc.session_bpmn_meta_patch(session_id, inp)

@router.post('/api/sessions/{session_id}/bpmn_meta/infer_rtiers')
def session_bpmn_meta_infer_rtiers(session_id: str, inp: InferRtiersIn, request: Request = None):
    return _svc.session_bpmn_meta_infer_rtiers(session_id, inp)

@router.get('/api/sessions/{session_id}/bpmn')
def session_bpmn_export(session_id: str, raw: int, include_overlay: int, zoom: float, pan_x: float, pan_y: float, request: Request = None):
    return _svc.session_bpmn_export(session_id, raw, include_overlay, zoom, pan_x, pan_y)

@router.get('/api/sessions/{session_id}/overlays')
def session_overlays(session_id: str, request: Request = None):
    return _svc.session_overlays(session_id)

@router.put('/api/sessions/{session_id}/bpmn')
def session_bpmn_save(session_id: str, inp: BpmnXmlIn, request: Request = None):
    return _svc.session_bpmn_save(session_id, inp, request)

@router.get('/api/sessions/{session_id}/bpmn/versions')
def session_bpmn_versions_list(
    session_id: str,
    limit: int = Query(10),
    offset: int = Query(0),
    include_xml: int = Query(0),
    include_technical: bool = Query(False),
    request: Request = None,
):
    return _svc.bpmn_versions_list(
        session_id,
        request=request,
        limit=limit,
        offset=offset,
        include_xml=include_xml,
        include_technical=include_technical,
    )

@router.get('/api/sessions/{session_id}/bpmn/versions/{version_id}')
def session_bpmn_version_detail(session_id: str, version_id: str, request: Request = None):
    return _svc.session_bpmn_version_detail(session_id, version_id)

@router.post('/api/sessions/{session_id}/bpmn/restore/{version_id}')
def session_bpmn_restore(session_id: str, version_id: str, inp=None, request: Request = None):
    return _svc.session_bpmn_restore(session_id, version_id, inp)

@router.delete('/api/sessions/{session_id}/bpmn')
def session_bpmn_clear(session_id: str, request: Request = None):
    return _svc.session_bpmn_clear(session_id)

@router.get('/api/sessions/{session_id}/export')
def export(session_id: str):
    return _svc.export(session_id)

@router.get('/api/sessions/{session_id}/export.zip')
def export_zip(session_id: str):
    return _svc.export_zip(session_id)

@router.get('/api/orgs/{org_id}/sessions/{session_id}/reports/versions')
def list_org_session_report_versions(org_id: str, session_id: str, request: Request, path_id: str = '', steps_hash: str = ''):
    return _svc.list_org_session_report_versions(org_id, session_id, path_id, steps_hash)

@router.post('/api/orgs/{org_id}/sessions/{session_id}/reports/build')
def build_org_session_report(org_id: str, session_id: str, inp: OrgReportBuildIn, request: Request):
    return _svc.build_org_session_report(org_id, session_id, inp)

@router.get('/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}')
def get_org_session_report_version(org_id: str, session_id: str, version_id: str, request: Request, path_id: str = ''):
    return _svc.get_org_session_report_version(org_id, session_id, version_id, path_id)

@router.delete('/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}')
def delete_org_session_report_version(org_id: str, session_id: str, version_id: str, request: Request, path_id: str = ''):
    return _svc.delete_org_session_report_version(org_id, session_id, version_id, path_id)
