# PLAN — Agent prompt stack compression v1

**Contour:** `feature/agent-prompt-stack-compression-v1`  
**Run ID:** `feature-agent-prompt-stack-compression-v1-20260831T152200Z`  
**Role:** Agent 1 (Planner)  
**Date:** 2026-08-31  
**Status:** draft, awaiting user approval before any product code

---

## 1. Context from audit (source of truth)

- Every `processman_agent` prompt currently carries the **full JSON projection** of the BPMN schema (`memory/chat.py:228`, `memory/context.py:147`).
- On schemas with 100–300 BPMN elements this projection alone is **10–30k tokens** (audit `TOKEN_MAP.md`).
- History is added whole (`history_limit=50`, `memory/chat.py:214`), adding up to **1–10k tokens**.
- `processman_agent` is intentionally not cached because history makes each prompt unique.
- RAG retrieval already exists (`memory/chat.py:524`, `runners/monolith_client.py:53`) but only for `doc_qa`.
- Conversation summary infrastructure exists (migration 028, `agent_conversations.summary`) but is not used at prompt-build time.

**Goal:** reduce prompt tokens for a typical question on a large schema from 20–40k to **<5k** without quality regression.

---

## 2. Scope

**IN:**
- `backend/services/agent/memory/chat.py` — replace full-projection prompt assembly.
- `backend/services/agent/memory/context.py` — optional: expose compact projection helper.
- New `backend/services/agent/memory/prompt_builder.py` — compact projection, history budget, prompt assembly.
- Config/token budgets (module-level constants + env overrides, no new DB tables).
- Tests: unit tests for prompt builder + regression tests for existing branches.
- Measurements: synthetic before/after token count on a 300-element schema.

**OUT (separate contours):**
- RAG source-type expansion (`property_dictionary`, `operation_catalog`, `glossary`) → `rag-dictionaries-coverage-v1`.
- Model-class routing / cheap-model swaps → `agent-model-routing-optimization-v1`.
- Provider-specific prompt caching (`cache_control` for Anthropic) → `agent-gateway-cache-control-v1`.
- Frontend chat changes (except exposing usage metadata if already present).

---

## 3. Architecture

### 3.1 New module: `memory/prompt_builder.py`

Responsibilities:
1. Build a **compact projection** from the full projection, user question, selected step, and optional RAG chunks.
2. Format **history** with a hard token budget: last N turns verbatim + conversation summary for older turns.
3. Assemble the final user prompt for `processman_agent` and `schema_overview` cold path.
4. Expose token-count estimates so tests can assert budget compliance.

Public API (draft):

```python
@dataclass
class PromptBudgetConfig:
    max_total_prompt_tokens: int = 4096      # hard ceiling we design for
    max_projection_tokens: int = 2048        # compact projection + RAG
    max_history_tokens: int = 1024           # recent turns + summary
    history_turns_full: int = 6              # verbatim recent turns
    rag_top_k: int = 5
    selected_step_radius: int = 1            # predecessors + successors

class PromptBuilder:
    def __init__(self, config: PromptBudgetConfig | None = None): ...

    def build_processman_prompt(
        self,
        ctx: AgentContext,
        payload: AgentChatIn,
        rag_chunks: list[dict] | None = None,
    ) -> PromptAssembly: ...

    def build_schema_overview_prompt(
        self,
        ctx: AgentContext,
        rag_chunks: list[dict] | None = None,
    ) -> PromptAssembly: ...

    def estimate_tokens(self, text: str) -> int: ...
```

`PromptAssembly` carries:
- `user_prompt: str`
- `compact_projection: dict` (for tests/observability)
- `history_text: str`
- `estimated_prompt_tokens: int`
- `layer_tokens: dict` (system/cached prefix, compact projection, history, user message)

### 3.2 Compact projection format

Replace:

```json
{
  "steps": [ { "id", "type", "name_ru", "duration", "role", "operation_code?" }, ... ],
  "edges": [ { "from", "to" }, ... ],
  "meta": { "session_id", "rev", "nodes_count", "schema" }
}
```

With a human-readable, token-cheap block:

```text
=== BPMN-схема (компактная проекция) ===
Всего узлов: 312
  По типам: task 120, userTask 80, exclusiveGateway 30, parallelGateway 15, startEvent 12, endEvent 12, intermediateCatchEvent 43
Рёбер: 340
Роли: [технолог, повар, упаковщик, контролёр]
Коды операций: [оп_001, оп_002, оп_003, ...]

Релевантные узлы (по запросу пользователя):
- step_42 "Мытьё овощей" (userTask, role=повар, duration=5 мин)
- step_43 "Нарезка" (userTask, role=повар, duration=10 мин)

Контекст выбранного шага step_42:
Предшественники: step_41 "Приёмка сырья"
Последователи: step_43 "Нарезка", step_44 "Контроль качества"
```

How it is built:
1. **Statistics** — counts by element type, total edges, distinct roles, distinct operation codes. Always included; tiny.
2. **RAG top-k relevant elements** — search RAG `bpmn_xml` by user question (reuse `_search_rag_prioritized`). Include full step fields only for retrieved elements. Cap at `config.rag_top_k`.
3. **Selected-step neighborhood** — if `payload.selected_step_id` is present, include the step itself, its direct predecessors and successors (radius=1) with full fields.
4. **Operation-affected elements** — reserved hook for edit/propose branches; for `processman_agent` smalltalk/doc_qa/schema_overview this is empty.
5. **Edges** — only edges that connect included steps. Rendered as `from -> to` lines, not full JSON array.

If the total compact-projection text exceeds `max_projection_tokens`, we trim in this order:
1. Drop RAG chunks beyond top-3.
2. Drop selected-step radius to 0 (only the selected step).
3. Drop operation-code list.
4. Truncate names to 80 chars.

### 3.3 History budget

Current behavior: all turns up to 50 are added verbatim.

New behavior:
1. Load turns from DB unchanged (`history_limit=50` still fetched by `load_context`).
2. Keep the last `history_turns_full` turns verbatim.
3. If older turns exist and `agent_conversations.summary` is non-empty, prepend: `Краткое содержание предыдущей части диалога: <summary>`.
4. If older turns exist but no summary, prepend a one-line note: `Ранее в диалоге обсуждалась схема из N сообщений.`
5. If the verbatim part exceeds `max_history_tokens`, drop oldest turns from the verbatim window until it fits.

This uses the existing `summary` column (migration 028) without requiring new background summarization in Phase 1.

### 3.4 Prompt structure / stable prefix

`gateway.gateway._render_messages` already emits a `system` message followed by a single `user` message. We keep the prompt structured so the stable part comes first and the variable part comes last:

1. Keep the **system prompt** stable and identical across all `processman_agent` calls. The current v2 prompt is stable.
2. Move any long static reference text (element-type catalog, role hints) into the **system prompt** or a second static `system` message, not into the user payload.
3. Place the variable parts (compact projection, history, user message) at the **end** of the user message.

**Prompt caching is NOT in scope for this contour.**
- DeepSeek/OpenAI-compatible providers may apply automatic prefix caching when the leading `system` messages are identical across requests, but this is not guaranteed and not measured here.
- Anthropic `claude-opus-4-6` requires explicit `cache_control` markers; adding them requires provider-conditional gateway changes (`agent-gateway-cache-control-v1`).

Therefore the claimed economy of this contour comes **only from prompt compression** (smaller projection + capped history), not from cache hits.

### 3.5 Call-site changes

`memory/chat.py`:
- Replace `_build_user_prompt(ctx, payload)` with `PromptBuilder().build_processman_prompt(ctx, payload, rag_chunks)`.
- In `_run_schema_overview_branch` cold path, use `build_schema_overview_prompt` instead of dumping full projection JSON.
- In streaming `run_turn_stream`, use the same builder for `smalltalk`/`doc_qa` fallback.
- `doc_qa` branch stays as-is when RAG returns results; only the fallback to free-answer uses compact projection.

`memory/context.py`:
- No change to `load_context` signature or projection loading.
- Optional: export `_compact_projection` helper if shared with `schema_memory.py`.

`memory/schema_memory.py`:
- `_build_memory_prompt` can optionally use the compact builder for the background `agent_memory` worker. Left as follow-up if measurements show it is needed.

---

## 4. Token budgets by layer (target <5k)

See `TOKEN_BUDGET.md` for the full matrix. Summary:

| Layer | Before (large schema) | After (budget) | Notes |
|-------|----------------------|----------------|-------|
| System prompt | ~200 | 200 | stable prefix |
| Rules / element catalog | 0 | 200 | added to system prompt; may auto-cache on some providers, but not counted as savings |
| Compact projection + RAG | 10–30k | ≤2048 | statistics + top-k + neighborhood |
| History | 1–10k | ≤1024 | last 6 turns + summary; pending-edit context is never trimmed |
| User message | ~50 | ≤100 | question + selected step id |
| **Total typical** | **20–40k** | **~3574** | ceiling 4096 |

Hard ceiling: `max_total_prompt_tokens = 4096`. The builder must never exceed it; if a layer is too large, trim using the fallback rules above.

---

## 5. Measurement plan

Close the audit gap: the audit did not measure actual prompt tokens on a large schema.

### 5.1 Before measurement

Script: `scripts/measure_prompt_tokens.py` (temporary, not committed to product code unless requested).

1. Generate a synthetic projection with 300 steps and 340 edges (typical large schema).
2. Build the current `_build_user_prompt` output.
3. Count tokens with `tiktoken` (`cl100k_base` for DeepSeek/OpenAI compatibility). If `tiktoken` is unavailable, use the project’s agreed heuristic: 1 token ≈ 4 chars for ASCII/JSON, 1 token ≈ 2 chars for Cyrillic.
4. Record: total tokens, projection tokens, history tokens, user-message tokens.

### 5.2 After measurement

1. Build the compact prompt with `PromptBuilder`.
2. Count tokens the same way.
3. Record layer breakdown from `PromptAssembly.layer_tokens`.

### 5.3 Regression quality check

Use the existing test suite as a guard:
- `backend/services/agent/tests/test_branches.py`
- `backend/services/agent/tests/test_agent_chat_contract.py`
- `backend/services/agent/tests/test_agent_stream_contract.py`
- `backend/services/agent/tests/test_context.py`
- New `backend/services/agent/tests/test_prompt_builder.py`

If any existing test fails, the contour is not approved.

### 5.4 Structural prefix observability (not claimed savings)

Because we cannot make real LLM calls in this environment, we only record the size of the stable prefix:

```
stable_prefix_tokens = system_prompt_tokens + stable_reference_tokens
prefix_ratio = stable_prefix_tokens / total_prompt_tokens
```

This is informational only. The contour does **not** claim cache-hit savings because provider-specific `cache_control` is out of scope (see §3.4).

---

## 6. Files to change (Phase 1)

```
backend/services/agent/memory/prompt_builder.py        # new
backend/services/agent/memory/chat.py                  # integrate builder
backend/services/agent/tests/test_prompt_builder.py    # new
backend/services/agent/tests/test_branches.py          # adjust assertions if prompt text is inspected
backend/services/agent/tests/conftest.py               # add mock conversation summary fixture if needed
```

No DB migrations, no OpenAPI changes, no frontend changes, no Nginx changes.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Compact projection degrades answer quality | Keep full fields for RAG-relevant and selected-step-neighborhood elements; preserve statistics; regression tests. |
| History cap loses context | Use existing conversation summary for older turns; cap is configurable. |
| `doc_qa` fallback now gets less schema context | Acceptable: fallback only when RAG is empty; if quality drops, increase RAG top_k or switch to schema_overview. |
| Tests inspect raw prompt JSON | Update tests to assert on structure, not on raw JSON; existing branch tests mock `complete` and check only behavior. |
| Token estimator inaccurate | Use tiktoken when available; heuristic documented; measurements labeled accordingly. |

---

## 8. Acceptance criteria

- [ ] Large-schema (300 nodes) prompt tokens <5k for a typical smalltalk question.
- [ ] Existing agent tests pass without behavioral regression.
- [ ] New unit tests prove budget compliance and compact projection structure.
- [ ] Pending-edit context is preserved in the prompt regardless of history budget.
- [ ] No change to public HTTP contract (`AgentChatIn` / `AgentChatOut`).
- [ ] No DB migrations required.
- [ ] git-proof clean: branch from `origin/main`, only intended files changed.

Cache-hit savings are explicitly **not** part of acceptance for this contour.

---

## 9. Next step

**STOP — await user approval of this PLAN.md before writing product code.**
