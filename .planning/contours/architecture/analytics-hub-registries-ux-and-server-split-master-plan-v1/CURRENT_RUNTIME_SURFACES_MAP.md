# Current Runtime Surfaces Map

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`  
Назначение: карта текущих UI/runtime surfaces вокруг Analytics Hub и registries.

## Навигационная карта

| Surface | URL-модель | Entry points | Close/back behavior | Evidence |
|---|---|---|---|---|
| App base | `/app` + workspace/project/session params | Top-level app shell / explorer / process stage | N/A | `processMapRouteModel.js` |
| Analytics Hub | `/app?surface=analytics&workspace=...&project=...&session=...` | Explorer workspace/project buttons; ProcessStage callbacks | `buildAnalyticsHubCloseUrl` удаляет `surface` и `registry_scope` | `ProcessAnalyticsHub.jsx`, `ProcessStage.jsx`, `WorkspaceExplorer.jsx` |
| Product Actions Registry | `/app?surface=product-actions-registry&registry_scope=...` | Hub module button; Process/Interview product actions entry; Explorer/project routes | If opened from Hub, close returns to Hub; otherwise close returns to base/project/session context | `ProductActionsRegistryPage.jsx`, `ProductActionsRegistryPanel.jsx`, `processMapRouteModel.js` |
| Legacy/modal Product Actions Registry | component prop `open=true` | Existing reusable panel path | Overlay dialog with `role=dialog` | `ProductActionsRegistryPanel` default export |

## Analytics Hub surface

Confirmed:
- Компонент: `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`.
- Test id page wrapper: `process-analytics-hub-page`.
- Рабочий module: `analytics-hub-module-registry` с кнопкой `analytics-hub-open-registry`.
- Placeholder modules: `analytics-hub-module-properties`, `analytics-hub-module-dashboards`, `analytics-hub-module-export`.
- Summary cards не используют backend metrics: значения `—`.

Derived behavior:
- Scope выбирается из наличия `sessionId` и `projectId`: `session`, `project`, иначе `workspace`.
- При открытии registry Hub передаёт `scope`, `workspaceId`, `projectId`, `sessionId`.

Hypothesis:
- Hub задуман как L1 analytics workspace, но пока фактически является navigation shell.

## Product Actions Registry surface

Confirmed:
- Dedicated page: `ProductActionsRegistryPage`.
- Main content: `ProductActionsRegistryContent`.
- Scope controls: workspace/project/session tabs.
- Read-only backend load runs on scope/context change through `apiQueryProductActionRegistry`.
- Export buttons call CSV/XLSX backend export endpoints.
- Bulk AI controls exist only for workspace/project scope and require explicit selection.
- Accepting AI suggestions mutates durable truth only through `acceptAiProductActions`.

Runtime states from source:
- Loading: `Загружаю read-only реестр…`, `Загружаю данные…`.
- Empty workspace without context: `Workspace будет выбран текущим контекстом приложения.`
- Empty project without context: `Выберите проект или откройте реестр из проекта.`
- Empty session without context: `Откройте сессию или выберите проект для preview.`
- Empty with valid scope: `В выбранном scope пока нет сессий с действиями с продуктом.`
- Populated: rows + metrics + filters + pagination + session summary table.

## Backend/API surface

| Endpoint | Current role |
|---|---|
| `POST /api/analysis/product-actions/registry/query` | Read-only registry rows/sessions/session_summary |
| `POST /api/analysis/product-actions/registry/export.csv` | CSV export from registry payload |
| `POST /api/analysis/product-actions/registry/export.xlsx` | XLSX export from registry payload |
| `POST /api/analysis/product-actions/suggest-bulk` | Bulk AI draft suggestions for selected sessions |
| `POST /api/sessions/{id}/analysis/product-actions/suggest` | Single-session AI suggestions |
| `POST /api/rag/product-actions/index` | Index selected/all durable product actions into RAG |
| `GET /api/rag/search` | RAG search |
| `POST /api/rag/index` | General RAG indexing |

## Serving-mode status

В этой части live serving mode не валидировался, потому что prompt требует source-truth reports и запрещает product implementation. Runtime map основан на текущем checkout source. Для merge/release gate нужен отдельный reviewer/runtime proof against served app.
