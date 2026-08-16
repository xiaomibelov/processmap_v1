"""AGENT-SVC: TTL-кэш resolve_model (решение владельца: ≤60 с, in-process).

Правка модели/ключа в админке вступает в силу в сервисе не позже TTL — здесь
проверяется механика: повторный resolve в пределах TTL не ходит в БД, после
истечения TTL состояние перечитывается. Время замокано.
"""
from __future__ import annotations

import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from gateway import llm_store


def _reset_cache():
    llm_store._model_cache["ts"] = 0.0
    llm_store._model_cache["defaults"] = {}
    llm_store._model_cache["overrides"] = {}


def test_resolve_model_ttl_60s():
    assert llm_store._MODEL_CACHE_TTL_SEC == 60  # решение владельца: TTL = 60 с

    now = {"t": 1000.0}
    loads = []

    def fake_load():
        loads.append(now["t"])
        llm_store._model_cache["defaults"] = {"org_default": f"model_v{len(loads)}"}
        llm_store._model_cache["overrides"] = {}
        llm_store._model_cache["ts"] = now["t"]

    _reset_cache()
    with mock.patch.object(llm_store, "_load_model_resolve_state", side_effect=fake_load), \
         mock.patch.object(llm_store, "time") as fake_time:
        fake_time.monotonic.side_effect = lambda: now["t"]

        first = llm_store.resolve_model("processman_agent", "org_default")
        assert first == "model_v1" and len(loads) == 1

        # в пределах TTL — кэш, БД не перечитывается
        now["t"] += 59.0
        assert llm_store.resolve_model("processman_agent", "org_default") == "model_v1"
        assert len(loads) == 1

        # после TTL — перечитывание (правка админки вступила в силу ≤60 с)
        now["t"] += 2.0
        assert llm_store.resolve_model("processman_agent", "org_default") == "model_v2"
        assert len(loads) == 2
    _reset_cache()


def test_resolve_model_feature_override_wins():
    now = {"t": 1000.0}

    def fake_load():
        llm_store._model_cache["defaults"] = {"org_default": "default_model"}
        llm_store._model_cache["overrides"] = {"org_default": {"schema_assistant": "cheap_model"}}
        llm_store._model_cache["ts"] = now["t"]

    _reset_cache()
    with mock.patch.object(llm_store, "_load_model_resolve_state", side_effect=fake_load), \
         mock.patch.object(llm_store, "time") as fake_time:
        fake_time.monotonic.side_effect = lambda: now["t"]
        assert llm_store.resolve_model("schema_assistant", "org_default") == "cheap_model"
        assert llm_store.resolve_model("process_analysis", "org_default") == "default_model"
        assert llm_store.resolve_model("schema_assistant", "org_unknown") is None
    _reset_cache()
