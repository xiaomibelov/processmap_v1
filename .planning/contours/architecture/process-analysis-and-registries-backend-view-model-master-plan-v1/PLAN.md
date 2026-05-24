# Master plan: Process analysis and registries backend view model

Контур: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`  
Run ID: `20260520T221413Z-51872`  
Статус: `READY_FOR_EXECUTION`

## Зачем нужен контур

Текущие backend-реестры (`Product Actions Registry`, `Process Properties Registry`) эволюционировали инкрементально и независимо. У каждого есть свои endpoints, модели фильтрации, пагинации и экспорта, но отсутствует единая архитектурная рамка `backend view model`, через которую `frontend` становится тонким клиентом.

Этот контур создаёт unified master plan для:
- процесс-аналитической поверхности (`Анализ процессов`);
- реестров действий с продуктом и свойств процесса;
- backend view model как единого паттерна для всех analytics/registry поверхностей.

Контур планирующий: product-code не меняется, PR/merge/deploy не делаются.

## Текущие pain points

1. Два реестра развивались независимо — схожие, но не идентичные паттерны запроса/фильтра/экспорта.
2. Нет unified response envelope: `rows`, `summary`, `page`, `filter_options`, `metrics`, `empty_state`, `source_state` закреплены не везде.
3. Frontend всё ещё держит часть вычислений client-side (особенно для session-scope Properties).
4. Поверхность `Анализ процессов` не потребляет backend view model напрямую — данные доходят через вложенные session payloads.
5. Scope validation, permission checks, export formatting дублируются между реестрами.
6. Нет shared infrastructure для registry query/filter/export.
7. Недавнее hardening (`feature/product-actions-registry-backend-contract-fields-v1`, `feature/process-properties-registry-backend-contract-v1`) инкрементально и требует архитектурного обрамления.

## Non-goals

- Не менять frontend/backend product-code.
- Не делать прямой UI redesign.
- Не делать backend/API implementation.
- Не делать schema migration.
- Не менять BPMN XML.
- Не открывать PR, не merge, не deploy.
- Не выдавать гипотезы за durable product truth.

## Source/runtime truth status

| Plane | Evidence |
|---|---|
| workspace | `pwd=/opt/processmap-test` |
| branch | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `a2359d8ce732ab89f8911ec0479500ecd660a764` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| status | Dirty: 2 commits ahead of main, untracked planning/runtime artifacts |
| diff cached | `backend/app/routers/__init__.py`, `backend/app/routers/process_properties_registry.py`, `backend/app/storage.py`, `backend/tests/test_process_properties_registry_api.py`, `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`, `frontend/src/lib/api.js`, `frontend/src/lib/apiRoutes.js` |

Риск: workspace — не canonical repo root, ветка отличается от `origin/main`. Product implementation в этом checkout запрещён. Разрешены только артефакты в `.planning/contours/architecture/process-analysis-and-registries-backend-view-model-master-plan-v1/`.

## Текущий source map

### Product Actions Registry — backend truth

- `backend/app/routers/product_actions_registry.py` (579 строк)
- Endpoints:
  - `POST /api/analysis/product-actions/registry/query`
  - `POST /api/analysis/product-actions/registry/export.csv`
  - `POST /api/analysis/product-actions/registry/export.xlsx`
- Поддерживает: `workspace` / `project` / `session` scope, фильтры, пагинацию, сортировку, summary, session summaries, CSV/XLSX export.
- Недавнее hardening (`feature/product-actions-registry-backend-contract-fields-v1`) добавило: `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`.

### Process Properties Registry — backend truth

- `backend/app/routers/process_properties_registry.py` (799 строк)
- Endpoints:
  - `POST /api/analysis/properties/registry/query`
  - `POST /api/analysis/properties/registry/export.csv`
  - `POST /api/analysis/properties/registry/export.xlsx`
- Поддерживает: `workspace` / `project` / `session` scope, фильтры, пагинацию, сортировку, summary, filter options, metrics, empty state, source state, CSV/XLSX export.
- Текущая ветка (`feature/process-properties-registry-backend-contract-v1`) добавила element types в contract.

### Frontend — mixed state

- `ProductActionsRegistryPanel.jsx` / `ProductActionsRegistryPage.jsx` — потребляют backend API, но держат часть UI-фильтров и состояния локально.
- `ProcessPropertiesRegistryPage.jsx` — session-scope rows раньше строились client-side; текущая ветка переводит на backend query.
- `productActionsRegistryModel.js` — содержит client-side normalization и фильтрацию, которые частично дублируют backend logic.

### Process Analysis surface

- `Анализ процессов` — top-level поверхность с B-block companion.
- Данные доходят через `interview.analysis.product_actions[]`, вложенные в полный session payload.
- Нет dedicated backend view model API для аналитики, отдельной от session load.

## Target architecture: Unified Registry View Model

### Принципы

1. **Backend owns computation**: row shaping, aggregation, filtering, pagination, sorting, summaries, export preparation.
2. **Frontend owns UI state**: active tab, scope selector, selected filters, selected rows, expanded rows, viewport, hover, navigation.
3. **Unified response envelope**: все registry endpoints возвращают стабильную структуру.
4. **Shared infrastructure**: scope validation, permission checks, export formatting, pagination helpers — общие.
5. **Read-only by default**: registry view models не мутируют sessions, BPMN XML, product actions.

### Unified response envelope (target)

```json
{
  "scope": "workspace|project|session",
  "scope_id": "...",
  "rows": [...],
  "summary": {
    "total": 0,
    "complete": 0,
    "incomplete": 0,
    "sessions_selected": 0,
    "sources_loaded": 0
  },
  "page": { "limit": 100, "offset": 0, "total": 0 },
  "filter_options": {
    "products": [],
    "action_types": [],
    "stages": [],
    "roles": [],
    "object_categories": []
  },
  "applied_filters": { ... },
  "metrics": { "total_actions": 0, "complete_rows": 0, "incomplete_rows": 0 },
  "empty_state": { "reason": "no_sources|no_rows|filters_too_strict", "message": "..." },
  "source_state": { "sessions": [...], "projects": [...] }
}
```

### Shared infrastructure candidates

- `_normalize_scope`, `_normalize_limit`, `_normalize_offset`
- `_validate_project_ids`, `_validate_session_ids`
- `_visible_project_ids_for_workspace`
- `_workspace_title`, `_with_workspace_titles`
- `_completeness`
- `_matches_filters`, `_sort_key`
- `_summary`, `_session_summary`, `_session_summary_totals`
- `_reconcile_session_summaries_with_rows`
- Export helpers: `_export_filename`, `_export_cell`, `_csv_bytes`, `_xlsx_bytes`

## Phased roadmap

| Phase | Objective | Suggested contour |
|---|---|---|
| 0 | Approve this master plan. | `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1` |
| 1 | Consolidate Product Actions Registry backend view model. | `feature/product-actions-registry-backend-contract-fields-v1` (выполнено/выполняется) |
| 2 | Consolidate Process Properties Registry backend view model. | `feature/process-properties-registry-backend-contract-v1` (текущая ветка) |
| 3 | Extract shared registry view model utilities. | `feature/registry-shared-view-model-infrastructure-v1` |
| 4 | Frontend thin-client migration: Product Actions Registry. | `feature/frontend-product-actions-registry-thin-client-v1` |
| 5 | Frontend thin-client migration: Process Properties Registry. | `feature/frontend-process-properties-registry-thin-client-v1` |
| 6 | Process Analysis surface backend view model APIs. | `feature/process-analysis-backend-view-model-api-v1` |
| 7 | Unified registry infrastructure + optional cache/materialization. | `feature/analytics-registry-infrastructure-and-cache-v1` |

## Worker split

### Mode: SINGLE_EXECUTOR_MODE

Это planning-only/documentation-only контур. Parallel split не нужен.

### Agent 2 / Worker: architecture and source-truth lane

Задача: зафиксировать текущее состояние backend registry view models, выявить divergence между двумя реестрами, описать shared infrastructure candidates.

Основные outputs:
- `WORKER_2_REPORT.md`
- `CURRENT_BACKEND_SOURCE_TRUTH.md`
- `REGISTRY_DIVERGENCE_MATRIX.md`
- `SHARED_INFRASTRUCTURE_CANDIDATES.md`
- `WORKER_2_DONE`

### Agent 3: shell-only merge / no-LLM handoff

В `TOKEN_ECONOMY_SINGLE_EXECUTOR` режиме Agent 3 выполняет shell-only merge результатов Worker 2 в `EXEC_REPORT.md` и передаёт Agent 4.

## Deliverables planning pack

- `PLAN.md`
- `REGISTRY_VIEW_MODEL_ARCHITECTURE.md`
- `CURRENT_BACKEND_SOURCE_TRUTH.md`
- `FRONTEND_THIN_CLIENT_TARGET.md`
- `SHARED_INFRASTRUCTURE_DIRECTION.md`
- `IMPLEMENTATION_ROADMAP.md`
- `STATE.json`
- `AGENT_RUN_ID`
- Worker/reviewer prompts
- `READY_FOR_EXECUTION`

## Review gates

Agent 4 может ставить `REVIEW_PASS` только если:
- current state grounded in source/runtime truth;
- confirmed facts и hypotheses чётко разделены;
- unified response envelope описан достаточно конкретно для Phase 3–5;
- frontend/backend split корректен и не смешивает computation с DOM-рендерингом;
- shared infrastructure candidates действительно общие для обоих реестров;
- roadmap порождает конкретные follow-up contour IDs;
- no product code changes by Planner.

## Acceptance criteria

- [ ] Required proof files non-empty и содержат run id.
- [ ] Worker prompt независимо исполняем.
- [ ] API contracts помечены draft, если не доказаны source.
- [ ] Plan различает backend computation и frontend DOM-рендеринг.
- [ ] No product code changed by Planner.
- [ ] STATE.json execution_mode = `single-lane`.
