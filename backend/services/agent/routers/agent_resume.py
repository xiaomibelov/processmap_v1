"""Resume endpoint for AGENT-3 HITL.

POST /sessions/{session_id}/agent/resume — принимает решение пользователя
о pending_edit (confirm/reject) и применяет/отклоняет правки.
"""
from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from edit import apply_edit_plan, EditApplyError, get_pending_edit, update_pending_edit_status
from memory.chat import EDIT_FEATURE
from runners import monolith_client
from schemas import AgentChatIn
from services.auth_service import AuthError, SessionNotFound, get_session_context


router = APIRouter(tags=["agent"])


def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    parts = str(auth).split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return ""


def _session_gate(session_id: str, request: Request) -> Dict[str, Any]:
    token = _extract_bearer(request)
    try:
        ctx = get_session_context(token, session_id)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    ctx["token"] = token
    return ctx


def _sse_event(event_type: str, payload: Dict[str, Any]) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


class ResumeIn(AgentChatIn):
    pending_edit_id: str
    decision: str  # "confirm" | "reject"


def _resume_stream(
    session_id: str,
    user_id: str,
    org_id: str,
    payload: ResumeIn,
    token: str,
) -> Any:
    import time

    from gateway import llm_store
    from gateway.gateway import complete

    peid = str(payload.pending_edit_id or "").strip()
    decision = str(payload.decision or "").strip().lower()

    yield _sse_event("start", {"turn_id": f"resume_{int(time.time() * 1000)}"})

    pending = get_pending_edit(peid, org_id)
    if not pending:
        yield _sse_event("error", {"status": "not_found", "error": "pending edit not found"})
        return

    if pending["status"] != "pending":
        yield _sse_event("error", {"status": "already_resumed", "error": f"status={pending['status']}"})
        return

    if pending["expires_at"] and pending["expires_at"] < int(time.time()):
        update_pending_edit_status(peid, "expired", resumed_by_user_id=user_id)
        yield _sse_event("error", {"status": "expired", "error": "время подтверждения истекло"})
        return

    if decision == "reject":
        update_pending_edit_status(peid, "rejected", resumed_by_user_id=user_id)
        yield _sse_event("done", {"status": "rejected", "message": "Правка отклонена"})
        return

    if decision != "confirm":
        yield _sse_event("error", {"status": "bad_request", "error": "decision must be confirm or reject"})
        return

    # Загружаем актуальную сессию для CAS.
    try:
        session_data = monolith_client.get_session(session_id, token=token, org_id=org_id)
    except Exception as exc:
        yield _sse_event("error", {"status": "error", "error": f"failed to load session: {exc}"})
        return

    current_version = int(session_data.get("diagram_state_version") or 0)
    pending_base_version = int(pending.get("base_diagram_state_version") or 0)

    # Схема изменилась с момента предложения правки — не применяем.
    if pending_base_version != current_version:
        update_pending_edit_status(peid, "conflict_rev", resumed_by_user_id=user_id)
        yield _sse_event(
            "error",
            {
                "status": "conflict_rev",
                "error": "схема изменилась, перечитайте",
                "details": {
                    "pending_base_version": pending_base_version,
                    "server_current_version": current_version,
                },
            },
        )
        return

    try:
        result = apply_edit_plan(
            session_id=session_id,
            token=token,
            edit_plan=pending["edit_plan"],
            base_diagram_state_version=pending_base_version,
            org_id=org_id,
            create_snapshot=True,
        )
        update_pending_edit_status(peid, "applied", resumed_by_user_id=user_id)

        # Финальный ответ через agent_edit (primary).
        final_prompt = {
            "input": json.dumps(
                {
                    "result": result,
                    "edit_plan": pending["edit_plan"],
                    "user_decision": "confirm",
                },
                ensure_ascii=False,
            )
        }
        final_result = complete(
            EDIT_FEATURE,
            payload=final_prompt,
            user_id=user_id,
            project_id=str(session_data.get("project_id") or ""),
            session_id=session_id,
            org_id=org_id,
            max_tokens=600,
        )
        message = str(final_result.get("text") or "Правка применена")
        yield _sse_event("token", {"delta": message})
        yield _sse_event("done", {"status": "applied", "operations_applied": result.get("operations_applied", 0)})
    except EditApplyError as exc:
        if exc.status == "conflict_rev":
            update_pending_edit_status(peid, "conflict_rev", resumed_by_user_id=user_id)
            yield _sse_event("error", {"status": "conflict_rev", "error": str(exc), "details": exc.details})
        else:
            update_pending_edit_status(peid, "rejected", resumed_by_user_id=user_id)
            yield _sse_event("error", {"status": exc.status, "error": str(exc)})


@router.post("/sessions/{session_id}/agent/resume")
def agent_resume(session_id: str, body: ResumeIn, request: Request) -> StreamingResponse:
    ctx = _session_gate(session_id, request)
    return StreamingResponse(
        _resume_stream(
            session_id=session_id,
            user_id=ctx["user_id"],
            org_id=ctx["org_id"],
            payload=body,
            token=ctx["token"],
        ),
        media_type="text/event-stream",
    )
