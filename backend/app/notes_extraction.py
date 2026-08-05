from __future__ import annotations

import copy
import json
import logging
import time
from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException, Request

from .ai.execution_log import hash_ai_input, record_ai_execution
from .models import Edge, Node, Question, Session
from .schemas.legacy_api import (
    NotesExtractionApplyIn,
    NotesExtractionPreviewIn,
    NotesIn,
)
from .services.session_recompute import _recompute_session
from .settings import load_llm_settings
from .shared.coerce import _notes_apply_flag
from .shared.entities import (
    _edge_identity,
    _list_diff_by_id,
    _merge_nodes,
    _role_diff,
    _safe_model_dump,
    _safe_model_dump_list,
)
from .shared.text_utils import _redact_notes_preview_message
from .storage import get_default_org_id, get_storage
from .utils.legacy_normalization import norm_roles as _norm_roles
from .utils.session_helpers import (
    _mark_diagram_truth_write,
    _require_diagram_cas_or_409,
    _resolve_actor_context,
    _resolve_base_diagram_state_version,
    raise_session_not_found,
)


def post_notes(session_id: str, inp: NotesIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    s.notes = inp.notes

    llm = load_llm_settings()
    try:
        from .ai.deepseek_client import extract_process
    except Exception as e:
        return {"error": f"deepseek client module not available: {e}"}

    try:
        extracted = extract_process(
            s.notes,
            api_key=llm.get("api_key", ""),
            base_url=llm.get("base_url", ""),
        )
    except Exception as e:
        return {"error": f"deepseek failed: {e}"}

    nodes_raw = extracted.get("nodes", []) or []
    edges_raw = extracted.get("edges", []) or []
    existing_roles = _norm_roles(getattr(s, "roles", None))
    extracted_roles = _norm_roles(extracted.get("roles", []))
    roles = existing_roles if existing_roles else extracted_roles

    extracted_nodes = [Node.model_validate(nr) for nr in nodes_raw]
    extracted_edges = [Edge.model_validate(er) for er in edges_raw]

    s.roles = roles
    sr = str(getattr(s, "start_role", "") or "").strip()
    if roles:
        if not sr or sr not in roles:
            s.start_role = roles[0]
    else:
        s.start_role = None

    s.nodes = _merge_nodes(s.nodes, extracted_nodes)
    s.edges = extracted_edges

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["notes", "roles", "start_role", "nodes", "edges", "questions"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()

_NOTES_EXTRACTION_MODULE_ID = "ai.process.extract_from_notes"

def _notes_preview_scope(sess: Session, org_id: Optional[str] = None) -> Dict[str, str]:
    return {
        "org_id": str(org_id or getattr(sess, "org_id", "") or get_default_org_id()).strip(),
        "workspace_id": "",
        "project_id": str(getattr(sess, "project_id", "") or "").strip(),
        "session_id": str(getattr(sess, "id", "") or "").strip(),
    }

def _record_notes_preview_execution_safe(**kwargs: Any) -> None:
    try:
        record_ai_execution(**kwargs)
    except Exception:
        logging.getLogger(__name__).warning("failed to record notes extraction ai execution", exc_info=True)

def _edge_key(value: Any) -> str:
    row = _safe_model_dump(value)
    if not row and isinstance(value, dict):
        row = value
    return f"{str(row.get('from_id') or '').strip()}->{str(row.get('to_id') or '').strip()}"

def _edge_diff(current: Any, candidate: Any) -> Dict[str, Any]:
    current_rows = list(current or [])
    candidate_rows = list(candidate or [])
    current_keys = {_edge_key(item) for item in current_rows if _edge_key(item)}
    candidate_keys = {_edge_key(item) for item in candidate_rows if _edge_key(item)}
    return {
        "added": sorted(candidate_keys - current_keys),
        "removed": sorted(current_keys - candidate_keys),
        "unchanged": sorted(candidate_keys & current_keys),
        "added_count": len(candidate_keys - current_keys),
        "removed_count": len(current_keys - candidate_keys),
        "unchanged_count": len(candidate_keys & current_keys),
    }

def _sanitize_notes_preview_warnings(warnings: Any, *, api_key: str = "", base_url: str = "") -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for item in warnings or []:
        row = item if isinstance(item, dict) else {"code": "warning", "message": str(item or "")}
        code = str(row.get("code") or "warning").strip() or "warning"
        message = _redact_notes_preview_message(row.get("message"), api_key=api_key, base_url=base_url)
        out.append({"code": code, "message": message})
    return out

def _notes_preview_response_from_extraction(
    *,
    sess: Session,
    notes_text: str,
    extraction: Dict[str, Any],
    input_hash: str,
    warnings: List[Dict[str, str]],
) -> Dict[str, Any]:
    extracted = extraction if isinstance(extraction, dict) else {}
    nodes_raw = extracted.get("nodes", []) or []
    edges_raw = extracted.get("edges", []) or []
    extracted_roles = _norm_roles(extracted.get("roles", []))
    current_roles = _norm_roles(getattr(sess, "roles", None))
    candidate_roles = current_roles if current_roles else extracted_roles

    current_start_role = str(getattr(sess, "start_role", "") or "").strip()
    candidate_start_role = current_start_role
    if candidate_roles:
        if not candidate_start_role or candidate_start_role not in candidate_roles:
            candidate_start_role = candidate_roles[0]
    else:
        candidate_start_role = ""

    candidate_nodes = [Node.model_validate(nr) for nr in nodes_raw]
    candidate_edges = [Edge.model_validate(er) for er in edges_raw]
    proposed_nodes = _merge_nodes(list(getattr(sess, "nodes", []) or []), candidate_nodes)

    preview_sess = copy.deepcopy(sess)
    preview_sess.roles = list(candidate_roles)
    preview_sess.start_role = candidate_start_role or None
    preview_sess.nodes = list(proposed_nodes)
    preview_sess.edges = list(candidate_edges)
    preview_sess = _recompute_session(preview_sess)
    candidate_questions = list(getattr(preview_sess, "questions", []) or [])

    base_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    return {
        "ok": True,
        "module_id": _NOTES_EXTRACTION_MODULE_ID,
        "status": "preview",
        "source": str((extracted.get("_source") or "")).strip() or "unknown",
        "input_hash": input_hash,
        "current_diagram_state_version": base_version,
        "candidate_roles": list(candidate_roles),
        "candidate_start_role": candidate_start_role or None,
        "candidate_nodes": _safe_model_dump_list(candidate_nodes),
        "candidate_edges": _safe_model_dump_list(candidate_edges),
        "candidate_questions": _safe_model_dump_list(candidate_questions),
        "warnings": warnings,
        "diff": {
            "notes": {
                "changed": str(notes_text or "") != str(getattr(sess, "notes", "") or ""),
                "current_length": len(str(getattr(sess, "notes", "") or "")),
                "candidate_length": len(str(notes_text or "")),
            },
            "roles": _role_diff(getattr(sess, "roles", []) or [], candidate_roles),
            "start_role": {
                "current": current_start_role or None,
                "candidate": candidate_start_role or None,
                "changed": (current_start_role or "") != (candidate_start_role or ""),
            },
            "nodes": _list_diff_by_id(getattr(sess, "nodes", []) or [], candidate_nodes),
            "edges": _edge_diff(getattr(sess, "edges", []) or [], candidate_edges),
            "questions": _list_diff_by_id(getattr(sess, "questions", []) or [], candidate_questions),
        },
    }

def _notes_apply_require_cas(
    *,
    sess: Session,
    session_id: str,
    inp: NotesExtractionApplyIn,
    request: Request = None,
) -> None:
    import app._legacy_main as _lm
    base_version = _resolve_base_diagram_state_version(
        request=request,
        payload=inp.model_dump(exclude_unset=True),
    )
    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    if base_version is None:
        raise HTTPException(
            status_code=409,
            detail=_lm._diagram_state_conflict_payload(
                code="DIAGRAM_STATE_BASE_VERSION_REQUIRED",
                session_id=str(getattr(sess, "id", "") or session_id),
                client_base_version=None,
                server_current_version=current_version,
                sess=sess,
            ),
        )
    if int(base_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail=_lm._diagram_state_conflict_payload(
                code="DIAGRAM_STATE_CONFLICT",
                session_id=str(getattr(sess, "id", "") or session_id),
                client_base_version=int(base_version),
                server_current_version=current_version,
                sess=sess,
            ),
        )

def _merge_selected_edges(existing: Any, selected: Any) -> List[Edge]:
    merged: Dict[str, Edge] = {}
    for edge in list(existing or []):
        parsed = edge if isinstance(edge, Edge) else Edge.model_validate(edge)
        key = _edge_identity(parsed)
        if key:
            merged[key] = parsed
    for edge in list(selected or []):
        parsed = edge if isinstance(edge, Edge) else Edge.model_validate(edge)
        key = _edge_identity(parsed)
        if key:
            merged[key] = parsed
    return list(merged.values())

def _merge_selected_nodes(existing: Any, selected: Any) -> List[Node]:
    current = [item if isinstance(item, Node) else Node.model_validate(item) for item in list(existing or [])]
    by_id = {str(node.id or "").strip(): node for node in current if str(node.id or "").strip()}
    selected_nodes = [item if isinstance(item, Node) else Node.model_validate(item) for item in list(selected or [])]
    appended: List[Node] = []
    for node in selected_nodes:
        node_id = str(node.id or "").strip()
        if not node_id:
            continue
        old = by_id.get(node_id)
        if old:
            by_id[node_id] = _merge_nodes([old], [node])[0]
        else:
            by_id[node_id] = node
            appended.append(node)
    out: List[Node] = []
    seen: Set[str] = set()
    for node in current:
        node_id = str(node.id or "").strip()
        if node_id and node_id in by_id:
            out.append(by_id[node_id])
            seen.add(node_id)
    for node in appended:
        node_id = str(node.id or "").strip()
        if node_id and node_id not in seen:
            out.append(node)
            seen.add(node_id)
    return out

def _entity_list_signature(values: Any) -> str:
    dumped = _safe_model_dump_list(values)
    try:
        return json.dumps(dumped, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        return str(dumped)

def post_notes_extraction_apply(
    session_id: str,
    inp: NotesExtractionApplyIn,
    request: Request = None,
) -> Dict[str, Any]:
    import app._legacy_main as _lm
    s, _, _ = _lm._legacy_load_session_scoped(session_id, request)
    if not s:
        return {"error": "not found"}
    st = get_storage()

    _notes_apply_require_cas(sess=s, session_id=session_id, inp=inp, request=request)
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    before = {
        "notes": str(getattr(s, "notes", "") or ""),
        "roles": list(getattr(s, "roles", []) or []),
        "start_role": str(getattr(s, "start_role", "") or ""),
        "nodes": _entity_list_signature(getattr(s, "nodes", []) or []),
        "edges": _entity_list_signature(getattr(s, "edges", []) or []),
        "questions": _entity_list_signature(getattr(s, "questions", []) or []),
        "bpmn_xml": str(getattr(s, "bpmn_xml", "") or ""),
        "diagram_state_version": int(getattr(s, "diagram_state_version", 0) or 0),
    }

    changed_keys: Set[str] = set()
    graph_changed = False

    if _notes_apply_flag(inp, "apply_notes") and inp.notes is not None:
        next_notes = str(inp.notes or "")
        if next_notes != before["notes"]:
            s.notes = next_notes
            changed_keys.add("notes")

    if _notes_apply_flag(inp, "apply_roles"):
        next_roles = _norm_roles(inp.roles if inp.roles is not None else getattr(s, "roles", []))
        next_start_role = inp.start_role
        if next_start_role is None:
            next_start = str(getattr(s, "start_role", "") or "").strip()
        else:
            next_start = str(next_start_role or "").strip()
        if next_start and next_roles and next_start not in next_roles:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "start_role must be one of roles",
                    "start_role": next_start,
                    "roles": next_roles,
                },
            )
        if list(getattr(s, "roles", []) or []) != next_roles:
            s.roles = next_roles
            changed_keys.add("roles")
        current_start = str(getattr(s, "start_role", "") or "").strip()
        if next_start != current_start:
            s.start_role = next_start or None
            changed_keys.add("start_role")

    if _notes_apply_flag(inp, "apply_nodes_edges"):
        selected_nodes = [Node.model_validate(item) for item in list(inp.nodes or [])]
        selected_edges = [Edge.model_validate(item) for item in list(inp.edges or [])]
        if selected_nodes:
            s.nodes = _merge_selected_nodes(list(getattr(s, "nodes", []) or []), selected_nodes)
        if selected_edges:
            s.edges = _merge_selected_edges(list(getattr(s, "edges", []) or []), selected_edges)
        if _entity_list_signature(getattr(s, "nodes", []) or []) != before["nodes"]:
            changed_keys.add("nodes")
            graph_changed = True
        if _entity_list_signature(getattr(s, "edges", []) or []) != before["edges"]:
            changed_keys.add("edges")
            graph_changed = True

    if graph_changed:
        s = _recompute_session(s)

    if _notes_apply_flag(inp, "apply_questions"):
        selected_questions = [Question.model_validate(item) for item in list(inp.questions or [])]
        s.questions = selected_questions

    if _entity_list_signature(getattr(s, "questions", []) or []) != before["questions"]:
        changed_keys.add("questions")

    if not changed_keys:
        return {
            "ok": True,
            "status": "noop",
            "module_id": _NOTES_EXTRACTION_MODULE_ID,
            "changed_keys": [],
            "diagram_state_version": before["diagram_state_version"],
            "session": s.model_dump(),
            "result": s.model_dump(),
        }

    _mark_diagram_truth_write(
        s,
        changed_keys=sorted(changed_keys),
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    session_payload = s.model_dump()
    return {
        "ok": True,
        "status": "applied",
        "module_id": _NOTES_EXTRACTION_MODULE_ID,
        "changed_keys": sorted(changed_keys),
        "input_hash": str(inp.input_hash or "").strip(),
        "diagram_state_version": int(getattr(s, "diagram_state_version", 0) or 0),
        "session": session_payload,
        "result": session_payload,
    }

def post_notes_extraction_preview(
    session_id: str,
    inp: NotesExtractionPreviewIn,
    request: Request = None,
) -> Dict[str, Any]:
    import app._legacy_main as _lm
    sess, org_id, _ = _lm._legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}

    _, actor_user_id, _ = _resolve_actor_context(request)
    scope = _notes_preview_scope(sess, org_id=org_id)
    notes_text = str(getattr(inp, "notes", "") or "")
    llm = _lm.load_llm_settings()
    api_key = str(llm.get("api_key") or "").strip()
    base_url = str(llm.get("base_url") or "").strip()
    model_name = str(llm.get("model") or "deepseek-chat").strip() or "deepseek-chat"
    input_hash = hash_ai_input(
        {
            "endpoint": "POST /api/sessions/{session_id}/notes/extraction-preview",
            "session_id": str(getattr(sess, "id", "") or session_id),
            "notes": notes_text,
        }
    )
    input_payload = {
        "endpoint": "POST /api/sessions/{session_id}/notes/extraction-preview",
        "session_id": str(getattr(sess, "id", "") or session_id),
        "notes_len": len(notes_text),
        "options": sorted((getattr(inp, "options", None) or {}).keys()) if isinstance(getattr(inp, "options", None), dict) else [],
    }
    started_at = time.time()
    created_at = int(started_at)

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
        _record_notes_preview_execution_safe(
            module_id=_NOTES_EXTRACTION_MODULE_ID,
            actor_user_id=actor_user_id,
            scope=scope,
            provider="deepseek",
            model=model_name,
            status=status,
            input_payload=input_payload,
            input_hash=input_hash,
            output_summary=output_summary,
            usage=usage if isinstance(usage, dict) else {},
            latency_ms=latency_ms,
            error_code=error_code,
            error_message=_redact_notes_preview_message(error_message, api_key=api_key, base_url=base_url),
            created_at=created_at,
            finished_at=finished_at,
        )
        return response

    try:
        rate = _lm.check_ai_rate_limit(module_id=_NOTES_EXTRACTION_MODULE_ID, actor_user_id=actor_user_id, scope=scope)
    except Exception:
        rate = {"allowed": True}
    if not bool(rate.get("allowed", rate.get("ok", True))):
        return _finish(
            {
                "error": "ai_rate_limit_exceeded",
                "module_id": _NOTES_EXTRACTION_MODULE_ID,
                "input_hash": input_hash,
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
        from .ai.deepseek_client import extract_process_preview
    except Exception as exc:
        message = _redact_notes_preview_message(exc, api_key=api_key, base_url=base_url)
        return _finish(
            {"error": f"deepseek client module not available: {message}", "module_id": _NOTES_EXTRACTION_MODULE_ID, "input_hash": input_hash},
            status="error",
            output_summary="notes extraction module unavailable",
            error_code="module_unavailable",
            error_message=message,
        )

    warnings: List[Dict[str, str]] = []
    base_version = _resolve_base_diagram_state_version(request=request, payload=inp.model_dump(exclude_unset=True))
    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    if base_version is not None and int(base_version) != current_version:
        warnings.append(
            {
                "code": "diagram_state_version_mismatch",
                "message": "Preview was generated against the current session, but the submitted base diagram version is stale.",
            }
        )

    try:
        preview = extract_process_preview(notes_text, api_key=api_key, base_url=base_url)
        source = str((preview or {}).get("source") or "fallback").strip().lower()
        if source not in {"llm", "fallback"}:
            source = "fallback"
        extracted = dict((preview or {}).get("result") or {})
        extracted["_source"] = source
        warnings.extend(_sanitize_notes_preview_warnings((preview or {}).get("warnings"), api_key=api_key, base_url=base_url))
        response = _notes_preview_response_from_extraction(
            sess=sess,
            notes_text=notes_text,
            extraction=extracted,
            input_hash=input_hash,
            warnings=warnings,
        )
        response["source"] = source
        summary = (
            f"source={source} "
            f"nodes={len(response.get('candidate_nodes') or [])} "
            f"edges={len(response.get('candidate_edges') or [])} "
            f"questions={len(response.get('candidate_questions') or [])}"
        )
        return _finish(
            response,
            status="success",
            output_summary=summary,
            usage={
                "source": source,
                "candidate_nodes": len(response.get("candidate_nodes") or []),
                "candidate_edges": len(response.get("candidate_edges") or []),
                "candidate_questions": len(response.get("candidate_questions") or []),
                "warnings": len(warnings),
            },
        )
    except Exception as exc:
        message = _redact_notes_preview_message(exc, api_key=api_key, base_url=base_url)
        return _finish(
            {"error": f"notes extraction preview failed: {message}", "module_id": _NOTES_EXTRACTION_MODULE_ID, "input_hash": input_hash},
            status="error",
            output_summary="notes extraction preview failed",
            error_code="preview_failed",
            error_message=message,
        )
