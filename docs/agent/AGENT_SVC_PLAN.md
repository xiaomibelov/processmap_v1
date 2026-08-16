# AGENT-SVC — план выноса LLM-агента PROCESSMAN в микросервис

**СТАТУС: ЧЕРНОВИК (v0.1), НЕ АПРУВНУТ. Дата: 2026-08-16.**
Все шаги ниже — предложение к апруву владельца. Реализация не начата.
Дисциплина трека: план → апрув владельца → реализация по фазам, PR на фазу/группу фаз.

Шаблон: `.planning/contours/audit/microservices-migration/SOLUTION.md` (плейбук выноса notifications).
Основание: `.planning/contours/audit/microservices-migration/AUDIT.md` — домен agents (`ai/`) признан кандидатом №3 на вынос: собственные таблицы, импортирует только rbac, не трогает `_legacy_main.py`.

---

## 0. Контекст и зависимости

- База: `origin/main` @ `ad02fba3`.
- **Зависимость-блокер:** AGENT-0 (`backend/app/agent/`, `backend/app/routers/agent_chat.py`, миграции 017/018, тесты `test_agent_chat_*` / `test_agent_memory`) на момент написания плана существует только в ветке `feat/agent-0-processman-memory` и **не влит в main**. AGENT-SVC стартует только после мержа AGENT-0 в main; ветка работы — `feat/agent-svc-extraction` от обновлённого main.
- Образец реализации: `backend/services/notifications/` (FastAPI-сервис с собственным Dockerfile, JWT decode общим секретом, membership lookup по общей БД).
- Верификация: только `clearvestnic.ru:5177` (stage). Prod — запрещён без отдельного апрува.

### 0.1 Ограничения (наследованы из плейбука и ТЗ владельца)

- Секреты не публикуются: только `has_api_key` + `key_last4` (правило зафиксировано ссылками в `docs/llm/*.md`; сам файл `docs/PASSWORD_ROTATION_RULE.md` в репозитории **не найден** — НЕ ПРОВЕРЕНО, правило применяем по известной конвенции).
- Каждое утверждение о коде подтверждено файлом/строкой; непроверенное помечено «НЕ ПРОВЕРЕНО».
- Сервис не импортирует `backend.app.*` — жёсткое правило + lint-проверка в CI.
- Общая PostgreSQL, схему не делим. Alembic-миграции запускает только монолит (`backend/scripts/db_bootstrap.py`, LINEAR). Сервис миграций не содержит.

### 0.2 Граница сервиса: что переезжает / что остаётся

