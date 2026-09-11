from __future__ import annotations

import copy
import logging
import time
from typing import Any, Dict, List, Optional, Set

from fastapi import Request

from .ai.execution_log import record_ai_execution
from .models import Question, Session
from .schemas.legacy_api import AiQuestionsIn
from .services.session_recompute import _recompute_session
from .sessions_core import _session_api_dump
from .shared.coerce import _llm_question_status_to_interview
from .storage import Storage, get_default_org_id, get_storage
from .utils.session_helpers import _resolve_actor_context


def _merge_interview_analysis_namespace(existing_raw: Any, incoming_raw: Any) -> Optional[Dict[str, Any]]:
    existing = existing_raw if isinstance(existing_raw, dict) else {}
    incoming = incoming_raw if isinstance(incoming_raw, dict) else {}
    existing_analysis = existing.get("analysis")
    incoming_has_analysis = "analysis" in incoming
    existing_obj = copy.deepcopy(existing_analysis) if isinstance(existing_analysis, dict) else None
    if not incoming_has_analysis:
        return existing_obj
    incoming_analysis = incoming.get("analysis")
    if not isinstance(incoming_analysis, dict):
        return existing_obj
    out: Dict[str, Any] = existing_obj or {}
    out.update(copy.deepcopy(incoming_analysis))
    return out


