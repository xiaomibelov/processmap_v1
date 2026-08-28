# AGENT-SVC Phase 5 — протокол верификации с реальными LLM-ответами

> Дата: 2026-08-17. Среда: **локальный docker-compose стек** (`server-backup/root/processmap_v1`),
> HEAD = `47a5f05c` = `origin/main`. Stage-хост `stage.processmap.ru` используется
> (решение владельца 2026-08-16): прогоны и верификация — только локально.
> Секреты замаскированы по `docs/PASSWORD_ROTATION_RULE.md` (`has_api_key` + `key_last4`).

## Preconditions — PASS

- `GET /api/llm/status` → `{"configured":true, ...}`; провайдер `llmprov_095846a1bc0b`
  (name `deepseek`, base_url `https://vvchat.vkusvill.ru/red-mad-router`, model `deepseek-chat`,
  `has_api_key:true`, `key_last4:0OhQ`); кнопка «Проверить»
  (`POST /api/admin/llm/providers/{id}/test`) → `ok:true`, latency 1243ms.
- runtime = main: `SERVER_URL=http://localhost:5177 API_URL=http://localhost:8011 ./verify-deploy.sh`
  → MATCH (версия + agent-контейнер); 6 контейнеров healthy
  (postgres, redis, api, agent, notifications, frontend).
