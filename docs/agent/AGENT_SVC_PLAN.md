# AGENT-SVC — план выноса LLM-агента PROCESSMAN в микросервис

**СТАТУС: ЧЕРНОВИК, редакция 2. Решения владельца 2026-08-16 внесены. Финальный апрув — ожидается.**
Реализация не начата. Дисциплина трека: план → апрув владельца → реализация по фазам, PR на фазу/группу фаз.

Шаблон: `.planning/contours/audit/microservices-migration/SOLUTION.md` (плейбук выноса notifications).
Основание: `.planning/contours/audit/microservices-migration/AUDIT.md` — домен agents (`ai/`) признан кандидатом №3 на вынос: собственные таблицы, импортирует только rbac, не трогает `_legacy_main.py`.

История редакций:
- v0.1 (2026-08-16) — первый черновик, 7 открытых вопросов.
- ред. 2 (2026-08-16) — внесены решения владельца: роль (гейт org member), граница сервиса (только замыкание gateway), гейт тестов («без изменений поведения»), nginx (узкий regex), TTL-кэш resolve_model 60с, preconditions старта. Открытыми остались вопросы №3, №5–7 (дедлайн-гейт: до Phase 2).

---

## 0. Контекст и зависимости

- База: `origin/main` @ `ad02fba3` (на момент редакции).
- **Зависимость-блокер:** AGENT-0 (`backend/app/agent/`, `backend/app/routers/agent_chat.py`, миграции 017/018, тесты `test_agent_chat_*` / `test_agent_memory`) на момент написания плана существует только в ветке `feat/agent-0-processman-memory` и **не влит в main**. AGENT-SVC стартует только после мержа AGENT-0 в main; ветка работы — `feat/agent-svc-extraction` от обновлённого main.
- Образец реализации: `backend/services/notifications/` (FastAPI-сервис с собственным Dockerfile, JWT decode общим секретом, membership lookup по общей БД).
- Верификация: только `clearvestnic.ru:5177` (stage). Prod — запрещён без отдельного апрува.

### 0.0 Preconditions старта (жёсткий гейт — решение владельца 2026-08-16)

Phase 1 НЕ стартует, пока не выполнены все три:

- а) AGENT-0 влит в `main`.
- б) миграции 017/018 прогнаны на живом PostgreSQL (не только SQLite).
- в) git-state AGENT-0 чистый — modified/untracked файлы (`routers/__init__.py`, `db_bootstrap.py`) закоммичены.

Проверка preconditions — первый шаг Phase 1, фиксируется git-proof'ом в PR-1.

### 0.1 Ограничения (наследованы из плейбука и ТЗ владельца)

- Секреты не публикуются: только `has_api_key` + `key_last4` (правило зафиксировано ссылками в `docs/llm/*.md`; сам файл `docs/PASSWORD_ROTATION_RULE.md` в репозитории **не найден** — НЕ ПРОВЕРЕНО, правило применяем по известной конвенции).
- Каждое утверждение о коде подтверждено файлом/строкой; непроверенное помечено «НЕ ПРОВЕРЕНО».
- Сервис не импортирует `backend.app.*` — жёсткое правило **без исключений** (решение владельца 2026-08-16) + lint-проверка в CI.
- Общая PostgreSQL, схему не делим. Alembic-миграции запускает только монолит (`backend/scripts/db_bootstrap.py`, LINEAR). Сервис миграций не содержит.

### 0.2 Граница сервиса: что переезжает / что остаётся

**Решение владельца 2026-08-16:** переезжает только фактическое замыкание gateway — `gateway.py` + read/usage-подмножество `llm_store.py` + retry-хелпер `_deepseek_chat_request`, **скопированный** в сервис (не импортированный). `deepseek_client.py`, `prompt_registry.py`, `execution_log.py` остаются в монолите.

