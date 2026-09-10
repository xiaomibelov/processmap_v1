"""RED: memory short-circuit schema_overview должен материализоваться
даже когда весь асинхронный путь (Redis-очередь + LLM agent_memory) мёртв.

Контур fix/agent-schema-memory-not-materializing (audit/llm-agent-audit-v1,
evidence-p4 §7.4): на stage 20 идентичных schema_overview-вопросов дали
20 полных LLM-вызовов, short-circuit ни разу не сработал.

Ожидание: ≤1 LLM-вызова processman_agent (первый miss), далее 19 memory-hit'ов
(usage.cached=True, ответы идентичны). Тест моделирует stage-сбой: Redis
недоступен (get_redis_client -> None), worker-LLM agent_memory падает.
"""
from __future__ import annotations

import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import memory.chat as chat
import memory.schema_memory as schema_memory
from memory.chat import run_turn
from schemas import AgentChatIn

OVERVIEW_TEXT = "## Краткое описание BPMN-схемы\n\nПроцесс из двух шагов."


@pytest.fixture
def projection_mock():
    with mock.patch("runners.monolith_client.get_projection") as m:
        m.return_value = {
            "ok": True,
            "projection": {
                "steps": [
                    {"id": "step_1", "type": "step", "name_ru": "Шаг 1", "duration": None, "role": ""},
                    {"id": "step_2", "type": "step", "name_ru": "Шаг 2", "duration": None, "role": ""},
                ],
                "edges": [{"from": "step_1", "to": "step_2"}],
                "meta": {"session_id": "", "rev": 1, "nodes_count": 2, "schema": 1},
            },
            "projection_digest": "d" * 32,
            "rev": 1,
        }
        yield m


def _counting_complete(calls: dict):
    def _fake(feature, payload=None, **kwargs):
        calls[feature] = calls.get(feature, 0) + 1
        return {
            "ok": True,
            "status": "ok",
            "text": OVERVIEW_TEXT,
            "usage": {"prompt_tokens": 461, "completion_tokens": 400},
            "provider_id": "p1",
            "model": "m",
            "prompt_version": 1,
            "fallback": False,
            "cached": False,
        }

    return _fake


def test_schema_overview_shortcircuit_materializes_without_async_path(
    seed, member_user, session_id, projection_mock
):
    """20 идентичных вопросов при мёртвом Redis/worker -> 1 LLM-вызов + 19 hit'ов."""
    calls: dict = {}
    # worker-LLM agent_memory всегда падает: short-circuit не должен от него зависеть
    failing_memory_llm = mock.Mock(side_effect=RuntimeError("agent_memory LLM down"))

    with mock.patch.object(chat, "route_intent", return_value="schema_overview"), \
         mock.patch.object(chat, "complete", side_effect=_counting_complete(calls)), \
         mock.patch.object(schema_memory, "get_redis_client", return_value=None), \
         mock.patch.object(schema_memory.gateway, "complete", failing_memory_llm):

        payload = AgentChatIn(message="Расскажи о схеме процесса")
        first_message = None
        for i in range(20):
            out = run_turn(session_id, member_user["id"], seed.DEFAULT_ORG, payload, token="t")
            assert out.ok is True, f"turn {i + 1} failed: {out.error}"
            if i == 0:
                first_message = out.message
                assert out.usage.get("cached") is not True, "первый turn не должен быть cache-hit"
            else:
                assert out.usage.get("cached") is True, (
                    f"turn {i + 1}: memory short-circuit не сработал "
                    f"(usage={out.usage}) — материализация зависит от async-пути"
                )
                assert out.message == first_message, f"turn {i + 1}: ответ hit-ветки отличается"

    assert calls.get("processman_agent", 0) == 1, (
        f"ожидался ровно 1 LLM-вызов (miss), фактически: {calls}"
    )


def test_schema_overview_hit_shape_contract(seed, member_user, session_id, projection_mock):
    """Hit-ответ сохраняет контракт /agent/chat: ok/status/action/message/usage."""
    calls: dict = {}
    with mock.patch.object(chat, "route_intent", return_value="schema_overview"), \
         mock.patch.object(chat, "complete", side_effect=_counting_complete(calls)), \
         mock.patch.object(schema_memory, "get_redis_client", return_value=None), \
         mock.patch.object(schema_memory.gateway, "complete", mock.Mock(return_value={"ok": False, "status": "error"})):
        payload = AgentChatIn(message="Расскажи о схеме процесса")
        run_turn(session_id, member_user["id"], seed.DEFAULT_ORG, payload, token="t")
        out = run_turn(session_id, member_user["id"], seed.DEFAULT_ORG, payload, token="t")

    assert out.status == "ok"
    assert out.action == "schema_overview"
    assert out.action_payload == {}
    assert out.error == ""
    assert out.message == OVERVIEW_TEXT
    assert out.usage.get("cached") is True
    assert out.projection_digest == "d" * 32


def test_memory_worker_does_not_erase_existing_summary(seed):
    """Worker-обновление без summary не должно затирать существующий (иначе hit сломан)."""
    sid = seed.make_session()
    schema_memory.save_schema_memory(sid, "org_default", "Существующее summary", ["f1"], [], "dg1")

    # LLM вернул facts без summary — summary должен уцелеть (защита hit-инварианта)
    result = {"ok": True, "status": "ok", "text": '{"facts": ["новый факт"]}'}
    with mock.patch.object(schema_memory.gateway, "complete", return_value=result):
        ok = schema_memory.update_schema_memory(
            sid,
            "org_default",
            "dg1",
            projection={"steps": [{"id": "s1"}], "edges": []},
        )
    assert ok is True
    row = schema_memory.load_schema_memory(sid, "org_default")
    assert row["summary"] == "Существующее summary"
    assert row["facts"] == ["новый факт"]