- `LLM_VIA_AGENT_SVC=1` в `.env` (монолит ходит в LLM через сервис).
- PR `fix/deploy-sh-macos-sed` (#743) и `fix/storage-table-exists-pg` (#744) в main,
  дерево синхронизировано; в работе только локальные env-патчи (`.env`, localhost-binding
  портов в `docker-compose.yml`), uncommitted код-фиксов нет.

## Таблица критериев

| # | Критерий | Артефакт | Вердикт |
|---|----------|----------|---------|
| 1 | Реальный completion e2e | ниже | **PASS** |
| 2 | Кэш «0 токенов» | ниже | **PASS с оговоркой** (см. расхождение Р1) |
| 3 | TTL-кэш resolve_model ≤60с | ниже | **PASS** (Δ57с) |
| 4 | LLM3 через сервис, guard жив | ниже | **PASS** |
| 5 | Деградация и восстановление | ниже | **PASS** |
| 6 | Честный no_provider | ниже | **PASS** |
| 7 | История из PG, 0 LLM-вызовов на history | ниже | **PASS** |
| 8 | Latency soak | ниже | **PASS** (hop p95 = 4мс) |
| 9 | PASSWORD_ROTATION_RULE.md | docs-коммит в этом PR | **PASS** |
| 10 | OpenAPI + contract-suite | ниже | **PASS** (145 passed, 0 failed, новых падений на /agent/* нет) |

## К1 — реальный completion e2e — PASS

```
POST /api/sessions/b01bb10549/agent/chat  (через nginx :5177, JWT technologist-demo)
→ HTTP 200, {"ok":true,"status":"ok", "action":null,
   "usage":{"prompt_tokens":364,"completion_tokens":43,
            "provider_id":"llmprov_095846a1bc0b","model":"deepseek-chat", ...}}
```

Строка `llm_usage` (PG):

```
feature=processman_agent | provider_id=llmprov_095846a1bc0b | model=deepseek-chat
prompt_tokens=364 | completion_tokens=43 | latency_ms=1575 | cached=f | status=ok
```

Наблюдение (раздел «Качество ответов»): на пустой схеме модель вернула сырой
action-JSON в markdown-фенсе, сервис деградировал в free-answer, показав сырой JSON
(`action:null`). Код не правился — настройка промпта `processman_agent` — отдельная задача.

## К2 — кэш «0 токенов» — PASS с оговоркой

Механизм кэша доказан на LLM3 (`complete_cached`):

```
POST /api/sessions/b01bb10549/llm/suggest-next  (повтор, схема не менялась)
→ cached:true, prompt_tokens=0, completion_tokens=0
Redis: pm:cache:llm:schema_assistant:v1:e44df8ed5d4c21d2a54e23e897573aa4  TTL=604729
```

**Расхождение Р1 (зафиксировано, не дефект контура):** chat-path (`processman_agent`)
вызывает `complete()` БЕЗ кэша by design (`memory/chat.py:189`) — история диалога
делает каждый промпт уникальным. Буква критерия («тот же вопрос → cached:true») к chat
неприменима; кэш монолита и сервиса общий (ключи `pm:cache:llm:{feature}:v1:{digest}`)
и при переключении не инвалидируется — это подтверждено.

## К3 — TTL-кэш resolve_model (≤60с) — PASS

```
07:56:52Z  PATCH admin: создана модель llmmodel_a7f40cefe1e0 (deepseek-reasoner, is_default)
07:57:49Z  первая выборка с новой моделью (llm_usage.model=deepseek-reasoner)
Δ = 57с ≤ 60с
```

Откат: set-default обратно на `llmmodel_deepseek_chat`, тестовая модель disabled (08:00:32Z).

## К4 — LLM3 через сервис — PASS

- `suggest-next` → кандидаты `publish_event`, `wait` — оба есть в `operation_catalog`
  (13 кодов), `dropped:0` — guard жив.
- `explain-step n2` → пересказ trace, trace-объект в ответе.
- `step-qa n3` → ответ по шагу.
- Лог agent-контейнера: 5× `POST /internal/llm/complete_cached 200` — вызовы LLM3
  идут через сервис.

## К5 — деградация и восстановление — PASS

```
docker compose stop agent
a) POST /agent/chat через nginx → HTTP 502
   Панель PROCESSMAN (выбран шаг «Заявка получена», вопрос «Что не так с этим шагом?»):
   карточка «Не удалось получить ответ / Ошибка при обращении к LLM — попробуйте ещё раз.»
   + кнопка «Повторить» — человекочитаемое состояние S6, не сырой JSON, не зависание.
   Артефакт: скриншот (playwright, chromium headless) — подтверждён визуально.
б) suggest-next?force=1 → {"ok":false,"status":"error",
   "error":"agent-svc unreachable: ConnectError"} — честный статус, монолит не падает.
в) docker compose start agent → контейнер healthy за ~8с,
   повторный POST /agent/chat → 200 ok:true БЕЗ ручных правок.
```

Попутное наблюдение (раздел «Качество ответов»): без выбранного шага composer
отвечает локальным гардом «Пока отвечаю только по конкретному шагу»
(0 LLM-вызовов, by design — `ProcessmanTobe.jsx:113`).

## К6 — честные статусы при мёртвом провайдере — PASS

```
PATCH /api/admin/llm/providers/llmprov_095846a1bc0b {"enabled": false}  → ok
(пауза 62с > TTL resolve_model)
POST /agent/chat → HTTP 200
  {"ok":false,"status":"no_provider","error":"no enabled LLM providers with api key",
   "usage":{"prompt_tokens":0,"completion_tokens":0,...}}
```

HTTP 200, не 500. Провайдер возвращён (`enabled:true`), кнопка «Проверить» зелёная,
`/api/llm/status` → `configured:true`.

## К7 — история из PG, 0 LLM-вызовов на history — PASS

```
agent_turns по сессии b01bb10549: 14 строк (долговременная память в Postgres)
llm_usage feature=processman_agent: before=10
GET /agent/history ×2 → 200, 14 реплик user/assistant
llm_usage: after=10, Δ=0  — на history НОЛЬ новых LLM-вызовов
```

## К8 — latency soak — PASS

20 последовательных `POST /agent/chat`:

```
wall time (curl -w):  min=1.599s p50=1.842s p95=2.259s max=2.259s
service latency_ms (llm_usage, включает вызов LLM): p50=1800ms p95=2215ms
```

Hop-замер по плейбуку (GET /agent/history, без LLM; nginx-path vs direct in-network):

```
nginx-path (localhost:5177 → nginx → agent): p50=8ms  p95=11ms
direct (api container → agent:8000):         p50=8ms  p95=28ms
hop (nginx-path − direct):                   p50≈0ms  p95=4ms  — бюджет <50мс подтверждён
```

Оговорка: разность «wall − latency_ms» на chat-вызовах (p50≈42ms, p95≈78ms) — это НЕ hop,
а серверная обработка вне замера LLM-вызова (построение контекста памяти, чтение проекции
из монолита, запись turn'ов). Чистый транспортный hop = 4мс, как в Phase 4.

## К9 — PASSWORD_ROTATION_RULE.md — PASS

Файл `docs/PASSWORD_ROTATION_RULE.md` восстановлен docs-коммитом в этом же PR
(был назначен на Phase 3, отсутствовал в репозитории): секреты не публикуются
(только `has_api_key` + `key_last4`), ключи вводит владелец вручную через админку,
после ротации сервис подхватывает ключ без редеплоя (TTL-кэш 60с).

## К10 — OpenAPI + contract-suite

Живая спека (`scripts/dump_openapi.py`, in-process на временной SQLite):

```
271 paths / 344 operations; agent-endpoints присутствуют:
  POST /api/sessions/{session_id}/agent/chat
  GET  /api/sessions/{session_id}/agent/history
  GET  /api/sessions/{session_id}/agent/projection
```

Contract-suite (`pytest backend/tests -m contract`, venv phase2-worktree, прогон от корня
репо — тесты импортируют `backend.app.main`):

```
145 passed, 1173 deselected, 21 warnings in 709.83s
fuzzed=136 llm_envelope=9 skipped_policy=172 skipped_explicit=27 total=344 (profile=pr)
details: build/contract-operations.json
```

Новых падений на `/agent/*` нет; известные флейки (500 на health/auth/login/
deployment-notice) в этом прогоне не воспроизвелись — отдельный контур, здесь зафиксировано.

## Качество ответов (наблюдения, не дефекты контура)

1. На пустой схеме модель возвращает сырой action-JSON в markdown-фенсе; сервис
   деградирует в free-answer и показывает сырой JSON пользователю (`action:null`).
   Настройка промпта `processman_agent` — следующая задача (с живым ключом).
2. Preview кнопки «Проверить» у провайдера приходит на китайском
   («你好！我是 DeepSeek…») — роутер `vvchat.vkusvill.ru` проксирует DeepSeek;
   на функциональность не влияет, для промптов учитывать.
3. Agent-проекция слепа к сессиям, где истина в BPMN-XML (сессия `d1587c279b`):
   проекция строится из узлов/связей session-state, не из XML.

## Известные ограничения (не чинились в этом запуске)

- Degraded-первый-бут на пустой БД — контур `fix/bootstrap-first-boot` заведён владельцем.
- Флейки contract-suite на health/auth/login/deployment-notice — отдельный контур.

## Итог

Общий вердикт: **PASS** по всем 10 критериям (К2 — с зафиксированным расхождением Р1:
chat не кэшируется by design). После мержа этого PR владелец ставит точку в soak:
14 дней стабильной работы → отдельный PR на удаление монолитного agent-кода.
