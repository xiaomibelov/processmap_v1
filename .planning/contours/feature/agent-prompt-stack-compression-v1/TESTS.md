# TESTS — agent-prompt-stack-compression-v1

## New unit tests: `backend/services/agent/tests/test_prompt_builder.py`

1. `test_compact_projection_includes_statistics`
   - Input: projection with 300 steps, mixed types.
   - Assert: output contains counts by type, total nodes, total edges.

2. `test_compact_projection_includes_selected_step_neighborhood`
   - Input: projection with linear chain, selected_step_id in the middle.
   - Assert: selected step, predecessor, successor present with full fields.

3. `test_compact_projection_includes_rag_chunks`
   - Input: projection + RAG results for 3 element ids.
   - Assert: those 3 elements appear with full fields even if not selected.

4. `test_compact_projection_does_not_exceed_budget`
   - Input: large projection.
   - Assert: `estimated_prompt_tokens <= max_total_prompt_tokens`.

5. `test_history_keeps_last_n_turns_verbatim`
   - Input: 20 turns.
   - Assert: last 6 turns present verbatim; older turns not present unless summarized.

6. `test_history_uses_conversation_summary_for_older_turns`
   - Input: 20 turns + conversation summary.
   - Assert: summary text appears in history block.

7. `test_history_does_not_exceed_budget`
   - Input: very long turns.
   - Assert: `layer_tokens["history"] <= max_history_tokens`.

8. `test_prompt_layers_reported`
   - Assert: `PromptAssembly.layer_tokens` contains keys: `system`, `projection`, `history`, `user`.

9. `test_build_schema_overview_prompt_uses_compact_projection`
   - Assert: cold schema_overview prompt does not contain full JSON projection dump.

## Regression tests (existing, must pass)

- `test_branches.py`
- `test_agent_chat_contract.py`
- `test_agent_stream_contract.py`
- `test_context.py`
- `test_agent_memory.py`
- `test_memory_worker.py`

## Measurement tests (manual / CI optional)

- `scripts/measure_prompt_tokens.py`
  - Generate 300-node synthetic projection.
  - Print before/after token counts and layer breakdown.
  - Exit 0 if after < 5000 tokens.

## Test command

```bash
cd backend/services/agent
python -m pytest tests/test_prompt_builder.py tests/test_branches.py tests/test_agent_chat_contract.py tests/test_agent_stream_contract.py tests/test_context.py -q
```
