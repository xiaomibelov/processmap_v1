# AGENT-1: диалоговый агент PROCESSMAN с роутером intent, памятью схемы и RAG

> **СТАТУС: ПЛАН, редакция 2, решения владельца внесены. Требует апрува. Реализацию не начинать.**  
> Дата: 2026-08-17. Ветка: `docs/agent-1-plan` от `origin/main` @ `e34c5986`.  
> База: `backend/services/agent/` (AGENT-SVC Phase 2–5, уже в `main`), монолитный `backend/app/agent/` и флаг `LLM_VIA_AGENT_SVC` **не трогаются** (soak на боевом).

## 0. Контекст и ограничения

### 0.1 Что уже в main (проверено по коду)

- Агент-сервис: `backend/services/agent/` — автономный FastAPI с собственным gateway-клоном (`gateway/gateway.py`), памятью диалога (`memory/`), HTTP-runners к монолитным LLM3 endpoints (`runners/action_runners.py`) и internal LLM API (`routers/internal_llm.py`).
- Публичные пути сервиса: `/sessions/{session_id}/agent/chat`, `/sessions/{session_id}/agent/history` (`routers/agent_chat.py:58`, `:74`).
- Nginx маршрутизирует только узкий regex `^/api/sessions/[^/]+/agent/(chat|history)$` (`deploy/nginx/default.prod.internal.conf:33`); `/agent/projection` остаётся на монолите.
- Phase 5 PASS: `docs/agent/AGENT_SVC_PHASE5_VERIFICATION.md` — реальные completions, общий Redis-кэш `pm:cache:llm:*`, TTL-кэш `resolve_model` 60 с, честные статусы.
- Монолитный `backend/app/agent/` и `routers/agent_chat.py` живут как fallback; удаление — отдельный PR после 14 дней soak (решение владельца).

### 0.2 Жёсткие ограничения AGENT-1

1. **Монолитный agent-код и `LLM_VIA_AGENT_SVC` не трогать.**
2. **Сервис не импортирует `backend.app.*`** — сохраняется правило AGENT-SVC; новые модули копируют/адаптируют код, а не импортируют.
3. **Alembic-миграции только в монолите** (`backend/alembic/versions/`); сервис не содержит миграций.
4. **Секреты не публикуются** — только `has_api_key` + `key_last4` (`docs/PASSWORD_ROTATION_RULE.md`).
5. **0 LLM-вызовов** на открытие панели, `GET /agent/history`, выбор шага.
6. **Кэш-ключи `pm:cache:llm:*`** общие с монолитом; не ломать.
7. **Prod/deploy без явного апрува владельца запрещён.**

---

## 1. Роутер intent

### 1.1 Задача

Добавить перед `gateway.complete("processman_agent", ...)` («толстый» chat-моделью) узкий cheap-роутер, который классифицирует вопрос пользователя в один из интентов:

```
{node_qa, schema_overview, doc_qa, suggest_next, smalltalk}
```

- `node_qa` — вопрос про конкретный выбранный шаг.
- `schema_overview` — вопрос «расскажи про схему целиком».
- `doc_qa` — вопрос по базе знаний (RAG).
- `suggest_next` — явная просьба предложить следующий шаг.
- `smalltalk` — приветствие, уточнение, вопрос не по схеме.

### 1.2 Контракт роутера

- Новый feature: `agent_router`.
- Модель: `model_class='cheap'` (`deepseek-chat` на текущей конфигурации; см. `gateway/llm_store.py:94` `resolve_model`).
- `max_tokens ≤ 200`.
- Промпт: короткий system + user-блок с `question`, `projection_digest`, `selected_node_id`, `history_summary` (2–3 последние реплики). Явная инструкция «ответь одним словом из списка» и «отвечай на русском».
- Кэш: `complete_cached(feature="agent_router", cache_digest=md5(question + projection_digest + selected_node_id))`. Ключ попадает в общий Redis `pm:cache:llm:agent_router:v1:{digest}` — повторный вопрос при неизменной схеме = 0 токенов.
- Падение/мусор (JSON не распарсился, интент вне списка) → **деградация в `smalltalk` / free-answer**, HTTP 200, не 500.

### 1.3 Где встраивать

