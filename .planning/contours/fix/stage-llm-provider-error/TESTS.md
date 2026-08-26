# TESTS — fix/stage-llm-provider-error

## Backend

| Файл | Что проверяет | Статус |
|------|---------------|--------|
| `backend/tests/test_llm_gateway.py::test_timeout_fails_fast_to_backup_provider` | При таймауте/обрыве первого провайдера gateway сразу failover'ит на backup без retry | ✅ passed |
| `backend/tests/test_product_actions_ai_suggest.py::ProductActionsAiSuggestTests::test_gateway_provider_error_includes_provider_diagnostics` | `AI_PROVIDER_ERROR` включает provider_id/model в diagnostics | ✅ passed |
| `backend/tests/test_product_actions_suggest_v2.py::test_v4_prompt_requires_action_text` | Промпт v4 требует `action_text` | ✅ passed |
| `backend/tests/test_product_actions_suggest_v2.py` (остальные) | Нормализация, missing fields, product_name/group не обязательны | ✅ 5 passed |
| `backend/tests/test_llm_gateway.py` (полный прогон) | Gateway regression | ⚠️ 17 passed, 1 failed (pre-existing `test_effective_providers_with_key_prefers_org_then_org_default` — загрязнённая Postgres) |

## Frontend

| Файл | Что проверяет | Статус |
|------|---------------|--------|
| `frontend/src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs` | `AI_PROVIDER_ERROR`, `AI_RESPONSE_PARSE_ERROR`, `AI_RATE_LIMIT_EXCEEDED` мапятся в человекочитаемые сообщения; raw code уходит в технический блок | ✅ 4 passed |
| `npm run build` | Сборка green, нет новых i18n warning'ов | ✅ built |

## Команды для воспроизведения

```bash
# Backend
cd backend
.venv/bin/pytest tests/test_product_actions_suggest_v2.py tests/test_llm_gateway.py -q

# Frontend (Docker, node на хосте не установлен)
cd frontend
docker run --rm -m 8g -v "$PWD:/ws" -w /ws node:20-alpine node --test src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs
docker run --rm -m 8g -v "$PWD:/ws" -w /ws node:20-alpine npm run build
```