| Модуль | Решение владельца | Факт по коду | Итог в плане |
|---|---|---|---|
| `backend/app/ai/gateway.py` | переезжает | импорты: `..redis_cache`, `.llm_store`, `.deepseek_questions._deepseek_chat_request` | переезжает (ядро сервиса) |
| `backend/app/ai/llm_store.py` | переезжает | импорт только `..storage._connect`; используется также монолитными `routers/admin_llm.py:16`, `routers/llm_feedback.py:15`, `routers/llm_status.py:17`, которые **остаются** | физически остаётся в монолите; в сервис копируется read+usage подмножество (см. 0.3) — конкретизация решения №1, не оспаривание |
| `backend/app/ai/deepseek_client.py` | переезжает | используется монолитными `notes_extraction.py:61,500`, `prompt_registry.py:119` (legacy-контур) | **остаётся в монолите** (legacy); сервису не нужен. Открытый вопрос №2 |
| `backend/app/ai/deepseek_questions.py` (retry-хелпер) | переезжает retry-хелпер | файл 83KB, импортирует `..models` (Node, Question, Session); используется `ai_questions.py:360`, `_legacy_main.py:1513,3689`, `ai/product_actions_suggest.py:6` | целиком не переносится (тянет `models`). Выделяется retry-хелпер `_deepseek_chat_request` (`deepseek_questions.py:773-813`) в `backend/app/ai/llm_http_client.py` (монолит) + копия в сервис |
| `backend/app/ai/prompt_registry.py` | переезжает | импортирует `..storage`; lazy-импорты deepseek_client/deepseek_questions (:119-120); используется `_legacy_main.py:86`, `routers/product_actions_ai.py:12`, `routers/admin.py:18`. Это legacy-реестр поверх `ai_prompt_versions`; gateway его НЕ использует (gateway читает `llm_prompts` через llm_store) | **остаётся в монолите**. Открытый вопрос №2 |
| `backend/app/ai/execution_log.py` | переезжает | импортирует `..storage` (append/count/list ai_execution_log); используется `ai_questions.py:10`, `notes_extraction.py:11`, `_legacy_main.py:85`, `routers/product_actions_ai.py:10`, `routers/admin.py:16` | **остаётся в монолите**. Открытый вопрос №2 |
| `backend/app/agent/` (memory_store, context, chat, action_runners) | переезжает | `chat.py:10` импортирует gateway (`:181` вызов) — внутренний импорт после выноса | переезжает целиком |
| `backend/app/routers/agent_chat.py` | переезжает | роутер AGENT-0 | переезжает целиком |
| `backend/app/ai/schema_assistant.py` (LLM3) | остаётся | вызывает gateway `:29,:73,:76` | остаётся; gateway-вызовы заменяются на internal-клиент (Phase 1) |
| `backend/app/ai/process_analysis.py` (LLM1) | остаётся | вызывает gateway `:28,:160,:163` | остаётся; аналогично |
| `backend/app/transformation/pipeline.py` (LLM2) | остаётся | gateway lazy-import и вызов `:209-215` (feature=`as_is_transform`) | остаётся; аналогично |
| `backend/app/routers/admin_llm.py` | остаётся | `:17` импортирует `_deepseek_chat_request` напрямую (provider test, endpoint `POST /api/admin/llm/providers/{id}/test`, :127) | остаётся; после выделения `llm_http_client.py` импортирует хелпер оттуда |
| `backend/app/routers/llm_feedback.py`, `llm_status.py` | остаются | оба используют `_legacy_main._request_active_org_id` + `_enterprise_require_org_member`; пишут/читают `llm_usage` через llm_store | остаются (монолитные по зависимостям). Открытый вопрос №3 |
| `backend/app/redis_cache.py` | — | `cache_get_json/cache_set_json(key, *, client)` поверх `redis_client.get_client` | копия в сервис с тем же `REDIS_URL` |

### 0.3 AST-проверка: разрывы импортов `backend.app.*`

Полный список импортов переезжающего кода и способ разрыва:

| Импорт (из переезжающего модуля) | Куда ведёт | Разрыв |
|---|---|---|
| `gateway.py → ..redis_cache` | Redis-клиент монолита | копия модуля в сервис (те же ключи, тот же `REDIS_URL`) |
| `gateway.py → .llm_store` | таблицы `llm_providers/llm_prompts/llm_feature_flags/llm_usage` | read-only копия подмножества в сервисе: `get_active_prompt`, `get_feature_flag`, `enabled_providers_with_key`, `any_enabled_provider`, `resolve_model`, `usage_daily_tokens`, `record_usage` (запись usage). CRUD остаётся только в монолите |
| `gateway.py → .deepseek_questions._deepseek_chat_request` | HTTP-вызов DeepSeek (`requests.post` на `{base_url}/v1/chat/completions`, retry/backoff, `deepseek_questions.py:773-813`) | выделение в `ai/llm_http_client.py` (монолит) + копия в сервис |
| `agent/chat.py → gateway` | внутренний после выноса | не требует разрыва |
| `agent/* → session_repo / process_projection / storage` | сессии, проекция схемы, БД сессий | HTTP: новый endpoint монолита `GET /api/sessions/{id}/agent/projection` (решение №3); memory-таблицы — прямой SQL по общей БД (таблицы `agent_conversations/agent_turns` принадлежат сервисному домену) |
| `agent/action_runners → schema_assistant` | LLM3-действия | HTTP: существующие endpoints `/api/sessions/{id}/llm/suggest-next|explain-step|step-qa` с пробросом JWT |
| RAG (AGENT-1 перспектива) | `GET /api/rag/search` | HTTP: существующий endpoint, сигнатура `q, top_k, source_type, session_id, min_score` (`routers/rag.py:36-44`), org-member gate внутри, ответ `{ok, results[]}` |

⚠️ **Кэш resolve_model:** `llm_store.resolve_model` использует in-process кэш (`_load_model_resolve_state` + `invalidate_model_cache`). После выноса админка монолита инвалидирует только свой процесс — сервис может отдавать stale-модель до перезапуска/TTL. Митигация в Phase 2: в сервисной копии llm_store кэш с TTL (например 30с) вместо in-process invalidation, либо без кэша (запрос дешёвый). Решение — в реализации Phase 2, зафиксировать в PR.

