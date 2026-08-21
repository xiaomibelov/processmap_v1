"""AGENT-2: service context loader tests."""
from __future__ import annotations

import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from memory.context import load_context


@pytest.fixture
def mock_get_projection():
    with mock.patch("runners.monolith_client.get_projection") as m:
        m.return_value = {
            "ok": True,
            "projection": {"steps": [], "edges": [], "meta": {"session_id": "s1", "rev": 1, "nodes_count": 0, "schema": 1}},
            "projection_digest": "emptydigest",
            "rev": 1,
        }
        yield m


def test_load_context_empty_projection_falls_back_to_rag(mock_get_projection):
    with mock.patch("runners.monolith_client.search_rag") as m:
        m.return_value = {
            "ok": True,
            "results": [
                {
                    "chunk_id": "c1",
                    "chunk_text": "<bpmn:userTask id='t1' name='Шаг 1'/>",
                    "metadata": {"element_id": "t1", "element_name": "Шаг 1", "element_tag": "userTask"},
                },
                {
                    "chunk_id": "c2",
                    "chunk_text": "<bpmn:userTask id='t2' name='Шаг 2'/>",
                    "metadata": {"element_id": "t2", "element_name": "Шаг 2", "element_tag": "userTask"},
                },
            ],
        }
        ctx = load_context("s1", "u1", "org_default", token="tok")

    assert len(ctx.projection["steps"]) == 2
    assert ctx.projection["steps"][0]["id"] == "t1"
    assert ctx.projection["steps"][0]["name_ru"] == "Шаг 1"
    # digest пересчитан — не равен исходному emptydigest.
    assert ctx.digest != "emptydigest"
    assert len(ctx.digest) == 32


def test_load_context_existing_projection_does_not_replace_steps(mock_get_projection):
    mock_get_projection.return_value = {
        "ok": True,
        "projection": {
            "steps": [{"id": "step_1", "type": "step", "name_ru": "Existing", "duration": None, "role": ""}],
            "edges": [],
            "meta": {"session_id": "s1", "rev": 1, "nodes_count": 1, "schema": 1},
        },
        "projection_digest": "existingdigest",
        "rev": 1,
    }
    with mock.patch("runners.monolith_client.search_rag") as m:
        m.return_value = {"ok": True, "results": []}
        ctx = load_context("s1", "u1", "org_default", token="tok")

    assert len(ctx.projection["steps"]) == 1
    assert ctx.projection["steps"][0]["id"] == "step_1"
    assert ctx.digest == "existingdigest"


def test_load_context_rag_search_failure_is_non_fatal(mock_get_projection):
    with mock.patch("runners.monolith_client.search_rag") as m:
        m.side_effect = Exception("RAG down")
        ctx = load_context("s1", "u1", "org_default", token="tok")

    assert ctx.projection["steps"] == []
    assert ctx.digest == "emptydigest"