Файл `backend/services/agent/memory/chat.py:181` вызывает `complete(FEATURE, ...)`. До этой точки в `run_turn()` добавить:

```python
intent = route_intent(payload.message, ctx.digest, payload.selected_step_id, ctx.history)
```

Если `intent in {"node_qa", "schema_overview", "doc_qa", "suggest_next"}` — идём в соответствующую ветку. Если `smalltalk` или роутер упал — free-answer через `complete("processman_agent", ...)`.

### 1.4 Почему это чинит «сырой JSON на пустой схеме»

Наблюдение Phase 5 (`AGENT_SVC_PHASE5_VERIFICATION.md`, раздел «Качество ответов»): на пустой схеме `processman_agent` возвращает action-JSON, который затем деградирует в free-answer, но пользователь видит сырой JSON. После введения роутера:

- пустая схема + вопрос без явного действия → `smalltalk`;
- `smalltalk` отвечается коротким free-answer без попытки парсинга action-JSON;
- сырой JSON больше не попадает в UI.

---

## 2. Ветки обработки

### 2.1 `node_qa` → LLM3 step-qa

- Условие: `intent == "node_qa"` и `selected_step_id` присутствует в проекции.
- Действие: вызвать существующий `run_step_qa(session_id, token, step_id=selected, question=message)` (`runners/action_runners.py:49`).
- Guard'ы LLM3 остаются в монолите (`schema_assistant.py:272`); сервис только проксирует.
- Ответ в ленту: `message = action_payload.answer`, `action="step-qa"`.
- 0 вызовов `processman_agent`.

### 2.2 `schema_overview` → предрасчётанное summary

- Условие: `intent == "schema_overview"`.
- Данные: таблица `agent_schema_memory` (см. раздел 3) + текущая проекция.
- Если `agent_schema_memory.summary` свежее (для текущего `projection_digest`) — вернуть его, **0 LLM-вызовов**.
- Если summary устарело/отсутствует — fallback: один вызов `processman_agent` с явным prompt'ом «суммари схемы на русском, ≤400 токенов», затем фоновый `update_memory`.
- Целевое свойство: **«расскажи про схему» ≤ 5 с p95 при тёплой памяти** (замер на stage).

### 2.3 `doc_qa` → BM25 RAG

- Условие: `intent == "doc_qa"` или вопрос явно про документацию/норматив.
- Действие: HTTP `GET /api/rag/search` монолита с пробросом JWT (`runners/monolith_client.py` добавить `search_rag(...)`).
  - Параметры: `q=message`, `top_k=5`, `source_type` по контексту (`bpmn_xml` / `product_action`), `session_id`, `min_score=0.1`.
  - Endpoint: `backend/app/routers/rag.py:36`.
- Контекст: топ-N чанков + question отправляются в `complete("processman_agent", ...)` с system-инструкцией «ответь на основе предоставленных отрывков, на русском».
- Если RAG выключен (`rag_disabled`) или нет результатов — деградация в free-answer по схеме.

### 2.4 `suggest_next` → LLM3 suggest-next

- Условие: `intent == "suggest_next"` и `selected_step_id` в проекции.
- Действие: `run_suggest_next(session_id, token, after_step_id=selected)` (`runners/action_runners.py:39`).
- Guard каталога остаётся в монолите (`schema_assistant.py:130`).

### 2.5 `smalltalk` → cheap free-answer

- Условие: роутер вернул `smalltalk`, пустая схема, вопрос вне домена.
- Действие: `complete("processman_agent", ...)` с коротким ответом (max_tokens=400), без action-JSON.
- Экономия: одна cheap-модель вместо cheap-router + толстый chat.

### 2.6 Таблица веток

| intent | LLM-вызовы | Модель | Кэш | Guard'ы |
|---|---|---|---|---|
| `node_qa` | 1 (LLM3 step-qa) | cheap | `schema_assistant` | монолит |
| `schema_overview` | 0 (теплая память) или 1 | cheap/primary | `agent_memory` | — |
| `doc_qa` | 1 (RAG + chat) | primary | `processman_agent` | BM25 + min_score |
| `suggest_next` | 1 (LLM3 suggest-next) | cheap | `schema_assistant` | монолит |
| `smalltalk` | 1 | cheap | `processman_agent` | — |

