# План: cleanup/analytics-single-source-of-truth-v1

Run ID: `20260522T205346Z-85330`
Contour: `cleanup/analytics-single-source-of-truth-v1`

## Статус

`READY_FOR_EXECUTION` после записи всех required proof файлов.

## Цель

Установить единый источник правды (single source of truth) для аналитических данных в ProcessMap:
1. Вынести разрозненное analytics routing state из `ProcessStage.jsx` в выделенный модуль.
2. Убрать дублирующее клиентское построение registry rows — данные реестров должны приходить только из backend API.
3. Сделать frontend тонким клиентом для analytics: backend отдаёт view-model, frontend рендерит.

## Нон-goals

- Нет изменений backend API, схем, БД.
- Нет изменений в диаграммном движке (bpmn-js overlays).
- Нет добавления новых UI-экранов или функций.
- Нет merge/deploy/PR из этого контура.

## Текущие проблемы (source truth)

### 1. Analytics routing state размазан по ProcessStage.jsx
- `analyticsHubRoute` / `setAnalyticsHubRoute` — `useState` в `ProcessStage.jsx` (строки ~927).
- `productActionsRegistryRoute` / `setProductActionsRegistryRoute` — `useState` в `ProcessStage.jsx` (строки ~919).
- Нет dedicated analytics state hook; логика смешана с diagram, interview, session state.

### 2. Product Actions Registry — двойное построение rows
- Backend: `backend/app/routers/product_actions_registry.py` отдаёт готовые rows через `/api/analysis/product-actions/registry/query` и `/api/sessions/{id}/analysis/view-model`.
- Frontend: `frontend/src/features/process/analysis/productActionsRegistryModel.js` содержит `buildProductActionRegistryRows`, которая строит rows из `interviewData.analysis.product_actions`.
- `ProductActionsRegistryPanel.jsx` для session-scope использует fallback на клиентское построение (строки ~219–223) вместо того чтобы полагаться исключительно на backend view-model.

### 3. Properties Registry — двойное построение rows
- Backend: `backend/app/routers/process_properties_registry.py` отдаёт готовые rows через `/api/analysis/properties/registry/query`.
- Frontend: `ProcessPropertiesRegistryPage.jsx` содержит `buildCamundaRows`, которая строит rows из `bpmn_meta.camunda_extensions_by_element_id` локально (строки ~63–96).

## Target source map

| Поверхность | Текущий источник | Target источник |
|---|---|---|
| Analytics hub route state | `ProcessStage.jsx` useState | `frontend/src/features/process/analysis/useAnalyticsRouteState.js` |
| Product Actions rows (все скоупы) | Backend API + клиентский fallback | Backend API только |
| Properties rows (все скоупы) | Backend API + клиентский fallback | Backend API только |
| Registry filter/page state | `ProductActionsRegistryPanel.jsx` useState | Остаётся в компоненте (UI state) |

## Execution mode

`SINGLE_EXECUTOR_MODE` — однопоточный executor. Это cleanup/refactoring контура без parallel backend/frontend split. Работа связная и последовательная.

## Файлы для изменения

### Новые файлы
- `frontend/src/features/process/analysis/useAnalyticsRouteState.js` — выделенный hook для analytics routing state.
- `frontend/src/features/process/analysis/useAnalyticsRouteState.test.mjs` — тесты.

### Изменяемые файлы
- `frontend/src/components/ProcessStage.jsx` — удалить `analyticsHubRoute`/`productActionsRegistryRoute` useState, импортировать и использовать новый hook.
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — удалить клиентское `buildProductActionRegistryRows` для session-scope, использовать только backend API rows.
- `frontend/src/features/process/analysis/productActionsRegistryModel.js` — удалить или deprecate `buildProductActionRegistryRows` (проверить, используется ли ещё где-то).
- `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` — удалить `buildCamundaRows`, использовать только backend API rows.

### Проверяемые файлы (не изменять без proof необходимости)
- `frontend/src/lib/api.js` — API обёртки уже существуют.
- `frontend/src/lib/apiRoutes.js` — роуты уже существуют.
- `backend/app/routers/product_actions_registry.py` — не трогать.
- `backend/app/routers/process_properties_registry.py` — не трогать.

## Acceptance criteria

- [ ] `ProcessStage.jsx` не содержит `useState` для `analyticsHubRoute` или `productActionsRegistryRoute`.
- [ ] Существует `useAnalyticsRouteState.js` с тем же поведением (read/write analytics hub и product actions registry route).
- [ ] `ProductActionsRegistryPanel.jsx` для session-scope использует только backend view-model API, без клиентского fallback на `interviewData.analysis.product_actions`.
- [ ] `ProcessPropertiesRegistryPage.jsx` для session-scope использует только backend API, без клиентского fallback на `buildCamundaRows`.
- [ ] Все существующие analytics hub / registry / navigation сценарии продолжают работать (Agent 4 проверит runtime).
- [ ] Нет regression в остальных частях `ProcessStage.jsx` (diagram, interview, notes и т.д.).

## Runtime/source truth captured by Planner

| Plane | Evidence |
|---|---|
| workspace | `pwd=/opt/processmap-test` |
| branch | `feat/active-runs-monitor-v1` |
| HEAD | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| origin/main | fetch failed (SSH permission denied) |
| status | Dirty workspace with pre-existing admin changes and untracked planning/runtime artifacts. |
| diff --name-only | `backend/app/routers/admin.py`, `frontend/public/build-info.json`, `frontend/src/app/router/adminRoutes.jsx`, `frontend/src/features/admin/AdminApp.jsx`, `frontend/src/features/admin/api/adminApi.js`, `frontend/src/features/admin/constants/adminNav.js`, `frontend/src/features/admin/constants/adminRoutes.constants.js`, `frontend/src/features/admin/constants/adminStatusMeta.js`, `frontend/src/generated/buildInfo.js`, `frontend/src/lib/apiModules/adminApi.js`, `frontend/src/lib/apiRoutes.js`, `frontend/src/shared/i18n/ru.js` |

Risk: workspace dirty и branch отличается от `origin/main`. Поскольку это cleanup-контур, план ограничивает изменения только указанными frontend файлами и не затрагивает product runtime вне analytics.

## GSD discipline

- Bounded scope: только frontend analytics state и registry row sources.
- No broad refactor: ProcessStage.jsx меняется только в части analytics route state extraction.
- No backend changes.
- No PR/merge/deploy из этого контура.
