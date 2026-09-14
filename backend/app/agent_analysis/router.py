"""Manual/admin endpoints for the background agent-analysis pipeline.

These endpoints are for admins and debugging only — the product flow is the
background save-hook. Auth model mirrors routers/auto_pass.py.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import _legacy_main
from ..ai import llm_store
from ..celery_app import app
from ..schemas.agent_chat import AgentAnalysisArtifactOut
from .settings import FEATURE
from .tasks import run_agent_analysis_task

router = APIRouter(tags=["agent-analysis"])


class AgentAnalysisRunIn(BaseModel):
    pass


def _feature_enabled() -> bool:
    try:
        flag = llm_store.get_feature_flag(FEATURE)
    except Exception:
        return False
    return bool(flag and flag.get("enabled"))


@router.post("/api/sessions/{session_id}/agent-analysis")
def run_agent_analysis(session_id: str, request: Request, inp: Optional[AgentAnalysisRunIn] = None) -> Dict[str, Any]:
    uid, _ = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    sess, oid, _ = _legacy_main._legacy_load_session_scoped(session_id, request)
    if not sess:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    if not _feature_enabled():
        return JSONResponse(
            status_code=404,
            content={"error": "agent_analysis_disabled", "message": "feature 'agent_analysis' is disabled"},
        )
    sid = str(session_id or "").strip()
    org_id = str(oid or getattr(sess, "org_id", "") or _legacy_main.get_default_org_id())
    async_result = run_agent_analysis_task.apply_async(args=[sid, org_id, str(uid or "")], countdown=0)
    return {"job_id": str(getattr(async_result, "id", "") or ""), "status": "queued", "session_id": sid}


_STATE_MAP = {
    "PENDING": "queued",
    "STARTED": "running",
    "RETRY": "running",
    "PROGRESS": "running",
}


@router.get("/api/sessions/{session_id}/agent-analysis")
def agent_analysis_status(session_id: str, request: Request, job_id: str = Query(default="")) -> Dict[str, Any]:
    uid, _ = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    sess, _, _ = _legacy_main._legacy_load_session_scoped(session_id, request)
    if not sess:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    jid = str(job_id or "").strip()
    if not jid:
        return _legacy_main._enterprise_error(422, "validation_error", "job_id is required")
    try:
        result = app.AsyncResult(jid)
        state = str(getattr(result, "state", "") or "PENDING")
        if state == "SUCCESS":
            payload = result.result if isinstance(result.result, dict) else {}
            status = str(payload.get("status") or "done")
            return {"job_id": jid, "status": status, "result": payload}
        if state == "FAILURE":
            return {
                "job_id": jid,
                "status": "failed",
                "error": str(getattr(result, "traceback", "") or "task failed"),
            }
        return {"job_id": jid, "status": _STATE_MAP.get(state, "queued"), "state": state}
    except Exception:
        # Celery backend недоступен/невалидный job_id — доменный not_found
        # (по образцу auto_pass_status, см. contract spec_gap).
        return _legacy_main._enterprise_error(404, "not_found", "not_found")


@router.get(
    "/api/sessions/{session_id}/agent-analysis/artifact",
    response_model=AgentAnalysisArtifactOut,
    responses={
        401: {"description": "Unauthorized"},
        404: {"description": "Session or agent_analysis artifact not found"},
    },
)
def agent_analysis_artifact(session_id: str, request: Request) -> Any:
    """Отдать сохранённый артефакт bpmn_meta.agent_analysis_v1 владельцу сессии.

    Без флага фичи: чтение собственного артефакта безопасно (флаг остаётся
    только на POST enqueue). Источник данных — тот же bpmn_meta, что пишет
    processor (rule of single implementation).
    """
    uid, _ = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    sess, _, _ = _legacy_main._legacy_load_session_scoped(session_id, request)
    if not sess:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    meta = _legacy_main._normalize_bpmn_meta(getattr(sess, "bpmn_meta", {}) or {})
    artifact = meta.get("agent_analysis_v1")
    if not isinstance(artifact, dict) or not artifact:
        return _legacy_main._enterprise_error(404, "agent_analysis_not_found", "agent_analysis_not_found")
    return {
        "artifact": artifact,
        "schema_version": str(artifact.get("schema_version") or ""),
        "version": int(getattr(sess, "version", 0) or 0),
        "updated_at": str(artifact.get("generated_at") or ""),
    }
