"""Tests for PromptBuilder.

Covers:
- feature/agent-model-routing-optimization-v1: model_class routing per intent.
- feature/agent-prompt-stack-compression-v1: compact projection, history budget,
  pending-edit protection, token estimates.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from schemas import AgentChatIn
from memory.context import AgentContext
from memory.prompt_builder import (
    PromptBuilder,
    PromptBudgetConfig,
    _build_compact_projection,
    _format_history,
    _is_pending_edit_turn,
    _select_relevant_step_ids,
    estimate_tokens,
)


# --- helpers for compression tests ---


@dataclass
class _FakeTurn:
    role: str
    content: Dict[str, Any] = field(default_factory=dict)
    action: Optional[str] = None
    action_payload: Dict[str, Any] = field(default_factory=dict)
    projection_digest: Optional[str] = None


@dataclass
class _FakeCtx:
    projection: Dict[str, Any]
    digest: str
    history: List[_FakeTurn]


def _make_projection() -> Dict[str, Any]:
    return {
        "steps": [
            {"id": "s1", "type": "task", "name_ru": "Приёмка", "duration": 5, "role": "технолог", "operation_code": "оп_001"},
            {"id": "s2", "type": "userTask", "name_ru": "Мытьё", "duration": 10, "role": "повар", "operation_code": "оп_002"},
            {"id": "s3", "type": "userTask", "name_ru": "Нарезка", "duration": 15, "role": "повар"},
            {"id": "s4", "type": "exclusiveGateway", "name_ru": "Контроль", "duration": None, "role": ""},
        ],
        "edges": [
            {"from": "s1", "to": "s2"},
            {"from": "s2", "to": "s3"},
            {"from": "s3", "to": "s4"},
        ],
        "meta": {"session_id": "sess", "rev": 1, "nodes_count": 4, "schema": 1},
    }


# --- helpers for routing tests ---


def _ctx(projection: dict | None = None) -> AgentContext:
    return AgentContext(
        session=SimpleNamespace(id="s", project_id="p"),
        projection=projection or {"steps": [{"id": "step_1"}]},
        digest="d" * 32,
        history=[],
    )


def _payload(message: str = "hello", selected_step_id: str = "") -> SimpleNamespace:
    return SimpleNamespace(message=message, selected_step_id=selected_step_id)


# --- compression tests ---


def test_estimate_tokens_positive_for_non_empty():
    assert estimate_tokens("hello world") > 0
    assert estimate_tokens("Привет") > 0


def test_build_processman_prompt_includes_statistics():
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=[])
    builder = PromptBuilder()
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="что это"))

    assert "Всего узлов: 4" in assembly.user_prompt
    assert "task" in assembly.user_prompt
    assert "userTask" in assembly.user_prompt
    assert "exclusiveGateway" in assembly.user_prompt


def test_build_processman_prompt_includes_selected_step_neighborhood():
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=[])
    builder = PromptBuilder()
    assembly = builder.build_processman_prompt(
        ctx, AgentChatIn(message="что дальше", selected_step_id="s2")
    )

    assert "s1" in assembly.user_prompt
    assert "s2" in assembly.user_prompt
    assert "s3" in assembly.user_prompt
    assert "s4" not in assembly.user_prompt


def test_build_processman_prompt_includes_rag_chunks():
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=[])
    builder = PromptBuilder()
    rag_chunks = [
        {"metadata": {"element_id": "s3"}, "element_name": "Нарезка", "chunk_text": "подробности"}
    ]
    assembly = builder.build_processman_prompt(
        ctx, AgentChatIn(message="расскажи про нарезку"), rag_chunks=rag_chunks
    )

    assert "s3" in assembly.user_prompt
    assert "Нарезка" in assembly.user_prompt


def test_history_turns_are_trimmed_to_budget():
    history = [
        _FakeTurn(role="user", content={"text": "привет"}),
        _FakeTurn(role="assistant", content={"text": "отвечаю"}),
    ] + [
        _FakeTurn(role="user", content={"text": f"вопрос {i}"})
        for i in range(20)
    ]
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=history)
    config = PromptBudgetConfig(max_history_tokens=20, history_turns_full=6)
    builder = PromptBuilder(config=config)
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="ok"))

    assert "привет" not in assembly.user_prompt
    assert assembly.estimated_prompt_tokens < 5000


def test_pending_edit_turns_never_trimmed():
    history = [
        _FakeTurn(role="user", content={"text": "измени схему"}, action="edit_canvas"),
        _FakeTurn(role="assistant", content={"text": "предлагаю"}),
    ] + [
        _FakeTurn(role="user", content={"text": f"вопрос {i}"})
        for i in range(30)
    ]
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=history)
    config = PromptBudgetConfig(max_history_tokens=10, history_turns_full=2)
    builder = PromptBuilder(config=config)
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="ok"))

    assert "измени схему" in assembly.user_prompt
    assert "Неподтверждённые правки схемы" in assembly.user_prompt


def test_is_pending_edit_turn_detects_payload_status():
    turn = _FakeTurn(
        role="user",
        content={"text": "x"},
        action_payload={"status": "pending_confirmation"},
    )
    assert _is_pending_edit_turn(turn) is True


def test_history_summary_used_for_older_turns():
    history = [
        _FakeTurn(role="user", content={"text": "old1"}),
        _FakeTurn(role="assistant", content={"text": "old2"}),
        _FakeTurn(role="user", content={"text": "recent"}),
    ]
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=history)
    config = PromptBudgetConfig(max_history_tokens=200, history_turns_full=1)
    builder = PromptBuilder(config=config)
    assembly = builder.build_processman_prompt(
        ctx, AgentChatIn(message="ok"), conversation_summary="ранее обсуждали мойку"
    )

    assert "ранее обсуждали мойку" in assembly.user_prompt
    assert "old1" not in assembly.user_prompt
    assert "recent" in assembly.user_prompt


def test_compact_projection_falls_back_to_statistics_on_large_projection():
    big = {
        "steps": [
            {
                "id": f"s{i}",
                "type": "task",
                "name_ru": f"Шаг {i} с очень длинным описанием для раздувания токенов",
            }
            for i in range(100)
        ],
        "edges": [{"from": f"s{i}", "to": f"s{i+1}"} for i in range(99)],
        "meta": {"schema": 1, "rev": 1},
    }
    ctx = _FakeCtx(projection=big, digest="d", history=[])
    config = PromptBudgetConfig(max_projection_tokens=50)
    builder = PromptBuilder(config=config)
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="ok"))

    assert "Всего узлов: 100" in assembly.user_prompt


def test_select_relevant_step_ids_with_rag_and_selected():
    projection = _make_projection()
    rag_chunks = [{"metadata": {"element_id": "s4"}}]
    config = PromptBudgetConfig(rag_top_k=5, selected_step_radius=1)
    selected = _select_relevant_step_ids(projection, "s2", rag_chunks, config)

    assert "s2" in selected
    assert "s1" in selected
    assert "s3" in selected
    assert "s4" in selected


def test_build_compact_projection_formats_edges_between_selected():
    projection = _make_projection()
    text = _build_compact_projection(projection, {"s1", "s2", "s3"})

    assert "s1 -> s2" in text
    assert "s3 -> s4" not in text


def test_prompt_builder_build_returns_dict_for_smalltalk():
    result = PromptBuilder.build("smalltalk", _ctx(), _payload())
    assert result["model_class"] == "cheap"
    assert "input" in result["payload"]
    assert result["max_tokens"] > 0
    assert "estimated_prompt_tokens" in result
    assert "layer_tokens" in result


# --- routing tests ---


def test_smalltalk_is_cheap():
    result = PromptBuilder.build("smalltalk", _ctx(), _payload())
    assert result["model_class"] == "cheap"
    assert "input" in result["payload"]
    assert result["max_tokens"] > 0


def test_schema_overview_is_cheap():
    result = PromptBuilder.build("schema_overview", _ctx(), _payload())
    assert result["model_class"] == "cheap"
    assert "BPMN-схему" in result["payload"]["input"]
    assert result["max_tokens"] == 400


def test_doc_qa_with_rag_is_cheap():
    rag = [{"chunk": "Отрывок 1"}, {"chunk": "Отрывок 2"}]
    result = PromptBuilder.build("doc_qa", _ctx(), _payload(message="вопрос"), rag_results=rag)
    assert result["model_class"] == "cheap"
    assert "Отрывок 1" in result["payload"]["input"]
    assert "вопрос" in result["payload"]["input"]


def test_doc_qa_fallback_is_primary():
    result = PromptBuilder.build("doc_qa_fallback", _ctx(), _payload(message="вопрос"))
    assert result["model_class"] == "primary"


def test_unknown_intent_defaults_to_primary():
    result = PromptBuilder.build("weird_intent", _ctx(), _payload())
    assert result["model_class"] == "primary"


def test_doc_qa_empty_rag_falls_back_to_primary():
    """PromptBuilder safeguards: doc_qa with empty results falls back to free answer."""
    result = PromptBuilder.build("doc_qa", _ctx(), _payload(message="вопрос"), rag_results=[])
    assert result["model_class"] == "primary"