| Модуль | Факт по коду | Итог (утверждено) |
|---|---|---|
| `backend/app/ai/gateway.py` | импорты: `..redis_cache`, `.llm_store`, `.deepseek_questions._deepseek_chat_request` | **переезжает** (ядро сервиса) |
| `backend/app/ai/llm_store.py` | импорт только `..storage._connect`; используется также монолитными `routers/admin_llm.py:16`, `routers/llm_feedback.py:15`, `routers/llm_status.py:17`, которые остаются | физически **остаётся** в монолите; в сервис **копируется** read+usage подмножество (см. 0.3) |
| retry-хелпер `_deepseek_chat_request` (`deepseek_questions.py:773-813`) | файл `deepseek_questions.py` 83KB, импортирует `..models`; используется `ai_questions.py:360`, `_legacy_main.py:1513,3689`, `ai/product_actions_suggest.py:6` | **копия** в сервис (`llm/llm_http_client.py`); монолитный экземпляр выделяется в `backend/app/ai/llm_http_client.py` (Phase 1), сам `deepseek_questions.py` остаётся |
| `backend/app/ai/deepseek_client.py` | используется монолитными `notes_extraction.py:61,500`, `prompt_registry.py:119` | **остаётся** в монолите (решение владельца) |
| `backend/app/ai/prompt_registry.py` | legacy-реестр поверх `ai_prompt_versions`; gateway его НЕ использует; используется `_legacy_main.py:86`, `routers/product_actions_ai.py:12`, `routers/admin.py:18` | **остаётся** в монолите (решение владельца) |
| `backend/app/ai/execution_log.py` | используется `ai_questions.py:10`, `notes_extraction.py:11`, `_legacy_main.py:85`, `routers/product_actions_ai.py:10`, `routers/admin.py:16` | **остаётся** в монолите (решение владельца) |
| `backend/app/agent/` (memory_store, context, chat, action_runners) | `chat.py:10,:181` — вызов gateway, после выноса внутренний | **переезжает** целиком |
| `backend/app/routers/agent_chat.py` | роутер AGENT-0 | **переезжает** целиком |
| `backend/app/ai/schema_assistant.py` (LLM3) | вызывает gateway `:29,:73,:76` | остаётся; gateway-вызовы — через internal-клиент (Phase 1) |
| `backend/app/ai/process_analysis.py` (LLM1) | вызывает gateway `:28,:160,:163` | остаётся; аналогично |
| `backend/app/transformation/pipeline.py` (LLM2) | gateway lazy-import и вызов `:209-215` (feature=`as_is_transform`) | остаётся; аналогично |
| `backend/app/routers/admin_llm.py` | `:17` импортирует `_deepseek_chat_request` напрямую (provider test, :127) | остаётся; после Phase 1 импортирует хелпер из `ai/llm_http_client.py` |
| `backend/app/routers/llm_feedback.py`, `llm_status.py` | оба используют `_legacy_main._request_active_org_id` + `_enterprise_require_org_member`; пишут/читают `llm_usage` через llm_store | остаются (монолитные по зависимостям). Открытый вопрос №3 |
| `backend/app/redis_cache.py` | `cache_get_json/cache_set_json(key, *, client)` поверх `redis_client.get_client` | **копия** в сервис с тем же `REDIS_URL` |

⚠️ **Legacy-контур ходит в DeepSeek напрямую (осознанное решение владельца 2026-08-16, не техдолг «забыли»):** legacy-фичи LLM0-эпохи (`notes_extraction`, `ai_questions`, `product_actions_ai` и пр. через `deepseek_client.py` / `deepseek_questions.py` / `prompt_registry.py`) продолжают вызывать DeepSeek напрямую, **минуя сервис и gateway**. Лимиты и usage по legacy-фичам учитываются отдельно — через `execution_log` монолита (`ai_execution_log`), а не через `llm_usage` gateway'я. Вывод legacy-контура на gateway — вне scope этого эпика.

### 0.3 AST-проверка: разрывы импортов `backend.app.*`

