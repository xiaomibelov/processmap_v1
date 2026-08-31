"""Cost measurement harness — agent-model-routing-optimization-v1.

Two modes, driven by env var AGENT_ROUTING_MEASUREMENT:
  - "before" (default when explicitly requested): historical baseline before
    per-intent model_class routing. Patches PromptBuilder so that every
    processman_agent turn uses the primary model, matching pre-Phase 1 code.
  - "after": measurement with the new PromptBuilder matrix.

Run explicitly:
  AGENT_ROUTING_MEASUREMENT=before  pytest tests/test_measurement_baseline.py -v -s
  AGENT_ROUTING_MEASUREMENT=after   pytest tests/test_measurement_baseline.py -v -s

Both modes use the same large_schema_300_nodes fixture and the same mocked
LLM response size so the totals are comparable.
"""
from __future__ import annotations

import json
import os
import sys
import time
from unittest import mock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from gateway import gateway, llm_store
from memory.chat import run_turn
from memory.prompt_builder import PromptBuilder
from schemas import AgentChatIn
from tests.fixtures.large_schema import large_schema_300_nodes

MODE = os.environ.get("AGENT_ROUTING_MEASUREMENT", "before")

# Placeholder pricing ($ per 1k tokens) used for measurement calculation.
PRICES = {
    "deepseek-chat": {"prompt": 0.0005, "completion": 0.002},
    "claude-opus-4-6": {"prompt": 0.015, "completion": 0.075},
}