---

## 3. Долгосрочная память схемы (`agent_schema_memory`)

### 3.1 Схема (миграция `019_agent_schema_memory.py`)

```sql
CREATE TABLE IF NOT EXISTS agent_schema_memory (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'org_default',
    session_id TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    facts_json TEXT NOT NULL DEFAULT '{}',
    decisions_json TEXT NOT NULL DEFAULT '{}',
    projection_digest TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE(org_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_schema_memory_session
ON agent_schema_memory(org_id, session_id);
```

- `down_revision = "018"`.
- `backend/scripts/db_bootstrap.py:30` LINEAR расширить значением `"019"`.
- Маркер для db_bootstrap: `"019": "SELECT 1 FROM information_schema.tables WHERE table_name='agent_schema_memory' LIMIT 1"`.

### 3.2 Когда обновлять память

Фоновый `update_memory` запускается при:

1. Смене `projection_digest` после успешного chat-ответа (не smalltalk, не ошибка).
2. Явном событии «схема сохранена» — позже через монолитный webhook или Redis pub/sub; в AGENT-1 достаточно п.1.

Guard'ы (не писать в БД):

- `smalltalk` или ошибка роутера;
- пустая проекция (0 шагов);
- новые `facts` отсутствуют (cheap-модель вернула пустой/идентичный список).

### 3.3 Фоновый update через Redis queue (не Celery)

Решение владельца (открытый вопрос AGENT-SVC №5): Celery не вводим. Используем существующий Redis + лёгкий worker-паттерн:

- В `memory/schema_memory.py`:
  - `schedule_memory_update(session_id, org_id, projection_digest)` — LPUSH в `pm:agent:memory:queue` JSON `{"session_id", "org_id", "digest", "ts"}`.
  - `run_memory_worker_once()` — BRPOP из очереди, загрузка последних turn'ов и проекции, вызов cheap-модели с feature `agent_memory`, запись `summary/facts_json/decisions_json` в `agent_schema_memory`.
- В `main.py` при старте сервиса запускается фоновый поток (`threading.Thread`), который в цикле вызывает `run_memory_worker_once()`.
- Timeout цикла: 5 с холостого ожидания; graceful shutdown через `stop_event`.
- Альтернатива (если владелец предпочтёт): отдельный контейнер `agent-worker` с тем же образом и командой `python -m memory.schema_memory_worker`; в AGENT-1 начинаем с in-process thread, отдельный контейнер — опция.

### 3.4 Контракт `agent_memory` LLM-вызова

- Feature: `agent_memory`.
- Model class: `cheap`.
- `max_tokens ≤ 800`.
- Input: сжатая проекция + последние 10 turn'ов.
- Output (JSON): `{"summary": "...", "facts": [...], "decisions": [...]}`.
- Промпт: явное «отвечай на русском», «facts — только утверждённые в диалоге решения».

### 3.5 Использование памяти в `schema_overview`

```python
memory = load_schema_memory(session_id, org_id)
if memory and memory.projection_digest == current_digest:
    return AgentChatOut(ok=True, message=memory.summary, action="schema_overview")
```

---

## 4. Решение о рантайме графа: langgraph vs свой рантайм

### 4.1 Текущее состояние

AGENT-0/AGENT-SVC реализованы на «своём рантайме»: последовательный `run_turn()` в `memory/chat.py:152` с if/else на action. Уже есть ветвление:

- `complete("processman_agent")` → парсинг JSON → выбор runner (`suggest-next`/`explain-step`/`step-qa`).
- Деградации (bad JSON, unknown step, gateway status).

### 4.2 Требования AGENT-1 и AGENT-3

| Требование | AGENT-1 | AGENT-3 (будущий) |
|---|---|---|
| Ветвления intent | ≥ 5 веток | + правки канваса |
| interrupt/HITL | не нужен | обязателен (согласование правки узла) |
| Стриминг | SSE | SSE |
| Persistence | Postgres `agent_turns` + `agent_schema_memory` | то же + черновики правок |
| Переносимость тестов AGENT-0 | высокий приоритет | высокий |

### 4.3 Сравнительная таблица

