"""Unit tests for PromptBuilder."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from schemas import AgentChatIn
from memory.prompt_builder import (
    PromptBuilder,
    PromptBudgetConfig,
    _build_compact_projection,
    _format_history,
    _is_pending_edit_turn,
    _select_relevant_step_ids,
    estimate_tokens,
)


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

    assert "s2" in assembly.user_prompt
    assert "s1" in assembly.user_prompt or "s3" in assembly.user_prompt
    assert "Мытьё" in assembly.user_prompt


def test_build_processman_prompt_includes_rag_chunks():
    projection = _make_projection()
    ctx = _FakeCtx(projection=projection, digest="d", history=[])
    rag_chunks = [
        {
            "element_id": "s4",
            "element_name": "Контроль",
            "chunk_text": "описание контроля",
            "metadata": {"element_id": "s4", "element_name": "Контроль"},
        }
    ]
    builder = PromptBuilder()
    assembly = builder.build_processman_prompt(
        ctx, AgentChatIn(message="расскажи про контроль"), rag_chunks=rag_chunks
    )

    assert "Контроль" in assembly.user_prompt
    assert "s4" in assembly.user_prompt


def test_build_processman_prompt_does_not_dump_full_projection_json():
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=[])
    builder = PromptBuilder()
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="что это"))

    # Full JSON dump would contain the literal key "name_ru" many times.
    # Compact format uses statistics instead.
    assert '"steps":' not in assembly.user_prompt
    assert '"edges":' not in assembly.user_prompt


def test_history_keeps_last_n_turns():
    history = [
        _FakeTurn(role="user", content={"text": f"вопрос {i}"}, projection_digest="d")
        for i in range(1, 21)
    ]
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=history)
    builder = PromptBuilder(PromptBudgetConfig(history_turns_full=4))
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="ok"))

    assert "вопрос 20" in assembly.history_text
    assert "вопрос 17" in assembly.history_text
    # Older turns should be summarized or noted.
    assert "Ранее в диалоге" in assembly.history_text or "вопрос 1" not in assembly.history_text


def test_history_uses_conversation_summary():
    history = [
        _FakeTurn(role="user", content={"text": f"вопрос {i}"}, projection_digest="d")
        for i in range(1, 21)
    ]
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=history)
    builder = PromptBuilder(PromptBudgetConfig(history_turns_full=4))
    assembly = builder.build_processman_prompt(
        ctx,
        AgentChatIn(message="ok"),
        conversation_summary="Ранее обсуждали процесс приёмки.",
    )

    assert "Ранее обсуждали процесс приёмки" in assembly.history_text


def test_history_does_not_exceed_budget():
    long_history = [
        _FakeTurn(role="user", content={"text": "x" * 500}, projection_digest="d")
        for _ in range(20)
    ]
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=long_history)
    config = PromptBudgetConfig(max_history_tokens=200, history_turns_full=10)
    builder = PromptBuilder(config)
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="ok"))

    assert assembly.layer_tokens["history"] <= config.max_history_tokens


def test_pending_edit_turn_never_trimmed():
    pending_turn = _FakeTurn(
        role="assistant",
        content={"text": "Предлагаю изменить схему"},
        action="edit_canvas",
        action_payload={"pending_edit_id": "pe_1", "status": "pending_confirmation"},
        projection_digest="d",
    )
    filler = [
        _FakeTurn(role="user", content={"text": "x" * 500}, projection_digest="d")
        for _ in range(20)
    ]
    history = filler + [pending_turn]
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=history)
    config = PromptBudgetConfig(max_history_tokens=200, history_turns_full=2)
    builder = PromptBuilder(config)
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="ок"))

    assert "Предлагаю изменить схему" in assembly.history_text


def test_is_pending_edit_turn_detection():
    assert _is_pending_edit_turn(
        _FakeTurn(role="assistant", action="edit_canvas", action_payload={})
    )
    assert _is_pending_edit_turn(
        _FakeTurn(role="assistant", action_payload={"pending_edit_id": "pe_1"})
    )
    assert _is_pending_edit_turn(
        _FakeTurn(role="assistant", action_payload={"status": "pending_confirmation"})
    )
    assert not _is_pending_edit_turn(
        _FakeTurn(role="assistant", action="schema_overview", action_payload={})
    )


def test_projection_budget_not_exceeded():
    projection = _make_projection()
    # Expand projection to many nodes.
    projection["steps"] = [
        {
            "id": f"s{i}",
            "type": "userTask" if i % 2 == 0 else "task",
            "name_ru": f"Длинное название шага {i} для измерения токенов",
            "duration": i,
            "role": "повар" if i % 2 == 0 else "технолог",
        }
        for i in range(1, 301)
    ]
    projection["edges"] = [{"from": f"s{i}", "to": f"s{i+1}"} for i in range(1, 300)]
    projection["meta"]["nodes_count"] = 300

    ctx = _FakeCtx(projection=projection, digest="d", history=[])
    config = PromptBudgetConfig(max_projection_tokens=2048)
    builder = PromptBuilder(config)
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="расскажи про схему"))

    assert assembly.layer_tokens["projection"] <= config.max_projection_tokens
    assert assembly.estimated_prompt_tokens <= config.max_total_prompt_tokens


def test_schema_overview_prompt_is_compact():
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=[])
    builder = PromptBuilder()
    assembly = builder.build_schema_overview_prompt(ctx)

    assert '"steps":' not in assembly.user_prompt
    assert "Всего узлов: 4" in assembly.user_prompt


def test_select_relevant_step_ids_with_radius():
    projection = _make_projection()
    selected = _select_relevant_step_ids(
        projection,
        selected_step_id="s2",
        rag_chunks=[],
        config=PromptBudgetConfig(selected_step_radius=1),
    )
    assert selected == {"s1", "s2", "s3"}


def test_prompt_layers_reported():
    ctx = _FakeCtx(projection=_make_projection(), digest="d", history=[])
    builder = PromptBuilder()
    assembly = builder.build_processman_prompt(ctx, AgentChatIn(message="ok"))

    assert "projection" in assembly.layer_tokens
    assert "history" in assembly.layer_tokens
    assert "user" in assembly.layer_tokens
