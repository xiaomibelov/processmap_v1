"""Action runners — HTTP к монолитным LLM3 endpoints с пробросом JWT пользователя.

Сервисная замена backend/app/agent/action_runners.py (там — прямой вызов
schema_assistant). Guard'ы LLM3 (живой каталог, trace_map, шаг в проекции)
НЕ дублируются — остаются в монолите; сервис проксирует вызов и возвращает
ответ как dict. Недоступность монолита → честный {"ok": False, "status":
"error"} (HTTP-контракт chat не ломается, как gateway-статусы в монолите).
"""
from __future__ import annotations

from typing import Any, Dict

import httpx

from .monolith_client import DEFAULT_TIMEOUT_SEC, _base_url, _headers


def _post_llm3(session_id: str, action_path: str, token: str, *, params: Dict[str, Any], json_body: Dict[str, Any] = None, org_id: str = "") -> Dict[str, Any]:
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/llm/{action_path}"
    try:
        resp = httpx.post(
            url,
            headers=_headers(token, org_id),
            params={k: v for k, v in params.items() if v},
            json=json_body or {},
            timeout=DEFAULT_TIMEOUT_SEC * 2 + 10,  # запас на retry внутри gateway монолита
        )
    except Exception as exc:
        return {"ok": False, "status": "error", "error": f"monolith unreachable: {exc.__class__.__name__}: {exc}"}
    if resp.status_code != 200:
        return {"ok": False, "status": "error", "error": f"monolith llm/{action_path} HTTP {resp.status_code}"}
    try:
        data = resp.json()
    except Exception as exc:
        return {"ok": False, "status": "error", "error": f"monolith llm/{action_path} invalid json: {exc.__class__.__name__}"}
    return data if isinstance(data, dict) else {"ok": False, "status": "error", "error": "invalid_json_root"}


def run_suggest_next(session_id: str, token: str, after_step_id: str = "", *, org_id: str = "") -> Dict[str, Any]:
    """Runner for 'suggest-next' — LLM3 монолита с catalog guard."""
    return _post_llm3(session_id, "suggest-next", token, params={"after_step_id": after_step_id}, org_id=org_id)


def run_explain_step(session_id: str, token: str, step_id: str = "", *, org_id: str = "") -> Dict[str, Any]:
    """Runner for 'explain-step' — LLM3 монолита, пересказ trace_map."""
    return _post_llm3(session_id, "explain-step", token, params={"step_id": step_id}, org_id=org_id)


def run_step_qa(session_id: str, token: str, step_id: str = "", question: str = "", *, org_id: str = "") -> Dict[str, Any]:
    """Runner for 'step-qa' — LLM3 монолита, контекст = шаг + соседи."""
    return _post_llm3(session_id, "step-qa", token, params={"step_id": step_id}, json_body={"question": question}, org_id=org_id)