| Критерий | Свой рантайм (наследуем) | LangGraph |
|---|---|---|
| Зависимости | 0 новых | `langgraph`, `langchain-core` |
| Checkpointer | наши `agent_turns` / `agent_schema_memory` | его `PostgresSaver` или `RedisSaver` → **двойное хранение** |
| interrupt/HITL | нужно реализовать вручную | встроено (`NodeInterrupt`) |
| Стриминг | ручная SSE | `astream_events` |
| Тесты AGENT-0 | переносятся без изменений | нужен shim / переписывание моков |
| Объём переписывания | минимальный (AGENT-1) | значительный (весь `memory/chat.py` + тесты) |
| Риск | рост сложности при AGENT-3 | vendor lock-in, версионная совместимость |

### 4.4 Рекомендация (решение владельца)

**AGENT-1 — остаёмся на своём рантайме.**

Обоснование:

- Ветвления intent реализуются простым enum + switch без графовой абстракции.
- Стриминг SSE можно реализовать поверх `complete()` генератором токенов.
- Тесты AGENT-0 не переписываются.
- AGENT-3 (HITL) оцениваем отдельно: если interrupt станет сложным вручную — пересмотреть langgraph на старте AGENT-3, но не раньше.

---

## 5. Стриминг (SSE)

### 5.1 Endpoint

`POST /sessions/{session_id}/agent/stream` в сервисе, проксируется nginx:

```nginx
location ~ ^/api/sessions/[^/]+/agent/(chat|history|stream)$ {
    rewrite ^/api/(.*)$ /$1 break;
    proxy_pass http://$agent_host:8000;
    proxy_http_version 1.1;
    proxy_connect_timeout 5s;
    proxy_send_timeout 180s;
    proxy_read_timeout 180s;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # ⚠️ важно для SSE
    proxy_buffering off;
    proxy_cache off;
}
```

### 5.2 Контракт SSE-событий

| event | data | Описание |
|---|---|---|
| `start` | `{"turn_id": "..."}` | Начало генерации |
| `token` | `{"delta": "..."}` | Часть текста (если провайдер поддерживает streaming) |
| `action` | `{"action": "...", "payload": {...}}` | Если роутер выбрал LLM3-действие и оно выполнено |
| `done` | `{"usage": {...}, "projection_digest": "..."}` | Завершение |
| `error` | `{"status": "...", "error": "..."}` | Честная ошибка (HTTP 200 в рамках SSE) |

### 5.3 Реализация

- `gateway/llm_http_client.py`: добавить `_deepseek_chat_request_stream(...)` — вызов `/chat/completions` с `stream=true`.
- `gateway/gateway.py`: добавить `complete_stream(feature, payload, ...)` — генератор токенов.
- `memory/chat.py`: добавить `run_turn_stream(...)` — выполняет роутер/ветку и yield'ит события.
- `routers/agent_stream.py`: FastAPI `StreamingResponse` с `media_type="text/event-stream"`.
- **Фронт:** `ProcessmanTobe` использует `fetch()` + `ReadableStream` (`response.body.getReader()`), НЕ `EventSource`, т.к. endpoint — `POST` с телом запроса (`message`, `selected_step_id`, `client_turn_id`). `AbortController` прерывает соединение по кнопке «Стоп». Состояния S1–S8 сохраняются (`processmanView.js:55`).

### 5.4 Fallback если streaming не поддерживается

Если провайдер не вернул choices[0].delta.content, эмитим единственный `token` с полным текстом и `done`.

---

## 6. Промпты

### 6.1 Новые фичи и их промпты

| feature | model_class | max_tokens | Статус миграции |
|---|---|---|---|
| `agent_router` | cheap | 200 | seed-миграция `020_agent_router_prompt.py`, статус `draft` |
| `agent_memory` | cheap | 800 | seed-миграция `020_agent_router_prompt.py` или `021_agent_memory_prompt.py`, статус `draft` |
| `processman_agent` (обновлённый) | primary | 1200 | seed-миграция `022_processman_agent_v2_prompt.py`, статус `draft` |

### 6.2 Требования к тексту

