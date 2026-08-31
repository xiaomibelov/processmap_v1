"""AGENT-SVC: PromptBuilder model_class decisions per intent.

Contour feature/agent-model-routing-optimization-v1.
Does NOT change response logic — only verifies routing class and prompt shape.
"""
from __future__ import annotations

import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from memory.context import AgentContext
from memory.prompt_builder import PromptBuilder


def _ctx(projection: dict | None = None) -> AgentContext:
    return AgentContext(
        session=SimpleNamespace(id="s", project_id="p"),
        projection=projection or {"steps": [{"id": "step_1"}]},
        digest="d" * 32,
        history=[],
    )


def _payload(message: str = "hello", selected_step_id: str = "") -> SimpleNamespace:
    return SimpleNamespace(message=message, selected_step_id=selected_step_id)


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
