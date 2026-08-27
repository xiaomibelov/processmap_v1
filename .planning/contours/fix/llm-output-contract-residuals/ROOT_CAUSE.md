# ROOT_CAUSE.md — fix/llm-output-contract-residuals

## Факты (без кода)

- Stage задеплоен с `main` (`307effbb`) — `GET https://stage.processmap.ru/agent/version` возвращает тот же commit.
- `/api/health` → `ok: true`, `alembic_version: "031"`.
- H1 (deploy drift agent-сервиса) **не подтверждается** на уровне версии.

## Гипотезы

### H1 — deploy drift agent gateway

**Статус:** маловероятно (версия совпадает), но копии `backend/services/agent/gateway/*` всё ещё могут дрейфовать по логике.

Проверка:
- `diff backend/app/ai/gateway.py backend/services/agent/gateway/gateway.py` — различия только в импортах, streaming, комментариях; логика идентична.
- `diff backend/app/ai/llm_http_client.py backend/services/agent/gateway/llm_http_client.py` — идентичен за исключением `_deepseek_chat_request_stream` в сервисе.
- `diff backend/app/agent/chat.py backend/services/agent/memory/chat.py` — сервисная копия содержит streaming/edit/router, монолитная — устаревшая версия; для SSE endpoint используется сервисная.

**Вывод:** код agent-сервиса синхронизирован с main; H1 не является root cause.

### H2 — модуль анализа/product-actions не прибит к deepseek-main

**Статус:** ожидает stage-данных.

- `process_analysis.py` и `schema_assistant.py` используют `_llm_backend()`: если `LLM_VIA_AGENT_SVC=1` — agent-service, иначе монолит gateway. В compose по умолчанию `LLM_VIA_AGENT_SVC=0`.
- `product_actions_ai.py` использует `_llm_complete` с той же логикой.
- Capability-aware json_mode есть в обоих gateway; repair-retry есть в `product_actions_ai.py`.
- Нужен execution log с stage, чтобы увидеть фактический provider/model и `json_mode_used`.

### H3 — усечение по max_tokens

**Статус:** ожидает stage-данных.

- `schema_assistant.MAX_TOKENS = 800` — жёсткий лимит.
- `process_analysis.MAX_TOKENS = 4000`.
- `product_actions_ai.py` использует `max_tokens=4000`.
- Если LLM обрывает JSON посередине, tolerant-парсеры (#836/#840) не помогут.
- Нужен `raw_len` и сравнение с `max_tokens` из execution log.

### H4 — фронтенд не распознаёт action-конверт processman

**Статус:** подтверждено по коду для ветки `chat` + JSON envelope.

- `frontend/src/features/process/processman/processmanView.js:extractAnswerText` обрабатывает только `"suggest"`, `"explain"`, `"qa"`.
- В streaming-ветке `chat` agent-сервис шлёт `action: "suggest-next"` / `"explain-step"` / `"step-qa"`. `extractAnswerText("suggest-next", data)` возвращает `""`.
- В `ProcessmanTobe.jsx` при `patch.type === "action"` вызывается `updateAgentMessage(..., { text: extractAnswerText(...) })`, что затирает накопленный текст.
- Если LLM вернул в `chat` JSON envelope, который `_extract_json_block` в `chat.py` не распознал, `assistant_message` остаётся равным `collected_text` (сырой JSON). `AgentMarkdown` эскейпит кавычки → видим `{&quot;action&quot;: ...}`.
- Даже при корректном envelope текущий `extractAnswerText` не умеет извлекать `message`/`note` из `suggest-next`/`explain-step`/`step-qa`, что даёт пустой text.

## Доказательства со stage

- Токен stage-админа получен и сохранён в `/tmp/stage_token.txt`.
- **S1 воспроизведён**: сессия `13f1f10b20`, POST `/api/sessions/13f1f10b20/agent/stream`, payload `{"message":"расскажи анекдот","selected_step_id":"Activity_0eqhdco"}`. SSE-фреймы сохранены в `evidence/processman_sse_raw_envelope.txt`.
  - Сначала идут token-события с сырым JSON envelope: `\`\`\`json\n{"action":"suggest-next",...}\n\`\`\``.
  - Затем `event: action` с `action: "suggest-next"` и полным payload (ok, status, suggestions.candidates, note и т.д.).
  - Provider: `llmprov_deepseek_seed`, model: `deepseek-v4-flash`, fallback: false.
- **S2 не воспроизведён**: product-actions suggest и process analysis на `13f1f10b20` отдают валидный результат. Execution log за последние записи содержит только `AI_SUGGEST_NO_STEPS` (не `AI_RESPONSE_PARSE_ERROR`). Ошибка, вероятно, была до PR #843 или на других сессиях (ВЫВЫВ/екеkе — не найдены в списке).

## Итог гипотез

| Гипотеза | Статус | Обоснование |
|----------|--------|-------------|
| H1 deploy drift agent gateway | Отвергнута | `/agent/version` = `307effbb` = main; diff gateway/llm_http_client/chat — незначительный; код синхронизирован |
| H2 модуль анализа не прибит к deepseek | Не подтвердилась на stage | execution log показывает deepseek-v4-flash, fallback=false; parse error отсутствует |
| H3 усечение по max_tokens | Не подтвердилась | raw ответы полные, не обрываются на середине JSON |
| H4 фронтенд не распознаёт action-конверт processman | **Подтверждена** | `extractAnswerText` не знает `suggest-next`/`explain-step`/`step-qa`; при action event текст затирается в `""`; во время стриминга виден сырой JSON |
