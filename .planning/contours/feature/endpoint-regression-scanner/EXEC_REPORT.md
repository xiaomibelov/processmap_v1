> DEPRECATED: упоминания clearvestnic.ru в этом документе — исторические. Домен выведен из проекта. Prod = processmap.ru, stage = stage.processmap.ru.

# EXEC_REPORT — feature/endpoint-regression-scanner

Дата: 2026-08-19. Ветка: `feature/endpoint-regression-scanner` (base origin/main = e462d99d;
на момент финала origin/main ушёл на e1387bc7 — перед merge нужна актуализация ветки).

## Цель

Регрессионный сканер эндпоинтов: кнопка в админке + автозапуск после деплоя →
прогон всех read-only (GET) эндпоинтов живого приложения → дифф против прошлого
прогона. Без GitHub API, всё внутри приложения.

## Что сделано

### Этап 0 — одноразовый sweep прода (выполнен первым, результат выдан сразу)

- `scripts/endpoint_sweep.py` — standalone (stdlib + PyYAML): живая спека
  `/api/openapi.json` с admin-токеном, GET-only, concurrency 2, таймауты,
  exclusions.yaml, LLM-конверты, слепая зона.
- Прогон прода (processmap.ru, main@68d4c6c2, buildTime 2026-08-19T16:37:50Z):
  112 GET в прогоне, **107 ok / 5 HTTP-ошибок (все 4xx, 5xx=0) / 0 доменных /
  0 таймаутов**. Два 422 (`reports/versions`, `auto-pass`) — недокументированные
  обязательные query-параметры (spec-gap, кандидаты на доработку спеки).
  Артефакт: `sweep-prod-20260819_174748.json`.
- Инцидент: clearvestnic.ru мёртв (SSL connection refused) — прод живёт на
  processmap.ru; AGENTS.md в корне kimi_PM устарел в этой части.

### Этап 1 — backend

- `backend/app/endpoint_check/`: `service.py` (thread-прогон против
  localhost:8000, self-scan токен с TTL > бюджета, exclusions, реальные id из
  БД, fingerprint, связка error-events, stale-recovery, partial-results flush),
  `store.py` (CRUD поверх storage), `diff.py` (чистая матрица диффа).
- `backend/app/routers/admin_endpoint_check.py`: POST run (202/409/401/403),
  GET status / runs / runs/{id}. Право — как у «API Docs» (`_api_docs_access`).
- DDL в `storage.py:_ensure_schema()` (паттерн error_events): `endpoint_check_runs`,
  `endpoint_check_results`. История не затирается.
- `auth.py`: `create_access_token(user_id, ttl_seconds=None)` (опционально,
  обратно совместимо) + `/api/admin/endpoint-check/run` в AUTH_PUBLIC_PATHS
  (авторизация полностью внутри обработчика: bearer api-docs-право ИЛИ
  X-Deploy-Token через hmac.compare_digest).
- Baseline `docs/openapi.yaml` обновлён (4 новых пути); exclusions.yaml +
  spec-gap 404 для runs/{run_id}. Contract suite: новые эндпоинты фаззятся чисто.

### Этап 2 — frontend

- `EndpointCheckWidget.jsx` (дашборд админки, рядом с FeatureFlagsWidget;
  видимость по `canOpenApiDocs`, без права нет в DOM): кнопка «Запустить»,
  поллинг 7с, сводка `X ok · Y новых · Z падают · W починились`, trigger +
  commit, **красный бейдж при новых ошибках**; таблица с дефолтным фильтром
  «Новые»; drill-down: тело ответа + error-events; блок «Вне сканирования»
  (мутации + blind_zone с причинами).
- `endpointCheckApi.js` — изолированный контракт; `endpointCheckModel.js` —
  чистая логика (тестируется node --test).

### Этап 3 — автозапуск после деплоя

- `deploy/deploy.sh:113-131`: после healthcheck'а POST run с X-Deploy-Token
  (env или .env); 202/200/409/прочее — нефатально, деплой не валится.