| Импорт (из переезжающего модуля) | Куда ведёт | Разрыв |
|---|---|---|
| `gateway.py → ..redis_cache` | Redis-клиент монолита | копия модуля в сервис (те же ключи, тот же `REDIS_URL`) |
| `gateway.py → .llm_store` | таблицы `llm_providers/llm_prompts/llm_feature_flags/llm_usage` | read-only копия подмножества в сервисе: `get_active_prompt`, `get_feature_flag`, `enabled_providers_with_key`, `any_enabled_provider`, `resolve_model`, `usage_daily_tokens`, `record_usage` (запись usage). CRUD остаётся только в монолите |
| `gateway.py → .deepseek_questions._deepseek_chat_request` | HTTP-вызов DeepSeek (`requests.post` на `{base_url}/v1/chat/completions`, retry/backoff, `deepseek_questions.py:773-813`) | копия хелпера в сервисе; в монолите выделение в `ai/llm_http_client.py` |
| `agent/chat.py → gateway` | внутренний после выноса | не требует разрыва |
| `agent/* → session_repo / process_projection / storage` | сессии, проекция схемы, БД сессий | HTTP: новый endpoint монолита `GET /api/sessions/{id}/agent/projection`; memory-таблицы (`agent_conversations/agent_turns`) — прямой SQL по общей БД (таблицы принадлежат сервисному домену) |
| `agent/action_runners → schema_assistant` | LLM3-действия | HTTP: существующие endpoints `/api/sessions/{id}/llm/suggest-next\|explain-step\|step-qa` с пробросом JWT |
| RAG (AGENT-1 перспектива) | `GET /api/rag/search` | HTTP: существующий endpoint, сигнатура `q, top_k, source_type, session_id, min_score` (`routers/rag.py:36-44`), org-member gate внутри, ответ `{ok, results[]}` |

**Кэш resolve_model — РЕШЕНО (владелец, 2026-08-16):** TTL-кэш в сервисной копии llm_store, **TTL = 60 секунд** (вместо монолитного in-process `_load_model_resolve_state` + `invalidate_model_cache`, который не кросс-процессный). Измеримое свойство: **«правка ключа/модели в админке вступает в силу в сервисе в течение ≤60 с после сохранения»** — дисциплина «редактируется без редеплоя» сохраняется с этой оговоркой. Проверка — кандидат в Phase 5 (см. чек-лист Phase 5).

⚠️ **«Два писателя» (решение владельца принято):** `llm_providers/llm_prompts/llm_feature_flags/llm_usage` — общие таблицы. Пишет админка монолита (CRUD) и сервис (только `llm_usage` через `record_usage`). Конфликтов схемы нет: миграции только монолит; `record_usage` — append-only.

### 0.4 Подтверждение решения №8 (Redis-кэш)

Cache key в `gateway.py:187`: `pm:cache:llm:{feature}:v1:{digest}` — формируется только от feature+digest, **без привязки к процессу/хосту**. Перенос не инвалидирует существующий кэш. Проверено по коду.

### 0.5 Маршрутизация nginx — РЕШЕНО (владелец, 2026-08-16)

Коллизия из ред. 1 (широкий regex `^/api/sessions/[^/]+/agent/` перехватил бы монолитный `/agent/projection` → петля) закрыта утверждённым решением:

- **Узкий regex:** `location ~ ^/api/sessions/[^/]+/agent/(chat|history)` → agent:8000. Монолитный `GET /api/sessions/{id}/agent/projection` остаётся на монолите, петли нет.
- **Правило сопровождения:** новые agent-endpoints добавляются в regex **явно и списком**. Следующий кандидат — `/agent/stream` в AGENT-1. Каждое расширение regex — отдельный пункт PR-чеклиста.
- **Отложенная стратегическая опция (не сейчас):** префикс `/api/agent/...` без коллизий. Трогает фронт, вынесена за scope эпика; зафиксирована здесь, чтобы не потерять.

