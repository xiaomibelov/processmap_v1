"""Thin action runners wrapping LLM3 schema_assistant helpers."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import Request

from ..ai import schema_assistant


def run_suggest_next(session_id: str, request: Request, after_step_id: str = "") -> Dict[str, Any]:
    """Runner for 'suggest-next' — delegates to LLM3 with catalog guard."""
    return schema_assistant.llm_suggest_next(session_id, request=request, after_step_id=after_step_id)


def run_explain_step(session_id: str, request: Request, step_id: str = "") -> Dict[str, Any]:
    """Runner for 'explain-step' — delegates to LLM3 trace_map retelling."""
    return schema_assistant.llm_explain_step(session_id, request=request, step_id=step_id)


def run_step_qa(session_id: str, request: Request, step_id: str = "", question: str = "") -> Dict[str, Any]:
    """Runner for 'step-qa' — delegates to LLM3 with step+neighbours context."""
    return schema_assistant.llm_step_qa(session_id, request=request, step_id=step_id, question=question)
