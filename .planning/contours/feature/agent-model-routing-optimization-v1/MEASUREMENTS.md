# MEASUREMENTS — baseline (ДО)

**Contour:** feature/agent-model-routing-optimization-v1  
**Timestamp:** 2026-08-31T14:30:31Z  
**Fixture:** large_schema_300_nodes  
**Status:** baseline before model_class routing changes  

## Method

- DB seeded to mimic the pre-change routing:
  - cheap features (agent_router, agent_memory, agent_summary, agent_edit_propose) → deepseek-chat;
  - every processman_agent turn forced to primary (claude-opus-4-6) via PromptBuilder patch.
- `_deepseek_chat_request` mocked; prompt_tokens estimated from JSON message length (1 token ≈ 4 chars).
- completion_tokens fixed at 100 per LLM call for comparability.

## Scenarios

| Scenario | Intent | Feature | Model | Prompt tokens | Completion tokens | Cost USD |
|----------|--------|---------|-------|--------------:|------------------:|---------:|
| smalltalk | smalltalk | processman_agent | claude-opus-4-6 | 22172 | 100 | 0.340080 |
| schema_overview | schema_overview | processman_agent | claude-opus-4-6 | 22177 | 100 | 0.340155 |
| doc_qa_with_rag | doc_qa | processman_agent | claude-opus-4-6 | 85 | 100 | 0.008775 |
| doc_qa_no_rag | doc_qa | processman_agent | claude-opus-4-6 | 22225 | 100 | 0.340875 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |
| edit_canvas | edit_canvas | agent_edit_propose | deepseek-chat | 22182 | 100 | 0.011291 |

**Total cost USD:** 1.097631

## Notes

- `suggest_next` and `node_qa` use action runners (no direct LLM call in chat.py), so they do not appear as LLM usage rows.
- `edit_canvas` triggers `agent_edit_propose` (cheap). The final `agent_edit` answer is produced by the resume endpoint, not measured here.
- Placeholder pricing: deepseek-chat $0.50/$2.00 per 1M, claude-opus-4-6 $15.00/$75.00 per 1M.
