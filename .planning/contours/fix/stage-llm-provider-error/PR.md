# PR — fix/stage-llm-provider-error

**Ветка:** `fix/stage-llm-provider-error`  
**База:** `main` (`67083197`)  
**Тип:** fix  
**PR:** https://github.com/xiaomibelov/processmap_v1/pull/835  
**Заголовок:** `fix(llm): быстрый failover при таймауте провайдера, маппинг AI_PROVIDER_ERROR, action_text в промпте v4`

## Root cause

После мержа PR #834 на stage вкладка AI → «Сгенерировать действия» стала возвращать `AI_PROVIDER_ERROR` через ~1,7 мин.

1. **Главный дефект:** `backend/app/ai/gateway.py` делал до 2 retry на одного и того же провайдера при `Timeout`/`ConnectionError`. VVPROXY LLM с моделью `claude-opus-4-6` таймаутился на длинном контексте suggest/processman, и только после ~90 сек fallback на deepseek-main.
2. **Frontend:** `ProductActionSuggestionsPanel.jsx` не мапил коды `AI_PROVIDER_ERROR`, `AI_RESPONSE_PARSE_ERROR`, `AI_RATE_LIMIT_EXCEEDED` — пользователь видел raw code.
3. **Regression PR #834:** активный промпт `product_actions_suggest` v4 не содержал `action_text`, поэтому все сгенерированные предложения помечались incomplete.

## Что изменено

### Backend

- `backend/app/ai/gateway.py`:
  - При `requests.exceptions.Timeout` / `ConnectionError` gateway сразу failover'ит на следующего провайдера, не retry'я медленный/недоступный upstream.
  - В `status="error"` результате теперь возвращаются `provider_id` и `model` последнего провайдера цепочки.
- `backend/app/ai/llm_http_client.py`:
  - Новый параметр `retry_on_timeout` (default `True`); gateway передаёт `False`, чтобы самостоятельно управлять failover.
- `backend/app/routers/product_actions_ai.py`:
  - `_ProductActionsLLMProviderError` теперь несёт `result` (provider/model).
  - `AI_PROVIDER_ERROR` включает `diagnostics.provider_id` и `diagnostics.model` для прозрачности.
- `backend/app/ai/product_actions_suggest.py`:
  - В `PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4` добавлено поле `action_text` и правило «глагольная формулировка физического действия».

### Frontend

- `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx`:
  - `KNOWN_ERROR_CODES` дополнен `AI_PROVIDER_ERROR`, `AI_RESPONSE_PARSE_ERROR`, `AI_RATE_LIMIT_EXCEEDED`.
  - `formatErrorMessage` мапит эти коды на i18n-строки.
- `frontend/src/shared/i18n/ru.js` / `en.js`:
  - Добавлен `processAnalysis.ai.parseError`.

## Тесты

- `backend/tests/test_llm_gateway.py::test_timeout_fails_fast_to_backup_provider` ✅
- `backend/tests/test_product_actions_suggest_v2.py::test_v4_prompt_requires_action_text` ✅
- `frontend/src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs` ✅ 4 passed
- `npm run build` ✅ green

## Регрессия

- Существующие AI-фичи продолжают retry для HTTP 5xx/429 (retry logic в `llm_http_client` не изменена для не-таймаутных ошибок).
- `processman_agent` и другие фичи gateway теперь тоже получают быстрый failover при таймауте — это улучшение, не ломающий контракт.

## Stage-верификация (после мержа пользователем)

- [ ] suggest возвращает предложения без `AI_PROVIDER_ERROR`.
- [ ] processman отвечает.
- [ ] Execution log /admin/llm показывает provider/model успешных вызовов.
- [ ] Время отклика suggest — секунды, не минуты.

## Merge/deploy

- **Merge и deploy выполняет пользователь вручно.**
- После merge требуется проверка на stage.