### 0.6 Авторизация сервиса — роль РЕШЕНА (владелец, 2026-08-16)

- JWT decode общим `JWT_SECRET`: в монолите `auth.py:150-151` (env `JWT_SECRET`, дефолт `dev-insecure-change-me`); issuer в токенах **не используется** (jwt.encode без `iss`) → в сервисе `JWT_ISSUER=None`, как допускает `notifications/app/services/auth_service.py` (`decode_access_token`, issuer из env, default None).
- Membership lookup по общей БД — копия подхода notifications `auth_service.resolve_user_context` (SELECT `users.is_admin` + `org_memberships.role`).
- **Гейт: «org member», как у LLM3** (org-scoped load сессии, `require_org_member_for_enterprise`). Роль `technologist` **не вводим** (в коде такой роли нет; существующие: org_owner/org_admin/project_manager/editor/viewer/org_viewer/auditor).
- **Вне scope:** ужесточение по ролям для agent-endpoints — отдельный контур RBAC, этим эпиком не выполняется.

---

## Phase 1 — подготовка в монолите (PR-1, без переключения трафика)

Цель: монолит готов к появлению сервиса, поведение не меняется.

0. **Проверка preconditions (0.0):** AGENT-0 в main; миграции 017/018 прогнаны на живом PostgreSQL; git-state AGENT-0 чистый. Git-proof в описании PR-1. Без выполнения — Phase 1 не стартует.
1. **Новый endpoint проекции:** `GET /api/sessions/{id}/agent/projection` в `backend/app/routers/agent_chat.py` (или отдельный роутер `agent_projection.py`). Обычный authenticated endpoint, org-scoped load сессии как у LLM3 (`_load_session` в `schema_assistant.py`). Возвращает `build_process_projection(session)` + `projection_digest` + `rev`. **Новый тест (решение владельца):** контракт projection-endpoint — org-scoped, 404 для чужой сессии (403-by-role — по гейту org member).
2. **Internal LLM-клиент монолита:** `backend/app/ai/llm_internal_client.py` — httpx-клиент с контрактом, идентичным `gateway.complete()/complete_cached()`: `POST {AGENT_SVC_URL}/internal/llm/complete` и `/internal/llm/complete_cached`, ответ `{ok, status, text, usage, provider_id, model, fallback, cached, latency_ms}`. Timeout + честный `status="error"` при недоступности.
3. **Перевод LLM1/LLM2/LLM3 на internal-клиент за флагом:** env `LLM_VIA_AGENT_SVC=0|1` (дефолт 0). Точки замены: `process_analysis.py:160,163`, `schema_assistant.py:73,76`, `transformation/pipeline.py:209-215`. При `0` — текущий прямой вызов gateway (монолитный gateway остаётся на месте до конца Phase 5).
4. **Выделение `ai/llm_http_client.py`:** retry-хелпер `_deepseek_chat_request` переезжает из `deepseek_questions.py` без изменения поведения; `deepseek_questions.py` и `admin_llm.py:17` реимпортируют оттуда. (Копия для сервиса создаётся в Phase 2.)
5. Регрессия PR-1: `test_diagram_cas_guard`, auth-тесты, LLM3-тесты, тесты AGENT-0 — зелёные без изменений.

## Phase 2 — создание `backend/services/agent/` (PR-2)

Структура по образцу notifications:

