# 2026-05-07 - feature/admin-ai-provider-settings-and-product-actions-prompt-v1

New admin AI provider endpoints:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/admin/ai/provider-settings` | returns secret-safe provider settings summary |
| POST | `/api/admin/ai/provider-settings` | saves/replaces DeepSeek API key and Base URL; returns no secret |
| POST | `/api/admin/ai/provider-settings/verify` | verifies provider availability; returns controlled result |

Existing product actions AI endpoint updated:

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/sessions/{session_id}/analysis/product-actions/suggest` | returns controlled setup/provider errors and still writes only AI execution log, not session truth |

Controlled error codes:

- `AI_PROVIDER_NOT_CONFIGURED`
- `AI_PROMPT_NOT_CONFIGURED`
- `AI_PROVIDER_ERROR`

Unchanged:

- legacy `/api/settings/llm` remains available;
- product_actions save path unchanged;
- BPMN XML unchanged;
- no export endpoint added.
