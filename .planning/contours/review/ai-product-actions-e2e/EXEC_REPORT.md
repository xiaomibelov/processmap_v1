# EXEC_REPORT — migrate product-actions AI suggest to LLM gateway

## Goal
Migrate `POST /api/sessions/{id}/analysis/product-actions/suggest` and batch/bulk endpoints from reading `DEEPSEEK_API_KEY` env to using the existing LLM gateway (`app.ai.gateway` / `app.ai.llm_internal_client`).

## Changed files

- `backend/alembic/versions/029_product_actions_llm_gateway_prompt.py` (new)
  - Revision `029`, down_revision `028`.
  - Seeds active `llm_prompt` for feature `product_actions_suggest` using V4 prompt template + `{input}` placeholder, `system=''`, `max_tokens=4000`, `model_class='primary'`, `status='active'`, `version=1`.
  - Seeds `llm_feature_flags` row `(feature='product_actions_suggest', enabled=true, daily_token_limit=200000)`.
  - Idempotent `ON CONFLICT DO NOTHING`; no secrets.

- `backend/app/ai/product_actions_suggest.py`
  - Added `parse_product_actions_suggestions(text, max_suggestions=3)` that reuses `_dq._extract_json_candidate`, `json.loads`, and `normalize_product_action_suggestions_response`; raises `ProductActionsAiResponseParseError(raw_content=...)` on failure.
  - Kept `suggest_product_actions_with_deepseek` for backward compatibility; refactored to call the new parser.

- `backend/app/routers/product_actions_ai.py`
  - Added `FEATURE = "product_actions_suggest"`.
  - Imported `complete` from `..ai.gateway` and `llm_internal_client` helpers.
  - Added `_llm_complete(feature, payload, **kwargs)` routing to agent-service when `LLM_VIA_AGENT_SVC` is enabled.
  - Added `_call_product_actions_llm(...)` returning `(parsed, gateway_result)` and raising typed exceptions for `no_provider`, `rate_limited`, and generic provider errors.
  - `suggest_product_actions`: removed `load_llm_settings()` / api_key logic; kept `check_ai_rate_limit`; calls `_call_product_actions_llm`; maps gateway statuses to existing controlled error codes; uses gateway `provider_id`/`model`/`prompt_version` in response and execution log.
  - `batch_suggest_product_actions`: removed env/settings and legacy-prompt gate; per-chunk calls `_call_product_actions_llm` with per-chunk error handling.
  - Kept `seed_existing_ai_prompts` / `get_active_prompt` only for legacy prompt metadata (prompt_id); the actual LLM prompt now comes from gateway.
  - Updated `_safe_error_message` to also redact `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL` from env to preserve secret sanitization in diagnostics.

- `backend/tests/test_product_actions_ai_suggest.py`
  - Replaced all patches of `suggest_product_actions_with_deepseek` with patches of `app.routers.product_actions_ai._llm_complete` returning gateway-style result dicts.
  - Added `test_gateway_no_provider_returns_ai_provider_not_configured`.
  - Added `test_gateway_ok_json_text_returns_suggestions`.
  - Updated parse-error tests to patch `_llm_complete` with malformed/markdown-wrapped text.
  - Replaced legacy "missing active prompt" error tests with tests that verify gateway prompt is used even when legacy catalog is empty/unavailable.
  - Preserved mutation/draft/bulk tests.

- `backend/tests/test_llm_gateway.py`
  - Added `test_effective_providers_with_key_prefers_org_then_org_default` covering org-scoped provider preference, fallback to `org_default`, and empty chain.

- `backend/tests/test_llm_provider_resolution.py` (new)
  - SQLite-based focused unit tests for `llm_store.effective_providers_with_key` (org > org_default > empty; disabled/empty-key excluded).

## Test results

- `tests/test_product_actions_ai_suggest.py`: **28 passed, 6 warnings in 700.39s** (Docker `python:3.11-slim`, sqlite backend).
- `tests/test_llm_provider_resolution.py`: **4 passed in 0.71s** (Docker `python:3.11-slim`, sqlite backend).
- `tests/test_llm_gateway.py`: **not run** — requires a Postgres instance (`E2_TEST_DATABASE_URL`); no local PG was available. The added test follows the existing `sandbox` fixture pattern and should pass in the existing CI/postgres environment.

## Git state

```
branch: fix/ai-product-actions-llm-gateway
HEAD:   2a437a11cde19f52401c51dc28481ff3935b2c16
origin/main: 2a437a11cde19f52401c51dc28481ff3935b2c16
```

Diffstat (tracked modifications):

```
 backend/app/ai/product_actions_suggest.py        |  37 ++--
 backend/app/routers/product_actions_ai.py        | 256 +++++++++++++----------
 backend/tests/test_llm_gateway.py                |  26 +++
 backend/tests/test_product_actions_ai_suggest.py | 218 +++++++++++--------
```

New untracked files:

- `backend/alembic/versions/029_product_actions_llm_gateway_prompt.py`
- `backend/tests/test_llm_provider_resolution.py`
- `.planning/contours/review/ai-product-actions-e2e/EXEC_REPORT.md`

## Blockers / follow-up

- No blockers for the code changes.
- **Remaining verification**: run `backend/tests/test_llm_gateway.py` in a Postgres environment to confirm the new provider-resolution test passes.
- **Deployment**: migration `029` must be applied before the new router code is deployed; the router now relies on `llm_prompts`/`llm_feature_flags` rows seeded by the migration.
- No commits, merges, or deployments were performed.