```
backend/services/agent/
├── Dockerfile                  # python:3.12-slim, uvicorn app.main:app, порт 8000
├── requirements.txt            # fastapi 0.110.x, pydantic 2.6.x, psycopg[binary], psycopg_pool, pyjwt, httpx, requests
├── app/
│   ├── main.py                 # create_app, CORS, health; БЕЗ ensure_schema (миграции — монолит)
│   ├── config.py               # env: DATABASE_URL, REDIS_URL, JWT_SECRET, MONOLITH_URL, SKIP_AUTH (тесты)
│   ├── db.py                   # паттерн notifications db.py: get_conn/adapt_sql/row_to_dict, psycopg_pool
│   ├── dependencies.py         # auth: decode JWT + membership (копия auth_service notifications); гейт org member (0.6)
│   ├── llm/
│   │   ├── gateway.py          # перенос backend/app/ai/gateway.py
│   │   ├── llm_store.py        # read+usage подмножество (0.3); resolve_model с TTL-кэшем 60с (0.3, решение владельца)
│   │   ├── llm_http_client.py  # КОПИЯ retry-хелпера (не импорт из backend.app — без исключений)
│   │   └── redis_cache.py      # копия, те же ключи pm:cache:llm:*
│   ├── agent/                  # перенос backend/app/agent/: memory_store, context, chat, action_runners
│   ├── monolith_client.py      # httpx: projection / llm-actions / rag, проброс JWT пользователя
│   └── routers/
│       ├── agent_chat.py       # перенос роутера AGENT-0 (chat, history)
│       └── internal_llm.py     # POST /internal/llm/complete, /internal/llm/complete_cached (только внутренняя сеть)
└── tests/                      # перенос test_agent_chat_*, test_agent_memory (см. гейт тестов ниже)
```

Ключевые решения:
- **Проброс JWT:** все вызовы сервис→монолит с заголовком `Authorization: Bearer <user-jwt>`. Никаких service-token с обходом авторизации — org-scoped guard'ы монолита работают без изменений.
- **`/internal/llm/*` не публикуется через nginx:** только docker-сеть.
- **Гейт тестов — РЕШЕНО (владелец, 2026-08-16), формулировка «без изменений ПОВЕДЕНИЯ»:** тесты AGENT-0 переезжают вместе с кодом в `backend/services/agent/tests/`; правится **только import-path** (и точка мока на границе `monolith_client`/gateway сервиса); набор кейсов и ассерты — один в один (idempotency по `client_turn_id`, fallback при кривом action-JSON, 0 LLM-вызовов на history и пр.). Shim re-export в монолите **не требуется**.
- **Health endpoint:** `GET /health` (как notifications).
- **Запрет импортов `backend.app.*`:** lint-шаг в CI (grep/AST-проверка по `backend/services/agent/**`), без исключений.
- **Гейт «до Phase 2»:** открытые вопросы №3, №5–7 (см. конец документа) должны быть решены владельцем до старта Phase 2. На Phase 1 они не блокируют (см. статусы в разделе открытых вопросов).

## Phase 3 — инфраструктура (PR-3)

1. **docker-compose.yml:** сервис `agent` по образцу notifications (`docker-compose.yml:127`): `build.context: ./backend/services/agent`, env `DATABASE_URL/REDIS_URL/JWT_SECRET/MONOLITH_URL`, без внешних ports. Аналогично stage/prod compose-файлы (содержимое `docker-compose.stage.yml` / `docker-compose.prod.yml` — НЕ ПРОВЕРЕНО, при реализации скопировать блок notifications).
2. **nginx:** в `deploy/nginx/default.prod.internal.conf` (паттерн: `set $notifications_host notifications;` + `resolver 127.0.0.11 ipv6=off valid=30s`):
   ```
   set $agent_host agent;
   location ~ ^/api/sessions/[^/]+/agent/(chat|history) {
       proxy_pass http://$agent_host:8000;
       ...стандартные proxy-заголовки как у notifications...
   }
   ```
   Узкий regex — утверждённое решение (0.5). Общий `location /api/` → монолит не меняется. Фронт не меняется.
   **Fallback-вариант (если regex окажется хрупким):** тонкий proxy в монолите через httpx с 503-fallback, как Phase 4 у notifications. **Критерий выбора:** сначала regex на stage; если наблюдаются некорректные матчи/404 на соседних путях — переход на монолитный proxy. **Если выбран proxy-вариант — обязателен новый монолитный тест: fallback 503 при недоступном сервисе** (решение владельца).
