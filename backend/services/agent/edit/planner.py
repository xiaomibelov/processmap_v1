"""Планировщик правок канваса (AGENT-3).

Получает запрос пользователя, вызывает cheap-модель (agent_edit_propose),
валидирует план, при необходимости просит LLM исправить (цикл ≤ max_iterations).
Сервис не импортирует backend.app.*.
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional, Tuple

from gateway.gateway import complete
from gateway import llm_store

from .validator import validate_edit_plan


FEATURE = "agent_edit_propose"
MAX_TOKENS = 800
MAX_ITERATIONS = 6


def _now_ms() -> int:
    return int(time.time())


def _to_json_text(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except Exception:
        return "{}"


def _extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    import re

    raw = str(text or "").strip()
    if not raw:
        return None
    block_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    candidate = block_match.group(1).strip() if block_match else raw
    obj_match = re.search(r"\{[\s\S]*\}", candidate)
    if obj_match:
        candidate = obj_match.group(0).strip()
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _build_propose_prompt(
    question: str,
    projection: Dict[str, Any],
    selected_node_id: Optional[str] = None,
    validation_errors: Optional[List[str]] = None,
    previous_plan: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    parts = [
        "=== BPMN-схема ===",
        _to_json_text(projection),
    ]
    if selected_node_id:
        parts.append(f"Выбранный шаг: {selected_node_id}")
    parts.append(f"Запрос пользователя: {question}")
    if validation_errors:
        parts.append("=== Ошибки в предыдущем плане ===")
        parts.extend(f"- {e}" for e in validation_errors)
        parts.append("=== Предыдущий план ===")
        parts.append(_to_json_text(previous_plan))
        parts.append("Исправь план и верни только JSON с edit_plan.")
    return {"input": "\n\n".join(parts)}


def _check_feature_enabled(org_id: str) -> Optional[Tuple[str, str]]:
    """Вернуть (status, error) если фича выключена/лимит исчерпан."""
    flag = llm_store.get_feature_flag("agent_edit_propose")
    if flag is not None and not flag.get("enabled"):
        return ("disabled", "feature 'agent_edit_propose' is disabled")
    if flag is not None:
        limit = int(flag.get("daily_token_limit") or 0)
        if limit > 0:
            used = llm_store.usage_daily_tokens("agent_edit_propose", org_id, int(time.time()) - 24 * 3600)
            if used >= limit:
                return ("rate_limited", f"daily token limit reached ({used}/{limit})")
    return None


def propose_edit_plan(
    question: str,
    projection: Dict[str, Any],
    token: str,
    session_id: str,
    org_id: str,
    user_id: str,
    project_id: str,
    *,
    selected_node_id: Optional[str] = None,
    max_iterations: int = MAX_ITERATIONS,
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """Сформировать и валидировать edit_plan.

    Returns:
        (edit_plan, metadata)
        edit_plan — None если не удалось; metadata содержит status, iterations, errors.
    """
    disabled = _check_feature_enabled(org_id)
    if disabled:
        return None, {"status": disabled[0], "error": disabled[1], "iterations": 0, "validation_errors": []}

    current_plan: Optional[Dict[str, Any]] = None
    validation_errors: List[str] = []

    for iteration in range(1, max_iterations + 1):
        prompt = _build_propose_prompt(
            question,
            projection,
            selected_node_id=selected_node_id,
            validation_errors=validation_errors if current_plan is not None else None,
            previous_plan=current_plan,
        )
        result = complete(
            FEATURE,
            payload=prompt,
            user_id=user_id,
            project_id=project_id,
            session_id=session_id,
            org_id=org_id,
            max_tokens=MAX_TOKENS,
        )
        if not result.get("ok"):
            return None, {"status": result.get("status", "error"), "error": str(result.get("error") or ""), "iterations": iteration, "validation_errors": []}

        candidate = _extract_json_block(str(result.get("text") or ""))
        if candidate is None:
            validation_errors = ["ответ не содержит JSON-объект edit_plan"]
            current_plan = None
            continue

        validation_errors = validate_edit_plan(candidate, projection, token, session_id)
        if not validation_errors:
            return candidate, {"status": "ok", "iterations": iteration, "validation_errors": []}

        current_plan = candidate

    return None, {
        "status": "edit_plan_failed",
        "error": "не удалось составить валидный план за {} итераций".format(max_iterations),
        "iterations": max_iterations,
        "validation_errors": validation_errors,
    }
