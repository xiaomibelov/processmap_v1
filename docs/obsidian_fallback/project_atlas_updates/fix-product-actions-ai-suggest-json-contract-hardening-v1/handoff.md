# Handoff — fix/product-actions-ai-suggest-json-contract-hardening-v1

**Date:** 2026-05-08
**App version:** v1.0.119
**Status:** CLOSED — code pushed, no merge, no deploy

---

## Branch / Commits

| Commit | Description |
|--------|-------------|
| `554204a` | fix(ai): propagate parse-error diagnostics for product actions suggest (contour 1) |
| `3845028` | fix(ai): harden product-actions JSON contract — prompt v4, max_tokens=4000, cap=3 (contour 2) |

Branch: `fix/product-actions-ai-suggest-response-parse-diagnostics-v1`
Worktree: `/tmp/processmap_product_actions_ai_suggest_response_parse_diagnostics_v1`

---

## Root Cause

Execution `exec_ae23c4dd6ba7479d` returned `AI_RESPONSE_PARSE_ERROR`:

```
parse_error: invalid json response: Expecting ',' delimiter at line 226 column 6
```

**Cause:** `max_tokens=2400` × `max_suggestions=20` default — provider generated verbose
suggestion objects (long `evidence_text`, verbose `action_method`, per-suggestion `warnings[]`)
and exhausted the token budget before closing the JSON array. `_extract_json_candidate` passed
the truncated fragment to `json.loads` which raised `JSONDecodeError`.

---

## Fix — Two Contours

### Contour 1 (`554204a`) — Diagnostics

- `ProductActionsAiResponseParseError` gains `.raw_content` attribute
- Router builds `diagnostics` block on `AI_RESPONSE_PARSE_ERROR`:
  `execution_id`, `parse_error`, `response_excerpt`, `provider`, `model`, `request_payload`
- Frontend renders collapsible `<details data-testid="product-actions-ai-diagnostics">` in
  the AI progress error section ("Технические детали")
- `aiDiagnostics` state initialized to `null`, reset on hide

### Contour 2 (`3845028`) — JSON Contract Hardening

| Dimension | Before (v3) | After (v4) |
|-----------|-------------|------------|
| Max suggestions in prompt | none | `"Верни не более 3 предложений."` |
| String length constraint | none | `"Все строковые поля — не более 60 символов."` |
| `confidence` type | `0.0` float | `"low\|medium\|high"` string enum |
| `evidence_text` | present | removed from v4 schema (kept in normalizer) |
| `reason` field | absent | replaces `evidence_text`, ≤60 chars |
| Per-suggestion `warnings[]` | present | removed from v4 schema |
| `max_tokens` | `2400` | `4000` |
| Default `max_suggestions` | `20` | `3` |
| Router `_max_suggestions()` default | `20` | `3` |
| Router post-decorate cap | absent | `[:max_suggestions]` slice added |
| `_confidence()` normalizer | float-only | `high→1.0`, `medium→0.6`, `low→0.3` + float |
| Active prompt seed | `seed_ai_product_actions_suggest_v3` | `seed_ai_product_actions_suggest_v4` |
| v3 seed status | `active` | `archived` |

---

## Files Changed (contour 2, commit `3845028`)

```
backend/app/ai/product_actions_suggest.py      +55 / -2
backend/app/ai/prompt_registry.py              +11 / -1
backend/app/routers/product_actions_ai.py       +4 / -2
backend/tests/test_ai_prompt_registry_seeds.py +10 / -5
backend/tests/test_product_actions_ai_suggest.py +54 / -1
frontend/src/components/process/interview/ProductActionsPanel.jsx  +3 / -1
frontend/src/components/process/interview/ProductActionsPanel.test.mjs +7 / -0
frontend/src/config/appVersion.js              +8 / -1
```

---

## Tests

| Suite | Count | Result |
|-------|-------|--------|
| Backend (`pytest`) | 24 | ✅ all pass |
| Frontend (`node *.test.mjs`) | 19 | ✅ all pass |

**New backend tests (contour 2):**
- `test_confidence_normalizer_accepts_string_enum`
- `test_max_suggestions_cap_limits_output`
- `test_normalize_includes_reason_field`
- `test_success_result_has_empty_suggestions_list_not_none`

**New frontend test (contour 2):**
- `ProductActionsPanel shows friendly message when AI returns zero suggestions`

---

## AI Layer / Modules

- Module: `ai.product_actions.suggest`
- Active seed: `seed_ai_product_actions_suggest_v4` (version `v4`)
- Archived seeds: `v1`, `v2`, `v3`
- Seeder idempotency: confirmed — archived seeds never re-activated
- `max_tokens`: `4000`
- Default `max_suggestions` (prompt + router + normalizer): `3`
- Confidence wire format: `"low"|"medium"|"high"` (normalizer maps to float for storage)

---

## Product Actions — State

- AI suggestions are read-only candidates — never auto-write to domain truth
- `acceptAiProductActions` is the only write path, requires explicit user action
- `bpmn_xml`, `diagram_state_version`, `interview` are untouched by suggest endpoint
- Empty suggestions (`[]`) now shows friendly UI state instead of stub copy

---

## Runtime Evidence

- Execution `exec_ae23c4dd6ba7479d`: confirmed `AI_RESPONSE_PARSE_ERROR` at line 226 col 6
- Diagnostics block now surfaced to admin via collapsible panel
- No stage runtime proof yet (no deploy)

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| `max_suggestions=3` default (not 5 or 10) | Prevents truncation at 4000 tokens with room for context payload; reviewable set size |
| String enum confidence instead of float | Eliminates float serialization verbosity from LLM; normalizer preserves float for storage |
| `reason` replaces `evidence_text` | Shorter field name, same semantic; `evidence_text` kept in normalizer for backward compat |
| No per-suggestion `warnings[]` in v4 | Saves ~15 tokens per suggestion; top-level `warnings` kept |
| Router `[:max_suggestions]` slice | Defense-in-depth: caps even when provider mock bypasses normalizer |

---

## Backlog / Next Required Step

1. **PR** — open PR from `fix/product-actions-ai-suggest-response-parse-diagnostics-v1` → `main`
2. **Merge** — after review
3. **Deploy to stage** — trigger after merge
4. **Stage runtime proof** — run `ai.product_actions.suggest` on stage, confirm:
   - no `AI_RESPONSE_PARSE_ERROR` for typical session
   - `prompt_id: seed_ai_product_actions_suggest_v4` in response
   - `suggestions.length <= 3`
   - confidence values are `"low"|"medium"|"high"` in raw API response

---

## Constraints Observed

- No merge ✅
- No deploy ✅
- No BPMN XML changes ✅
- No Interview autosave changes ✅
- No `_deepseek_chat_json` / `_strip_fences` / `_extract_json_candidate` changes ✅
- `AI_RESPONSE_PARSE_ERROR` error code unchanged ✅
- Product code untouched in this doc commit ✅
