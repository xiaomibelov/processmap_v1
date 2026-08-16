"""Core turn execution for PROCESSMAN chat — КОПИЯ backend/app/agent/chat.py.

Отличия от монолитного оригинала (только границы, логика один в один):
- complete — из gateway.gateway сервиса (бывш. app.ai.gateway);
- action runners — HTTP к монолиту (runners.action_runners), вместо прямого
  вызова schema_assistant; вместо Request пробрасывается JWT (token);
- DTO — локальный schemas.py (копия app/schemas/agent_chat.py).
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from gateway.gateway import complete
from runners.action_runners import run_explain_step, run_step_qa, run_suggest_next
from schemas import AgentChatIn, AgentChatOut

from .context import AgentContext, load_context
from .memory_store import AgentTurn, append_turn, find_turn_by_client_id, get_or_create_conversation


FEATURE = "processman_agent"
MAX_TOKENS = 1200


def _now_ms() -> int:
    import time

    return int(time.time())


def _to_json_text(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except Exception:
        return "{}"


def _step_ids(projection: Dict[str, Any]) -> set:
    return {str(s.get("id") or "").strip() for s in (projection.get("steps") or []) if str(s.get("id") or "").strip()}


def _format_history_for_prompt(history: List[AgentTurn], current_digest: str) -> str:
    lines: List[str] = []
    for turn in history:
        role_label = "User" if turn.role == "user" else "Assistant"
        text = str((turn.content or {}).get("text") or "")
        if not text:
            continue
        stale_note = ""
        if turn.projection_digest and turn.projection_digest != current_digest:
            stale_note = " (схема с тех пор изменилась)"
        lines.append(f"{role_label}{stale_note}: {text}")
    return "\n".join(lines)


def _build_user_prompt(ctx: AgentContext, payload: AgentChatIn) -> str:
    projection_text = _to_json_text(ctx.projection)
    history_text = _format_history_for_prompt(ctx.history, ctx.digest)
    parts = [
        "=== BPMN-схема ===",
        projection_text,
    ]
    if history_text:
        parts.append("=== История диалога ===")
        parts.append(history_text)
    selected = str(payload.selected_step_id or "").strip()
    if selected:
        parts.append(f"Выбранный шаг: {selected}")
    parts.append(f"Сообщение пользователя: {payload.message}")
    return "\n\n".join(parts)


def _extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    raw = str(text or "").strip()
    if not raw:
        return None
    # Try markdown code block first.
    block_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if block_match:
        candidate = block_match.group(1).strip()
    else:
        # Fall back to first { ... } object.
        obj_match = re.search(r"\{[\s\S]*\}", raw)
        candidate = obj_match.group(0).strip() if obj_match else raw
    try:
        return json.loads(candidate)
    except Exception:
        return None


def _usage_out(result: Dict[str, Any]) -> Dict[str, Any]:
    usage = result.get("usage") or {}
    return {
        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
        "completion_tokens": int(usage.get("completion_tokens") or 0),
        "provider_id": str(result.get("provider_id") or ""),
        "model": str(result.get("model") or ""),
        "prompt_version": int(result.get("prompt_version") or 0),
        "fallback": bool(result.get("fallback")),
        "cached": bool(result.get("cached")),
    }


def _run_action(
    action: str,
    payload_obj: Dict[str, Any],
    session_id: str,
    token: str,
    ctx: AgentContext,
    user_message: str,
) -> Optional[Dict[str, Any]]:
    """Execute a valid action or return None to degrade to free answer."""
    step_ids_set = _step_ids(ctx.projection)

    if action == "suggest-next":
        after_step_id = str(payload_obj.get("after_step_id") or "").strip()
        if after_step_id and after_step_id not in step_ids_set:
            return None
        return run_suggest_next(session_id, token, after_step_id=after_step_id)

    if action == "explain-step":
        step_id = str(payload_obj.get("step_id") or "").strip()
        if not step_id or step_id not in step_ids_set:
            return None
        return run_explain_step(session_id, token, step_id=step_id)

    if action == "step-qa":
        step_id = str(payload_obj.get("step_id") or "").strip()
        question = str(payload_obj.get("question") or "").strip() or user_message
        if not step_id or step_id not in step_ids_set:
            return None
        return run_step_qa(session_id, token, step_id=step_id, question=question)

    return None


def _persisted_answer_from_turn(turn: AgentTurn) -> AgentChatOut:
    return AgentChatOut(
        ok=True,
        status="ok",
        error="",
        message=str((turn.content or {}).get("text") or ""),
        action=turn.action,
        action_payload=turn.action_payload or {},
        usage=turn.usage or {},
        projection_digest=turn.projection_digest or "",
    )


def run_turn(
    session_id: str,
    user_id: str,
    org_id: str,
    payload: AgentChatIn,
    *,
    token: str = "",
    session_row: Optional[Dict[str, Any]] = None,
) -> AgentChatOut:
    """Execute one chat turn with durable memory."""
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"

    ctx = load_context(sid, uid, oid, token=token, session_row=session_row, history_limit=50)
    conv_id = get_or_create_conversation(sid, uid, oid, now_ms=_now_ms())

    # Idempotency: same client_turn_id -> return existing turn without LLM call.
    client_turn_id = (str(payload.client_turn_id).strip() if payload.client_turn_id else None)
    if client_turn_id:
        existing = find_turn_by_client_id(conv_id, client_turn_id)
        if existing:
            return _persisted_answer_from_turn(existing)

    # Persist user turn.
    append_turn(
        sid,
        uid,
        oid,
        role="user",
        content_json={"text": payload.message, "selected_step_id": payload.selected_step_id},
        client_turn_id=client_turn_id,
        projection_digest=ctx.digest,
        now_ms=_now_ms(),
    )

    user_prompt_text = _build_user_prompt(ctx, payload)
    result = complete(
        FEATURE,
        payload={"input": user_prompt_text},
        user_id=uid,
        project_id=str(getattr(ctx.session, "project_id", "") or ""),
        session_id=sid,
        org_id=oid,
        max_tokens=MAX_TOKENS,
    )

    usage = _usage_out(result)

    # Handle gateway-level non-ok statuses: still persist assistant turn for retry context.
    if not result.get("ok"):
        status = str(result.get("status") or "error")
        error_text = str(result.get("error") or "")
        assistant_text = f"[{status}] {error_text}" if error_text else status
        append_turn(
            sid,
            uid,
            oid,
            role="assistant",
            content_json={"text": assistant_text, "status": status},
            client_turn_id=client_turn_id,
            projection_digest=ctx.digest,
            usage_json=usage,
            now_ms=_now_ms(),
        )
        return AgentChatOut(
            ok=False,
            status=status,
            error=error_text,
            message=assistant_text,
            usage=usage,
            projection_digest=ctx.digest,
        )

    llm_text = str(result.get("text") or "")
    action_obj = _extract_json_block(llm_text)

    action_name: Optional[str] = None
    action_payload: Dict[str, Any] = {}
    assistant_message = llm_text

    if action_obj and isinstance(action_obj, dict):
        possible_action = str(action_obj.get("action") or "").strip()
        if possible_action in {"suggest-next", "explain-step", "step-qa"}:
            action_result = _run_action(possible_action, action_obj, sid, token, ctx, payload.message)
            if action_result is not None:
                action_name = possible_action
                action_payload = action_result
                assistant_message = str(action_result.get("message") or action_result.get("note") or llm_text)

    append_turn(
        sid,
        uid,
        oid,
        role="assistant",
        content_json={"text": assistant_message},
        client_turn_id=client_turn_id,
        action=action_name,
        action_payload_json=action_payload,
        projection_digest=ctx.digest,
        usage_json=usage,
        now_ms=_now_ms(),
    )

    return AgentChatOut(
        ok=True,
        status="ok",
        error="",
        message=assistant_message,
        action=action_name,
        action_payload=action_payload,
        usage=usage,
        projection_digest=ctx.digest,
    )