⚠️ **«Два писателя» (решение №6 владельца принято):** `llm_providers/llm_prompts/llm_feature_flags/llm_usage` — общие таблицы. Пишет админка монолита (CRUD) и сервис (только `llm_usage` через `record_usage`). Конфликтов схемы нет: миграции только монолит; `record_usage` — append-only. Зафиксировано как осознанное решение владельца.

### 0.4 Подтверждение решения №8 (Redis-кэш)

Cache key в `gateway.py:187`: `pm:cache:llm:{feature}:v1:{digest}` — формируется только от feature+digest, **без привязки к процессу/хосту**. Перенос не инвалидирует существующий кэш. Проверено по коду.

### 0.5 Найденная коллизия маршрутизации (требует решения)

ТЗ: nginx `location ~ ^/api/sessions/[^/]+/agent/` → agent:8000 **и** новый монолитный endpoint `GET /api/sessions/{id}/agent/projection`. Это противоречие: regex перехватит projection и отправит в сервис (петля сервис→nginx→сервис).

Варианты:
- **(а) Рекомендуемый:** сузить regex до реальных путей сервиса: `location ~ ^/api/sessions/[^/]+/agent/(chat|history)`. Монолитный endpoint сохраняет путь из ТЗ `/agent/projection` и обслуживается монолитом. При добавлении новых endpoint'ов сервиса regex расширяется явно — это фича (явный контракт маршрутизации), а не баг.
- (б) Переименовать монолитный endpoint в `/api/sessions/{id}/agent-projection` (вне regex). Отклоняется как дефолт: отходит от ТЗ без необходимости.

### 0.6 Авторизация сервиса (решение №4)

- JWT decode общим `JWT_SECRET`: в монолите `auth.py:150-151` (env `JWT_SECRET`, дефолт `dev-insecure-change-me`); issuer в токенах **не используется** (jwt.encode без `iss`) → в сервисе `JWT_ISSUER=None`, как допускает `notifications/app/services/auth_service.py` (`decode_access_token`, issuer из env, default None).
- Membership lookup по общей БД — копия подхода notifications `auth_service.resolve_user_context` (SELECT `users.is_admin` + `org_memberships.role`).
- Роли: ТЗ требует «technologist и выше». **Факт по коду:** роль `technologist` в монолите не найдена; существующие роли — `org_owner/org_admin/project_manager/editor/viewer/org_viewer/auditor`. Предположение (⏳): гейт как у LLM3 — org member (любая membership-роль), что совпадает с `require_org_member_for_enterprise`. Открытый вопрос №1.

---

## Phase 1 — подготовка в монолите (PR-1, без переключения трафика)

Цель: монолит готов к появлению сервиса, поведение не меняется.