3. **`.env.example`:** `AGENT_SVC_URL=http://agent:8000`, `LLM_VIA_AGENT_SVC=0`, `MONOLITH_URL=http://api:8000` (рядом с существующими `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`).
4. **CI:** matrix-build образа agent только при изменении `backend/services/agent/**` — по образцу notifications в `.github/workflows/deploy-stage.yml:36,101,120`. Плюс lint-шаг запрета импортов `backend.app.*` из сервиса.

## Phase 4 — переключение маршрутов + fallback (PR-4)

1. Deploy на stage с `LLM_VIA_AGENT_SVC=0`: agent-сервис поднят, nginx location активен, чат панели обслуживается сервисом. Монолитный agent-код остаётся на месте (не удаляется).
2. Замер добавочного latency hop: `curl -w` по `/api/sessions/{id}/agent/chat` vs baseline — бюджет **< 50мс** (методика плейбука notifications).
3. Включение `LLM_VIA_AGENT_SVC=1` на stage: LLM1/LLM2/LLM3 идут через `/internal/llm/complete`. Проверка честных статусов при остановленном сервисе: монолит не падает, LLM1/2/3 отдают свои `status="error"`/timeout-статусы; панель показывает S6/S7 по `docs/llm/LLM4_PROCESSMAN_PANEL.md`.
4. Откат за 5 минут: убрать nginx location (или `LLM_VIA_AGENT_SVC=0`) + redeploy монолита. Данные не затрагиваются (общая БД, общий Redis, кэш-ключи неизменны).

## Phase 5 — верификация (только clearvestnic.ru:5177)

Регрессия (все проверки на stage):
- Тесты AGENT-0 (`test_agent_chat_*`, `test_agent_memory`) — зелёные в новом расположении, **поведение без изменений** (кейсы и ассерты один в один, правлен только import-path — гейт по решению владельца).
- Новые монолитные тесты: контракт projection-endpoint (org-scoped, 404 чужой сессии); fallback 503 — только если выбран proxy-вариант маршрутизации.
- LLM3 endpoints (`suggest-next|explain-step|step-qa`) — не сломаны (автотесты + ручной прогон панели).
- Baseline: `test_diagram_cas_guard` + auth-тесты (`test_auth_jwt_flow`, `test_auth_users_db_profile_storage`) — зелёные.
- Деградация: сервис остановлен → панель S6/S7, монолит жив, LLM1/2/3 честные статусы.
- Кэш Redis: повторный вопрос при неизменной схеме → `cached=true` (ключи не инвалидированы переносом).
- **TTL-кэш resolve_model (кандидат на проверку — решение владельца):** правка модели/ключа в админке → в сервисе вступает в силу ≤60 с после сохранения (замер: сохранить в админке, зафиксировать время до первого ответа сервиса на новой модели).
- Latency hop < 50мс подтверждён замером.
- Prod — отдельный апрув владельца, этот план prod не покрывает.

## Риски и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| Петля маршрутизации nginx regex vs `/agent/projection` | закрыт решением | узкий regex `/agent/(chat|history)` утверждён (0.5); новые endpoints — только явным расширением списка |
| Stale-кэш resolve_model в сервисе после смены модели админкой | закрыт решением | TTL-кэш 60с (0.3); измеримое свойство ≤60с — проверка в Phase 5 |
| Рассинхрон копий llm_store/llm_http_client/redis_cache с монолитом | средняя | копии read-only подмножества; изменения llm_* схемы — только монолитные миграции; CI-lint на дрейф (diff-check) |
| Двойной LLM-вызов при частичном переключении флага LLM_VIA_AGENT_SVC | низкая | флаг глобальный per-deploy; rollout только целиком |
| Деградация сервиса ломает LLM1/2/3 | средняя | timeout+честный status в internal-клиенте (Phase 1.2), тест Phase 5 |
| JWT без issuer: любой токен с тем же секретом валиден | низкая (наследовано) | тот же секрет и риск, что у монолита; не усугубляется |
| In-memory BM25 монолита при росте корпуса RAG (до 2000 чанков, `routers/rag.py:21`) | отложенный | зафиксировано в треке AGENT-2 (pgvector), вне этого эпика |
| Legacy-контур вне лимитов gateway | осознанное решение | usage по legacy-фичам — отдельно через execution_log монолита (0.2 ⚠️) |

