# Executor Part 1 Prompt

You are Agent 2 / Executor for ProcessMap.

## Identity

- Contour: `feature/process-properties-registry-backend-source-truth-v1`
- Run ID: `20260520T193813Z-39871`
- Scope: backend implementation + minimal frontend API wiring
- Mode: `SINGLE_EXECUTOR_MODE` — this is the only substantive executor lane.

## Source truth capture (do first)

Before writing any code, record:

```bash
cd /opt/processmap-test
pwd
git remote -v
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

If current branch is not `feature/process-properties-registry-backend-source-truth-v1` or HEAD is not based on `origin/main`, create a new clean branch:

```bash
git checkout -b feature/process-properties-registry-backend-source-truth-v1 origin/main
```

Save this proof in `EXEC_PART_1_REPORT.md` under "Source truth".

## Implementation tasks

### 1. Backend router: `backend/app/routers/process_properties_registry.py`

Create a new FastAPI router following the pattern in `backend/app/routers/product_actions_registry.py`.

Required endpoints:

```python
@router.post("/api/analysis/properties/registry/query")
def query_process_properties_registry(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Dict[str, Any]:
    ...

@router.post("/api/analysis/properties/registry/export.csv")
def export_process_properties_registry_csv(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Response:
    ...

@router.post("/api/analysis/properties/registry/export.xlsx")
def export_process_properties_registry_xlsx(inp: ProcessPropertiesRegistryQueryIn, request: Request) -> Response:
    ...
```

Input model requirements:
- `scope`: str, one of `"workspace"`, `"project"`, `"session"`
- `workspace_id`: Optional[str]
- `project_id`: Optional[str]
- `session_id`: Optional[str]
- `project_ids`: List[str] = []
- `session_ids`: List[str] = []
- `filters`: ProcessPropertiesRegistryFilters
  - `property_types`: List[str] = []
  - `groups`: List[str] = []
  - `sources`: List[str] = []
  - `processes`: List[str] = []
  - `completeness`: str = "all"
- `limit`: int = 100
- `offset`: int = 0

Scope validation, auth, and org membership checks must mirror `product_actions_registry.py` exactly.

### 2. Storage read helpers in `backend/app/storage.py`

Add functions (or reuse existing) to:

1. List session sources for given scope, exactly like `list_product_action_registry_sources`.
2. Extract Camunda extension properties from `session.bpmn_meta.camunda_extensions_by_element_id` for each session.
3. Build registry rows with all required fields (see PLAN.md Row contract).

Row extraction must be read-only. Do not write to:
- BPMN XML
- `bpmn_meta`
- Product Actions durable data
- Any new DB table

### 3. Response envelope

Return the exact envelope shape:

```json
{
  "ok": true,
  "scope": "...",
  "rows": [...],
  "summary": {...},
  "sessions": [...],
  "session_summary": {...},
  "page": {"limit": ..., "offset": ..., "total": ..., "has_more": ...},
  "filter_options": {...},
  "applied_filters": {...},
  "metrics": {...},
  "empty_state": {"kind": "...", "scope": "...", "message_key": "..."},
  "source_state": {"source": "process_properties_registry_backend", "namespace": "/api/analysis/properties/registry", "heavy_payload_excluded": true, "mutation_allowed": false, "session_summary_source": "...", "sessions_scanned": 0, "actions_scanned": 0}
}
```

### 4. Export parity

CSV and XLSX must:
- Use the same `_registry_payload` logic as query (same filters, same sort).
- Include all row fields.
- Use `;` delimiter and UTF-8 BOM for CSV.
- Use inline-XML XLSX generation (no openpyxl), same pattern as `product_actions_registry.py`.
- Filename: `process-properties-{scope}-{YYYYMMDD-HHMM}.{csv|xlsx}`.

### 5. Router wiring

Register the router in the app factory. Ensure tags include `["process-properties-registry"]`.

### 6. Frontend API routes

In `frontend/src/lib/apiRoutes.js`, add under `analysis:`:

```js
processPropertiesRegistryQuery: () => "/api/analysis/properties/registry/query",
processPropertiesRegistryExportCsv: () => "/api/analysis/properties/registry/export.csv",
processPropertiesRegistryExportXlsx: () => "/api/analysis/properties/registry/export.xlsx",
```

In `frontend/src/lib/api.js`, add:
- `queryProcessPropertiesRegistry(payload)`
- `exportProcessPropertiesRegistryCsv(payload)`
- `exportProcessPropertiesRegistryXlsx(payload)`

Follow the exact pattern used for `productActionsRegistryQuery` and friends.

### 7. Frontend page API integration

Update `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` (or create a wrapper hook) so that:

- `workspace` and `project` scopes call the backend API via `queryProcessPropertiesRegistry`.
- `session` scope may keep the existing client-side `buildCamundaRows` fallback OR also call the API. Prefer API if it returns data; fallback to client-side if backend returns empty.
- The page must show `sourceTruth` text indicating whether rows come from backend or foundation mode.
- Preserve all existing UI: header, subtitle, scope selector, metrics, filters, table, empty state, footer.

### 8. Tests

Add backend tests:
- `backend/tests/test_process_properties_registry.py` or similar location.
- Test scope validation (workspace requires workspace_id, etc.).
- Test filter logic (completeness, property_type, group, source, process).
- Test pagination.
- Test CSV/XLSX export response headers and content.
- Test read-only: verify no DB writes occur during query.

### 9. Version/build-info

If the project has a build-info or version file, update it or document in `EXEC_PART_1_REPORT.md` why no update is needed.

## Blockers

If any of the following are true, write `EXEC_PART_1_BLOCKED.md` and stop:

- Cannot create a clean branch from `origin/main`.
- Existing storage.py structure is incompatible and requires broad refactor.
- Frontend page `ProcessPropertiesRegistryPage.jsx` is missing or unrecoverable.
- Scope requires new durable DB table (should not; we read session JSON only).

## Deliverables

1. `EXEC_PART_1_REPORT.md` with:
   - Source truth (pwd, branch, HEAD, origin/main, status)
   - Implementation checklist
   - Files changed
   - Test results
   - API contract verification (curl or test output)
2. All product code changes committed to the feature branch.
3. `WORKER_2_DONE` marker file in the contour directory.

## Rules

- Do not write planning documents.
- Do not merge, deploy, or open a PR.
- Do not print secrets.
- Do not mutate BPMN XML, `bpmn_meta`, or Product Actions durable data.
- Do not use fake data.
- Keep changes bounded to the contour scope.
