from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..ai.execution_log import check_ai_rate_limit, hash_ai_input, record_ai_execution
from ..ai.product_actions_suggest import ProductActionsAiResponseParseError, suggest_product_actions_with_deepseek
from ..ai.prompt_registry import get_active_prompt, seed_existing_ai_prompts
from ..legacy.request_context import require_authenticated_user, request_active_org_id
from ..models import Edge, Node, Session
from ..services.org_workspace import project_access_allowed, require_org_member_for_enterprise
from ..settings import load_llm_settings
from ..storage import get_project_storage, get_storage

router = APIRouter(tags=["product-actions-ai"])

_MODULE_ID = "ai.product_actions.suggest"
_ENDPOINT = "POST /api/sessions/{session_id}/analysis/product-actions/suggest"
_BATCH_ENDPOINT = "POST /api/sessions/{session_id}/analysis/product-actions/batch-suggest"
_BULK_ENDPOINT = "POST /api/analysis/product-actions/suggest-bulk"
_REQUIRED_FIELDS = ("product_name", "product_group", "action_type", "action_object")
_BULK_SESSION_CAP = 10
_BATCH_DEFAULT_STEPS_PER_CHUNK = 10
_BATCH_MAX_STEPS_PER_CHUNK = 20
_BATCH_MAX_INPUT_CHARS = 18000
_BATCH_IN_FLIGHT: Set[str] = set()
_CONTROLLED_ERROR_MESSAGES = {
    "AI_PROVIDER_NOT_CONFIGURED": "AI_PROVIDER_NOT_CONFIGURED",
    "AI_PROMPT_NOT_CONFIGURED": "AI_PROMPT_NOT_CONFIGURED",
    "AI_PROVIDER_ERROR": "AI_PROVIDER_ERROR",
    "AI_RESPONSE_PARSE_ERROR": "AI_RESPONSE_PARSE_ERROR",
    "AI_RATE_LIMIT_EXCEEDED": "AI_RATE_LIMIT_EXCEEDED",
}


class ProductActionsSuggestIn(BaseModel):
    options: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ProductActionsBulkSuggestIn(BaseModel):
    session_ids: List[str] = Field(default_factory=list)
    options: Optional[Dict[str, Any]] = Field(default_factory=dict)


class BatchDraftIn(BaseModel):
    draft: Optional[Dict[str, Any]] = None


class ProductActionsBatchSuggestIn(BaseModel):
    scope: str = "without_actions"
    step_ids: List[str] = Field(default_factory=list)
    options: Optional[Dict[str, Any]] = Field(default_factory=dict)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _actor_user_id(request: Request) -> str:
    user = getattr(getattr(request, "state", None), "auth_user", None)
    if isinstance(user, dict):
        return _text(user.get("id") or user.get("sub") or user.get("email"))
    return ""


def _max_suggestions(inp: ProductActionsSuggestIn) -> int:
    options = _as_dict(getattr(inp, "options", None))
    try:
        value = int(options.get("max_suggestions") or 3)
    except Exception:
        value = 3
    return max(1, min(value, 40))


def _unique_session_ids(values: Any) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    if not isinstance(values, list):
        return out
    for value in values:
        text = _text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _project_workspace_id(project_id: str, org_id: str) -> str:
    if not project_id:
        return ""
    project = get_project_storage().load(project_id, org_id=org_id, is_admin=True)
    if project is None:
        return ""
    return _text(getattr(project, "workspace_id", ""))


def _load_session_for_request(request: Request, session_id: str, org_id: str) -> Session:
    session = get_storage().load(session_id, org_id=org_id, is_admin=True)
    if session is None:
        raise HTTPException(status_code=404, detail="not_found")
    project_id = _text(getattr(session, "project_id", ""))
    if project_id and not project_access_allowed(request, org_id, project_id):
        raise HTTPException(status_code=404, detail="not_found")
    return session


def _model_dump(value: Any) -> Dict[str, Any]:
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dumped if isinstance(dumped, dict) else {}
    return dict(value) if isinstance(value, dict) else {}


def _node_context(node_raw: Any) -> Dict[str, Any]:
    node = node_raw if isinstance(node_raw, Node) else None
    data = _model_dump(node_raw)
    return {
        "id": _text(data.get("id") or getattr(node, "id", "")),
        "title": _text(data.get("title") or getattr(node, "title", "")),
        "type": _text(data.get("type") or getattr(node, "type", "")),
        "role": _text(data.get("role") or data.get("actor_role") or getattr(node, "actor_role", "")),
        "lane": _text(data.get("lane") or data.get("lane_id") or data.get("laneId")),
    }


def _edge_context(edge_raw: Any) -> Dict[str, Any]:
    edge = edge_raw if isinstance(edge_raw, Edge) else None
    data = _model_dump(edge_raw)
    return {
        "id": _text(data.get("id") or getattr(edge, "id", "")),
        "source": _text(data.get("source") or data.get("source_id") or data.get("from_id") or getattr(edge, "from_id", "")),
        "target": _text(data.get("target") or data.get("target_id") or data.get("to_id") or getattr(edge, "to_id", "")),
        "label": _text(data.get("label") or data.get("when") or getattr(edge, "when", "")),
    }


def _step_context(step_raw: Any) -> Dict[str, Any]:
    step = _as_dict(step_raw)
    step_id = _text(step.get("id") or step.get("step_id") or step.get("stepId"))
    node_id = _text(step.get("node_id") or step.get("nodeId") or step.get("node_bind_id") or step.get("bpmn_ref"))
    label = _text(step.get("action") or step.get("label") or step.get("title") or step.get("node_bind_title"))
    return {
        "id": step_id,
        "step_id": step_id,
        "bpmn_element_id": node_id,
        "node_id": node_id,
        "label": label,
        "role": _text(step.get("role")),
        "phase": _text(step.get("phase") or step.get("stage")),
        "raw_kind": _text(step.get("kind") or step.get("type")),
    }