- Явная инструкция «отвечай на русском» во всех system-промптах.
- `processman_agent v2`:
  - Если ответ предполагает действие — всё ещё JSON в markdown-блоке (для `suggest_next`/`explain_step`/`step_qa`), **но только когда это уместно**.
  - Если вопрос — smalltalk/doc_qa/schema_overview — не требовать JSON.
- `agent_router`:
  - Список интентов фиксирован; ответ — одно слово.
  - Пример: `node_qa`.

### 6.3 Чиним «сырой JSON на пустой схеме»

- Приёмочный тест: пустая проекция (0 шагов) + вопрос «что это?» → роутер `smalltalk` → free-answer без action-JSON → UI видит человекочитаемый текст, не JSON.
- Регрессионный тест: прежний malformed-JSON кейс (`test_agent_chat_integration.py:61`) остаётся зелёным.

---

## 7. Модели и лимиты

### 7.1 Предлагаемые `llm_feature_flags`

| feature | enabled | daily_token_limit | model_class |
|---|---|---|---|
| `agent_router` | true | 100000 | cheap |
| `agent_chat` (`processman_agent`) | true | 300000 | primary |
| `agent_memory` | true | 100000 | cheap |

- Значения — seed в миграции или ручное создание через `/api/admin/llm/features`.
- `model_class` определяет `resolve_model`: cheap → default/override для `agent_router`/`agent_memory`; primary — для `agent_chat`.

### 7.2 Cross-class fallback

Текущий gateway (`gateway/gateway.py:141`) фолбэкается **по провайдерам**, но не по `model_class`. Если `agent_chat` настроен на primary (`claude-opus-4-6`), а primary недоступен, gateway может уйти на следующего enabled-провайдера, который может быть cheap (`deepseek-chat`).

**Решение владельца (2026-08-17):**

- **AGENT-1:** вариант (в) — алерт по `llm_usage.model` для `processman_agent`, если фактическая модель отличается от ожидаемой primary. Gateway не усложняем.
- **После AGENT-1 (отдельная задача):** вариант (б) — добавить в gateway признак `model_class` и фильтровать провайдерскую цепочку по совместимости модели, если потребуется.

### 7.3 Провайдеры (актуальные)

По наблюдениям Phase 5:

- `VVPROXY` (`https://vvchat.vkusvill.ru/red-mad-router`) — primary `claude-opus-4-6`.
- `deepseek-chat` — cheap.

Никаких ключей в коде; конфигурация через `/api/admin/llm/providers` и `/api/admin/llm/feature-models`.

---

## 8. Экономика токенов

### 8.1 Сохраняемые свойства AGENT-0

- Открытие панели / `GET /agent/history` / выбор шага — **0 LLM-вызовов**.
- История читается из Postgres (`memory/memory_store.py:204`).
- Кэш LLM3 (`schema_assistant`) общий с монолитом (`gateway/gateway.py:189`).

### 8.2 Новые траты

| Сценарий | Вызовы | Примечание |
|---|---|---|
| Smalltalk | 1× router (cached) + 1× chat | router кэшируется при повторе |
| Node QA | 1× router (cached) + 1× LLM3 step-qa | step-qa кэшируется по схеме/шагу/вопросу |
| Suggest next | 1× router (cached) + 1× LLM3 suggest-next | suggest-next кэшируется |
| Schema overview (тепло) | 1× router (cached) | summary уже в БД |
| Schema overview (холодно) | 1× router + 1× chat + фоновый agent_memory | следующий раз — 0 |
| Doc QA | 1× router + 1× chat (+ RAG поиск 0 LLM) | chat может кэшироваться, если вопрос+чанки идентичны |

### 8.3 Кэш router

Ключ: `md5(question + "|" + projection_digest + "|" + selected_node_id)`.
- Повторный вопрос при неизменной схеме → router 0 токенов.
- При смене схемы digest меняется → естественная инвалидация.

---

## 9. Архитектура сервисных изменений

### 9.1 Новые/изменённые модули в `backend/services/agent/`

