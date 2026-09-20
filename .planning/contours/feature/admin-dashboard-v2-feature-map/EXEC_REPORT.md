# EXEC_REPORT — feature/admin-dashboard-v2-feature-map

Дата: 2026-09-20. Роль: Agent 2 (Executor), orchestrator-сводка поверх двух worker-executor'ов (backend, frontend).
Ветка: `feature/admin-dashboard-v2-feature-map` от `origin/main` = `2c051887` (PR #1004).
Worktree: `server-backup/opt/processmap-test-worktrees/feature-admin-dashboard-v2-feature-map`.
PLAN: approved владельцем с 14 правками аудита `audit/admin-dashboard-v2-verify` (ACCEPTED).

## Закрыто

### Backend (RED→GREEN: 27/27 новых тестов)
- **`GET /api/admin/feature-flags/catalog`** (admin-only, 403 как у PATCH): группы → флаги с метаданными (`label`, `description`, `group`, `maturity`, `owner_contour`, `removal_criterion`, `source`, `editable`, `value`, `default`); реестр — `backend/app/feature_flag_catalog.py`; значения — слои defaults→Postgres→Redis overlay; env-флаг `FPC_ASYNC_SUBPROCESS_SYNC` (rollout, editable=false, значение из env); неизвестные Postgres-ключи → группа `other`/`experimental`. Разметка зрелости — строго по аудиту H5/H8 (rudiment для `lightweightOverlays`, `canvas_profiler_enabled`, `workspace_auto_expand_steps`).
- **PATCH/PUT с env-ключом → 422 `FEATURE_FLAG_ENV_READONLY`** (guard до любой записи). PATCH неизвестных ключей по-прежнему принимается — known behavior (whitelist = контур `fix/feature-flags-governance`), зафиксировано тестом.
- **`GET /api/admin/dashboard`**: добавлены `capability_map` (7 доменов / 36 строк строго по CAPABILITY_INVENTORY.md, статусы ok/pilot/off/attention/no_data) и `attention` (только count>0: autopass_failed, sessions_warnings, redis degraded/incident, mirror_failed только при включённом org-mirror, llm_provider_errors за 24ч). Существующие ключи payload НЕ удалялись.
- LLM-агрегат: `count` через тот же storage-домен, что `/api/admin/ai/executions` (where-строители `_ai_execution_log_where` + `base.count`), без нового endpoint'а. Граница окна 24ч эксклюзивна (created_from = now−86400+1).
- Файлы: `backend/app/feature_flag_catalog.py` (+188), `backend/app/admin_capability_map.py` (+269), `backend/app/routers/feature_flags.py` (+36/−1), `backend/app/routers/admin.py` (+42/−1), тесты `test_admin_feature_flags_catalog.py` (+201), `test_admin_feature_flags_env_readonly.py` (+131), `test_admin_dashboard_capability_map.py` (+449).

### Frontend (RED→GREEN: 17/17 новых тестов, дельта падений = 0)
- **Новая «Сводка»**: «Возможности системы» (accordion, Enter/Space, aria-expanded, sessionStorage), «Требует реакции» (пусто → «Сигналов нет»), «Feature Flags» из каталога (optimistic toggle + inline-откат, env read-only disabled+tooltip, «Прочее»), «Система» — одна строка фактов. Ровно 2 запроса (dashboard + catalog). Компоненты: `CapabilityMapSection`, `AttentionSection`, `FeatureFlagsCatalogSection`, `SystemFactsStrip`.
- **Перенос (замена дублей)**: `/admin/jobs` ← AutoPassOutcomes+JobsThroughput (удалены QueueHealthWidget и recent-failures блок); `/admin/orgs` (таб gitMirror) ← PublishGitMirrorWidget; `/admin/sessions` ← ReportsHealthWidget + RedisHealthWidget (удалены attention/Redis дубли); `onNavigate` проброшен в три страницы.
- **Удалено**: DashboardKpiRow, EndpointCheckMovedCard, TemplateUsageWidget (+cleanup-тест), SessionsActivityWidget, RequiresAttentionWidget, QueueHealthWidget. `FeatureFlagsWidget` сохранён (живёт в AdminSystemPanel). Diffstat frontend: 25 файлов, +1348/−353.
- i18n: `admin.dashboardPage` в ru.js и en.js.

### Spec (AGENTS.md §6.1, blocking)
- `docs/openapi.yaml` регенерирован через `scripts/dump_openapi.py` (307 paths / 389 operations, +24 строки: catalog + env-readonly схемы), `@redocly/cli lint` → **0 errors**. `GET /api/feature-flags` (публичный) не менялся — breaking-маркер не нужен.

### Perf (PLAN §7: порог ≤ +10%)
- Прямой вызов `admin_dashboard`, пустая sqlite, 50 итераций, 5 прогонов вперемешку: **branch 16.85ms vs main 16.65ms → +1.2%** (до оптимизации было +11.5%). Оптимизация: все добавленные чтения (флаги, llm-агрегат, rag readiness) в одном `with _connect()` (1 connect + 3 execute на вызов), redis-client только при заданном REDIS_URL (без error-лога в degraded-режиме). Использованы приватные хелперы storage (`_ai_execution_log_where`, `base.count`) — на review.

## Верификация

| Проверка | Результат |
|---|---|
| Backend scoped (admin+flags, 16 файлов): ветка | **160 passed, 1 failed** — `test_admin_agent_runs::test_active_conversation` |
| Backend scoped: pristine main (те же 13 файлов) | **133 passed, 1 failed** — то же pre-existing падение |
| Дельта падений backend | **0** (единственное падение pre-existing на main; +27 новых тестов все зелёные) |
| Frontend полный `npm test` | **3981 тестов: 3903 pass / 74 fail** — baseline main: 3969/3891/74, дельта = 0 |
| `npm run build` | ok (32s, только стандартные chunk-size warnings) |
| OpenAPI lint | 0 errors |
| Сводка = 2 запроса | да (dashboard + catalog), smoke-тест фиксирует |

- 27 тестовых файлов backend (`from backend.app import …`) не коллектируются вне repo-root — pre-existing ограничение окружения (CI nightly гоняет их с `|| true`; список в `evidence/env-broken-test-files.txt`). Полный прогон `backend/tests` в этом окружении не завершился за 90 минут (зависшие pg/redis-зависимые тесты + падение Docker-демона посреди прогона) — оба раза на обоих деревьях одинаково; дельта верифицирована scoped-наборами, покрывающими все затронутые файлы.

## Решения EXEC (зафиксированы)
1. `SessionsActivityWidget` — удалён целиком (место на `/admin/sessions` не очевидно).
2. Payload для приёмников — собственный fetch `GET /api/admin/dashboard` на странице (backend не расширялся), на `/admin/orgs` — лениво по активному табу.
3. LLM-кэш org-scoped на карту не выносим (нет наблюдаемого статуса). Freshness аналитики — `no_data` до появления endpoint'а.
4. `FeatureFlagsWidget` оставлен в AdminSystemPanel; на Сводке заменён каталожной секцией.
5. Orphaned i18n-ключи удалённых блоков не зачищались (minimal change).

## Ограничения / зона reviewer
- **Playwright-проверки PLAN §7 не исполнялись** (нужен поднятый стек; shared-хост занят стеком контура mutation-gateway-c3; Docker-демон падал посреди сессии) — рекомендованы на review/после stage-деплоя.
- Full-suite backend (без ignore-списка) — вне временного бюджета окружения; scoped-наборы покрывают все изменённые модули.
- Регенерация RAG-индекса в pm-task-init падала с OOM (exit 137) при конкурирующем стеке — контекст получен raw-preflight'ом и дайджестом поиска (зафиксировано).

## Git-proof
- branch: `feature/admin-dashboard-v2-feature-map`, base `2c051887`, HEAD: см. `git log --oneline -6` (коммиты: docs PLAN+STATE → backend → spec → frontend → docs EXEC/STATE).
- working tree: чистое после коммитов; diffstat vs main — только файлы контура.

## Handoff
Цель: пересборка «Сводки» по модели «карта возможностей + живые сигналы» с каталогом флагов и переносом виджетов — закрыта полностью по PLAN §1–§4. Риски: приватные storage-хелперы в агрегате LLM-errors; Playwright не прогонялся. Следующий шаг: Agent 3 (reviewer) по этому отчёту + артефактам аудита.