def _interview_steps(interview_raw: Any) -> List[Dict[str, Any]]:
    interview = _as_dict(interview_raw)
    candidates: List[Any] = []
    for key in ("steps", "timeline", "items"):
        if isinstance(interview.get(key), list):
            candidates = interview.get(key) or []
            break
    if not candidates:
        analysis = _as_dict(interview.get("analysis"))
        for key in ("steps", "timeline", "items"):
            if isinstance(analysis.get(key), list):
                candidates = analysis.get(key) or []
                break
    out: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for item in candidates[:200]:
        row = _step_context(item)
        key = row.get("id") or row.get("bpmn_element_id") or row.get("label")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _existing_product_actions(interview_raw: Any) -> List[Dict[str, Any]]:
    analysis = _as_dict(_as_dict(interview_raw).get("analysis"))
    out: List[Dict[str, Any]] = []
    for index, action_raw in enumerate(_as_list(analysis.get("product_actions"))[:500]):
        action = _as_dict(action_raw)
        out.append(
            {
                "id": _text(action.get("id") or action.get("action_id")) or f"existing_{index + 1}",
                "step_id": _text(action.get("step_id") or action.get("stepId")),
                "bpmn_element_id": _text(action.get("bpmn_element_id") or action.get("node_id") or action.get("bpmnElementId")),
                "step_label": _text(action.get("step_label") or action.get("stepLabel")),
                "product_name": _text(action.get("product_name") or action.get("productName")),
                "product_group": _text(action.get("product_group") or action.get("productGroup")),
                "action_type": _text(action.get("action_type") or action.get("actionType")),
                "action_stage": _text(action.get("action_stage") or action.get("actionStage")),
                "action_object": _text(action.get("action_object") or action.get("actionObject")),
                "action_object_category": _text(action.get("action_object_category") or action.get("actionObjectCategory")),
                "action_method": _text(action.get("action_method") or action.get("actionMethod")),
                "role": _text(action.get("role")),
                "source": _text(action.get("source")) or "manual",
            }
        )
    return out


def _fallback_steps_from_nodes(session: Session) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for node_raw in list(getattr(session, "nodes", []) or [])[:200]:
        node = _node_context(node_raw)
        if not node.get("id"):
            continue
        rows.append(
            {
                "id": node["id"],
                "step_id": node["id"],
                "bpmn_element_id": node["id"],
                "node_id": node["id"],
                "label": node.get("title") or node["id"],
                "role": node.get("role", ""),
                "phase": "",
                "raw_kind": node.get("type", ""),
            }
        )
    return rows


def _suggestion_key(row: Dict[str, Any]) -> str:
    parts = [
        _text(row.get("step_id") or row.get("bpmn_element_id")).lower(),
        _text(row.get("product_name")).lower(),
        _text(row.get("product_group")).lower(),
        _text(row.get("action_type")).lower(),
        _text(row.get("action_object")).lower(),
    ]
    return "|".join(parts)


