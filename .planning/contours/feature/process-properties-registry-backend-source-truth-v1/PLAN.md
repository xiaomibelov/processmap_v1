# PLAN

Контур: `feature/process-properties-registry-backend-source-truth-v1`  
Run ID: `20260520T193813Z-39871`  
Роль: Agent 1 / Planner  
Статус: `READY_FOR_EXECUTION`

## Цель

Реализовать backend source-of-truth для `Реестра свойств` — read-only API, который агрегирует свойства BPMN-элементов и процессных объектов из durable session data для scope `workspace | project | session`.

## Source/runtime truth before plan

```text
pwd: /opt/processmap-test
remote: origin -> github.com/xiaomibelov/processmap_v1.git
git fetch origin: PASS
branch: feature/product-actions-registry-backend-contract-fields-v1
HEAD: dfe7d2ba6d89d5a1ba6e09306dad49c88d694cdc
origin/main: d805e1c64c1107b9e3fe6854e031694bf741b187
status: untracked artifacts only; no dirty tracked product files in diff
cached diff: empty
```

Вывод: текущий checkout — ветка другого контура. Executor обязан создать новую чистую ветку от `origin/main`.

## Scope boundary

### In scope

1. Backend router `backend/app/routers/process_properties_registry.py`.
2. Storage read helpers в `backend/app/storage.py` для агрегации свойств из sessions.
3. Pydantic input models для query и filters.
4. Response envelope: `rows`, `summary`, `sessions`, `session_summary`, `page`, `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`.
5. CSV/XLSX export endpoints с тем же filtered row set.
6. Router registration в `app_factory.py` / `routers/__init__.py`.
7. Frontend API routes в `frontend/src/lib/apiRoutes.js` и `frontend/src/lib/api.js`.
8. Frontend thin-client switch: `ProcessPropertiesRegistryPage` должен уметь вызывать backend API для workspace/project scope (session scope может оставить client-side fallback или тоже перейти на API).
9. Tests: backend unit tests для aggregation logic и router integration.

### Out of scope

- Новые durable таблицы (данные вычисляются из существующего session JSON).
- Мутации BPMN XML, `bpmn_meta`, Product Actions.
- RAG/AI inference как source.
- Глобальный редизайн shell/header/sidebar.
- Dashboards.
- Merge / PR / deploy.

## API contract

### Endpoints

```text
POST /api/analysis/properties/registry/query
POST /api/analysis/properties/registry/export.csv
POST /api/analysis/properties/registry/export.xlsx
```

### Query input

```json
{
  "scope": "workspace | project | session",
  "workspace_id": "...",
  "project_id": "...",
  "session_id": "...",
  "project_ids": [],
  "session_ids": [],
  "filters": {
    "property_types": [],
    "groups": [],
    "sources": [],
    "processes": [],
    "completeness": "all | complete | incomplete"
  },
  "limit": 100,
  "offset": 0
}
```

### Row contract (minimum)

| Field | Source |
|-------|--------|
| `id` | generated `{session_id}::{element_id}::{property_kind}::{property_name}` |
| `scope` | inherited from query |
| `workspace_id` | from session source |
| `project_id` | from session source |
| `project_title` | from session source |
| `session_id` | from session source |
| `session_title` | from session source |
| `element_id` | BPMN element id |
| `element_title` | node title или element id fallback |
| `element_type` | bpmn:Task, bpmn:ServiceTask, etc. |
| `property_name` | имя свойства |
| `property_value` | значение или `—` |
| `property_type` | "Camunda property", "Camunda listener", etc. |
| `property_group` | "extensionProperties", "extensionListeners", etc. |
| `source` | session title или "Текущая сессия" |
| `source_kind` | "bpmn_meta.camunda_extensions_by_element_id" |
| `status` | "Полная" / "Неполная" |
| `updated_at` | from session `updated_at` |

### Source extraction rules