## Точка невозврата

До конца Phase 4 включительно откат = nginx/`LLM_VIA_AGENT_SVC` + redeploy, данные и код монолита не тронуты. **Точка невозврата — удаление монолитного agent-кода и gateway из `backend/app/`**: выполняется отдельным PR только после N дней (предложение ⏳: 7 дней — открытый вопрос №6) стабильной работы на stage и явного апрува владельца. До этого момента монолитный код — живой fallback.

## Fallback plan (откат за 5 минут)

1. `LLM_VIA_AGENT_SVC=0` (LLM1/2/3 возвращаются на монолитный gateway).
2. Убрать nginx location agent (или вернуть proxy на монолит) + reload nginx.
3. Сервис `agent` можно остановить; БД/Redis не трогаем (кэш-ключи совместимы).
4. Монолитный `backend/app/agent/` + роутер agent_chat остаются на месте до стабилизации — удаление отдельным PR (см. точку невозврата).

## Открытые вопросы владельцу

Статусы на редакцию 2 (2026-08-16):

1. **Роль `technologist` — РЕШЕНО (2026-08-16):** гейт «org member», как у LLM3 (org-scoped load сессии). Роль technologist не вводим. Ужесточение по ролям — отдельный контур RBAC, вне scope (см. 0.6).
2. **Список переезжающих модулей — РЕШЕНО (2026-08-16):** переезжает только замыкание gateway (gateway.py + read/usage-подмножество llm_store.py + скопированный retry-хелпер). `deepseek_client.py`, `prompt_registry.py`, `execution_log.py` остаются в монолите; legacy-контур ходит в DeepSeek напрямую, лимиты/usage по нему — отдельно через execution_log (см. 0.2, ⚠️).
3. **ОТКРЫТ (до Phase 2): `llm_feedback` / `llm_status`** — остаются в монолите (зависят от `_legacy_main`). ОК, или в перспективе перенести в сервис отдельным эпиком? Phase 1 не блокирует.
4. **Тесты AGENT-0 — РЕШЕНО (2026-08-16):** гейт «без изменений ПОВЕДЕНИЯ» — тесты переезжают с правкой только import-path, кейсы/ассерты один в один; плюс два новых монолитных теста (контракт projection-endpoint; fallback 503 при proxy-варианте). Shim не требуется (см. Phase 2, Phase 5).
5. **ОТКРЫТ (до Phase 2): фоновый `update_memory` (AGENT-1)** — нужен ли сервису Celery или достаточно существующей Redis queue? На AGENT-SVC (вынос AGENT-0) не блокирует: фоновых задач в AGENT-0 нет. Phase 1 не блокирует.
6. **ОТКРЫТ (до Phase 2): срок стабилизации N** перед удалением монолитного agent-кода — предложение 7 дней stage. Phase 1 не блокирует; блокирует только точку невозврата (после Phase 4).
7. **ОТКРЫТ (до Phase 2): `docs/PASSWORD_ROTATION_RULE.md`** отсутствует в репозитории (упоминается в docs/llm/*). Восстановить файл или правило считать зафиксированным устно (has_api_key + key_last4)? Phase 1 не блокирует.

**Гейт:** вопросы №3, №5–7 требуют решения владельца **до старта Phase 2**. Ни один из них не блокирует Phase 1.

---

*После финального апрува владельца: реализация по фазам PR-1…PR-4, каждый PR — протокол апрувов, финальный proof (git-state, verify stage, регрессия).*