def _preserve_current_interview_analysis_before_save(
    st: Storage,
    sess: Session,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> None:
    sid = str(getattr(sess, "id", "") or "").strip()
    if not sid:
        return
    current = st.load(sid, org_id=org_id, is_admin=is_admin)
    if not current:
        return
    analysis = _merge_interview_analysis_namespace(
        getattr(sess, "interview", {}),
        getattr(current, "interview", {}),
    )
    interview = dict(getattr(sess, "interview", {}) or {})
    if analysis is not None:
        interview["analysis"] = analysis
    else:
        interview.pop("analysis", None)
    sess.interview = interview


def _collect_node_llm_questions(s: Session, node_id: str) -> List[Question]:
    nid = str(node_id or "").strip()
    if not nid:
        return []
    return [
        q
        for q in (s.questions or [])
        if str(getattr(q, "id", "") or "").startswith("llm_")
        and str(getattr(q, "node_id", "") or "").strip() == nid
    ]


def _prune_node_llm_questions(s: Session, node_id: str, keep_max: int = 5) -> List[Question]:
    nid = str(node_id or "").strip()
    if not nid:
        return []
    keep = max(int(keep_max or 0), 1)
    kept_for_node: List[Question] = []
    next_questions: List[Question] = []
    for q in (s.questions or []):
        is_node_llm = str(getattr(q, "id", "") or "").startswith("llm_") and str(getattr(q, "node_id", "") or "").strip() == nid
        if not is_node_llm:
            next_questions.append(q)
            continue
        if len(kept_for_node) < keep:
            kept_for_node.append(q)
            next_questions.append(q)
    s.questions = next_questions
    return kept_for_node


def _sync_interview_ai_questions_for_node(
    s: Session,
    node_id: str,
    *,
    preferred_step_id: str = "",
    keep_max: int = 5,
) -> Dict[str, Any]:
    nid = str(node_id or "").strip()
    preferred_sid = str(preferred_step_id or "").strip()
    keep = max(int(keep_max or 0), 1)

    iv = dict(getattr(s, "interview", {}) or {})
    steps = iv.get("steps")
    if not isinstance(steps, list):
        steps = []

    step_ids: List[str] = []
    seen_sid: Set[str] = set()

    def _add_step_id(sid: str) -> None:
        sid = str(sid or "").strip()
        if not sid or sid in seen_sid:
            return
        seen_sid.add(sid)
        step_ids.append(sid)

    if preferred_sid:
        _add_step_id(preferred_sid)

    for st in steps:
        if not isinstance(st, dict):
            continue
        sid = str(st.get("id") or "").strip()
        st_node = str(st.get("node_id") or st.get("nodeId") or "").strip()
        if not sid:
            continue
        if nid and st_node == nid:
            _add_step_id(sid)

    llm_for_node = _collect_node_llm_questions(s, nid)[:keep]
    normalized_items: List[Dict[str, Any]] = []
    for q in llm_for_node:
        txt = str(getattr(q, "question", "") or "").strip()
        if not txt:
            continue
        normalized_items.append(
            {
                "id": str(getattr(q, "id", "") or "").strip(),
                "text": txt,
                "status": _llm_question_status_to_interview(getattr(q, "status", "")),
                "on_diagram": False,
            }
        )

    ai_map_raw = iv.get("ai_questions")
    ai_map: Dict[str, List[Dict[str, Any]]] = dict(ai_map_raw) if isinstance(ai_map_raw, dict) else {}

    for sid in step_ids:
        existing = ai_map.get(sid)
        if not isinstance(existing, list):
            existing = []
        keep_on_diagram: Dict[str, bool] = {}
        keep_status: Dict[str, str] = {}
        for it in existing:
            if not isinstance(it, dict):
                continue
            iid = str(it.get("id") or "").strip()
            itxt = str(it.get("text") or it.get("question") or "").strip()
            key = iid or itxt.lower()
            if not key:
                continue
            keep_on_diagram[key] = bool(it.get("on_diagram"))
            stxt = str(it.get("status") or "").strip()
            if stxt:
                keep_status[key] = stxt

        merged: List[Dict[str, Any]] = []
        for it in normalized_items:
            iid = str(it.get("id") or "").strip()
            itxt = str(it.get("text") or "").strip()
            key = iid or itxt.lower()
            row = dict(it)
            if key in keep_on_diagram:
                row["on_diagram"] = keep_on_diagram[key]
            if key in keep_status and row.get("status") == "уточнить":
                row["status"] = keep_status[key]
            merged.append(row)
        ai_map[sid] = merged[:keep]

    iv["ai_questions"] = ai_map
    s.interview = iv

    primary_sid = step_ids[0] if step_ids else ""
    step_questions = ai_map.get(primary_sid) if primary_sid else []
    if not isinstance(step_questions, list):
        step_questions = []
    return {
        "step_id": primary_sid or None,
        "step_ids": step_ids,
        "step_questions": step_questions[:keep],
        "node_questions_count": len(normalized_items),
    }


_AI_QUESTIONS_ELEMENT_MODES = {"sequential", "node_step", "one_by_one"}


def _ai_questions_module_id(mode: str, inp: AiQuestionsIn) -> str:
    normalized_mode = str(mode or "").strip().lower()
    if normalized_mode in _AI_QUESTIONS_ELEMENT_MODES:
        return "ai.questions.element"
    return "ai.questions.session"


def _ai_questions_scope(s: Session) -> Dict[str, str]:
    return {
        "org_id": str(getattr(s, "org_id", "") or get_default_org_id()).strip(),
        "workspace_id": "",
        "project_id": str(getattr(s, "project_id", "") or "").strip(),
        "session_id": str(getattr(s, "id", "") or "").strip(),
    }


def _ai_questions_actor_user_id(request: Request, s: Session) -> str:
    try:
        _user, actor_user_id, _actor_label = _resolve_actor_context(request)
    except Exception:
        actor_user_id = ""
    return (
        str(actor_user_id or "").strip()
        or str(getattr(s, "updated_by", "") or "").strip()
        or str(getattr(s, "created_by", "") or "").strip()
        or str(getattr(s, "owner_user_id", "") or "").strip()
    )


def _ai_questions_active_prompt(module_id: str, scope: Dict[str, Any]) -> Dict[str, Any]:
    import app._legacy_main as _lm

    candidates = [
        ("session", str((scope or {}).get("session_id") or "").strip()),
        ("project", str((scope or {}).get("project_id") or "").strip()),
        ("workspace", str((scope or {}).get("workspace_id") or "").strip()),
        ("org", str((scope or {}).get("org_id") or "").strip()),
        ("global", ""),
    ]
    for scope_level, scope_id in candidates:
        if scope_level != "global" and not scope_id:
            continue
        try:
            item = _lm.get_active_prompt(module_id=module_id, scope_level=scope_level, scope_id=scope_id)
        except Exception:
            continue
        if isinstance(item, dict) and str(item.get("template") or "").strip():
            return item
    return {}


def _record_ai_questions_execution_safe(**kwargs: Any) -> None:
    try:
        record_ai_execution(**kwargs)
    except Exception:
        logging.getLogger(__name__).warning("failed to record ai questions execution", exc_info=True)


def ai_questions(session_id: str, inp: AiQuestionsIn, request: Request = None) -> Dict[str, Any]:
    import app._legacy_main as _lm

    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    llm = _lm.load_llm_settings()
    api_key = (llm.get("api_key") or "").strip()
    base_url = (llm.get("base_url") or "").strip()
    model_name = str(llm.get("model") or "deepseek-chat").strip() or "deepseek-chat"

    limit = int(inp.limit or 10)
    if limit < 1:
        limit = 1
    if limit > 10:
        limit = 10

    mode = (inp.mode or "strict").strip().lower()
    if mode not in ("strict", "soft", "sequential", "node_step", "one_by_one"):
        mode = "strict"

    module_id = _ai_questions_module_id(mode, inp)
    scope = _ai_questions_scope(s)
    actor_user_id = _ai_questions_actor_user_id(request, s)
    input_payload = {
        "endpoint": "POST /api/sessions/{session_id}/ai/questions",
        "session_id": str(session_id or ""),
        "mode": mode,
        "limit": limit,
        "reset": bool(getattr(inp, "reset", False)),
        "node_id": str(getattr(inp, "node_id", "") or "").strip(),
        "step_id": str(getattr(inp, "step_id", "") or "").strip(),
    }
    started_at = time.time()
    created_at = int(started_at)
    active_prompt = _ai_questions_active_prompt(module_id, scope)
    system_prompt = str(active_prompt.get("template") or "").strip()
    prompt_id = str(active_prompt.get("prompt_id") or "").strip()
    prompt_version = str(active_prompt.get("version") or "").strip()

    def _finish(
        response: Dict[str, Any],
        *,
        status: str,
        output_summary: str = "",
        error_code: str = "",
        error_message: str = "",
        usage: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        finished_at = int(time.time())
        latency_ms = int(max(0.0, time.time() - started_at) * 1000)
        _record_ai_questions_execution_safe(
            module_id=module_id,
            actor_user_id=actor_user_id,
            scope=scope,
            provider="deepseek",
            model=model_name,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            status=status,
            input_payload=input_payload,
            output_summary=output_summary,
            usage=usage if isinstance(usage, dict) else {},
            latency_ms=latency_ms,
            error_code=error_code,
            error_message=error_message,
            created_at=created_at,
            finished_at=finished_at,
        )
        return response

    if not api_key:
        return _finish(
            {"error": "deepseek api_key is not set"},
            status="error",
            output_summary="missing provider api key",
            error_code="missing_api_key",
            error_message="deepseek api_key is not set",
        )

    try:
        rate = _lm.check_ai_rate_limit(module_id=module_id, actor_user_id=actor_user_id, scope=scope)
    except Exception:
        rate = {"allowed": True}
    if not bool(rate.get("allowed", rate.get("ok", True))):
        return _finish(
            {
                "error": "ai_rate_limit_exceeded",
                "rate_limit": {
                    "limit": int(rate.get("limit") or 0),
                    "window_sec": int(rate.get("window_sec") or 0),
                    "reset_at": int(rate.get("reset_at") or 0),
                },
            },
            status="error",
            output_summary="rate limit blocked",
            error_code="ai_rate_limit_exceeded",
            error_message="ai_rate_limit_exceeded",
        )

    try:
        from .ai.deepseek_questions import (
            generate_llm_questions,
            generate_llm_questions_for_node,
            collect_node_ids_in_bpmn_order,
            extract_node_xml_snippet,
        )
    except Exception as e:
        return _finish(
            {"error": f"deepseek questions module not available: {e}"},
            status="error",
            output_summary="deepseek questions module unavailable",
            error_code="module_unavailable",
            error_message=str(e),
        )

    if mode in ("sequential", "node_step", "one_by_one"):
        known = {str(getattr(n, "id", "") or "").strip() for n in (s.nodes or []) if str(getattr(n, "id", "") or "").strip()}
        ordered = collect_node_ids_in_bpmn_order(str(getattr(s, "bpmn_xml", "") or ""), known)
        for n in (s.nodes or []):
            nid = str(getattr(n, "id", "") or "").strip()
            if nid and nid not in ordered:
                ordered.append(nid)

        state = dict(getattr(s, "ai_llm_state", {}) or {})
        if bool(getattr(inp, "reset", False)):
            state = {}
        processed_old = [str(x).strip() for x in (state.get("processed_node_ids") or []) if str(x).strip()]
        processed_set = set(processed_old)
        requested_node_id = str(getattr(inp, "node_id", "") or "").strip()
        requested_step_id = str(getattr(inp, "step_id", "") or "").strip()

        llm_count_by_node: Dict[str, int] = {}
        for q in (s.questions or []):
            if not str(getattr(q, "id", "") or "").startswith("llm_"):
                continue
            qnid = str(getattr(q, "node_id", "") or "").strip()
            if not qnid:
                continue
            llm_count_by_node[qnid] = int(llm_count_by_node.get(qnid, 0)) + 1

        skipped_existing = 0
        selected_node = None
        if requested_node_id:
            selected_node = next((n for n in (s.nodes or []) if str(getattr(n, "id", "") or "").strip() == requested_node_id), None)
            if selected_node is None:
                return _finish(
                    {"error": "node not found", "node_id": requested_node_id},
                    status="error",
                    output_summary="node not found",
                    error_code="node_not_found",
                    error_message=requested_node_id,
                )
            if requested_node_id not in ordered:
                ordered.append(requested_node_id)
            existing_requested = _prune_node_llm_questions(s, requested_node_id, keep_max=5)
            if len(existing_requested) >= 5:
                processed_set.add(requested_node_id)
                processed_order = [nid for nid in ordered if nid in processed_set]
                remaining = len([x for x in ordered if x not in processed_set])
                sync = _sync_interview_ai_questions_for_node(
                    s,
                    requested_node_id,
                    preferred_step_id=requested_step_id,
                    keep_max=5,
                )
                state["processed_node_ids"] = processed_order
                state["last_node_id"] = requested_node_id
                state["last_status"] = "processed"
                state["updated_at"] = int(time.time())
                s.ai_llm_state = state
                _preserve_current_interview_analysis_before_save(st, s)
                st.save(s)
                out = _session_api_dump(s)
                questions_for_step = sync.get("step_questions") if isinstance(sync, dict) else []
                if not isinstance(questions_for_step, list):
                    questions_for_step = []
                out["llm_step"] = {
                    "status": "processed",
                    "node_id": requested_node_id,
                    "node_title": str(getattr(selected_node, "title", "") or requested_node_id),
                    "requested_node_id": requested_node_id,
                    "step_id": sync.get("step_id") if isinstance(sync, dict) else None,
                    "step_ids": sync.get("step_ids") if isinstance(sync, dict) else [],
                    "generated": 0,
                    "reused": True,
                    "questions": questions_for_step,
                    "new_questions": [],
                    "existing_questions_returned": len(questions_for_step),
                    "processed": len(processed_order),
                    "total": len(ordered),
                    "remaining": remaining,
                    "skipped_existing": skipped_existing,
                }
                return _finish(
                    out,
                    status="success",
                    output_summary=f"reused questions for node {requested_node_id}",
                )
        else:
            for nid in ordered:
                if nid in processed_set:
                    continue
                if int(llm_count_by_node.get(nid, 0)) >= 5:
                    processed_set.add(nid)
                    skipped_existing += 1
                    continue
                selected_node = next((n for n in (s.nodes or []) if str(getattr(n, "id", "") or "").strip() == nid), None)
                if selected_node is not None:
                    break

        if selected_node is None:
            processed_order = [nid for nid in ordered if nid in processed_set]
            state["processed_node_ids"] = processed_order
            state["last_status"] = "completed"
            state["updated_at"] = int(time.time())
            s.ai_llm_state = state
            _preserve_current_interview_analysis_before_save(st, s)
            st.save(s)
            out = _session_api_dump(s)
            out["llm_step"] = {
                "status": "completed",
                "processed": len(processed_order),
                "total": len(ordered),
                "remaining": 0,
                "skipped_existing": skipped_existing,
            }
            return _finish(
                out,
                status="success",
                output_summary="sequential questions completed without provider call",
            )

        node_xml = extract_node_xml_snippet(str(getattr(s, "bpmn_xml", "") or ""), str(getattr(selected_node, "id", "") or ""))
        existing_for_node_before = _collect_node_llm_questions(s, str(getattr(selected_node, "id", "") or ""))
        remain_for_node = max(0, 5 - len(existing_for_node_before))
        if remain_for_node <= 0:
            new_qs = []
        else:
            try:
                new_qs = generate_llm_questions_for_node(
                    s,
                    selected_node,
                    api_key=api_key,
                    base_url=base_url,
                    limit=min(limit, remain_for_node, 5),
                    node_xml=node_xml,
                    system_prompt=system_prompt,
                )
            except Exception as e:
                return _finish(
                    {"error": f"deepseek failed: {e}"},
                    status="error",
                    output_summary="deepseek provider failed",
                    error_code="provider_error",
                    error_message=str(e),
                )
        generated = 0
        added_questions: List[Dict[str, Any]] = []
        existing_ids = {q.id for q in (s.questions or []) if getattr(q, "id", None)}
        for q in (new_qs or []):
            if q.id in existing_ids:
                continue
            (s.questions or []).append(q)
            existing_ids.add(q.id)
            generated += 1
            added_questions.append(q.model_dump())

        nid = str(getattr(selected_node, "id", "") or "").strip()
        _prune_node_llm_questions(s, nid, keep_max=5)
        if nid:
            processed_set.add(nid)
        processed_order = [x for x in ordered if x in processed_set]
        remaining = len([x for x in ordered if x not in processed_set])

        node_results = state.get("node_results")
        if not isinstance(node_results, dict):
            node_results = {}
        node_results[nid] = {
            "node_title": str(getattr(selected_node, "title", "") or nid),
            "generated": generated,
            "ts": int(time.time()),
            "mode": "node_step" if requested_node_id else "sequential",
        }
        state["node_results"] = node_results
        state["processed_node_ids"] = processed_order
        state["last_node_id"] = nid
        state["last_status"] = "processed"
        state["updated_at"] = int(time.time())
        s.ai_llm_state = state

        s = _recompute_session(s)
        sync = _sync_interview_ai_questions_for_node(
            s,
            nid,
            preferred_step_id=requested_step_id,
            keep_max=5,
        )
        _preserve_current_interview_analysis_before_save(st, s)
        st.save(s)
        out = _session_api_dump(s)
        llm_questions_for_step = sync.get("step_questions") if isinstance(sync, dict) else []
        if not isinstance(llm_questions_for_step, list):
            llm_questions_for_step = []
        out["llm_step"] = {
            "status": "processed",
            "node_id": nid,
            "node_title": str(getattr(selected_node, "title", "") or nid),
            "requested_node_id": requested_node_id or None,
            "step_id": sync.get("step_id") if isinstance(sync, dict) else None,
            "step_ids": sync.get("step_ids") if isinstance(sync, dict) else [],
            "generated": generated,
            "reused": generated == 0,
            "questions": llm_questions_for_step,
            "new_questions": added_questions,
            "existing_questions_returned": max(len(llm_questions_for_step) - generated, 0),
            "processed": len(processed_order),
            "total": len(ordered),
            "remaining": remaining,
            "skipped_existing": skipped_existing,
        }
        return _finish(
            out,
            status="success",
            output_summary=f"generated={generated} node_id={nid}",
        )

    try:
        new_qs = generate_llm_questions(
            s,
            api_key=api_key,
            base_url=base_url,
            limit=limit,
            mode=mode,
            system_prompt=system_prompt,
        )
    except Exception as e:
        return _finish(
            {"error": f"deepseek failed: {e}"},
            status="error",
            output_summary="deepseek provider failed",
            error_code="provider_error",
            error_message=str(e),
        )

    if new_qs:
        existing_ids = {q.id for q in (s.questions or []) if getattr(q, "id", None)}
        for q in new_qs:
            if q.id not in existing_ids:
                (s.questions or []).append(q)
                existing_ids.add(q.id)

    s = _recompute_session(s)
    _preserve_current_interview_analysis_before_save(st, s)
    st.save(s)
    return _finish(
        s.model_dump(),
        status="success",
        output_summary=f"generated={len(new_qs or [])} mode={mode}",
    )