- Backend: `ENDPOINT_CHECK_RUN_ON_DEPLOY` (дефолт = BUILD_ENV=='stage'),
  отложенный старт 45с, дебаунс 5 мин (`debounced:true`), 409
  `scan_already_running` на занятый прогон. В записях: trigger + версия/коммит.

## Review и правки

Review (отдельный агент): blocker B1 (зомби-прогон после рестарта → вечный 409),
major M1 (TTL токена = бюджету → ложные new_error на хвосте), M2 (фронт читал
несуществующие поля not_scanned). Всё исправлено: stale-recovery по started_at
и heartbeat, ttl_seconds = budget + 900, контрактные тесты на not_scanned/blind_zone.
Также: m3 (спящий thread в тесте), m4 (сохранение частичных результатов при падении),
nit deploy.sh (ветка 200, кавычки токена). Осознанно НЕ делано: m1 (done-прогоны
в дебаунсе — новый деплой = новый код, прогон нужен), m2 ревью (multi-worker —
задокументировано у _LOCK).

## Доказательства (5 плоскостей)

- **code**: ветка feature/endpoint-regression-scanner; файлы перечислены выше.
- **workspace**: worktree p0-work-worktrees/feat-endpoint-regression-scanner;
  intended==served доказано на приёмке (`/version` commit == HEAD worktree).
- **DB**: `endpoint_check_runs/results` в postgres стенда pm_epscan; история из
  5 прогонов сохранена (`runs_final.json`).
- **env/compose**: отдельный проект pm_epscan (порты 8211/5277), живой стек
  processmap_v1-* не затронут.
- **serving mode**: прогоны ходили по реальному HTTP в localhost:8000 контейнера.

## Тесты

- Backend: `tests/test_admin_endpoint_check.py` — **19 passed**. Основной suite:
  40 failed / 1175 passed — список падений построчно идентичен baseline HEAD
  (pre-existing pg/redis-зависимые). Contract suite: без новых падений
  (envelope-флаки локальные, в CI зелёные).
- Frontend: **32/32** тестов фичи зелёные (model/source/api/JSX-render);
  vite build успешен. 80 падений полного frontend-suite — pre-existing drift
  HEAD (version-pin, AdminLlmPage), не связаны с фичей.

## Приёмка (подробности в ACCEPTANCE.md)

Стек pm_epscan из worktree: smoke (202/409/прогресс/деталь), намеренная
поломка `GET /version` → прогон показал **new_error 500** с error-events →
откат → **fixed**. Deploy-trigger: X-Deploy-Token → 202 trigger=deploy,
отложенный старт ~50с, повтор — debounced:true, запись с trigger=deploy и
коммитом. Скрины: `shots/01..06` (карточка, красный бейдж, таблица «Новые»,
drill-down 500, дашборд, отсутствие бейджа после fixed).

## Follow-up (вне контура)

1. Fresh-postgres bootstrap сломан апстримом: миграция 001 падает на пустой БД
   (`relation "users" does not exist`) → degraded без сидов. Нужен дефект.
2. `/api/health` сообщает migrations.head="016" при реальном head 025.
3. `.env` трекается в git — вынести из индекса (секреты стенда не закоммичены).
4. clearvestnic.ru недоступен — вычистить устаревшие упоминания stage/prod.

## Осталось / риски

- Merge в main — только после явного подтверждения владельца; перед merge
  актуализировать ветку на свежий origin/main.
- Прод-эксплуатация: выставить ENDPOINT_CHECK_DEPLOY_TOKEN в секретах прода и
  ENDPOINT_CHECK_RUN_ON_DEPLOY=1 при желании автозапуска на проде (по умолчанию
  там выключен — только кнопка).
- Self-scan видит собственные эндпоинты в спеке (безвредно); runs/{run_id} —
  в out_of_scope (нет маппинга run_id), осознанно.
