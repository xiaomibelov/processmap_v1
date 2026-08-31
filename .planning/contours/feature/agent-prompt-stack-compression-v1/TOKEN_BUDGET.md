# TOKEN_BUDGET — agent-prompt-stack-compression-v1

## Default config (`PromptBudgetConfig`)

| Field | Value | Rationale |
|-------|-------|-----------|
| `max_total_prompt_tokens` | 4096 | Hard ceiling for large-schema typical question. |
| `max_projection_tokens` | 2048 | Leaves room for system + history + user message. |
| `max_history_tokens` | 1024 | ~6 recent turns + summary fit comfortably. |
| `history_turns_full` | 6 | Enough short-term context; avoids 50-turn bloat. |
| `rag_top_k` | 5 | Same as current `_search_rag_prioritized`. |
| `selected_step_radius` | 1 | Direct predecessors + successors give local context without full graph. |

Env overrides (optional, no DB table):
- `PROCESSMAN_MAX_TOTAL_PROMPT_TOKENS`
- `PROCESSMAN_MAX_PROJECTION_TOKENS`
- `PROCESSMAN_MAX_HISTORY_TOKENS`
- `PROCESSMAN_HISTORY_TURNS_FULL`

## Layer budgets

| Layer | Before (large schema, est.) | After (budget) | Notes |
|-------|----------------------------|----------------|-------|
| System prompt (`processman_agent` v2) | 200 | 200 | Stable prefix. |
| Stable reference (element types, rules) | 0 | 200 | Added to system side; may auto-cache on some providers, but not counted as savings. |
| Compact projection + RAG context | 10 000–30 000 | ≤2048 | Statistics + top-k relevant + selected-step neighborhood. |
| History | 1000–10 000 | ≤1024 | Last 6 turns verbatim + conversation summary. **Pending-edit context is outside this budget.** |
| Pending-edit context | 0 | as needed | HITL context from `agent_pending_edits`; never trimmed. |
| User message + selected step | ~50 | ≤100 | Question text + selected_step_id. |
| **Total typical** | **20 000–40 000** | **~3574 + pending-edit** | Well under 5k ceiling for non-HITL turns; HITL turns preserve correctness over budget. |

## Trimming fallback order (compact projection)

If compact projection exceeds `max_projection_tokens`:

1. Reduce `rag_top_k` from 5 → 3.
2. Reduce `selected_step_radius` from 1 → 0.
3. Drop operation-code list from statistics.
4. Truncate element names to 80 characters.
5. If still over budget, drop RAG chunks entirely (keep statistics + neighborhood).

## Trimming fallback order (history)

Pending-edit context (any turn whose `action` is `edit_canvas` or whose `action_payload` contains `pending_edit_id` / `status: pending_confirmation`) is **excluded from trimming**.

For the remaining history, if verbatim history exceeds `max_history_tokens`:

1. Reduce `history_turns_full` by 1 until it fits or reaches 2.
2. If still over budget, truncate each non-pending turn to 200 characters.
3. Older turns beyond `history_turns_full` are replaced by summary or one-line note.

If pending-edit context alone exceeds the total prompt ceiling, the prompt is still assembled; correctness of the HITL flow takes priority over the token budget.

## Token counting

Runtime estimate uses a fast heuristic (no external dependency):
- ASCII / JSON: 1 token ≈ 4 characters.
- Cyrillic: 1 token ≈ 2 characters.

Tests may use `tiktoken` if available; heuristic is documented and conservative.
