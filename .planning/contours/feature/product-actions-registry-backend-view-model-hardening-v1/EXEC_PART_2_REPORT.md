# Agent 3 / Worker 3 — frontend thin-client/readiness lane

> **Контур:** `feature/product-actions-registry-backend-view-model-hardening-v1`  
> **Run ID:** `20260519T110751Z-24254`  
> **Статус:** DONE  
> **Режим:** proxy execution, без серверного LLM из-за лимитов

## Проверенные файлы

- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/features/process/analysis/productActionsRegistryModel.js`
- `frontend/src/components/process/analysis/registry/*`
- `frontend/src/lib/apiRoutes.js`
- `frontend/src/lib/api.js`

## Frontend usage truth

Frontend уже вызывает текущий backend namespace через:

- `apiRoutes.analysis.productActionsRegistryQuery()`
- `apiRoutes.analysis.productActionsRegistryExportCsv()`
- `apiRoutes.analysis.productActionsRegistryExportXlsx()`

UI использует backend rows/sessions, но всё ещё держит существенную view-model логику на клиенте.

## Frontend-heavy logic

В `ProductActionsRegistryPanel.jsx`:

- `normalizeBackendRows`
- `normalizeBackendSessions`
- `summarizeRowsAsSessions`
- `buildExportPayload`
- local `paginatedRows = filteredRows.slice(...)`
- fallback через `apiGetSession` для выбранных сессий проекта
- ручное обновление `backendRows/backendSessions` после AI accept

В `productActionsRegistryModel.js`:

- `buildProductActionRegistryRows`
- `summarizeProductActionRegistryRows`
- `uniqueProductActionRegistryFilterOptions`
- `filterProductActionRegistryRows`
- `productActionRegistryCompleteness`

## Thin-client target contract

Frontend должен получать от backend:

- `rows`: уже нормализованные строки текущей страницы;
- `sessions`: нормализованный список сессий scope;
- `summary` или `metrics`: totals до/после фильтров и page count;
- `filter_options`: варианты фильтров по filtered/source universe;
- `applied_filters`: нормализованные фильтры;
- `page`: server-side pagination state;
- `empty_state`: стабильный тип пустого состояния;
- `source_state`: источник данных и флаг исключения тяжёлых payload.

## Что останется на frontend

- Rendering таблицы/фильтров/pagination controls.
- Передача selected scope/project/session/session_ids.
- Download blob handling для export.
- Read-only navigation to project/session.
- Bulk AI review UI как отдельная mutation flow, не часть read-only registry query.

## Риски

- Пока frontend строит `filter_options` по загруженным строкам, возможна неверная картина при server-side pagination.
- Пока frontend пересчитывает filtered summary, query/export parity может расходиться.
- Project fallback через full `apiGetSession` остаётся capped legacy path и не должен становиться основным registry source.
- После AI accept frontend вручную патчит локальные rows/sessions; backend hardening должен явно отделить read-only query от mutation path.

## Agent 4 checklist

- Проверить, что `/api/analysis/product-actions/registry/*` сохранён.
- Проверить, что backend additions backward-compatible.
- Проверить, что frontend target не требует redesign.
- Проверить, что Properties Registry и Diagram overlays не попали в scope.
- Проверить, что no mutation boundary сохранён.

## Blockers

Нет.