```
backend/services/agent/
  main.py                              # + startup worker thread, + stream router
  schemas.py                           # + AgentStreamIn / SSE-события (опционально)
  memory/
    chat.py                            # + route_intent, ветки, run_turn_stream
    context.py                         # без изменений
    memory_store.py                    # без изменений
    schema_memory.py                   # NEW: CRUD + queue + worker
  runners/
    monolith_client.py                 # + search_rag(...), возможно projection с digest
    action_runners.py                  # без изменений
  routers/
    agent_chat.py                      # без изменений (chat/history)
    agent_stream.py                    # NEW: POST /sessions/{id}/agent/stream
    internal_llm.py                    # без изменений
    health.py                          # без изменений
  gateway/
    gateway.py                         # + complete_stream
    llm_http_client.py                 # + _deepseek_chat_request_stream
    llm_store.py                       # без изменений
```

### 9.2 Монолитные изменения (только то, что необходимо)

```
backend/alembic/versions/019_agent_schema_memory.py   # NEW DDL
backend/alembic/versions/020_agent_router_prompt.py   # NEW seed
backend/alembic/versions/021_agent_memory_prompt.py   # NEW seed
backend/alembic/versions/022_processman_agent_v2_prompt.py  # NEW seed
backend/scripts/db_bootstrap.py                       # LINEAR += "019"
backend/app/routers/rag.py                            # без изменений (уже есть /api/rag/search)
backend/app/routers/admin_llm.py                      # без изменений
backend/app/agent/                                    # НЕ ТРОГАТЬ (soak)
```

### 9.3 Инфраструктура

```
deploy/nginx/default.prod.internal.conf  # regex расширить до (chat|history|stream)
deploy/nginx/default.prod.tls.conf       # аналогично, если применяется
deploy/nginx/default.conf                  # аналогично
```

---

## 10. Гейт AGENT-1 (definition of done)

| # | Критерий | Как проверить |
|---|---|---|
| 1 | Свободный вопрос про узел → `node_qa` с чипами 📍 | Ручной прогон + `llm_usage.feature=schema_assistant` |
| 2 | «Расскажи про схему» ≤ 5 с p95 при тёплой памяти | 20 вызовов, замер wall time; `agent_schema_memory` hit |
| 3 | Повторный вопрос при неизменной схеме → router 0 токенов | `llm_usage.feature=agent_router` cached=true |
| 4 | Память схемы видна в `agent_schema_memory` и переживает reload | Перезапуск контейнера agent, history читается из PG |
| 5 | SSE: панель стримит, «Стоп» обрывает, S1–S8 не сломаны | Playwright/ручной прогон + frontend-тесты |
| 6 | Регрессия AGENT-0: тесты сервиса зелёные | `pytest backend/services/agent/tests` |
| 7 | Регрессия монолита: LLM3/contract-suite без новых падений | `pytest backend/tests -m contract` |
| 8 | Честные статусы: disabled/rate_limited/no_provider/error — HTTP 200 | Мок/ручной прогон |
| 9 | Пустая схема не показывает сырой JSON | Приёмочный тест + скриншот |
| 10 | 0 LLM-вызовов на открытие/history/выбор шага | Тест с моком `complete` |

---

## 11. Таблица «файл → изменение»

| Файл | Изменение | Процесс |
|---|---|---|
| `backend/services/agent/memory/schema_memory.py` | NEW | agent-сервис |
| `backend/services/agent/memory/chat.py` | route_intent, ветки, run_turn_stream | agent-сервис |
| `backend/services/agent/routers/agent_stream.py` | NEW | agent-сервис |
| `backend/services/agent/gateway/gateway.py` | complete_stream | agent-сервис |
| `backend/services/agent/gateway/llm_http_client.py` | streaming helper | agent-сервис |
| `backend/services/agent/runners/monolith_client.py` | search_rag | agent-сервис |
| `backend/services/agent/main.py` | worker thread, stream router | agent-сервис |
| `backend/services/agent/schemas.py` | AgentStreamIn (опционально) | agent-сервис |
| `backend/services/agent/tests/test_agent_*` | новые тесты intent/memory/stream | agent-сервис |
| `backend/alembic/versions/019_agent_schema_memory.py` | NEW DDL | монолит |
| `backend/alembic/versions/020_agent_router_prompt.py` | NEW seed | монолит |
| `backend/alembic/versions/021_agent_memory_prompt.py` | NEW seed | монолит |
| `backend/alembic/versions/022_processman_agent_v2_prompt.py` | NEW seed | монолит |
| `backend/scripts/db_bootstrap.py` | LINEAR += "019", MARKERS += "019" | монолит |
| `deploy/nginx/default.prod.internal.conf` | regex `(chat\|history\|stream)` | nginx |
| `deploy/nginx/default.prod.tls.conf` | аналогично | nginx |
| `deploy/nginx/default.conf` | аналогично | nginx |
| `frontend/src/lib/apiRoutes.js` | `agent.chat`, `agent.history`, `agent.stream` | frontend |
| `frontend/src/lib/api.js` | `apiAgentChat`, `apiAgentStream` | frontend |
| `frontend/src/features/process/processman/chat/processmanChatStore.js` | streaming-статусы | frontend |
| `frontend/src/features/process/processman/ProcessmanTobe.jsx` | fetch + ReadableStream + AbortController | frontend |
| `frontend/src/features/process/processman/processmanView.js` | маппинг SSE-событий | frontend |
| `docs/agent/AGENT1_PLAN.md` | этот документ | docs |

