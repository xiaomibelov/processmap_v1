# MEASUREMENTS — after (ПОСЛЕ)

**Contour:** feature/agent-model-routing-optimization-v1  
**Timestamp:** 2026-08-31T14:27:45Z  
**Fixture:** large_schema_300_nodes  
**Status:** after per-intent model_class routing  

## Method

- DB seeded with the new routing matrix:
  - cheap features (agent_router, agent_memory, agent_summary, agent_edit_propose) → deepseek-chat;
  - processman_agent low-creativity intents (smalltalk, schema_overview, doc_qa with RAG) → cheap;
  - processman_agent high-creativity fallback (doc_qa without RAG) → primary.
- `_deepseek_chat_request` mocked; prompt_tokens estimated from JSON message length (1 token ≈ 4 chars).
- completion_tokens fixed at 100 per LLM call for comparability.

## Scenarios

| Scenario | Intent | Feature | Model | Prompt tokens | Completion tokens | Cost USD |
|----------|--------|---------|-------|--------------:|------------------:|---------:|
| smalltalk | smalltalk | processman_agent | deepseek-chat | 22172 | 100 | 0.011286 |
| schema_overview | schema_overview | processman_agent | deepseek-chat | 22177 | 100 | 0.011288 |
| doc_qa_with_rag | doc_qa | processman_agent | deepseek-chat | 85 | 100 | 0.000243 |
| doc_qa_no_rag | doc_qa | processman_agent | claude-opus-4-6 | 22225 | 100 | 0.340875 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |

**Total cost USD:** 0.431438

## Notes

- `suggest_next` and `node_qa` use action runners (no direct LLM call in chat.py), so they do not appear as LLM usage rows.
- `edit_canvas` triggers `agent_edit_propose` (cheap). The final `agent_edit` answer is produced by the resume endpoint, not measured here.
- Placeholder pricing: deepseek-chat $0.50/$2.00 per 1M, claude-opus-4-6 $15.00/$75.00 per 1M.