1. **Новый endpoint проекции:** `GET /api/sessions/{id}/agent/projection` в `backend/app/routers/agent_chat.py` (или отдельный роутер `agent_projection.py`). Обычный authenticated endpoint, org-scoped load сессии как у LLM3 (`_load_session` в `schema_assistant.py`). Возвращает `build_process_projection(session)` + `projection_digest` + `rev`. Автотесты: 403-by-role, 404 чужой org.
2. **Internal LLM-клиент монолита:** `backend/app/ai/llm_internal_client.py` — httpx-клиент с контрактом, идентичным `gateway.complete()/complete_cached()`: `POST {AGENT_SVC_URL}/internal/llm/complete` и `/internal/llm/complete_cached`, ответ `{ok, status, text, usage, provider_id, model, fallback, cached, latency_ms}`. Timeout + честный `status="error"` при недоступности (решение №7).
3. **Перевод LLM1/LLM2/LLM3 на internal-клиент за флагом:** env `LLM_VIA_AGENT_SVC=0|1` (дефолт 0). Точки замены: `process_analysis.py:160,163`, `schema_assistant.py:73,76`, `transformation/pipeline.py:209-215`. При `0` — текущий прямой вызов gateway (монолитный gateway остаётся на месте до конца Phase 5).
4. **Выделение `ai/llm_http_client.py`:** retry-хелпер `_deepseek_chat_request` переезжает из `deepseek_questions.py` без изменения поведения; `deepseek_questions.py` и `admin_llm.py:17` реимпортируют оттуда.
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
│   ├── dependencies.py         # auth: decode JWT + membership (копия auth_service notifications), роли см. 0.6
│   ├── llm/
│   │   ├── gateway.py          # перенос backend/app/ai/gateway.py
│   │   ├── llm_store.py        # read+usage подмножество (см. 0.3), TTL-кэш resolve_model
│   │   ├── llm_http_client.py  # копия retry-хелпера
│   │   └── redis_cache.py      # копия, те же ключи pm:cache:llm:*
│   ├── agent/                  # перенос backend/app/agent/: memory_store, context, chat, action_runners
│   ├── monolith_client.py      # httpx: projection / llm-actions / rag, проброс JWT пользователя
│   └── routers/
│       ├── agent_chat.py       # перенос роутера AGENT-0 (chat, history)
│       └── internal_llm.py     # POST /internal/llm/complete, /internal/llm/complete_cached (только внутренняя сеть)
└── tests/                      # перенос test_agent_chat_*, test_agent_memory (мок на границе monolith_client / gateway)
```

Ключевые решения:
- **Проброс JWT (решение №3):** все вызовы сервис→монолит с заголовком `Authorization: Bearer <user-jwt>`. Никаких service-token с обходом авторизации — org-scoped guard'ы монолита работают без изменений.
- **`/internal/llm/*` не публикуется через nginx** (решение №2): только docker-сеть.
- **Тесты AGENT-0:** переезжают вместе с кодом в `backend/services/agent/tests/`. ⚠️ Требование ТЗ «тесты зелёные БЕЗ изменений» буквально невыполнимо: путь импорта `app.agent.chat` после выноса исчезает, conftest мокает `app.agent.chat.complete`. Предложение: тесты переезжают с той же логикой и теми же сценариями, правится только import-path и точка мока (мок на `monolith_client`/gateway сервиса). Если владелец требует буквального «без изменений» — оставить в монолите shim `backend/app/agent/__init__.py` с re-export до Phase 5 (открытый вопрос №4).
- **Health endpoint:** `GET /health` (как notifications).
- **Запрет импортов `backend.app.*`:** lint-шаг в CI (grep/AST-проверка по `backend/services/agent/**`).

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
   (вариант (а) из 0.5). Общий `location /api/` → монолит не меняется. Фронт не меняется.
   **Fallback-вариант (если regex окажется хрупким):** тонкий proxy в монолите через httpx с 503-fallback, как Phase 4 у notifications. **Критерий выбора:** сначала regex на stage; если наблюдаются некорректные матчи/404 на соседних путях — переход на монолитный proxy.
3. **`.env.example`:** `AGENT_SVC_URL=http://agent:8000`, `LLM_VIA_AGENT_SVC=0`, `MONOLITH_URL=http://api:8000` (рядом с существующими `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`).
4. **CI:** matrix-build образа agent только при изменении `backend/services/agent/**` — по образцу notifications в `.github/workflows/deploy-stage.yml:36,101,120`.

## Phase 4 — переключение маршрутов + fallback (PR-4)

1. Deploy на stage с `LLM_VIA_AGENT_SVC=0`: agent-сервис поднят, nginx location активен, чат панели обслуживается сервисом. Монолитный agent-код остаётся на месте (не удаляется).
2. Замер добавочного latency hop: `curl -w` по `/api/sessions/{id}/agent/chat` vs baseline — бюджет **< 50мс** (решение №7, методика плейбука notifications).
3. Включение `LLM_VIA_AGENT_SVC=1` на stage: LLM1/LLM2/LLM3 идут через `/internal/llm/complete`. Проверка честных статусов при остановленном сервисе: монолит не падает, LLM1/2/3 отдают свои `status="error"`/timeout-статусы; панель показывает S6/S7 по `docs/llm/LLM4_PROCESSMAN_PANEL.md`.
4. Откат за 5 минут: убрать nginx location (или `LLM_VIA_AGENT_SVC=0`) + redeploy монолита. Данные не затрагиваются (общая БД, общий Redis, кэш-ключи неизменны).

## Phase 5 — верификация (только clearvestnic.ru:5177)

Регрессия (все проверки на stage):
- Тесты AGENT-0 (`test_agent_chat_*`, `test_agent_memory`) — зелёные в новом расположении (см. оговорку Phase 2 про import-path).
- LLM3 endpoints (`suggest-next|explain-step|step-qa`) — не сломаны (автотесты + ручной прогон панели).
- Baseline: `test_diagram_cas_guard` + auth-тесты (`test_auth_jwt_flow`, `test_auth_users_db_profile_storage`) — зелёные.
- Деградация: сервис остановлен → панель S6/S7, монолит жив, LLM1/2/3 честные статусы.
- Кэш Redis: повторный вопрос при неизменной схеме → `cached=true` (ключи не инвалидированы переносом).
- Latency hop < 50мс подтверждён замером.
- Prod — отдельный апрув владельца, этот план prod не покрывает.

## Риски и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| Петля маршрутизации nginx regex vs `/agent/projection` | высокая (найдена при анализе) | узкий regex `/agent/(chat|history)` (0.5) |
| Stale-кэш resolve_model в сервисе после смены модели админкой | средняя | TTL-кэш/без кэша в сервисной копии llm_store (0.3) |
| Рассинхрон копий llm_store/llm_http_client/redis_cache с монолитом | средняя | копии read-only подмножества; изменения llm_* схемы — только монолитные миграции; CI-lint на дрейф (diff-check) |
| Двойной LLM-вызов при частичном переключении флага LLM_VIA_AGENT_SVC | низкая | флаг глобальный per-deploy; rollout только целиком |
| Деградация сервиса ломает LLM1/2/3 | средняя | timeout+честный status в internal-клиенте (Phase 1.2), тест Phase 5 |
| JWT без issuer: любой токен с тем же секретом валиден | низкая (наследовано) | тот же секрет и риск, что у монолита; не усугубляется |
| In-memory BM25 монолита при росте корпуса RAG (до 2000 чанков, `routers/rag.py:21`) | отложенный | зафиксировано в треке AGENT-2 (pgvector), вне этого эпика |

## Точка невозврата

До конца Phase 4 включительно откат = nginx/`LLM_VIA_AGENT_SVC` + redeploy, данные и код монолита не тронуты. **Точка невозврата — удаление монолитного agent-кода и gateway из `backend/app/`**: выполняется отдельным PR только после N дней (предложение ⏳: 7 дней) стабильной работы на stage и явного апрува владельца. До этого момента монолитный код — живой fallback.

## Fallback plan (откат за 5 минут)

1. `LLM_VIA_AGENT_SVC=0` (LLM1/2/3 возвращаются на монолитный gateway).
2. Убрать nginx location agent (или вернуть proxy на монолит) + reload nginx.
3. Сервис `agent` можно остановить; БД/Redis не трогаем (кэш-ключи совместимы).
4. Монолитный `backend/app/agent/` + роутер agent_chat остаются на месте до стабилизации — удаление отдельным PR (см. точку невозврата).

## Открытые вопросы владельцу

1. **Роль `technologist`:** такой роли в монолите нет (роли: org_owner/org_admin/project_manager/editor/viewer/org_viewer/auditor). Подтвердить маппинг: предлагаю гейт «org member» как у LLM3, либо указать конкретный набор ролей.
2. **Расхождение списка переезжающих модулей с кодом:** `deepseek_client.py`, `prompt_registry.py`, `execution_log.py` используются legacy-контуром монолита (`notes_extraction`, `_legacy_main`, `admin`, `product_actions_ai`, `ai_questions`) и gateway'ем не используются. Предлагаю оставить их в монолите (сервису они не нужны). Подтвердить.
3. **`llm_feedback` / `llm_status`:** остаются в монолите (зависят от `_legacy_main`). ОК, или в перспективе перенести в сервис отдельным эпиком?
4. **Тесты AGENT-0:** «зелёные БЕЗ изменений» буквально невозможно (import-path `app.agent.chat` исчезает). Варианты: (а) перенос тестов с правкой imports/точки мока, логика та же — рекомендую; (б) shim re-export в монолите до Phase 5. Выбрать.
5. **Фоновый `update_memory` (AGENT-1):** нужен ли сервису Celery или достаточно существующей Redis queue? (В AGENT-0 фоновых задач нет — вопрос на перспективу, блокером не является.)
6. **Срок стабилизации N** перед удалением монолитного agent-кода: предложение 7 дней stage. Подтвердить.
7. **`docs/PASSWORD_ROTATION_RULE.md`** отсутствует в репозитории (упоминается в docs/llm/*). Восстановить файл или правило считать зафиксированным устно (has_api_key + key_last4)?

---

*После апрува владельца: реализация по фазам PR-1…PR-4, каждый PR — протокол апрувов, финальный proof (git-state, verify stage, регрессия).*
