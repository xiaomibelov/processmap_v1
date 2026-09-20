# PLAN — feature/admin-dashboard-v2-feature-map

> Статус: APPROVED владельцем (20.09.2026), с учётом 14 правок аудита `audit/admin-dashboard-v2-verify` (VERIFY_REPORT.md).
> Baseline: `origin/main` = `2c051887` (PR #1004). Аудит: CAPABILITY_INVENTORY.md (финальный состав карты), DELTA.md (дельта 12.09 → main).

## 1. Постановка

Страница «Сводка» (`/admin/dashboard`) пересобирается по модели «карта возможностей + живые сигналы»:

1. **«Возможности системы»** — раскрывающиеся группы-домены (7 шт., состав — строго по CAPABILITY_INVENTORY.md аудита). Строка = название → статус-бейдж (`работает`/`пилот`/`выключено`/`внимание`/`нет данных`) → факт из существующих данных → ссылка-переход. Правило: пустой источник = `нет данных`, не «0%»; выключенный конфиг = `выключено`, не красная карточка.
2. **«Требует реакции»** — только живые сигналы с count > 0: autopass_failed, sessions_warnings, redis degraded/incident, mirror_failed (только при включённом org-mirror), llm_provider_errors за 24ч. Пусто → «Сигналов нет». Без плиток-нулей.
3. **«Feature Flags»** — иерархия по подсистемам с бейджами зрелости (`stable`/`pilot`/`experimental`/`debug`/`rollout`/`rudiment`) из нового каталога (§4); env-флаги — read-only блок; неизвестные ключи из Postgres → группа «Прочее» (`experimental`).
4. **«Система»** — одна строка фактов (Redis · очередь · активные сессии · проекты · save latency · время генерации); отсутствующие значения не рендерятся.

## 2. Перенос виджетов (перенос = замена дублей)

| Виджет | Приёмник | Примечание |
|---|---|---|
| AutoPassOutcomesWidget + JobsThroughputWidget | `/admin/jobs` | Заменяют QueueHealthWidget и recent-failures-дубль |
| PublishGitMirrorWidget | `/admin/orgs` (таб gitMirror) | Данные — собственный fetch `/api/admin/dashboard` на странице |
| ReportsHealthWidget | `/admin/sessions` | Замена attention/Redis-дублей по факту кода |
| SessionsActivityWidget | удалить | Решение EXEC: место на `/admin/sessions` не очевидно, дублирует табличные данные |
| EndpointCheckMovedCard, DashboardKpiRow, TemplateUsageWidget.jsx (+cleanup-тест) | — | Удаляются |

Backend под приёмники НЕ расширяется: каждая страница-приёмник делает собственный fetch `GET /api/admin/dashboard`. `onNavigate` пробросить в AdminJobsPage/AdminSessionsPage/AdminOrgsPage (AdminApp.jsx:217/264/296).

## 3. Backend

1. `GET /api/admin/dashboard`: добавить ключи `capability_map` (массив доменов `{domain, label, capabilities: [{id, label, status, fact, href}]}`, реестр — декларативная структура в backend) и `attention` (массив `{kind, count, label, href}`, только count > 0). Существующие ключи payload НЕ удалять (deprecate — в EXEC_REPORT).
2. `GET /api/admin/feature-flags/catalog` (admin-only, 403 как у PATCH): `{ok, groups: [{id, label, flags: [{key, label, description, maturity, owner_contour, removal_criterion, source, editable, value, default}]}], meta: {generated_at}}`. Метаданные — реестр-dict в backend. Значения — слои defaults → Postgres → Redis overlay; env-флаги из env процесса, `editable: false`.
3. PATCH/PUT флагов с env-ключом → `422 FEATURE_FLAG_ENV_READONLY`.
4. `GET /api/feature-flags` (публичный) — НЕ менять. PATCH произвольных ключей пока принимается (known behavior, whitelist — контур `fix/feature-flags-governance`) — зафиксировать тестом.
5. Миграций БД нет. OpenAPI: регенерация `docs/openapi.yaml` через `scripts/dump_openapi.py`, redocly lint 0 errors (blocking, AGENTS.md §6.1).

## 4. Каталог флагов — разметка (верифицировано H5/H8 аудита)

| Группа | Флаг | Зрелость | Примечание |
|---|---|---|---|
| canvas | `useBpmnExtensionOverlays` | stable | Hybrid Overlay V2; consumers: BpmnStage.jsx |
| canvas | `lightweightOverlays` | rudiment | consumers нет; только недостижимая legacy-ветка `__FPC_LIGHTWEIGHT_OVERLAYS__` |
| canvas | `bpmn_fps_meter_enabled` | debug | прямой fetch в ProcessStage.jsx, не через useFeatureFlag |
| canvas | `canvas_profiler_enabled` | rudiment | передаётся, но view-model не использует |
| workspace | `workspace_session_tree_view` | stable | WorkspaceExplorer.jsx |
| workspace | `workspace_auto_expand_steps` | rudiment | фронтом не читается (eagerTree=false), в БД=1 |
| workspace | `workspace_tobe_overview` | pilot | гейт `TOBE_OVERVIEW_PILOT_ORG_IDS=["8b89c83ea810"]` захардкожен во фронте — «включено» ≠ «раскатано» |
| save | `FPC_ASYNC_SUBPROCESS_SYNC` | rollout | env, read-only; НЕ задан на stage/prod (аудит H5) → статус строки «выключено» |

Неизвестные ключи Postgres → группа `other`, `experimental`, editable.

## 5. Источники статусов (верификация H4)

- Payload `/api/admin/dashboard`: kpis (avg_save_latency_ms), jobs_health, publish_git_mirror, redis_health, recent_failures, requires_attention.
- `GET /api/admin/rag/indexing-plan` — основной источник RAG-домена (readiness_counts/index_size/queue/next_run_at, PR #977).
- `GET /api/admin/graphs/snapshots` — freshness графа.
- LLM provider errors 24ч: готового агрегата нет → агрегация в `admin_dashboard` по хранилищу execution log (граница окна — строго 24ч, тест на границе).
- Freshness аналитики: admin-endpoint'а нет → строка «Ночной snapshot 04:30» = `no_data` (микро-расширение admin.py не делаем — out of scope минимума).
- LLM-кэш org-scoped: на карту не выносим (нет наблюдаемого статуса).

## 6. href'ы карты

Сверить с `adminNav.js`/`ADMIN_SECTIONS`: 11 пунктов сайдбара; `/admin/ai-modules` — прямой путь вне навигации; `/admin/rag` работает через `parseAdminRoute` (в `adminRoutes.jsx` отсутствует — факт, не чинить).

## 7. Тесты (RED→GREEN)

- **pytest**: каталог (группы/метаданные/env read-only/unknown→other/rudiment-разметка/422 на env-ключ/403 не-admin); capability_map (пустой источник → no_data; 30 failed autopass → attention; mirror org-disabled → off; tobe=on → pilot; LLM-errors-24ч граница окна); attention (только count>0; mirror_failed не появляется при выключенном mirror); регрессия существующих ключей payload и `GET /api/feature-flags`.
- **Vitest/RTL**: smoke-рендер страницы (обязателен — прецедент TDZ); домены/строки/бейджи/accordion (Enter/Space, sessionStorage); «Сигналов нет»; env-блок disabled + tooltip; optimistic toggle + откат при ошибке PATCH; «Прочее»; приёмники — виджеты на местах, дубли удалены, onNavigate проброшен; i18n ru/en полнота.
- **Playwright**: /admin/dashboard 1440×900 и 1280×800 без горизонтального скролла; переход из строки карты в профильный раздел; toggle флага сохраняется после reload; /admin/jobs, /admin/orgs, /admin/sessions рендерят перенесённые виджеты.
- **Perf**: Сводка = 2 запроса (dashboard + catalog); время ответа dashboard не деградирует > 10% против main (замер до/после в EXEC_REPORT).

## 8. Out of scope

Новые метрики/тренды/история; редизайн приёмников сверх переноса; зачистка deprecated-ключей payload; управление env-флагами из UI; починка AutoPass/publish mirror как функций; governance флагов (whitelist, global/per-org, window-fallback, pilot-гейт) — отдельный контур `fix/feature-flags-governance`; физическое удаление rudiment-флагов — туда же.

## 9. Запреты

Без approve владельца: no push/PR/merge/deploy. Не смешивать контуры. Без broad refactor. Виджеты не переписывать — перенос/замена. Не выдумывать статусы: нет источника → `no_data`. Нативные alert/confirm/prompt запрещены (AGENTS.md §6).
