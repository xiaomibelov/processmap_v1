"""AGENT-SVC: resolve_model and resolve_model_for_feature with model_class routing.

Contour feature/agent-model-routing-optimization-v1.
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
    llm_store._model_cache["costs"] = {}


def _seed_models_and_overrides():
    import db

    now = 1725000000
    with db.get_conn() as con:
        # Two defaults: one primary, one cheap.
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_models"
                " (id, org_id, provider, model_name, display_name, enabled, is_default, model_class, cost_prompt_1k_usd, cost_completion_1k_usd, params, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("m_primary", "org_default", "p", "claude-opus-4-6", "Opus", True, True, "primary", 0.015, 0.075, "{}", "t", now),
        )
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_models"
                " (id, org_id, provider, model_name, display_name, enabled, is_default, model_class, cost_prompt_1k_usd, cost_completion_1k_usd, params, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("m_cheap", "org_default", "p", "deepseek-chat", "DS", True, True, "cheap", 0.0005, 0.002, "{}", "t", now),
        )
        # Per-feature override: processman_agent cheap → deepseek-chat.
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_feature_models (feature, org_id, model_id, model_class) VALUES (?, ?, ?, ?)"
            ),
            ("processman_agent", "org_default", "m_cheap", "cheap"),
        )


def test_resolve_model_class_override_wins(isolate_service_db):
    _reset_cache()
    _seed_models_and_overrides()

    assert llm_store.resolve_model("processman_agent", "org_default", "cheap") == "deepseek-chat"
    assert llm_store.resolve_model("processman_agent", "org_default", "primary") == "claude-opus-4-6"
    # Unknown feature falls back to default for the class.
    assert llm_store.resolve_model("unknown_feature", "org_default", "cheap") == "deepseek-chat"
    assert llm_store.resolve_model("unknown_feature", "org_default", "primary") == "claude-opus-4-6"


def test_resolve_model_for_feature_uses_prompt_model_class(isolate_service_db):
    _reset_cache()
    _seed_models_and_overrides()

    import db

    now = 1725000000
    with db.get_conn() as con:
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_prompts"
                " (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("prompt_processman_v1", "processman_agent", 1, "sys", "{input}", "active", 1200, "cheap", "t", now),
        )

    assert llm_store.resolve_model_for_feature("processman_agent", "org_default") == "deepseek-chat"


def test_resolve_model_for_feature_missing_prompt_defaults_to_primary(isolate_service_db):
    _reset_cache()
    _seed_models_and_overrides()

    # No active prompt for processman_agent.
    assert llm_store.resolve_model_for_feature("processman_agent", "org_default") == "claude-opus-4-6"


def test_estimate_cost_uses_cached_prices(isolate_service_db):
    _reset_cache()
    _seed_models_and_overrides()

    assert llm_store.estimate_cost("deepseek-chat", 2000, 500) == (2000 * 0.0005 + 500 * 0.002) / 1000.0
    assert llm_store.estimate_cost("claude-opus-4-6", 1000, 200) == (1000 * 0.015 + 200 * 0.075) / 1000.0
    assert llm_store.estimate_cost("unknown-model", 1000, 200) == 0.0