- Читать только существующие durable session данные.
- Источник v1: `session.bpmn_meta.camunda_extensions_by_element_id`.
- Для каждого элемента извлекать `extensionProperties` и `extensionListeners`.
- Не писать в BPMN XML.
- Не патчить `bpmn_meta`.
- Не мутировать Product Actions.
- Не использовать RAG inference.
- Source inclusion explicit: `source_state.source_contract_version = "v1"`.

## Response envelope

Мirror Product Actions Registry envelope:

```json
{
  "ok": true,
  "scope": "...",
  "rows": [...],
  "summary": { "projects_total": 0, "sessions_total": 0, "actions_total": 0, "complete": 0, "incomplete": 0 },
  "sessions": [...],
  "session_summary": { "projects_total": 0, "sessions_total": 0, "sessions_with_actions": 0, "sessions_without_actions": 0, "actions_total": 0, "complete": 0, "incomplete": 0 },
  "page": { "limit": 100, "offset": 0, "total": 0, "has_more": false },
  "filter_options": { "property_types": [], "groups": [], "sources": [], "processes": [], "completeness": ["all", "complete", "incomplete"] },
  "applied_filters": { ... },
  "metrics": { "total_rows": 0, "filtered_rows": 0, "page_rows": 0, "projects_total": 0, "sessions_total": 0, "complete": 0, "incomplete": 0, "limit": 100, "offset": 0, "has_more": false },
  "empty_state": { "kind": "...", "scope": "...", "message_key": "..." },
  "source_state": { "source": "...", "namespace": "...", "heavy_payload_excluded": true, "mutation_allowed": false, "session_summary_source": "...", "sessions_scanned": 0, "actions_scanned": 0 }
}
```

## Execution split

### SINGLE_EXECUTOR_MODE

Это backend-only/API-contract контур. Параллельный split не требуется.

- **Agent 2 / Executor Part 1**: вся backend реализация + тесты + минимальный frontend wiring (apiRoutes, api client, page API integration).
- **Agent 3 / Executor Part 2**: shell-only merge / no-LLM handoff. Agent 3 не запускает отдельный LLM; выполняет shell merge artifacts и готовит `EXEC_REPORT.md` к review.

## Branch hygiene guard

- Новая ветка от `origin/main`.
- Имя ветки: `feature/process-properties-registry-backend-source-truth-v1`.
- Не смешивать с `feature/product-actions-registry-backend-contract-fields-v1`.
- Если в worktree есть unrelated изменения — `BLOCKED` до изоляции.

## Strict non-goals

- No backend schema migration.
- No new durable truth tables.
- No BPMN XML writes.
- No Product Actions mutation.
- No RAG runtime implementation.
- No AI auto-write.
- No full dashboards.
- No global shell/header/sidebar redesign.
- No fake data.
- No broad refactor.
- No merge/PR/deploy.

## Agent 4 gates

`REVIEW_PASS` только если:

- Backend endpoints отвечают на `POST /api/analysis/properties/registry/query`.
- CSV/XLSX export работают и возвращают корректные файлы.
- Response envelope содержит все обязательные поля.
- Row source = `bpmn_meta.camunda_extensions_by_element_id` только.
- No mutation: `PUT/PATCH/DELETE` отсутствуют в registry endpoints.
- No BPMN XML writes.
- No Product Actions mutation.
- Tests проходят.
- Source/runtime truth зафиксирован.
- Version/build-info обновлён или документирован.

No `REVIEW_PASS` если:
- Endpoints отсутствуют или 500.
- Fake rows / counts.
- Backend mutations out of scope.
- Only source/tests checked without curl/API proof.

## Required artifacts

- `EXECUTOR_PART_1_PROMPT.md`
- `EXECUTOR_PART_2_PROMPT.md`
- `REVIEWER_PROMPT.md`
- `RAG_PREFLIGHT_PLANNER.md`
- `OBSIDIAN_CONTEXT_USED.md`
- `GSD_CONTEXT_USED.md`
- `STATE.json`
- `AGENT_RUN_ID`
- `READY_FOR_EXECUTION`
