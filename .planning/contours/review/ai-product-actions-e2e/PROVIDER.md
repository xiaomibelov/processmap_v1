# PROVIDER.md — диагностика LLM-провайдера stage

Контур: `review/ai-product-actions-e2e`  
Дата: 2026-08-25  
Статус: **исправлено в ветке `fix/ai-product-actions-llm-gateway`; требуется merge пользователем + stage-креды для Playwright**

---

## 1. Какой провайдер используется

Фича «Действия с продуктом» (`ai.product_actions.suggest`) теперь использует **единый LLM-шлюз** ProcessMap (таблицы `llm_providers`, `llm_prompts`, `llm_feature_flags`).

- Провайдеры настраиваются в админке `/admin/llm`.
- Резолв: org-scoped → `org_default` → env-фолбэк `DEEPSEEK_API_KEY`.
- Модель берётся из настроенного провайдера / реестра моделей шлюза.

## 2. Root cause

**Было:** `backend/app/routers/product_actions_ai.py:606` вызывал `load_llm_settings()`, который читает `DEEPSEEK_API_KEY` из env или `_llm_settings.json`. На stage эта переменная не задана → `api_key == ""` → ответ `AI_PROVIDER_NOT_CONFIGURED`.

При этом остальные AI-фичи (`process_analysis`, `schema_assistant` и др.) уже использовали `backend/app/ai/gateway.py`, который берёт ключи из БД.

**Стало:** роутер вызывает `_llm_complete("product_actions_suggest", context, org_id=..., ...)`, который делегирует `gateway.complete` (или `llm_internal_client.complete` при `LLM_VIA_AGENT_SVC=1`). Провайдер резолвится из шлюза.

## 3. Что изменено

- Миграция `backend/alembic/versions/029_product_actions_llm_gateway_prompt.py`:
  - активный промпт `llm_prompts.feature = 'product_actions_suggest'`;
  - флаг фичи `llm_feature_flags.feature = 'product_actions_suggest'` (`enabled=true`, лимит 200k токенов/сутки).
- `backend/app/ai/product_actions_suggest.py` — добавлен `parse_product_actions_suggestions(text, ...)`.
- `backend/app/routers/product_actions_ai.py`:
  - убрано прямое чтение `DEEPSEEK_API_KEY`;
  - `_call_product_actions_llm(...)` → шлюз;
  - ошибки шлюза мапятся на существующие коды: `AI_PROVIDER_NOT_CONFIGURED`, `AI_RATE_LIMIT_EXCEEDED`, `AI_PROVIDER_ERROR`, `AI_RESPONSE_PARSE_ERROR`.

## 4. Проверка после merge

### 4.1. API-дым на stage (curl)

```bash
TOKEN=$(curl -s -X POST https://stage.processmap.ru/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<user>","password":"<pass>"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -s -X POST \
  "https://stage.processmap.ru/api/sessions/05e59e4aea/analysis/product-actions/suggest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Ожидаемый результат: ответ не содержит `AI_PROVIDER_NOT_CONFIGURED`. Может вернуться либо набор suggestions, либо другая управляемая ошибка (rate limit, provider error).

### 4.2. Вызов виден в расходе шлюза

После успешного вызова в админке `/admin/llm` → вкладка «Расход» должна появиться строка с `feature = product_actions_suggest` и использованным `provider_id`.

## 5. Что требуется от пользователя

1. **Merge PR** (`fix/ai-product-actions-llm-gateway`) — вручную.
2. **Stage-креды для Playwright** — email/password пользователя орг «Роботизация производств» (или актуальная сессия/cookie). Без них E2E-сценарий будет проверен только на API-уровне; в `VERDICT.md` это будет явно отмечено.

> DEEPSEEK_API_KEY в `.env.stage` больше не требуется для этой фичи. Ключи берутся из шлюза (БД), который уже настроен.

---

*Следующий шаг: пользователь мержит PR; после деплоя stage — curl-проверка и, при наличии кредов, Playwright E2E.*