---

## 12. Решения владельца (2026-08-17)

Все открытые вопросы закрыты; отклонения от изначального плана зафиксированы.

1. **Рантайм графа:** остаёмся на своём рантайме для AGENT-1. Пересмотр в пользу LangGraph — триггер = старт AGENT-3 (interrupt/HITL).
2. **Cross-class fallback:**
   - **Сейчас (AGENT-1):** вариант (в) — алерт по `llm_usage.model` для `processman_agent`, если фактическая модель отличается от ожидаемой primary. Gateway не усложняем.
   - **Отдельной задачей:** вариант (б) — добавить в gateway фильтрацию провайдерской цепочки по `model_class` (только если владелец инициирует после AGENT-1).
3. **Фоновый worker:** in-process thread в контейнере `agent`. Отдельный `agent-worker` — не в AGENT-1.
4. **RAG source_type для doc_qa:** использовать только существующие `bpmn_xml` и `product_action`; новый `agent_doc` не добавлять.
5. **Промпт `processman_agent v2`:** seed-миграция со статусом `draft`; активирует владелец после тюнинга с живым ключом на stage.
6. **Feature flags:** лимиты утверждены — `agent_router=100k`, `agent_chat=300k`, `agent_memory=100k`.
7. **SSE:** в scope AGENT-1; реализация фронта — `fetch()` + `ReadableStream` + `AbortController` (не `EventSource`).

---

## 13. Риски и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| Роутер ошибочно классифицирует в `suggest_next` → лишний LLM3 | средняя | cheap-модель + кэш; guard'ы LLM3 отсекают невалидный шаг; метрики по `llm_usage.feature` |
| Двойное хранение памяти (turns + schema_memory) | низкая | turns хранят диалог, schema_memory — саммари; схемы не дублируют друг друга |
| SSE через nginx-буферизацию ломает стрим | средняя | `proxy_buffering off; proxy_cache off;` в плане |
| Cross-class fallback портит метрики | средняя | Открытый вопрос №2 + алерт по `llm_usage.model` |
| Увеличение latency из-за роутера | низкая | Router cached → 0; первый вопрос +1 cheap-вызов ≤ 200 токенов |
| LangGraph не выбран сейчас → технический долг для AGENT-3 | низкая | Решение зафиксировано; пересмотр на старте AGENT-3 |
| Монолитный agent-код не трогаем, но дублируется логика | осознанно | Soak 14 дней, затем PR на удаление монолитного кода |

---

## 14. Порядок PR (после апрува плана)

1. **PR-1:** миграции 019 + seed-промпты 020–022 + `db_bootstrap.py`.
2. **PR-2:** сервисная часть — `schema_memory`, роутер intent, ветки, SSE (`backend/services/agent/` + nginx + тесты).
3. **PR-3 (опционально):** frontend — интеграция `/agent/stream` через `fetch()` + `ReadableStream` + `AbortController`, сохранение S1–S8.

Или, если владелец хочет меньше PR: PR-1 (миграции+сервис), PR-2 (frontend). В плане предлагается разделение по доменам.

---

*План готов к апруву. Реализация не начиналась.*
