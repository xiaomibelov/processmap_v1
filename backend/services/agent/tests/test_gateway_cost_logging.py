"""AGENT-SVC: gateway.complete records cost_usd when model prices are known.

Contour feature/agent-model-routing-optimization-v1.
"""
from __future__ import annotations

import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from gateway import gateway, llm_store


def _seed_provider_and_prices():
    import db

    now = 1725000000
    with db.get_conn() as con:
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_providers"
                " (id, org_id, name, base_url, api_key, model, priority, enabled, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("prov_1", "org_default", "test-provider", "http://localhost:9999", "key", "deepseek-chat", 10, True, now),
        )
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_models"
                " (id, org_id, provider, model_name, display_name, enabled, is_default, model_class, cost_prompt_1k_usd, cost_completion_1k_usd, params, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("m_cheap", "org_default", "prov_1", "deepseek-chat", "DS", True, True, "cheap", 0.0005, 0.002, "{}", "t", now),
        )
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_prompts"
                " (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("prompt_test_v1", "test_feature", 1, "sys", "{input}", "active", 200, "cheap", "t", now),
        )
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit) VALUES (?, ?, ?)"
            ),
            ("test_feature", True, 1_000_000),
        )


def _fake_deepseek_chat_request(**kwargs):
    return {
        "model": kwargs.get("model", "deepseek-chat"),
        "choices": [{"message": {"content": "ok"}}],
        "usage": {"prompt_tokens": 2000, "completion_tokens": 500},
    }


def test_complete_records_cost_usd_for_known_model(isolate_service_db):
    _seed_provider_and_prices()
    llm_store._model_cache["ts"] = 0.0
    llm_store._model_cache["defaults"] = {}
    llm_store._model_cache["overrides"] = {}
    llm_store._model_cache["costs"] = {}

    expected_cost = (2000 * 0.0005 + 500 * 0.002) / 1000.0

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake_deepseek_chat_request):
        result = gateway.complete(
            "test_feature",
            payload={"input": "test"},
            user_id="u1",
            session_id="s1",
            org_id="org_default",
        )

    assert result["ok"] is True
    assert result["model"] == "deepseek-chat"
    assert abs(result["cost_usd"] - expected_cost) < 1e-9

    # Verify durable usage row.
    import db

    with db.get_conn() as con:
        row = con.execute(
            db.adapt_sql("SELECT cost_usd FROM llm_usage WHERE feature = ? AND session_id = ?"),
            ("test_feature", "s1"),
        ).fetchone()
    assert row is not None
    assert abs(dict(row)["cost_usd"] - expected_cost) < 1e-9


def test_complete_zero_cost_when_price_unknown(isolate_service_db):
    """If model prices are missing, gateway still records usage but cost_usd = 0."""
    import db

    now = 1725000000
    with db.get_conn() as con:
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_providers"
                " (id, org_id, name, base_url, api_key, model, priority, enabled, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("prov_2", "org_default", "test-provider", "http://localhost:9999", "key", "unknown-model", 10, True, now),
        )
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_models"
                " (id, org_id, provider, model_name, display_name, enabled, is_default, model_class, cost_prompt_1k_usd, cost_completion_1k_usd, params, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("m_unknown", "org_default", "prov_2", "unknown-model", "U", True, True, "primary", 0, 0, "{}", "t", now),
        )
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_prompts"
                " (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("prompt_unknown_v1", "unknown_price_feature", 1, "sys", "{input}", "active", 200, "primary", "t", now),
        )
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit) VALUES (?, ?, ?)"
            ),
            ("unknown_price_feature", True, 1_000_000),
        )

    llm_store._model_cache["ts"] = 0.0

    def _fake(**kwargs):
        return {
            "model": kwargs.get("model", "unknown-model"),
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 1000, "completion_tokens": 100},
        }

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(
            "unknown_price_feature",
            payload={"input": "test"},
            user_id="u1",
            session_id="s2",
            org_id="org_default",
        )

    assert result["ok"] is True
    assert result["cost_usd"] == 0.0