def _seed_measurement_db():
    import db

    now = int(time.time())
    with db.get_conn() as con:
        # One enabled provider so the gateway chain is non-empty.
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_providers"
                " (id, org_id, name, base_url, api_key, model, priority, enabled, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            ("llmprov_baseline", "org_default", "baseline-provider", "http://localhost:9999", "key", "deepseek-chat", 10, True, now),
        )
        # Primary default.
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_models"
                " (id, org_id, provider, model_name, display_name, enabled, is_default, model_class, cost_prompt_1k_usd, cost_completion_1k_usd, params, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            (
                "llmmodel_opus_baseline",
                "org_default",
                "baseline-provider",
                "claude-opus-4-6",
                "Opus 4.6",
                True,
                True,
                "primary",
                PRICES["claude-opus-4-6"]["prompt"],
                PRICES["claude-opus-4-6"]["completion"],
                "{}",
                "baseline",
                now,
            ),
        )
        # Cheap default.
        con.execute(
            db.adapt_sql(
                "INSERT INTO llm_models"
                " (id, org_id, provider, model_name, display_name, enabled, is_default, model_class, cost_prompt_1k_usd, cost_completion_1k_usd, params, created_by, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            (
                "llmmodel_deepseek_baseline",
                "org_default",
                "baseline-provider",
                "deepseek-chat",
                "DeepSeek Chat",
                True,
                True,
                "cheap",
                PRICES["deepseek-chat"]["prompt"],
                PRICES["deepseek-chat"]["completion"],
                "{}",
                "baseline",
                now,
            ),
        )
        # Feature overrides: existing cheap features keep cheap.
        overrides = [
            ("agent_router", "cheap", "llmmodel_deepseek_baseline"),
            ("agent_memory", "cheap", "llmmodel_deepseek_baseline"),
            ("agent_summary", "cheap", "llmmodel_deepseek_baseline"),
            ("agent_edit_propose", "cheap", "llmmodel_deepseek_baseline"),
        ]
        for feature, model_class, model_id in overrides:
            con.execute(
                db.adapt_sql(
                    "INSERT INTO llm_feature_models (feature, org_id, model_id, model_class) VALUES (?, ?, ?, ?)"
                ),
                (feature, "org_default", model_id, model_class),
            )
        # Active prompts with model_class.
        prompts = [
            ("agent_router", "cheap", 200),
            ("agent_memory", "cheap", 800),
            ("agent_summary", "cheap", 400),
            ("agent_edit_propose", "cheap", 800),
            ("processman_agent", "cheap" if MODE == "after" else "primary", 1200),
            ("agent_edit", "primary", 600),
        ]
        for feature, model_class, max_tokens in prompts:
            con.execute(
                db.adapt_sql(
                    "INSERT INTO llm_prompts"
                    " (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ),
                (f"prompt_{feature}_v1", feature, 1, "system", "{input}", "active", max_tokens, model_class, "baseline", now),
            )
        # Feature flags.
        for feature, limit in [
            ("agent_router", 1_000_000),
            ("agent_memory", 1_000_000),
            ("agent_summary", 1_000_000),
            ("agent_edit_propose", 1_000_000),
            ("processman_agent", 1_000_000),
            ("agent_edit", 1_000_000),
        ]:
            con.execute(
                db.adapt_sql(
                    "INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit) VALUES (?, ?, ?)"
                ),
                (feature, True, limit),
            )


def _fake_deepseek_chat_request(**kwargs):
    """Mock LLM call: estimate prompt tokens from message JSON length."""
    model = kwargs.get("model") or "deepseek-chat"
    messages = kwargs.get("messages", [])
    prompt_text = json.dumps(messages, ensure_ascii=False)
    # Rough token estimate: 1 token ≈ 4 chars for mixed text.
    prompt_tokens = max(1, len(prompt_text) // 4)
    completion_tokens = 100
    return {
        "model": model,
        "choices": [{"message": {"content": "measured response"}}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
    }


def _cost_for_row(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    prices = PRICES.get(model, {"prompt": 0.0, "completion": 0.0})
    return (prompt_tokens * prices["prompt"] + completion_tokens * prices["completion"]) / 1000.0


def _fetch_usage(session_id: str):
    import db

    with db.get_conn() as con:
        cur = con.execute(
            db.adapt_sql(
                "SELECT feature, model, prompt_tokens, completion_tokens, cost_usd FROM llm_usage"
                " WHERE session_id = ? ORDER BY id"
            ),
            (session_id,),
        )
        rows = [dict(r) for r in cur.fetchall()]
    return rows


def _run_scenario(name: str, intent: str, payload_dict: dict, session_id: str, user_id: str):
    """Run one chat turn with the given intent and return llm_usage rows."""
    has_rag = payload_dict.pop("_has_rag", True)
    payload = AgentChatIn(**payload_dict)
    with mock.patch("memory.chat.route_intent", return_value=intent):
        if intent == "doc_qa":
            with mock.patch("memory.chat.search_rag") as mock_rag:
                if has_rag:
                    mock_rag.return_value = {
                        "ok": True,
                        "results": [
                            {"chunk": "Отрывок документации 1", "score": 0.9},
                            {"chunk": "Отрывок документации 2", "score": 0.8},
                        ],
                    }
                else:
                    mock_rag.return_value = {"ok": True, "results": []}
                run_turn(session_id, user_id, "org_default", payload, token="tok")
        elif intent == "suggest_next":
            with mock.patch("memory.chat.run_suggest_next") as mock_runner:
                mock_runner.return_value = {"message": "Предлагаю следующий шаг"}
                run_turn(session_id, user_id, "org_default", payload, token="tok")
        elif intent == "node_qa":
            with mock.patch("memory.chat.run_step_qa") as mock_runner:
                mock_runner.return_value = {"answer": "Это шаг 1"}
                run_turn(session_id, user_id, "org_default", payload, token="tok")
        elif intent == "edit_canvas":
            with mock.patch("edit.planner.validate_edit_plan") as mock_validate:
                mock_validate.return_value = []
                run_turn(session_id, user_id, "org_default", payload, token="tok")
        else:
            run_turn(session_id, user_id, "org_default", payload, token="tok")
    return _fetch_usage(session_id)


def _write_measurements(scenarios: list, total_cost: float, mode: str):
    contour_dir = os.path.dirname(__file__)
    contour_dir = os.path.join(contour_dir, "..", "..", "..", "..", ".planning", "contours", "feature", "agent-model-routing-optimization-v1")
    contour_dir = os.path.normpath(contour_dir)
    os.makedirs(contour_dir, exist_ok=True)

    if mode == "before":
        path = os.path.join(contour_dir, "MEASUREMENTS.md")
        title = "MEASUREMENTS — baseline (ДО)"
        status = "baseline before model_class routing changes"
        method_lines = [
            "- DB seeded to mimic the pre-change routing:",
            "  - cheap features (agent_router, agent_memory, agent_summary, agent_edit_propose) → deepseek-chat;",
            "  - every processman_agent turn forced to primary (claude-opus-4-6) via PromptBuilder patch.",
        ]
    else:
        path = os.path.join(contour_dir, "MEASUREMENTS_AFTER.md")
        title = "MEASUREMENTS — after (ПОСЛЕ)"
        status = "after per-intent model_class routing"
        method_lines = [
            "- DB seeded with the new routing matrix:",
            "  - cheap features (agent_router, agent_memory, agent_summary, agent_edit_propose) → deepseek-chat;",
            "  - processman_agent low-creativity intents (smalltalk, schema_overview, doc_qa with RAG) → cheap;",
            "  - processman_agent high-creativity fallback (doc_qa without RAG) → primary.",
        ]

    lines = [
        f"# {title}",
        "",
        f"**Contour:** feature/agent-model-routing-optimization-v1  ",
        f"**Timestamp:** {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}  ",
        f"**Fixture:** large_schema_300_nodes  ",
        f"**Status:** {status}  ",
        "",
        "## Method",
        "",
    ] + method_lines + [
        "- `_deepseek_chat_request` mocked; prompt_tokens estimated from JSON message length (1 token ≈ 4 chars).",
        "- completion_tokens fixed at 100 per LLM call for comparability.",
        "",
        "## Scenarios",
        "",
        "| Scenario | Intent | Feature | Model | Prompt tokens | Completion tokens | Cost USD |",
        "|----------|--------|---------|-------|--------------:|------------------:|---------:|",
    ]
    for sc in scenarios:
        lines.append(
            f"| {sc['scenario']} | {sc['intent']} | {sc['feature']} | {sc['model']} |"
            f" {sc['prompt_tokens']} | {sc['completion_tokens']} | {sc['cost_usd']:.6f} |"
        )
    lines.extend([
        "",
        f"**Total cost USD:** {total_cost:.6f}",
        "",
        "## Notes",
        "",
        "- `suggest_next` and `node_qa` use action runners (no direct LLM call in chat.py), so they do not appear as LLM usage rows.",
        "- `edit_canvas` triggers `agent_edit_propose` (cheap). The final `agent_edit` answer is produced by the resume endpoint, not measured here.",
        "- Placeholder pricing: deepseek-chat $0.50/$2.00 per 1M, claude-opus-4-6 $15.00/$75.00 per 1M.",
    ])
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def _primary_promptbuilder_patch(intent, ctx, payload, *, rag_results=None):
    """Replicate pre-Phase 1 processman prompts, all routed to the primary model.

    - smalltalk / doc_qa_fallback: full projection + history (free answer).
    - schema_overview: full projection summary prompt.
    - doc_qa with RAG: documentation chunks only (the old chat.py path).
    """
    if intent == "schema_overview":
        parts = [
            "Кратко опиши BPMN-схему ниже на русском языке. "
            "Не более 400 токенов. Схема:\n\n"
            f"{json.dumps(ctx.projection, ensure_ascii=False)}"
        ]
        rag_chunks = list((ctx.projection or {}).get("rag_context_chunks") or [])
        if rag_chunks:
            parts.append("Дополнительный контекст из BPMN/RAG:\n")
            for c in rag_chunks[:5]:
                eid = str(c.get("element_id") or "").strip()
                name = str(c.get("element_name") or "").strip()
                text = str(c.get("chunk_text") or "").strip()
                header = f"{name} ({eid})" if (name and eid) else (name or eid or "chunk")
                parts.append(f"{header}: {text}")
        return {"model_class": "primary", "payload": {"input": "\n\n".join(parts)}, "max_tokens": 400}

    if intent == "doc_qa" and rag_results:
        chunks_text = "\n---\n".join(
            str(r.get("chunk") or r.get("text") or "").strip() for r in rag_results[:5]
        )
        prompt_text = (
            "Ответь на вопрос пользователя на основе предоставленных отрывков документации. "
            "Отвечай на русском языке. Если ответа нет в отрывках, скажи об этом.\n\n"
            f"Отрывки:\n{chunks_text}\n\n"
            f"Вопрос: {payload.message}"
        )
        return {"model_class": "primary", "payload": {"input": prompt_text}, "max_tokens": 1200}

    # smalltalk, doc_qa_fallback and any unknown intent: free-answer with full projection.
    return PromptBuilder._free_answer(ctx, payload, model_class="primary")


def _run_measurement():
    _seed_measurement_db()
    # Invalidate in-process cache so fresh seed is loaded.
    llm_store._model_cache["ts"] = 0.0
    llm_store._model_cache["defaults"] = {}
    llm_store._model_cache["overrides"] = {}
    llm_store._model_cache["costs"] = {}

    uid = "user_1"
    sid = "sess_1"
    import db

    with db.get_conn() as con:
        con.execute(db.adapt_sql("INSERT INTO users (id, is_admin) VALUES (?, ?)"), (uid, False))
        con.execute(
            db.adapt_sql("INSERT INTO org_memberships (org_id, user_id, role) VALUES (?, ?, ?)"),
            ("org_default", uid, "editor"),
        )
        con.execute(
            db.adapt_sql("INSERT INTO sessions (id, org_id, project_id, owner_user_id) VALUES (?, ?, ?, ?)"),
            (sid, "org_default", "proj_1", uid),
        )

    scenarios = [
        ("smalltalk", "smalltalk", {"message": "привет"}),
        ("schema_overview", "schema_overview", {"message": "расскажи про схему"}),
        ("doc_qa_with_rag", "doc_qa", {"message": "как оформить заявку", "_has_rag": True}),
        ("doc_qa_no_rag", "doc_qa", {"message": "вопрос без ответа в базе", "_has_rag": False}),
        ("suggest_next", "suggest_next", {"message": "что дальше", "selected_step_id": "step_1"}),
        ("edit_canvas", "edit_canvas", {"message": "добавь шаг после step_1", "selected_step_id": "step_1"}),
        ("node_qa", "node_qa", {"message": "что это за шаг", "selected_step_id": "step_1"}),
    ]

    records = []
    total_cost = 0.0

    prompt_patch = mock.patch.object(PromptBuilder, "build", side_effect=_primary_promptbuilder_patch) if MODE == "before" else mock.patch.object(PromptBuilder, "build", side_effect=PromptBuilder.build)

    with mock.patch("runners.monolith_client.get_projection") as mock_proj, \
         mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake_deepseek_chat_request), \
         prompt_patch:
        mock_proj.return_value = {
            "ok": True,
            "projection": large_schema_300_nodes(),
            "projection_digest": "d" * 32,
            "rev": 1,
        }

        for name, intent, payload in scenarios:
            rows_before = _fetch_usage(sid)
            _run_scenario(name, intent, payload, sid, uid)
            rows_after = _fetch_usage(sid)
            new_rows = rows_after[len(rows_before):]

            for row in new_rows:
                cost = _cost_for_row(row["model"], row["prompt_tokens"], row["completion_tokens"])
                # Also verify gateway-recorded cost is consistent.
                assert abs(row["cost_usd"] - cost) < 1e-9, f"gateway cost_usd mismatch for {name}"
                total_cost += cost
                records.append(
                    {
                        "scenario": name,
                        "intent": intent,
                        "feature": row["feature"],
                        "model": row["model"],
                        "prompt_tokens": row["prompt_tokens"],
                        "completion_tokens": row["completion_tokens"],
                        "cost_usd": cost,
                    }
                )

    _write_measurements(records, total_cost, MODE)
    return records, total_cost


@pytest.mark.skipif(
    MODE != "before",
    reason="Historical baseline: run explicitly with AGENT_ROUTING_MEASUREMENT=before",
)
def test_baseline_measurement(isolate_service_db, seed, member_user):
    """Record baseline cost on large_schema_300_nodes before routing changes."""
    records, total_cost = _run_measurement()

    assert records, "expected at least one LLM usage row"
    processman_rows = [r for r in records if r["feature"] == "processman_agent"]
    assert all(r["model"] == "claude-opus-4-6" for r in processman_rows), "baseline processman_agent must be primary"
    cheap_rows = [r for r in records if r["feature"] in {"agent_router", "agent_edit_propose"}]
    assert all(r["model"] == "deepseek-chat" for r in cheap_rows), "baseline cheap features must be cheap"

    print(f"\nBASELINE TOTAL COST: ${total_cost:.6f}")


@pytest.mark.skipif(
    MODE != "after",
    reason="After measurement: run explicitly with AGENT_ROUTING_MEASUREMENT=after",
)
def test_after_measurement(isolate_service_db, seed, member_user):
    """Record cost on large_schema_300_nodes after per-intent model_class routing."""
    records, total_cost = _run_measurement()

    assert records, "expected at least one LLM usage row"

    by_scenario = {r["scenario"]: r for r in records if r["feature"] == "processman_agent"}
    assert by_scenario["smalltalk"]["model"] == "deepseek-chat"
    assert by_scenario["schema_overview"]["model"] == "deepseek-chat"
    assert by_scenario["doc_qa_with_rag"]["model"] == "deepseek-chat"
    assert by_scenario["doc_qa_no_rag"]["model"] == "claude-opus-4-6"

    cheap_rows = [r for r in records if r["feature"] in {"agent_router", "agent_edit_propose"}]
    assert all(r["model"] == "deepseek-chat" for r in cheap_rows), "cheap features must stay cheap"

    print(f"\nAFTER TOTAL COST: ${total_cost:.6f}")
