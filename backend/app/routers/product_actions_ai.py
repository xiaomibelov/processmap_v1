from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..ai.execution_log import check_ai_rate_limit, hash_ai_input, record_ai_execution
from ..ai.product_actions_suggest import (
    PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE,
    suggest_product_actions_with_deepseek,
)
from ..ai.prompt_registry import get_active_prompt, seed_existing_ai_prompts
from ..legacy.request_context import require_authenticated_user, request_active_org_id
from ..models import Edge, Node, Session
from ..services.org_workspace import project_access_allowed, require_org_member_for_enterprise
from ..settings import load_llm_settings
from ..storage import get_project_storage, get_storage

router = APIRouter(tags=["product-actions-ai"])

_MODULE_ID = "ai.product_actions.suggest"
_ENDPOINT = "POST /api/sessions/{session_id}/analysis/product-actions/suggest"
_REQUIRED_FIELDS = ("product_name", "product_group", "action_type", "action_object")


class ProductActionsSuggestIn(BaseModel):
    options: Optional[Dict[str, Any]] = Field(default_factory=dict)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _actor_user_id(request: Request) -> str:
    user = getattr(getattr(request, "state", None), "auth_user", None)
    if isinstance(user, dict):
        return _text(user.get("id") or user.get("sub") or user.get("email"))
    return ""


def _max_suggestions(inp: ProductActionsSuggestIn) -> int:
    options = _as_dict(getattr(inp, "options", None))
    try:
        value = int(options.get("max_suggestions") or 20)
    except Exception:
        value = 20
    return max(1, min(value, 40))


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
        key = _suggestion_key(row)
        duplicate_of = ""
        duplicate_reason = ""
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


def _safe_error_message(exc: Any, *, api_key: str = "", base_url: str = "") -> str:
    text = str(exc or "").strip() or "ai_suggestion_failed"
    for secret in (api_key, base_url):
        secret_text = _text(secret)
        if secret_text:
            text = text.replace(secret_text, "[redacted]")
    return text[:300]


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

    seed_existing_ai_prompts(actor_user_id="code_seeded")
    active_prompt = get_active_prompt(module_id=_MODULE_ID)
    prompt_template = _text((active_prompt or {}).get("template")) or PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE
    prompt_id = _text((active_prompt or {}).get("prompt_id"))
    prompt_version = _text((active_prompt or {}).get("version"))

    context = _build_context(session, org_id=org_id, workspace_id=workspace_id)
    max_suggestions = _max_suggestions(inp)
    input_hash = hash_ai_input({"module_id": _MODULE_ID, "session_id": session_id, "context": context})
    input_payload = {
        "endpoint": _ENDPOINT,
        "session_id": _text(session_id),
        "steps_count": len(context.get("steps") or []),
        "nodes_count": len(context.get("nodes") or []),
        "edges_count": len(context.get("edges") or []),
        "existing_product_actions_count": len(context.get("existing_product_actions") or []),
        "max_suggestions": max_suggestions,
    }
    started_at = time.time()
    created_at = int(started_at)
    llm = load_llm_settings()
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
        return response

    try:
        rate = check_ai_rate_limit(module_id=_MODULE_ID, actor_user_id=actor_user_id, scope=scope)
    except Exception:
        rate = {"allowed": True}
    if not bool(rate.get("allowed", rate.get("ok", True))):
        return _finish(
            {
                "ok": False,
                "error": "ai_rate_limit_exceeded",
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
            {"ok": False, "error": "deepseek api_key is not set", "module_id": _MODULE_ID, "input_hash": input_hash},
            status="error",
            output_summary="missing provider api key",
            error_code="missing_api_key",
            error_message="deepseek api_key is not set",
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
        suggestions = _decorate_duplicates(list(raw.get("suggestions") or []), existing_actions)
        warnings = list(raw.get("warnings") or [])
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
    except Exception as exc:
        message = _safe_error_message(exc, api_key=api_key, base_url=base_url)
        return _finish(
            {"ok": False, "error": f"product actions suggestion failed: {message}", "module_id": _MODULE_ID, "input_hash": input_hash},
            status="error",
            output_summary="product actions suggestion failed",
            error_code="suggestion_failed",
            error_message=message,
        )
