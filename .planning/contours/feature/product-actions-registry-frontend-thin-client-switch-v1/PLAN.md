# PLAN — feature/product-actions-registry-frontend-thin-client-switch-v1

Run ID: `20260519T144354Z-91101`
Статус: `READY_FOR_EXECUTION`

## 1. Backend Contract Precheck

Легкая проверка предыдущего контура выполнена перед планированием.

Текущий namespace подтвержден:

- `POST /api/analysis/product-actions/registry/query`
- `POST /api/analysis/product-actions/registry/export.csv`
- `POST /api/analysis/product-actions/registry/export.xlsx`

Запрещено переименовывать endpoint в `/api/analytics/*` в этом контуре.

Backend response fields подтверждены по router/test source:

- `filter_options`
- `applied_filters`
- `metrics`
- `empty_state`
- `source_state`

Предыдущий contour `feature/product-actions-registry-backend-contract-fields-v1` имеет `READY_FOR_REVIEW` и `EXEC_REPORT.md` с результатом `12/12 OK`, но в момент planning не найден `REVIEW_PASS`. Поэтому frontend migration должна быть компактной и обязана иметь независимую API-проверку Agent 3 до Agent 4 approval.

## 2. Goal

Перевести Product Actions Registry frontend ближе к thin-client mode:

- frontend рендерит backend view-model там, где backend уже отдает данные;
- frontend перестает заново считать metrics/filter options/source state при наличии backend fields;
- frontend сохраняет только UI state:
  - selected scope;
  - active filters;
  - page/page_size;
  - expanded rows;
  - selected AI mode;
  - navigation.

## 3. Frontend Computation To Reduce

Разрешено заменить на backend-provided fields, если response field присутствует и валиден:

- filter option families вместо локального `uniqueProductActionRegistryFilterOptions(rows)`;
- summary/metrics display вместо локального пересчета там, где UI показывает backend metrics;
- empty state kind/message source вместо ad hoc empty-state derivation;
- source/provenance state вместо локальных эвристик;
- pagination counts/has_more из backend `page`/`metrics`.

Не удалять fallback сразу полностью: текущий frontend должен продолжать работать, если backend field временно отсутствует. Fallback нужен как compatibility guard, но primary path должен быть backend view-model.

## 4. Frontend State That Must Stay Client-Side

- выбранный scope и ids;
- active filter selections;
- current page/page size;
- expanded rows;
- selected AI mode and AI controls state;
- navigation/opened Analytics module;
- transient loading/error UI state.

## 5. Strict Non-Goals

- no endpoint rename;
- no `/api/analytics/*` implementation;
- no Properties Registry;
- no Diagram overlays;
- no RAG runtime;
- no backend schema changes;
- no BPMN XML mutation;
- no Product Actions durable truth mutation;
- no AI auto-write;
- no global shell redesign;
- no fake data.

## 6. Worker Split

### Agent 2 / Worker — frontend implementation lane

Scope:

- inspect current Product Actions Registry frontend data shaping;
- use backend `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state` where available;
- preserve current UI and visual design;
- keep Analytics top-level section intact;
- keep `Реестр действий` as Analytics inner module;
- preserve CSV/XLSX behavior;
- preserve AI controls placement;
- add/update frontend tests for response contract and empty/populated states;
- write reports in Russian;
- create `WORKER_2_DONE`.

If blocked: create `EXEC_PART_1_BLOCKED.md`.

### Agent 3 / Worker — API contract verification lane

Scope:

- do not wait for Worker 2;
- do not validate Worker 2 implementation;
- independently inspect/call backend registry endpoints;
- verify `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`;
- verify query/export parity still holds;
- verify empty workspace/project/session behavior;
- prepare Agent 4 runtime checklist;
- write reports in Russian;
- create `WORKER_3_DONE`.

If blocked: create `EXEC_PART_2_BLOCKED.md`.

### Agent 4 / Reviewer

Agent 4 waits for `WORKER_2_DONE` and `WORKER_3_DONE`.

Gates:

- runtime on `:5180` verified fresh;
- endpoint namespace stayed `/api/analysis/product-actions/registry/*`;
- frontend uses backend view-model fields where available;
- UI still renders:
  - Analytics;
  - Реестр действий;
  - populated project scope;
  - empty workspace scope;
  - filters;
  - metrics;
  - AI controls;
  - exports;
  - sources;
- no console errors;
- no unsafe `PUT`/`PATCH`/`DELETE` from viewing/navigation;
- backend contract is present and frontend thin-client migration is runtime-proven.

## 7. Planning Validation

- Worker 3 does not depend on Worker 2.
- Only Agent 4 waits for both worker markers.
- Allowed block markers only:
  - `EXEC_PART_1_BLOCKED.md`
  - `EXEC_PART_2_BLOCKED.md`
- Product code must not be changed by Agent 1.

## 8. Acceptance Summary

The contour is successful when Product Actions Registry runtime visibly behaves the same, while frontend primarily consumes backend view-model fields for contract data and preserves compatibility fallbacks.
