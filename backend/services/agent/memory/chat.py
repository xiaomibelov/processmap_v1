"""Core turn execution for PROCESSMAN chat — КОПИЯ backend/app/agent/chat.py.

Отличия от монолитного оригинала (только границы, логика один в один):
- complete — из gateway.gateway сервиса (бывш. app.ai.gateway);
- action runners — HTTP к монолиту (runners.action_runners), вместо прямого
  вызова schema_assistant; вместо Request пробрасывается JWT (token);
- DTO — локальный schemas.py (копия app/schemas/agent_chat.py).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from typing import Any, Dict, Generator, List, Optional, Tuple

logger = logging.getLogger("agent.chat")

from edit import (
    build_human_diff,
    create_pending_edit,
    EditApplyError,
    propose_edit_plan,
    validate_edit_plan,
)
from gateway import llm_store
from gateway.gateway import complete, complete_cached, complete_stream
from runners.action_runners import run_explain_step, run_step_qa, run_suggest_next
from runners.monolith_client import get_session as monolith_get_session, search_rag
from schemas import AgentChatIn, AgentChatOut

from .context import AgentContext, load_context
from .memory_store import AgentTurn, append_turn, find_turn_by_client_id, get_or_create_conversation
from .prompt_builder import PromptBuilder
from .schema_memory import load_schema_memory, schedule_memory_update


FEATURE = "processman_agent"
EDIT_FEATURE = "agent_edit"
EDIT_PROPOSE_FEATURE = "agent_edit_propose"
MAX_TOKENS = 1200
ROUTER_FEATURE = "agent_router"
ROUTER_MAX_TOKENS = 200
SMALLTALK_MAX_TOKENS = 400
SCHEMA_OVERVIEW_MAX_TOKENS = 400
VALID_INTENTS = {"node_qa", "schema_overview", "doc_qa", "suggest_next", "smalltalk", "edit_canvas", "structured_fact_qa"}
# NOTE: new intent structured_fact_qa maps to model_class='cheap' in agent-model-routing-optimization-v1.


def _now_ms() -> int:
    import time

    return int(time.time())


def _to_json_text(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except Exception:
        return "{}"


def _search_rag_prioritized(
    q: str,
    session_id: str,
    token: str,
    org_id: str,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """Двухкруговой поиск: сначала чанки текущей сессии, потом глобальный корпус."""
    results: List[Dict[str, Any]] = []
    seen: set = set()

    def _result_key(r: Dict[str, Any], idx: int) -> str:
        cid = str(r.get("chunk_id") or "").strip()
        return cid if cid else f"__idx_{idx}"

    try:
        session_rag = search_rag(
            q,
            session_id,
            token,
            org_id=org_id,
            source_type="bpmn_xml",
            top_k=top_k,
            min_score=0.0,
        )
        for i, r in enumerate(list(session_rag.get("results") or [])):
            key = _result_key(r, i)
            if key not in seen:
                seen.add(key)
                results.append(r)
    except Exception:
        pass

    if len(results) < top_k:
        try:
            global_rag = search_rag(
                q,
                session_id,
                token,
                org_id=org_id,
                source_type="",
                top_k=top_k,
                min_score=0.0,
            )
            for i, r in enumerate(list(global_rag.get("results") or [])):
                key = _result_key(r, i)
                if key not in seen:
                    seen.add(key)
                    results.append(r)
        except Exception:
            pass

    return results[:top_k]


def _step_ids(projection: Dict[str, Any]) -> set:
    return {str(s.get("id") or "").strip() for s in (projection.get("steps") or []) if str(s.get("id") or "").strip()}


def _step_in_projection(projection: Dict[str, Any], step_id: Optional[str]) -> bool:
    return bool(str(step_id or "").strip()) and str(step_id).strip() in _step_ids(projection)


def _history_summary_for_router(history: List[AgentTurn], limit: int = 3) -> str:
    lines: List[str] = []
    for turn in history[-limit:]:
        text = str((turn.content or {}).get("text") or "").strip()
        if not text:
            continue
        prefix = "User" if turn.role == "user" else "Assistant"
        lines.append(f"{prefix}: {text[:200]}")
    return "\n".join(lines)


def _router_digest(question: str, projection_digest: str, selected_node_id: Optional[str]) -> str:
    key = "|".join([
        str(question or "").strip(),
        str(projection_digest or "").strip(),
        str(selected_node_id or "").strip(),
    ])
    return hashlib.md5(key.encode("utf-8")).hexdigest()


def _normalize_intent(text: Optional[str]) -> str:
    raw = str(text or "").strip().lower()
    # strip punctuation/markdown fences
    raw = re.sub(r"[^a-z0-9_\-]+", "", raw)
    if raw in VALID_INTENTS:
        return raw
    # accept hyphen variants
    aliases = {
        "nodeqa": "node_qa",
        "schemaoverview": "schema_overview",
        "overview": "schema_overview",
        "schema": "schema_overview",
        "docqa": "doc_qa",
        "documentation": "doc_qa",
        "suggestnext": "suggest_next",
        "next": "suggest_next",
        "editcanvas": "edit_canvas",
        "edit": "edit_canvas",
        "canvas": "edit_canvas",
        "smalltalk": "smalltalk",
        "chat": "smalltalk",
        "structuredfactqa": "structured_fact_qa",
        "structured_fact_qa": "structured_fact_qa",
        "factqa": "structured_fact_qa",
        "facts": "structured_fact_qa",
    }
    return aliases.get(raw, "smalltalk")


def route_intent(
    question: str,
    projection_digest: str,
    selected_node_id: Optional[str],
    history: List[AgentTurn],
    *,
    user_id: str = "",
    project_id: str = "",
    session_id: str = "",
    org_id: str = "org_default",
) -> str:
    """Cheap router: classify user question into one of VALID_INTENTS.

    Degrades to 'smalltalk' on any failure or unexpected output.
    """
    payload = {
        "input": json.dumps(
            {
                "question": str(question or "").strip(),
                "projection_digest": str(projection_digest or "").strip(),
                "selected_node_id": str(selected_node_id or "").strip(),
                "history_summary": _history_summary_for_router(history),
            },
            ensure_ascii=False,
        )
    }
    try:
        result = complete_cached(
            ROUTER_FEATURE,
            cache_digest=_router_digest(question, projection_digest, selected_node_id),
            payload=payload,
            user_id=user_id,
            project_id=project_id,
            session_id=session_id,
            org_id=org_id,
            max_tokens=ROUTER_MAX_TOKENS,
        )
        if not result.get("ok"):
            return "smalltalk"
        return _normalize_intent(str(result.get("text") or ""))
    except Exception:
        return "smalltalk"


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
    *,
    org_id: str = "",
) -> Optional[Dict[str, Any]]:
    """Execute a valid action or return None to degrade to free answer."""
    step_ids_set = _step_ids(ctx.projection)

    if action == "suggest-next":
        after_step_id = str(payload_obj.get("after_step_id") or "").strip()
        if after_step_id and after_step_id not in step_ids_set:
            return None
        return run_suggest_next(session_id, token, after_step_id=after_step_id, org_id=org_id)

    if action == "explain-step":
        step_id = str(payload_obj.get("step_id") or "").strip()
        if not step_id or step_id not in step_ids_set:
            return None
        return run_explain_step(session_id, token, step_id=step_id, org_id=org_id)

    if action == "step-qa":
        step_id = str(payload_obj.get("step_id") or "").strip()
        question = str(payload_obj.get("question") or "").strip() or user_message
        if not step_id or step_id not in step_ids_set:
            return None
        return run_step_qa(session_id, token, step_id=step_id, question=question, org_id=org_id)

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


def _persist_assistant_turn(
    session_id: str,
    user_id: str,
    org_id: str,
    message: str,
    usage: Dict[str, Any],
    ctx: AgentContext,
    *,
    client_turn_id: Optional[str] = None,
    action: Optional[str] = None,
    action_payload: Dict[str, Any] = None,
    now_ms: Optional[int] = None,
) -> Tuple[str, AgentChatOut]:
    turn_id = append_turn(
        session_id,
        user_id,
        org_id,
        role="assistant",
        content_json={"text": message},
        client_turn_id=client_turn_id,
        action=action,
        action_payload_json=(action_payload or {}),
        projection_digest=ctx.digest,
        usage_json=usage,
        now_ms=now_ms,
    )
    return turn_id, AgentChatOut(
        ok=True,
        status="ok",
        error="",
        message=message,
        action=action,
        action_payload=(action_payload or {}),
        usage=usage,
        projection_digest=ctx.digest,
    )


def _run_node_qa_branch(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    *,
    client_turn_id: Optional[str] = None,
) -> AgentChatOut:
    selected = str(payload.selected_step_id or "").strip()
    result = run_step_qa(
        session_id,
        token,
        step_id=selected,
        question=payload.message,
        org_id=org_id,
    )
    message = str(result.get("answer") or result.get("message") or result.get("note") or "")
    schedule_memory_update(session_id, org_id, ctx.digest, projection=ctx.projection)
    _, out = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=message,
        usage={},
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="step-qa",
        action_payload=result,
        now_ms=_now_ms(),
    )
    return out


def _run_suggest_next_branch(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    *,
    client_turn_id: Optional[str] = None,
) -> AgentChatOut:
    selected = str(payload.selected_step_id or "").strip()
    result = run_suggest_next(
        session_id,
        token,
        after_step_id=selected,
        org_id=org_id,
    )
    message = str(result.get("message") or result.get("note") or "")
    schedule_memory_update(session_id, org_id, ctx.digest, projection=ctx.projection)
    _, out = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=message,
        usage={},
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="suggest-next",
        action_payload=result,
        now_ms=_now_ms(),
    )
    return out


def _run_schema_overview_branch(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    *,
    client_turn_id: Optional[str] = None,
) -> AgentChatOut:
    memory = load_schema_memory(session_id, org_id)
    if memory and memory.get("projection_digest") == ctx.digest and memory.get("summary"):
        _, out = _persist_assistant_turn(
            session_id,
            user_id,
            org_id,
            message=memory["summary"],
            usage={"cached": True},
            ctx=ctx,
            client_turn_id=client_turn_id,
            action="schema_overview",
            action_payload={},
            now_ms=_now_ms(),
        )
        return out

    call_kwargs = PromptBuilder.build("schema_overview", ctx, payload)
    result = complete(
        FEATURE,
        payload=call_kwargs["payload"],
        user_id=user_id,
        project_id=str(getattr(ctx.session, "project_id", "") or ""),
        session_id=session_id,
        org_id=org_id,
        max_tokens=call_kwargs["max_tokens"],
        model_class=call_kwargs["model_class"],
    )
    usage = _usage_out(result)
    if not result.get("ok"):
        return _gateway_error_out(session_id, user_id, org_id, result, ctx, client_turn_id=client_turn_id)

    message = str(result.get("text") or "").strip()
    schedule_memory_update(session_id, org_id, ctx.digest, projection=ctx.projection)
    _, out = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=message,
        usage=usage,
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="schema_overview",
        action_payload={},
        now_ms=_now_ms(),
    )
    return out


def _run_doc_qa_branch(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    *,
    client_turn_id: Optional[str] = None,
) -> AgentChatOut:
    try:
        results = _search_rag_prioritized(
            payload.message,
            session_id,
            token,
            org_id=org_id,
            top_k=5,
        )
    except Exception:
        results = []

    if not results:
        return _run_free_answer_branch(
            payload, ctx, session_id, user_id, org_id, token,
            client_turn_id=client_turn_id, intent="doc_qa_fallback",
        )

    call_kwargs = PromptBuilder.build("doc_qa", ctx, payload, rag_results=results)
    result = complete(
        FEATURE,
        payload=call_kwargs["payload"],
        user_id=user_id,
        project_id=str(getattr(ctx.session, "project_id", "") or ""),
        session_id=session_id,
        org_id=org_id,
        max_tokens=call_kwargs["max_tokens"],
        model_class=call_kwargs["model_class"],
    )
    usage = _usage_out(result)
    if not result.get("ok"):
        return _gateway_error_out(session_id, user_id, org_id, result, ctx, client_turn_id=client_turn_id)

    schedule_memory_update(session_id, org_id, ctx.digest, projection=ctx.projection)
    _, out = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=str(result.get("text") or ""),
        usage=usage,
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="doc_qa",
        action_payload={"results_count": len(results)},
        now_ms=_now_ms(),
    )
    return out


def _detect_structured_fact_source_type(question: str) -> str:
    """Pick the most likely RAG corpus for a structured-fact question."""
    q = str(question or "").lower()
    property_hints = {"свойств", "значен", "допустим", "применим", "свойство", "поле", "атрибут"}
    operation_hints = {"операци", "параметр", "предуслови", "постуслови", "ресурс", "выполнен"}
    glossary_hints = {"что такое", "термин", "единица измерен", "оборудован", "ресурс"}
    property_score = sum(1 for h in property_hints if h in q)
    operation_score = sum(1 for h in operation_hints if h in q)
    glossary_score = sum(1 for h in glossary_hints if h in q)
    if glossary_score > 0 and "операци" not in q:
        return "glossary"
    if operation_score > property_score:
        return "operation_catalog"
    return "property_dictionary"


def _search_rag_for_structured_fact(
    question: str,
    session_id: str,
    token: str,
    org_id: str,
    source_type: str,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """Search a specific corpus, falling back to global RAG if no results."""
    try:
        resp = search_rag(
            question,
            session_id,
            token,
            org_id=org_id,
            source_type=source_type,
            top_k=top_k,
            min_score=0.0,
        )
        results = list(resp.get("results") or [])
        if results:
            return results
    except Exception:
        pass
    try:
        resp = search_rag(
            question,
            session_id,
            token,
            org_id=org_id,
            source_type="",
            top_k=top_k,
            min_score=0.0,
        )
        return list(resp.get("results") or [])
    except Exception:
        return []


def _build_structured_fact_prompt(question: str, chunks: List[Dict[str, Any]]) -> str:
    chunks_text = "\n---\n".join(
        str(r.get("chunk_text") or r.get("chunk") or "").strip() for r in chunks[:5]
    )
    return (
        "Ответь на вопрос пользователя на основе предоставленных фактов из справочников. "
        "Отвечай на русском языке. Если ответа нет в фактах, скажи об этом.\n\n"
        f"Факты:\n{chunks_text}\n\n"
        f"Вопрос: {question}"
    )


def _run_structured_fact_qa_branch(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    *,
    client_turn_id: Optional[str] = None,
) -> AgentChatOut:
    source_type = _detect_structured_fact_source_type(payload.message)
    results = _search_rag_for_structured_fact(
        payload.message,
        session_id,
        token,
        org_id=org_id,
        source_type=source_type,
        top_k=5,
    )
    if not results:
        return _run_free_answer_branch(
            payload, ctx, session_id, user_id, org_id, token, client_turn_id=client_turn_id
        )

    prompt_text = _build_structured_fact_prompt(payload.message, results)
    result = complete(
        FEATURE,
        payload={"input": prompt_text},
        user_id=user_id,
        project_id=str(getattr(ctx.session, "project_id", "") or ""),
        session_id=session_id,
        org_id=org_id,
        max_tokens=MAX_TOKENS,
    )
    usage = _usage_out(result)
    if not result.get("ok"):
        return _gateway_error_out(session_id, user_id, org_id, result, ctx, client_turn_id=client_turn_id)

    schedule_memory_update(session_id, org_id, ctx.digest, projection=ctx.projection)
    _, out = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=str(result.get("text") or ""),
        usage=usage,
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="structured_fact_qa",
        action_payload={"results_count": len(results), "source_type": source_type},
        now_ms=_now_ms(),
    )
    return out


def _run_free_answer_branch(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    *,
    client_turn_id: Optional[str] = None,
    intent: str = "smalltalk",
) -> AgentChatOut:
    """Smalltalk / free-answer fallback. Preserves AGENT-0 action-JSON fallback."""
    call_kwargs = PromptBuilder.build(intent, ctx, payload)
    result = complete(
        FEATURE,
        payload=call_kwargs["payload"],
        user_id=user_id,
        project_id=str(getattr(ctx.session, "project_id", "") or ""),
        session_id=session_id,
        org_id=org_id,
        max_tokens=call_kwargs["max_tokens"],
        model_class=call_kwargs["model_class"],
    )

    usage = _usage_out(result)

    if not result.get("ok"):
        return _gateway_error_out(session_id, user_id, org_id, result, ctx, client_turn_id=client_turn_id)

    llm_text = str(result.get("text") or "")
    action_obj = _extract_json_block(llm_text)

    action_name: Optional[str] = None
    action_payload: Dict[str, Any] = {}
    assistant_message = llm_text

    if action_obj and isinstance(action_obj, dict):
        possible_action = str(action_obj.get("action") or "").strip()
        if possible_action in {"suggest-next", "explain-step", "step-qa"}:
            action_result = _run_action(possible_action, action_obj, session_id, token, ctx, payload.message, org_id=org_id)
            if action_result is not None:
                action_name = possible_action
                action_payload = action_result
                assistant_message = str(action_result.get("message") or action_result.get("note") or llm_text)

    _, out = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=assistant_message,
        usage=usage,
        ctx=ctx,
        client_turn_id=client_turn_id,
        action=action_name,
        action_payload=action_payload,
        now_ms=_now_ms(),
    )

    return out


def _edit_feature_enabled(org_id: str) -> Optional[str]:
    """Проверить, что agent_edit разрешён. Вернуть error или None."""
    flag = llm_store.get_feature_flag(EDIT_FEATURE)
    if flag is not None and not flag.get("enabled"):
        return "feature 'agent_edit' is disabled"
    if flag is not None:
        limit = int(flag.get("daily_token_limit") or 0)
        if limit > 0:
            used = llm_store.usage_daily_tokens(EDIT_FEATURE, org_id, int(_now_ms()) - 24 * 3600)
            if used >= limit:
                return f"daily token limit reached ({used}/{limit})"
    return None


def _run_edit_canvas_branch(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    *,
    client_turn_id: Optional[str] = None,
) -> AgentChatOut:
    """Непотоковая ветка edit_canvas: возвращает action='edit_canvas' с diff."""
    disabled = _edit_feature_enabled(org_id)
    if disabled:
        _, out = _persist_assistant_turn(
            session_id,
            user_id,
            org_id,
            message=disabled,
            usage={},
            ctx=ctx,
            client_turn_id=client_turn_id,
            action="edit_canvas",
            action_payload={"status": "disabled"},
            now_ms=_now_ms(),
        )
        return out

    edit_plan, meta = propose_edit_plan(
        question=payload.message,
        projection=ctx.projection,
        token=token,
        session_id=session_id,
        org_id=org_id,
        user_id=user_id,
        project_id=str(getattr(ctx.session, "project_id", "") or ""),
        selected_node_id=payload.selected_step_id,
    )

    if edit_plan is None:
        message = str(meta.get("error") or "Не удалось составить план правок")
        _, out = _persist_assistant_turn(
            session_id,
            user_id,
            org_id,
            message=message,
            usage={},
            ctx=ctx,
            client_turn_id=client_turn_id,
            action="edit_canvas",
            action_payload={"status": meta.get("status", "error"), "validation_errors": meta.get("validation_errors", [])},
            now_ms=_now_ms(),
        )
        return out

    # Валидируем ещё раз перед сохранением.
    validation_errors = validate_edit_plan(edit_plan, ctx.projection, token, session_id, org_id=org_id)
    if validation_errors:
        _, out = _persist_assistant_turn(
            session_id,
            user_id,
            org_id,
            message="Не удалось составить корректный план правок",
            usage={},
            ctx=ctx,
            client_turn_id=client_turn_id,
            action="edit_canvas",
            action_payload={"status": "edit_plan_failed", "validation_errors": validation_errors},
            now_ms=_now_ms(),
        )
        return out

    turn_id, assistant_turn = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=str(edit_plan.get("note") or "Агент предлагает изменить схему"),
        usage={},
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="edit_canvas",
        action_payload={"edit_plan": edit_plan, "status": "pending_confirmation"},
        now_ms=_now_ms(),
    )

    pending_id = create_pending_edit(
        session_id=session_id,
        org_id=org_id,
        turn_id=turn_id,
        edit_plan=edit_plan,
        base_diagram_state_version=getattr(ctx.session, "diagram_state_version", 0),
        now_ms=_now_ms(),
    )

    _, out = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=str(edit_plan.get("note") or "Агент предлагает изменить схему"),
        usage={},
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="edit_canvas",
        action_payload={
            "pending_edit_id": pending_id,
            "edit_plan": edit_plan,
            "diff": build_human_diff(edit_plan),
            "timeout_sec": 900,
            "status": "pending_confirmation",
        },
        now_ms=_now_ms(),
    )

    return out


def _run_edit_canvas_branch_stream(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    stream_id: str,
    client_turn_id: Optional[str],
) -> Generator[Tuple[str, Dict[str, Any]], None, None]:
    """Streaming ветка edit_canvas: yield confirm_required и не завершает turn.

    stream_id — только для события start; реальный turn_id для БД берётся из
    _persist_assistant_turn, чтобы FK agent_pending_edits.turn_id не нарушался.
    """
    disabled = _edit_feature_enabled(org_id)
    if disabled:
        _ = _persist_assistant_turn(
            session_id, user_id, org_id,
            message=disabled, usage={}, ctx=ctx,
            client_turn_id=client_turn_id, action="edit_canvas",
            action_payload={"status": "disabled"}, now_ms=_now_ms(),
        )
        yield ("error", {"status": "disabled", "error": disabled})
        return

    edit_plan, meta = propose_edit_plan(
        question=payload.message,
        projection=ctx.projection,
        token=token,
        session_id=session_id,
        org_id=org_id,
        user_id=user_id,
        project_id=str(getattr(ctx.session, "project_id", "") or ""),
        selected_node_id=payload.selected_step_id,
    )

    if edit_plan is None:
        message = str(meta.get("error") or "Не удалось составить план правок")
        _ = _persist_assistant_turn(
            session_id, user_id, org_id,
            message=message, usage={}, ctx=ctx,
            client_turn_id=client_turn_id, action="edit_canvas",
            action_payload={"status": meta.get("status", "error"), "validation_errors": meta.get("validation_errors", [])},
            now_ms=_now_ms(),
        )
        yield ("error", {"status": meta.get("status", "error"), "error": message})
        return

    validation_errors = validate_edit_plan(edit_plan, ctx.projection, token, session_id, org_id=org_id)
    if validation_errors:
        _ = _persist_assistant_turn(
            session_id, user_id, org_id,
            message="Не удалось составить корректный план правок", usage={}, ctx=ctx,
            client_turn_id=client_turn_id, action="edit_canvas",
            action_payload={"status": "edit_plan_failed", "validation_errors": validation_errors},
            now_ms=_now_ms(),
        )
        yield ("error", {"status": "edit_plan_failed", "error": "Не удалось составить корректный план правок"})
        return

    assistant_message = str(edit_plan.get("note") or "Агент предлагает изменить схему")
    assistant_turn_id, _ = _persist_assistant_turn(
        session_id, user_id, org_id,
        message=assistant_message, usage={}, ctx=ctx,
        client_turn_id=client_turn_id, action="edit_canvas",
        action_payload={"edit_plan": edit_plan, "status": "pending_confirmation"},
        now_ms=_now_ms(),
    )

    pending_id = create_pending_edit(
        session_id=session_id,
        org_id=org_id,
        turn_id=assistant_turn_id,
        edit_plan=edit_plan,
        base_diagram_state_version=getattr(ctx.session, "diagram_state_version", 0),
        now_ms=_now_ms(),
    )

    yield ("token", {"delta": assistant_message + "\n\n"})
    yield (
        "confirm_required",
        {
            "pending_edit_id": pending_id,
            "edit_plan": edit_plan,
            "diff": build_human_diff(edit_plan),
            "timeout_sec": 900,
        },
    )


def _run_structured_fact_qa_branch_stream(
    payload: AgentChatIn,
    ctx: AgentContext,
    session_id: str,
    user_id: str,
    org_id: str,
    token: str,
    stream_id: str,
    client_turn_id: Optional[str],
) -> Generator[Tuple[str, Dict[str, Any]], None, None]:
    """Streaming variant of structured_fact_qa."""
    project_id = str(getattr(ctx.session, "project_id", "") or "")
    source_type = _detect_structured_fact_source_type(payload.message)
    results = _search_rag_for_structured_fact(
        payload.message,
        session_id,
        token,
        org_id=org_id,
        source_type=source_type,
        top_k=5,
    )
    if not results:
        yield from _run_free_answer_branch_stream(
            payload, ctx, session_id, user_id, org_id, token, client_turn_id=client_turn_id
        )
        return

    prompt_text = _build_structured_fact_prompt(payload.message, results)
    collected_text = ""
    final_usage: Dict[str, Any] = {}
    stream_error: Optional[Dict[str, Any]] = None

    for event_type, event_data in complete_stream(
        FEATURE,
        payload={"input": prompt_text},
        user_id=user_id,
        project_id=project_id,
        session_id=session_id,
        org_id=org_id,
        max_tokens=MAX_TOKENS,
    ):
        if event_type == "token":
            delta = str(event_data.get("delta") or "")
            collected_text += delta
            yield ("token", {"delta": delta})
        elif event_type == "error":
            stream_error = event_data
            break
        elif event_type == "usage":
            final_usage = {
                "prompt_tokens": int(event_data.get("usage", {}).get("prompt_tokens", 0)),
                "completion_tokens": int(event_data.get("usage", {}).get("completion_tokens", 0)),
                "provider_id": str(event_data.get("provider_id") or ""),
                "model": str(event_data.get("model") or ""),
                "prompt_version": int(event_data.get("prompt_version") or 0),
                "fallback": bool(event_data.get("fallback")),
                "cached": False,
            }

    if stream_error is not None:
        text = f"[{stream_error.get('status')}] {stream_error.get('error', '')}"
        _ = _persist_assistant_turn(
            session_id,
            user_id,
            org_id,
            message=text,
            usage=final_usage,
            ctx=ctx,
            client_turn_id=client_turn_id,
            action="structured_fact_qa",
            action_payload={"status": "error"},
            now_ms=_now_ms(),
        )
        yield ("error", {"status": stream_error.get("status"), "error": stream_error.get("error", "")})
        return

    schedule_memory_update(session_id, org_id, ctx.digest, projection=ctx.projection)
    _ = _persist_assistant_turn(
        session_id,
        user_id,
        org_id,
        message=collected_text,
        usage=final_usage,
        ctx=ctx,
        client_turn_id=client_turn_id,
        action="structured_fact_qa",
        action_payload={"results_count": len(results), "source_type": source_type},
        now_ms=_now_ms(),
    )
    yield ("done", {"usage": final_usage, "projection_digest": ctx.digest})


def _gateway_error_out(
    session_id: str,
    user_id: str,
    org_id: str,
    result: Dict[str, Any],
    ctx: AgentContext,
    *,
    client_turn_id: Optional[str] = None,
) -> AgentChatOut:
    status = str(result.get("status") or "error")
    error_text = str(result.get("error") or "")
    assistant_text = f"[{status}] {error_text}" if error_text else status
    usage = _usage_out(result)
    append_turn(
        session_id,
        user_id,
        org_id,
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

    project_id = str(getattr(ctx.session, "project_id", "") or "")
    intent = route_intent(
        payload.message,
        ctx.digest,
        payload.selected_step_id,
        ctx.history,
        user_id=uid,
        project_id=project_id,
        session_id=sid,
        org_id=oid,
    )

    if intent == "node_qa" and _step_in_projection(ctx.projection, payload.selected_step_id):
        return _run_node_qa_branch(payload, ctx, sid, uid, oid, token, client_turn_id=client_turn_id)

    if intent == "schema_overview":
        return _run_schema_overview_branch(payload, ctx, sid, uid, oid, token, client_turn_id=client_turn_id)

    if intent == "doc_qa":
        return _run_doc_qa_branch(payload, ctx, sid, uid, oid, token, client_turn_id=client_turn_id)

    if intent == "structured_fact_qa":
        return _run_structured_fact_qa_branch(payload, ctx, sid, uid, oid, token, client_turn_id=client_turn_id)

    if intent == "suggest_next" and _step_in_projection(ctx.projection, payload.selected_step_id):
        return _run_suggest_next_branch(payload, ctx, sid, uid, oid, token, client_turn_id=client_turn_id)

    if intent == "edit_canvas":
        return _run_edit_canvas_branch(payload, ctx, sid, uid, oid, token, client_turn_id=client_turn_id)

    return _run_free_answer_branch(payload, ctx, sid, uid, oid, token, client_turn_id=client_turn_id)


def run_turn_stream(
    session_id: str,
    user_id: str,
    org_id: str,
    payload: AgentChatIn,
    *,
    token: str = "",
    session_row: Optional[Dict[str, Any]] = None,
) -> Generator[Tuple[str, Dict[str, Any]], None, None]:
    """Streaming variant of run_turn. Yields SSE event tuples (type, payload)."""
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"

    ctx = load_context(sid, uid, oid, token=token, session_row=session_row, history_limit=50)
    conv_id = get_or_create_conversation(sid, uid, oid, now_ms=_now_ms())

    client_turn_id = (str(payload.client_turn_id).strip() if payload.client_turn_id else None)
    if client_turn_id:
        existing = find_turn_by_client_id(conv_id, client_turn_id)
        if existing:
            yield ("done", {"message": str((existing.content or {}).get("text") or "")})
            return

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

    project_id = str(getattr(ctx.session, "project_id", "") or "")
    stream_id = f"stream_{uuid.uuid4().hex[:12]}"
    yield ("start", {"turn_id": stream_id})

    intent = route_intent(
        payload.message,
        ctx.digest,
        payload.selected_step_id,
        ctx.history,
        user_id=uid,
        project_id=project_id,
        session_id=sid,
        org_id=oid,
    )

    def _finish(text: str, usage: Dict[str, Any], action: Optional[str] = None, action_payload: Dict[str, Any] = None) -> None:
        _ = _persist_assistant_turn(
            sid,
            uid,
            oid,
            message=text,
            usage=usage,
            ctx=ctx,
            client_turn_id=client_turn_id,
            action=action,
            action_payload=(action_payload or {}),
            now_ms=_now_ms(),
        )
        yield ("done", {"usage": usage, "projection_digest": ctx.digest})

    if intent == "node_qa" and _step_in_projection(ctx.projection, payload.selected_step_id):
        result = run_step_qa(sid, token, step_id=str(payload.selected_step_id), question=payload.message, org_id=oid)
        message = str(result.get("answer") or result.get("message") or result.get("note") or "")
        yield from _finish(message, {}, action="step-qa", action_payload=result)
        yield ("action", {"action": "step-qa", "payload": result})
        return

    if intent == "suggest_next" and _step_in_projection(ctx.projection, payload.selected_step_id):
        result = run_suggest_next(sid, token, after_step_id=str(payload.selected_step_id), org_id=oid)
        message = str(result.get("message") or result.get("note") or "")
        yield from _finish(message, {}, action="suggest-next", action_payload=result)
        yield ("action", {"action": "suggest-next", "payload": result})
        return

    if intent == "edit_canvas":
        yield from _run_edit_canvas_branch_stream(
            payload, ctx, sid, uid, oid, token, stream_id, client_turn_id
        )
        return

    if intent == "structured_fact_qa":
        yield from _run_structured_fact_qa_branch_stream(
            payload, ctx, sid, uid, oid, token, stream_id, client_turn_id
        )
        return

    if intent == "schema_overview":
        memory = load_schema_memory(sid, oid)
        if memory and memory.get("projection_digest") == ctx.digest and memory.get("summary"):
            yield ("token", {"delta": memory["summary"]})
            yield from _finish(memory["summary"], {"cached": True}, action="schema_overview")
            return

    if intent == "schema_overview":
        schedule_memory_update(sid, oid, ctx.digest)

    if intent == "doc_qa":
        try:
            results = _search_rag_prioritized(payload.message, sid, token, org_id=oid, top_k=5)
        except Exception:
            results = []
        stream_intent = "doc_qa" if results else "doc_qa_fallback"
        call_kwargs = PromptBuilder.build(stream_intent, ctx, payload, rag_results=results or [])
    else:
        call_kwargs = PromptBuilder.build(intent, ctx, payload)

    collected_text = ""
    final_usage: Dict[str, Any] = {}
    stream_error: Optional[Dict[str, Any]] = None

    for event_type, event_data in complete_stream(
        FEATURE,
        payload=call_kwargs["payload"],
        user_id=uid,
        project_id=project_id,
        session_id=sid,
        org_id=oid,
        max_tokens=call_kwargs["max_tokens"],
        model_class=call_kwargs["model_class"],
    ):
        if event_type == "token":
            delta = str(event_data.get("delta") or "")
            collected_text += delta
            yield ("token", {"delta": delta})
        elif event_type == "error":
            stream_error = event_data
            break
        elif event_type == "usage":
            final_usage = {
                "prompt_tokens": int(event_data.get("usage", {}).get("prompt_tokens", 0)),
                "completion_tokens": int(event_data.get("usage", {}).get("completion_tokens", 0)),
                "provider_id": str(event_data.get("provider_id") or ""),
                "model": str(event_data.get("model") or ""),
                "prompt_version": int(event_data.get("prompt_version") or 0),
                "fallback": bool(event_data.get("fallback")),
                "cached": False,
            }

    if stream_error is not None:
        text = f"[{stream_error.get('status')}] {stream_error.get('error', '')}"
        provider_id = stream_error.get("provider_id") or final_usage.get("provider_id") or ""
        model_name = stream_error.get("model") or final_usage.get("model") or ""
        logger.warning(
            "processman stream error session=%s provider=%s model=%s status=%s error=%s",
            sid,
            provider_id,
            model_name,
            stream_error.get("status"),
            stream_error.get("error", ""),
        )
        _ = _persist_assistant_turn(
            sid,
            uid,
            oid,
            message=text,
            usage=final_usage,
            ctx=ctx,
            client_turn_id=client_turn_id,
            action=None,
            action_payload={},
            now_ms=_now_ms(),
        )
        yield (
            "error",
            {
                "status": stream_error.get("status"),
                "error": stream_error.get("error", ""),
                "provider_id": provider_id,
                "model": model_name,
            },
        )
        return

    # AGENT-0 action-JSON fallback preserved for streaming free-answer.
    action_name: Optional[str] = None
    action_payload: Dict[str, Any] = {}
    assistant_message = collected_text
    if intent in {"smalltalk", "doc_qa"}:
        action_obj = _extract_json_block(collected_text)
        if action_obj and isinstance(action_obj, dict):
            possible_action = str(action_obj.get("action") or "").strip()
            if possible_action in {"suggest-next", "explain-step", "step-qa"}:
                action_result = _run_action(possible_action, action_obj, sid, token, ctx, payload.message, org_id=oid)
                if action_result is not None:
                    action_name = possible_action
                    action_payload = action_result
                    assistant_message = str(action_result.get("message") or action_result.get("note") or collected_text)
                    yield ("action", {"action": action_name, "payload": action_payload})

    _ = _persist_assistant_turn(
        sid,
        uid,
        oid,
        message=assistant_message,
        usage=final_usage,
        ctx=ctx,
        client_turn_id=client_turn_id,
        action=action_name,
        action_payload=action_payload,
        now_ms=_now_ms(),
    )
    yield ("done", {"usage": final_usage, "projection_digest": ctx.digest})