def _decorate_duplicates(suggestions: List[Dict[str, Any]], existing_actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    existing_by_key: Dict[str, Dict[str, Any]] = {}
    for action in existing_actions:
        key = _suggestion_key(action)
        if key.strip("|"):
            existing_by_key.setdefault(key, action)

    seen_suggestions: Dict[str, str] = {}
    out: List[Dict[str, Any]] = []
    for index, raw in enumerate(suggestions):
        row = dict(raw or {})
        row["id"] = _text(row.get("id")) or f"ai_pa_{index + 1}"
        row["duplicate_of"] = _text(row.get("duplicate_of"))
        row["duplicate_reason"] = _text(row.get("duplicate_reason"))
        key = _suggestion_key(row)
        duplicate_of = row["duplicate_of"]
        duplicate_reason = row["duplicate_reason"]
        if key.strip("|") and key in existing_by_key:
            duplicate_of = _text(existing_by_key[key].get("id"))
            duplicate_reason = "Похоже на уже сохранённое действие с продуктом."
        elif key.strip("|") and key in seen_suggestions:
            duplicate_of = seen_suggestions[key]
            duplicate_reason = "Похоже на другую AI-подсказку в этом черновике."
        if duplicate_of:
            row["duplicate_of"] = duplicate_of
            row["duplicate_reason"] = duplicate_reason
        elif key.strip("|"):
            seen_suggestions[key] = row["id"]
        else:
            row["duplicate_of"] = ""
            row["duplicate_reason"] = ""
        missing = [field for field in _REQUIRED_FIELDS if not _text(row.get(field))]
        row["missing_fields"] = missing
        warnings = list(_as_list(row.get("warnings")))
        if missing:
            warnings.append({"code": "missing_fields", "message": "Не заполнены обязательные поля: " + ", ".join(missing)})
        if duplicate_reason:
            warnings.append({"code": "duplicate_candidate", "message": duplicate_reason})
        row["warnings"] = warnings
        out.append(row)
    return out


def _build_context(session: Session, *, org_id: str, workspace_id: str) -> Dict[str, Any]:
    interview = _as_dict(getattr(session, "interview", {}))
    steps = _interview_steps(interview)
    if not steps:
        steps = _fallback_steps_from_nodes(session)
    existing_actions = _existing_product_actions(interview)
    return {
        "session": {
            "id": _text(getattr(session, "id", "")),
            "title": _text(getattr(session, "title", "")),
            "org_id": org_id,
            "workspace_id": workspace_id,
            "project_id": _text(getattr(session, "project_id", "")),
            "roles": [_text(item) for item in list(getattr(session, "roles", []) or []) if _text(item)][:80],
            "start_role": _text(getattr(session, "start_role", "")),
        },
        "steps": steps,
        "nodes": [_node_context(node) for node in list(getattr(session, "nodes", []) or [])[:200]],
        "edges": [_edge_context(edge) for edge in list(getattr(session, "edges", []) or [])[:300]],
        "existing_product_actions": existing_actions,
    }


def _selected_step_binding(options: Dict[str, Any]) -> Dict[str, str]:
    return {
        "step_id": _text(options.get("selected_step_id")),
        "label": _text(options.get("selected_step_label")),
        "bpmn_element_id": _text(options.get("selected_step_bpmn_id")),
    }


def _step_matches_binding(step: Dict[str, Any], binding: Dict[str, str]) -> bool:
    step_id = _text(binding.get("step_id"))
    bpmn_id = _text(binding.get("bpmn_element_id"))
    label = _text(binding.get("label")).lower()
    if step_id and _text(step.get("id") or step.get("step_id")) == step_id:
        return True
    if bpmn_id and (
        _text(step.get("bpmn_element_id")) == bpmn_id
        or _text(step.get("node_id")) == bpmn_id
    ):
        return True
    return bool(label and _text(step.get("label")).lower() == label)


def _row_matches_binding(row: Dict[str, Any], binding: Dict[str, str]) -> bool:
    step_id = _text(binding.get("step_id"))
    bpmn_id = _text(binding.get("bpmn_element_id"))
    row_step_id = _text(row.get("step_id") or row.get("stepId"))
    row_bpmn_id = _text(row.get("bpmn_element_id") or row.get("node_id") or row.get("bpmnElementId"))
    if row_step_id and step_id and row_step_id != step_id:
        return False
    if row_bpmn_id and bpmn_id and row_bpmn_id != bpmn_id:
        return False
    if step_id and row_step_id == step_id:
        return True
    if bpmn_id and row_bpmn_id == bpmn_id:
        return True
    return bool((step_id or bpmn_id) and not row_step_id and not row_bpmn_id)


def _filter_context_to_selected_step(context: Dict[str, Any], binding: Dict[str, str]) -> bool:
    if not _text(binding.get("step_id") or binding.get("bpmn_element_id") or binding.get("label")):
        return True
    steps = [step for step in _as_list(context.get("steps")) if _step_matches_binding(_as_dict(step), binding)]
    if not steps:
        context["steps"] = []
        context["nodes"] = []
        context["edges"] = []
        return False
    selected_step = _as_dict(steps[0])
    context["steps"] = [selected_step]
    bpmn_id = _text(binding.get("bpmn_element_id")) or _text(selected_step.get("bpmn_element_id") or selected_step.get("node_id"))
    if bpmn_id:
        context["nodes"] = [
            node for node in _as_list(context.get("nodes"))
            if _text(_as_dict(node).get("id")) == bpmn_id
        ]
        context["edges"] = [
            edge for edge in _as_list(context.get("edges"))
            if _text(_as_dict(edge).get("source")) == bpmn_id or _text(_as_dict(edge).get("target")) == bpmn_id
        ]
        binding["bpmn_element_id"] = bpmn_id
    if not _text(binding.get("step_id")):
        binding["step_id"] = _text(selected_step.get("step_id") or selected_step.get("id"))
    if not _text(binding.get("label")):
        binding["label"] = _text(selected_step.get("label"))
    context["selected_step"] = dict(binding)
    return True


def _filter_suggestions_to_selected_step(suggestions: List[Dict[str, Any]], binding: Dict[str, str]) -> List[Dict[str, Any]]:
    if not _text(binding.get("step_id") or binding.get("bpmn_element_id")):
        return suggestions
    out: List[Dict[str, Any]] = []
    for row_raw in suggestions:
        row = dict(row_raw or {})
        if not _row_matches_binding(row, binding):
            continue
        if binding.get("step_id") and not _text(row.get("step_id")):
            row["step_id"] = binding["step_id"]
        if binding.get("bpmn_element_id"):
            if not _text(row.get("bpmn_element_id")):
                row["bpmn_element_id"] = binding["bpmn_element_id"]
            if not _text(row.get("node_id")):
                row["node_id"] = binding["bpmn_element_id"]
        if binding.get("label") and not _text(row.get("step_label")):
            row["step_label"] = binding["label"]
        out.append(row)
    return out


def _step_key(step: Dict[str, Any]) -> str:
    return _text(step.get("step_id") or step.get("id") or step.get("bpmn_element_id") or step.get("node_id"))


def _step_bpmn_key(step: Dict[str, Any]) -> str:
    return _text(step.get("bpmn_element_id") or step.get("node_id"))


def _action_matches_step(action: Dict[str, Any], step: Dict[str, Any]) -> bool:
    step_id = _step_key(step)
    bpmn_id = _step_bpmn_key(step)
    action_step_id = _text(action.get("step_id") or action.get("stepId"))
    action_bpmn_id = _text(action.get("bpmn_element_id") or action.get("node_id") or action.get("bpmnElementId"))
    return bool((step_id and action_step_id == step_id) or (bpmn_id and action_bpmn_id == bpmn_id))


def _draft_entry_has_ready_rows(entry_raw: Any) -> bool:
    entry = _as_dict(entry_raw)
    if _text(entry.get("status")) not in {"ready", "skipped_existing_suggestion"}:
        return False
    return len(_as_list(entry.get("rows"))) > 0


def _draft_entry_for_step(draft_raw: Dict[str, Any], step: Dict[str, Any]) -> Dict[str, Any]:
    step_id = _step_key(step)
    bpmn_id = _step_bpmn_key(step)
    for key in (step_id, bpmn_id):
        if key and _as_dict(draft_raw.get(key)):
            return _as_dict(draft_raw.get(key))
    for entry_raw in draft_raw.values():
        entry = _as_dict(entry_raw)
        rows = _as_list(entry.get("rows"))
        if any(_row_matches_binding(_as_dict(row), {"step_id": step_id, "bpmn_element_id": bpmn_id}) for row in rows):
            return entry
    return {}


def _batch_row_id(row_raw: Dict[str, Any], step_id: str, index: int) -> str:
    row = _as_dict(row_raw)
    return _text(row.get("id")) or f"{step_id}__ai_pa_{index + 1}"


def _batch_entry(
    step: Dict[str, Any],
    *,
    rows: Optional[List[Dict[str, Any]]] = None,
    status: str = "ready",
    error_code: str = "",
    rate_limit: Optional[Dict[str, Any]] = None,
    skipped: bool = False,
) -> Dict[str, Any]:
    step_id = _step_key(step)
    row_list = list(rows or [])
    return {
        "stepName": _text(step.get("label")) or step_id,
        "rows": row_list,
        "status": status,
        "errorCode": _text(error_code) or None,
        "rateLimitObj": rate_limit if isinstance(rate_limit, dict) else None,
        "skipped": bool(skipped),
        "selectedIds": [
            _batch_row_id(row, step_id, index)
            for index, row in enumerate(row_list)
            if not _text(_as_dict(row).get("duplicate_of"))
        ],
    }


def _batch_summary(draft: Dict[str, Any], *, total: int = 0, candidates: int = 0, processed: int = 0) -> Dict[str, int]:
    entries = [_as_dict(item) for item in _as_dict(draft).values()]
    count = lambda status: sum(1 for item in entries if _text(item.get("status")) == status)
    return {
        "total": int(total or len(entries)),
        "candidates": int(candidates),
        "processed": int(processed),
        "ready": count("ready"),
        "skipped_existing_action": count("skipped_existing_action"),
        "skipped_existing_draft": count("skipped_existing_suggestion"),
        "skipped_in_flight": count("skipped_in_flight"),
        "failed": count("failed"),
        "rate_limited": count("rate_limited"),
        "not_processed": count("not_processed"),
    }


def _batch_items_from_draft(draft: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for step_id, entry_raw in _as_dict(draft).items():
        entry = _as_dict(entry_raw)
        out.append(
            {
                "step_id": _text(step_id),
                "status": _text(entry.get("status")) or "ready",
                "suggestions": _as_list(entry.get("rows")),
                "error": _text(entry.get("errorCode")),
                "rate_limit": _as_dict(entry.get("rateLimitObj")),
            }
        )
    return out


def _chunk_steps(steps: List[Dict[str, Any]], max_steps_per_chunk: int) -> List[List[Dict[str, Any]]]:
    limit = max(1, min(_BATCH_MAX_STEPS_PER_CHUNK, int(max_steps_per_chunk or _BATCH_DEFAULT_STEPS_PER_CHUNK)))
    chunks: List[List[Dict[str, Any]]] = []
    current: List[Dict[str, Any]] = []
    current_chars = 0
    for step in steps:
        text_len = len(str(step))
        if current and (len(current) >= limit or current_chars + text_len > _BATCH_MAX_INPUT_CHARS):
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(step)
        current_chars += text_len
    if current:
        chunks.append(current)
    return chunks


def _save_batch_draft_to_session(session: Session, draft: Dict[str, Any], *, request: Request, org_id: str) -> None:
    interview = _as_dict(getattr(session, "interview", None))
    analysis = _as_dict(interview.get("analysis"))
    analysis["product_actions_batch_draft"] = draft
    interview["analysis"] = analysis
    session.interview = interview
    get_storage().save(session, user_id=_actor_user_id(request), org_id=org_id, is_admin=True)


def _safe_error_message(exc: Any, *, api_key: str = "", base_url: str = "") -> str:
    text = str(exc or "").strip() or "ai_suggestion_failed"
    for secret in (api_key, base_url):
        secret_text = _text(secret)
        if secret_text:
            text = text.replace(secret_text, "[redacted]")
    return text[:300]


def _controlled_error(error_code: str, *, module_id: str = _MODULE_ID, input_hash: str = "", message: str = "", diagnostics: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    code = _text(error_code) or "AI_PROVIDER_ERROR"
    out: Dict[str, Any] = {
        "ok": False,
        "error": code,
        "message": _text(message) or _CONTROLLED_ERROR_MESSAGES.get(code, code),
        "module_id": module_id,
        "input_hash": _text(input_hash),
        "warnings": [],
    }
    if diagnostics:
        out["diagnostics"] = diagnostics
    return out


@router.post("/api/sessions/{session_id}/analysis/product-actions/suggest")
def suggest_product_actions(session_id: str, inp: ProductActionsSuggestIn, request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    session = _load_session_for_request(request, session_id, org_id)
    project_id = _text(getattr(session, "project_id", ""))
    workspace_id = _project_workspace_id(project_id, org_id)
    actor_user_id = _actor_user_id(request)
    scope = {"org_id": org_id, "workspace_id": workspace_id, "project_id": project_id, "session_id": _text(session_id)}

    try:
        context = _build_context(session, org_id=org_id, workspace_id=workspace_id)
    except Exception as exc:
        context = {"session": {"id": _text(session_id), "project_id": project_id, "workspace_id": workspace_id}, "steps": [], "nodes": [], "edges": [], "existing_product_actions": []}
        context_error = _safe_error_message(exc)
    else:
        context_error = ""

    options = _as_dict(getattr(inp, "options", None))
    selected_binding = _selected_step_binding(options)
    selected_step_requested = bool(_text(selected_binding.get("step_id") or selected_binding.get("bpmn_element_id") or selected_binding.get("label")))
    selected_step_found = _filter_context_to_selected_step(context, selected_binding)

    max_suggestions = _max_suggestions(inp)
    input_payload = {
        "endpoint": _ENDPOINT,
        "session_id": _text(session_id),
        "steps_count": len(context.get("steps") or []),
        "nodes_count": len(context.get("nodes") or []),
        "edges_count": len(context.get("edges") or []),
        "existing_product_actions_count": len(context.get("existing_product_actions") or []),
        "max_suggestions": max_suggestions,
        "selected_step": dict(selected_binding) if selected_step_requested else {},
    }
    input_hash = hash_ai_input({"module_id": _MODULE_ID, "session_id": session_id, "context": context})
    started_at = time.time()
    created_at = int(started_at)
    execution_id = f"exec_{uuid.uuid4().hex[:16]}"
    prompt_template = ""
    prompt_id = ""
    prompt_version = ""
    try:
        llm = load_llm_settings()
    except Exception as exc:
        llm = {"api_key": "", "base_url": ""}
        settings_error = _safe_error_message(exc)
    else:
        settings_error = ""
    api_key = _text(llm.get("api_key"))
    base_url = _text(llm.get("base_url"))
    model_name = _text(llm.get("model")) or "deepseek-chat"

    def _finish(
        response: Dict[str, Any],
        *,
        status: str,
        output_summary: str = "",
        usage: Optional[Dict[str, Any]] = None,
        error_code: str = "",
        error_message: str = "",
    ) -> Dict[str, Any]:
        finished_at = int(time.time())
        latency_ms = int(max(0.0, time.time() - started_at) * 1000)
        try:
            record_ai_execution(
                module_id=_MODULE_ID,
                actor_user_id=actor_user_id,
                scope=scope,
                provider="deepseek",
                model=model_name,
                prompt_id=prompt_id,
                prompt_version=prompt_version,
                status=status,
                input_payload=input_payload,
                input_hash=input_hash,
                output_summary=output_summary,
                usage=usage if isinstance(usage, dict) else {},
                latency_ms=latency_ms,
                error_code=error_code,
                error_message=_safe_error_message(error_message, api_key=api_key, base_url=base_url),
                created_at=created_at,
                finished_at=finished_at,
            )
        except Exception:
            warnings = response.get("warnings")
            if isinstance(warnings, list):
                warnings.append({"code": "ai_execution_log_failed", "message": "AI execution log write failed."})
        return response

    if context_error:
        return _finish(
            _controlled_error("AI_PROVIDER_ERROR", input_hash=input_hash, message="Не удалось собрать контекст сессии для AI."),
            status="error",
            output_summary="context assembly failed",
            error_code="AI_PROVIDER_ERROR",
            error_message=context_error,
        )

    if selected_step_requested and not selected_step_found:
        return _finish(
            {
                "ok": True,
                "module_id": _MODULE_ID,
                "draft_id": f"draft_{uuid.uuid4().hex[:16]}",
                "source": "selected_step_filter",
                "prompt_id": "",
                "prompt_version": "",
                "input_hash": input_hash,
                "suggestions": [],
                "warnings": [{"code": "selected_step_not_found", "message": "Выбранный шаг не найден в контексте AI."}],
                "summary": {"suggestions_count": 0, "duplicate_count": 0, "incomplete_count": 0},
            },
            status="success",
            output_summary="selected step not found; no suggestions",
            usage={"suggestions_count": 0, "steps_count": 0},
        )

    if settings_error:
        return _finish(
            _controlled_error("AI_PROVIDER_ERROR", input_hash=input_hash, message="Не удалось прочитать настройки AI provider."),
            status="error",
            output_summary="provider settings read failed",
            error_code="AI_PROVIDER_ERROR",
            error_message=settings_error,
        )

    try:
        rate = check_ai_rate_limit(module_id=_MODULE_ID, actor_user_id=actor_user_id, scope=scope)
    except Exception:
        rate = {"allowed": True}
    if not bool(rate.get("allowed", rate.get("ok", True))):
        return _finish(
            {
                "ok": False,
                "error": "ai_rate_limit_exceeded",
                "message": "AI_RATE_LIMIT_EXCEEDED",
                "module_id": _MODULE_ID,
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

    if not api_key:
        return _finish(
            _controlled_error("AI_PROVIDER_NOT_CONFIGURED", input_hash=input_hash),
            status="error",
            output_summary="missing provider api key",
            error_code="AI_PROVIDER_NOT_CONFIGURED",
            error_message="AI_PROVIDER_NOT_CONFIGURED",
        )

    try:
        seed_existing_ai_prompts(actor_user_id="code_seeded")
        active_prompt = get_active_prompt(module_id=_MODULE_ID)
        prompt_template = _text((active_prompt or {}).get("template"))
        prompt_id = _text((active_prompt or {}).get("prompt_id"))
        prompt_version = _text((active_prompt or {}).get("version"))
    except Exception as exc:
        message = _safe_error_message(exc, api_key=api_key, base_url=base_url)
        return _finish(
            _controlled_error("AI_PROMPT_NOT_CONFIGURED", input_hash=input_hash),
            status="error",
            output_summary="prompt lookup failed",
            error_code="AI_PROMPT_NOT_CONFIGURED",
            error_message=message or "AI_PROMPT_NOT_CONFIGURED",
        )

    if not prompt_template:
        return _finish(
            _controlled_error("AI_PROMPT_NOT_CONFIGURED", input_hash=input_hash),
            status="error",
            output_summary="missing active prompt",
            error_code="AI_PROMPT_NOT_CONFIGURED",
            error_message="AI_PROMPT_NOT_CONFIGURED",
        )

    try:
        raw = suggest_product_actions_with_deepseek(
            context=context,
            api_key=api_key,
            base_url=base_url,
            prompt_template=prompt_template,
            max_suggestions=max_suggestions,
        )
        existing_actions = list(context.get("existing_product_actions") or [])
        raw_suggestions = list(raw.get("suggestions") or [])
        selected_suggestions = _filter_suggestions_to_selected_step(raw_suggestions, selected_binding)
        suggestions = _decorate_duplicates(selected_suggestions, existing_actions)[:max_suggestions]
        warnings = list(raw.get("warnings") or [])
        if selected_step_requested and len(selected_suggestions) < len(raw_suggestions):
            warnings.append(
                {
                    "code": "selected_step_filter_removed_unrelated",
                    "message": "Часть AI-предложений скрыта, потому что она относится к другим шагам процесса.",
                }
            )
        duplicate_count = sum(1 for row in suggestions if _text(row.get("duplicate_of")))
        incomplete_count = sum(1 for row in suggestions if row.get("missing_fields"))
        response = {
            "ok": True,
            "module_id": _MODULE_ID,
            "draft_id": f"draft_{uuid.uuid4().hex[:16]}",
            "source": "llm",
            "prompt_id": prompt_id,
            "prompt_version": prompt_version,
            "input_hash": input_hash,
            "suggestions": suggestions,
            "warnings": warnings,
            "summary": {
                "suggestions_count": len(suggestions),
                "duplicate_count": duplicate_count,
                "incomplete_count": incomplete_count,
            },
        }
        return _finish(
            response,
            status="success",
            output_summary=f"suggestions={len(suggestions)} duplicates={duplicate_count} incomplete={incomplete_count}",
            usage={
                "suggestions_count": len(suggestions),
                "duplicate_count": duplicate_count,
                "incomplete_count": incomplete_count,
                "steps_count": len(context.get("steps") or []),
            },
        )
    except ProductActionsAiResponseParseError as exc:
        message = _safe_error_message(exc, api_key=api_key, base_url=base_url)
        raw_content = getattr(exc, "raw_content", "")
        safe_excerpt = _safe_error_message(raw_content, api_key=api_key, base_url=base_url)[:300]
        diagnostics = {
            "module_id": _MODULE_ID,
            "execution_id": execution_id,
            "provider": "deepseek",
            "model": model_name,
            "parse_error": message,
            "response_excerpt": safe_excerpt,
            "request_payload": {
                "scope": "selected_step",
                "steps_count": len(context.get("steps") or []),
                "session_id": _text(session_id),
            },
        }
        return _finish(
            _controlled_error("AI_RESPONSE_PARSE_ERROR", input_hash=input_hash, diagnostics=diagnostics),
            status="error",
            output_summary="product actions suggestion response parse failed",
            error_code="AI_RESPONSE_PARSE_ERROR",
            error_message=message or "AI_RESPONSE_PARSE_ERROR",
        )
    except Exception as exc:
        message = _safe_error_message(exc, api_key=api_key, base_url=base_url)
        return _finish(
            _controlled_error("AI_PROVIDER_ERROR", input_hash=input_hash, message=message),
            status="error",
            output_summary="product actions suggestion failed",
            error_code="AI_PROVIDER_ERROR",
            error_message=message,
        )


@router.post("/api/sessions/{session_id}/analysis/product-actions/batch-suggest")
def batch_suggest_product_actions(session_id: str, inp: ProductActionsBatchSuggestIn, request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    session = _load_session_for_request(request, session_id, org_id)
    project_id = _text(getattr(session, "project_id", ""))
    workspace_id = _project_workspace_id(project_id, org_id)
    actor_user_id = _actor_user_id(request)
    scope = {"org_id": org_id, "workspace_id": workspace_id, "project_id": project_id, "session_id": _text(session_id)}
    batch_id = f"batch_{uuid.uuid4().hex[:16]}"
    started_at = time.time()
    created_at = int(started_at)
    options = _as_dict(getattr(inp, "options", None))
    skip_existing_actions = bool(options.get("skip_existing_actions", True))
    skip_existing_drafts = bool(options.get("skip_existing_drafts", True))
    max_steps_per_chunk = max(
        1,
        min(_BATCH_MAX_STEPS_PER_CHUNK, _as_int(options.get("max_steps_per_chunk"), _BATCH_DEFAULT_STEPS_PER_CHUNK)),
    )
    scope_name = _text(getattr(inp, "scope", "")) or "without_actions"

    context = _build_context(session, org_id=org_id, workspace_id=workspace_id)
    all_steps = [_as_dict(step) for step in _as_list(context.get("steps")) if _step_key(_as_dict(step))]
    requested_ids = {_text(item) for item in _as_list(getattr(inp, "step_ids", [])) if _text(item)}
    if requested_ids:
        all_steps = [
            step for step in all_steps
            if _step_key(step) in requested_ids or _step_bpmn_key(step) in requested_ids
        ]
    analysis = _as_dict(_as_dict(getattr(session, "interview", None)).get("analysis"))
    existing_draft = _as_dict(analysis.get("product_actions_batch_draft"))
    existing_actions = [_as_dict(action) for action in _as_list(context.get("existing_product_actions"))]
    draft: Dict[str, Any] = {}
    candidates: List[Dict[str, Any]] = []

    for step in all_steps:
        step_id = _step_key(step)
        previous_draft = _draft_entry_for_step(existing_draft, step)
        if scope_name == "without_actions" and skip_existing_actions and any(_action_matches_step(action, step) for action in existing_actions):
            draft[step_id] = _batch_entry(step, status="skipped_existing_action", skipped=True)
            continue
        if skip_existing_drafts and _draft_entry_has_ready_rows(previous_draft):
            preserved = dict(previous_draft)
            preserved["status"] = "skipped_existing_suggestion"
            preserved.setdefault("stepName", _text(step.get("label")) or step_id)
            preserved.setdefault("rows", _as_list(previous_draft.get("rows")))
            preserved.setdefault("selectedIds", [])
            draft[step_id] = preserved
            continue
        candidates.append(step)

    input_hash = hash_ai_input(
        {
            "module_id": _MODULE_ID,
            "endpoint": _BATCH_ENDPOINT,
            "session_id": session_id,
            "scope": scope_name,
            "step_ids": [_step_key(step) for step in all_steps],
            "draft_keys": sorted(existing_draft.keys()),
        }
    )
    in_flight_key = f"{org_id}:{session_id}:{scope_name}:{input_hash}"
    if in_flight_key in _BATCH_IN_FLIGHT:
        for step in candidates:
            draft[_step_key(step)] = _batch_entry(step, status="skipped_in_flight", skipped=True)
        summary = _batch_summary(draft, total=len(all_steps), candidates=len(candidates), processed=0)
        return {
            "ok": True,
            "batch_id": batch_id,
            "status": "running",
            "module_id": _MODULE_ID,
            "input_hash": input_hash,
            "summary": summary,
            "items": _batch_items_from_draft(draft),
            "draft": draft,
        }

    _BATCH_IN_FLIGHT.add(in_flight_key)
    prompt_id = ""
    prompt_version = ""
    model_name = "deepseek-chat"
    processed_count = 0
    try:
        try:
            llm = load_llm_settings()
        except Exception as exc:
            llm = {"api_key": "", "base_url": ""}
            settings_error = _safe_error_message(exc)
        else:
            settings_error = ""
        api_key = _text(llm.get("api_key"))
        base_url = _text(llm.get("base_url"))
        model_name = _text(llm.get("model")) or model_name

        def finish(status: str, error_code: str = "", error_message: str = "") -> Dict[str, Any]:
            summary = _batch_summary(draft, total=len(all_steps), candidates=len(candidates), processed=processed_count)
            response = {
                "ok": status != "error" or bool(draft),
                "batch_id": batch_id,
                "status": status,
                "module_id": _MODULE_ID,
                "input_hash": input_hash,
                "summary": summary,
                "items": _batch_items_from_draft(draft),
                "draft": draft,
            }
            if error_code:
                response["error"] = error_code
                response["message"] = error_message or error_code
            try:
                record_ai_execution(
                    module_id=_MODULE_ID,
                    actor_user_id=actor_user_id,
                    scope=scope,
                    provider="deepseek",
                    model=model_name,
                    prompt_id=prompt_id,
                    prompt_version=prompt_version,
                    status="error" if status == "error" else "success",
                    input_payload={
                        "endpoint": _BATCH_ENDPOINT,
                        "session_id": _text(session_id),
                        "total": len(all_steps),
                        "candidates": len(candidates),
                        "max_steps_per_chunk": max_steps_per_chunk,
                    },
                    input_hash=input_hash,
                    output_summary=str(summary),
                    usage={"steps_count": len(all_steps), "processed": processed_count},
                    latency_ms=int(max(0.0, time.time() - started_at) * 1000),
                    error_code=error_code,
                    error_message=_safe_error_message(error_message, api_key=api_key, base_url=base_url),
                    created_at=created_at,
                    finished_at=int(time.time()),
                )
            except Exception:
                response.setdefault("warnings", []).append({"code": "ai_execution_log_failed", "message": "AI execution log write failed."})
            return response

        if settings_error or not api_key:
            code = "AI_PROVIDER_ERROR" if settings_error else "AI_PROVIDER_NOT_CONFIGURED"
            message = settings_error or code
            for step in candidates:
                draft[_step_key(step)] = _batch_entry(step, status="failed", error_code=code)
            _save_batch_draft_to_session(session, draft, request=request, org_id=org_id)
            return finish("error", code, message)

        try:
            seed_existing_ai_prompts(actor_user_id="code_seeded")
            active_prompt = get_active_prompt(module_id=_MODULE_ID)
            prompt_template = _text((active_prompt or {}).get("template"))
            prompt_id = _text((active_prompt or {}).get("prompt_id"))
            prompt_version = _text((active_prompt or {}).get("version"))
        except Exception as exc:
            prompt_template = ""
            prompt_error = _safe_error_message(exc, api_key=api_key, base_url=base_url)
        else:
            prompt_error = ""
        if not prompt_template:
            code = "AI_PROMPT_NOT_CONFIGURED"
            for step in candidates:
                draft[_step_key(step)] = _batch_entry(step, status="failed", error_code=code)
            _save_batch_draft_to_session(session, draft, request=request, org_id=org_id)
            return finish("error", code, prompt_error or code)

        chunks = _chunk_steps(candidates, max_steps_per_chunk)
        for chunk_index, chunk in enumerate(chunks):
            try:
                rate = check_ai_rate_limit(module_id=_MODULE_ID, actor_user_id=actor_user_id, scope=scope)
            except Exception:
                rate = {"allowed": True}
            if not bool(rate.get("allowed", rate.get("ok", True))):
                rate_limit = {
                    "limit": int(rate.get("limit") or 0),
                    "window_sec": int(rate.get("window_sec") or 0),
                    "reset_at": int(rate.get("reset_at") or 0),
                }
                for step in [item for rest in chunks[chunk_index:] for item in rest]:
                    draft[_step_key(step)] = _batch_entry(step, status="rate_limited", error_code="ai_rate_limit_exceeded", rate_limit=rate_limit)
                _save_batch_draft_to_session(session, draft, request=request, org_id=org_id)
                return finish("rate_limited", "ai_rate_limit_exceeded", "ai_rate_limit_exceeded")

            chunk_step_ids = {_step_key(step) for step in chunk}
            chunk_bpmn_ids = {_step_bpmn_key(step) for step in chunk if _step_bpmn_key(step)}
            chunk_context = {
                **context,
                "steps": chunk,
                "nodes": [
                    node for node in _as_list(context.get("nodes"))
                    if _text(_as_dict(node).get("id")) in chunk_bpmn_ids
                ],
                "edges": [
                    edge for edge in _as_list(context.get("edges"))
                    if _text(_as_dict(edge).get("source")) in chunk_bpmn_ids
                    or _text(_as_dict(edge).get("target")) in chunk_bpmn_ids
                ],
                "batch": {
                    "batch_id": batch_id,
                    "chunk_index": chunk_index,
                    "chunk_count": len(chunks),
                    "step_ids": sorted(chunk_step_ids),
                    "use_rag_context": False,
                },
            }
            try:
                raw = suggest_product_actions_with_deepseek(
                    context=chunk_context,
                    api_key=api_key,
                    base_url=base_url,
                    prompt_template=prompt_template,
                    max_suggestions=max(1, min(40, len(chunk) * 3)),
                )
                suggestions = _decorate_duplicates(list(raw.get("suggestions") or []), existing_actions)
            except ProductActionsAiResponseParseError:
                for step in chunk:
                    draft[_step_key(step)] = _batch_entry(step, status="failed", error_code="AI_RESPONSE_PARSE_ERROR")
                processed_count += len(chunk)
                continue
            except Exception as exc:
                message = _safe_error_message(exc, api_key=api_key, base_url=base_url)
                for step in chunk:
                    draft[_step_key(step)] = _batch_entry(step, status="failed", error_code=message or "AI_PROVIDER_ERROR")
                processed_count += len(chunk)
                continue

            for step in chunk:
                step_id = _step_key(step)
                binding = {"step_id": step_id, "bpmn_element_id": _step_bpmn_key(step), "label": _text(step.get("label"))}
                rows = []
                for row in _filter_suggestions_to_selected_step(suggestions, binding):
                    next_row = dict(row)
                    next_row["batch_id"] = batch_id
                    next_row["input_hash"] = input_hash
                    next_row["step_id"] = _text(next_row.get("step_id")) or step_id
                    next_row["step_label"] = _text(next_row.get("step_label")) or _text(step.get("label"))
                    next_row["status"] = _text(next_row.get("status")) or "ready"
                    next_row["source"] = _text(next_row.get("source")) or "ai_suggested"
                    next_row["created_at"] = int(time.time())
                    if not _text(next_row.get("action_title")):
                        obj = _text(next_row.get("action_object") or next_row.get("product_name"))
                        action_type = _text(next_row.get("action_type"))
                        next_row["action_title"] = " ".join(part for part in (action_type, obj) if part) or _text(step.get("label"))
                    rows.append(next_row)
                draft[step_id] = _batch_entry(step, rows=rows, status="ready")
            processed_count += len(chunk)

        _save_batch_draft_to_session(session, draft, request=request, org_id=org_id)
        return finish("completed")
    finally:
        _BATCH_IN_FLIGHT.discard(in_flight_key)


@router.post("/api/analysis/product-actions/suggest-bulk")
def suggest_product_actions_bulk(inp: ProductActionsBulkSuggestIn, request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)

    session_ids = _unique_session_ids(inp.session_ids)
    if not session_ids:
        raise HTTPException(status_code=422, detail="session_ids required")
    if len(session_ids) > _BULK_SESSION_CAP:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "bulk_session_cap_exceeded",
                "cap": _BULK_SESSION_CAP,
            },
        )

    results: List[Dict[str, Any]] = []
    for session_id in session_ids:
        session_title = ""
        project_id = ""
        try:
            session = _load_session_for_request(request, session_id, org_id)
            session_title = _text(getattr(session, "title", "")) or "Без названия"
            project_id = _text(getattr(session, "project_id", ""))
            draft = suggest_product_actions(session_id, ProductActionsSuggestIn(options=inp.options or {}), request)
            ok = bool(draft.get("ok"))
            results.append(
                {
                    "session_id": session_id,
                    "session_title": session_title,
                    "project_id": project_id,
                    "status": "success" if ok else "error",
                    "ok": ok,
                    "draft_id": _text(draft.get("draft_id")),
                    "input_hash": _text(draft.get("input_hash")),
                    "source": _text(draft.get("source")),
                    "prompt_id": _text(draft.get("prompt_id")),
                    "prompt_version": _text(draft.get("prompt_version")),
                    "suggestions": list(_as_list(draft.get("suggestions"))) if ok else [],
                    "warnings": list(_as_list(draft.get("warnings"))),
                    "summary": _as_dict(draft.get("summary")),
                    "error_code": "" if ok else _text(draft.get("error")),
                    "error_message": "" if ok else _text(draft.get("message") or draft.get("error")),
                }
            )
        except HTTPException as exc:
            results.append(
                {
                    "session_id": session_id,
                    "session_title": session_title or "Без названия",
                    "project_id": project_id,
                    "status": "error",
                    "ok": False,
                    "suggestions": [],
                    "warnings": [],
                    "summary": {},
                    "error_code": "not_found" if exc.status_code == 404 else "http_error",
                    "error_message": _text(exc.detail) or "session_error",
                }
            )
        except Exception as exc:
            results.append(
                {
                    "session_id": session_id,
                    "session_title": session_title or "Без названия",
                    "project_id": project_id,
                    "status": "error",
                    "ok": False,
                    "suggestions": [],
                    "warnings": [],
                    "summary": {},
                    "error_code": "AI_PROVIDER_ERROR",
                    "error_message": _safe_error_message(exc),
                }
            )

    success_count = sum(1 for item in results if item.get("ok"))
    suggestions_count = sum(len(item.get("suggestions") or []) for item in results)
    return {
        "ok": True,
        "module_id": _MODULE_ID,
        "endpoint": _BULK_ENDPOINT,
        "cap": _BULK_SESSION_CAP,
        "requested_sessions": len(session_ids),
        "success_count": success_count,
        "error_count": len(results) - success_count,
        "suggestions_count": suggestions_count,
        "results": results,
    }


@router.get("/api/sessions/{session_id}/analysis/product-actions/batch-draft")
def get_batch_draft(session_id: str, request: Request) -> Dict[str, Any]:
    """Load batch draft from session analysis state."""
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    session = _load_session_for_request(request, session_id, org_id)

    interview = _as_dict(getattr(session, "interview", None))
    analysis = _as_dict(interview.get("analysis"))
    batch_draft = _as_dict(analysis.get("product_actions_batch_draft"))

    return {
        "ok": True,
        "draft": batch_draft if batch_draft else None,
    }


@router.put("/api/sessions/{session_id}/analysis/product-actions/batch-draft")
def save_batch_draft(session_id: str, inp: BatchDraftIn, request: Request) -> Dict[str, Any]:
    """Save batch AI draft to session analysis state."""
    require_authenticated_user(request)
    org_id = request_active_org_id(request)
    require_org_member_for_enterprise(request, org_id)
    session = _load_session_for_request(request, session_id, org_id)

    storage = get_storage()

    # Load current interview and analysis
    interview = _as_dict(getattr(session, "interview", None))
    analysis = _as_dict(interview.get("analysis"))

    # Update batch draft
    if inp.draft is None:
        # Clear batch draft
        analysis.pop("product_actions_batch_draft", None)
    else:
        # Save batch draft
        analysis["product_actions_batch_draft"] = inp.draft

    # Save back to session.interview.analysis
    interview["analysis"] = analysis
    session.interview = interview
    storage.save(session, user_id=_actor_user_id(request), org_id=org_id, is_admin=True)

    return {
        "ok": True,
        "saved": inp.draft is not None,
    }
