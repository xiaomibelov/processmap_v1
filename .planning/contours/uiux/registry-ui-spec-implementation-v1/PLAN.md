# PLAN — Product Actions Registry UI Spec Implementation

**Contour:** `uiux/registry-ui-spec-implementation-v1`  
**Run ID:** `20260522T072413Z-agent1-plan`  
**Planner:** Agent 1  
**Status:** Ready for execution

---

## 1. Objective
Implement the Product Actions Registry UI exactly per `UI_SPEC.md` (`.planning/contours/uiux/registry-ui-spec-implementation-v1/UI_SPEC.md`).

The current implementation has an OLD layout (nested cards, gradients, internal shadows, hardcoded filters, monolithic 1205-line panel). The target is a clean, single-container, backend-driven view_model thin client.

---

## 2. Current State (Evidence)

| Plane | Fact |
|---|---|
| Code | Branch `uiux/registry-ui-spec-implementation-v1`, HEAD `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| Frontend | `ProductActionsRegistryPanel.jsx` (1205 lines, monolithic). Components in `frontend/src/components/process/analysis/registry/` exist but follow OLD spec |
| Backend | `POST /api/analysis/product-actions/registry/query` returns `{ok, scope, rows, summary, sessions, session_summary, page}`. No `GET /api/analysis/product-actions/registry` |
| CSS | Uses `--analysis-*` variables with gradients and card borders. No UI_SPEC.md design tokens |
| Tests | Node native `node --test` for frontend; `unittest` for backend. Both need new tests |
| Build | `vite build` (frontend), `pytest` (backend) |

---

## 3. Target State

### Frontend
- Single `RegistryLayout` white container (radius 12px, padding 24px, shadow `0 1px 3px rgba(0,0,0,0.04)`)
- `RegistryHeader`: "Реестр действий" + subtitle + [?] help icon + Export dropdown (CSV/XLSX)
- `ScopeTabs`: [Все действия] [По продуктам] [По сессиям] — backend-driven `view_model.scope_tabs`
- `MetricsRow`: Всего | С продуктом | Без продукта | Заполненность % (colored)
- `FiltersRow`: horizontal, backend-driven `view_model.filter_options`, no hardcoding
- `WarningRow`: conditional soft text + orange icon
- `AIControlsRow`: icon + text + ghost button "Показать рекомендации"
- `DataTable`: columns Действие | Продукт | Сессия | Источник | Статус | Дата. Status dots. Row height 48px, hover `#FAFAFA`
- `SourceSection`: "Источники данных" with indicators (no cards, no dotted border)
- `EmptyState` + `LoadingSkeleton` per spec
- Thin client: consume `view_model` strictly, no frontend data fabrication

### Backend
- New `GET /api/analysis/product-actions/registry` endpoint
- Response wraps everything in `view_model` matching UI_SPEC.md §7.1 contract exactly
- Keep existing `POST /api/analysis/product-actions/registry/query` for backward compatibility

### Tests
- Frontend: all new components render, empty state shows when `items` empty, filters apply, loading skeleton renders
- Backend: GET endpoint returns correct view_model shape, empty state populated when no rows, metrics calculated correctly, filter options backend-driven

### Runtime Proof
- `http://clearvestnic.ru:5180` serves the updated registry page
- Build passes with 0 errors
- All tests pass

---

## 4. Execution Split

**Mode:** `PARALLEL_REQUIRED`

Agent 2 (Executor Part 1) and Agent 3 (Executor Part 2) run independently. The contract between them is the `view_model` shape defined in `UI_SPEC.md` §7.1. Both agents must read `UI_SPEC.md` before starting.

| Agent | Scope | Key Deliverables |
|---|---|---|
| **Agent 2** | Frontend components + API client + CSS + frontend tests | New registry component suite, refactored Panel/Page, updated `api.js`/`apiRoutes.js`, CSS tokens, `.test.mjs` files |
| **Agent 3** | Backend endpoint + view_model builder + backend tests + runtime proof | New GET endpoint in `product_actions_registry.py`, backend tests, runtime verification on `:5180` |

**Merge / Finalization:** Agent 3 merges both parts into `EXEC_REPORT.md` and hands off to Agent 4.

---

## 5. Acceptance Criteria

1. **Layout:** Only ONE white container per page. No nested card chaos. No gradients. No internal shadows on rows.
2. **Backend-driven:** `filter_options`, `scope_tabs`, `metrics`, `items`, `source_state` all come from backend `view_model`.
3. **Honest empty state:** When `items` is empty, backend MUST send `empty_state`. Frontend MUST render it, NOT fake rows or "0 из 0" metrics.
4. **Status badges:** "Полная" (green dot), "Неполная" (orange dot), "Не определена" (gray). No colored backgrounds.
5. **Export:** Single export dropdown in header only. CSV/XLSX options.
6. **Build:** `cd frontend && npm run build` exits 0.
7. **Tests:** `cd frontend && npm test` exits 0. `cd backend && python -m pytest tests/test_product_actions_registry_api.py -v` exits 0.
8. **Runtime:** `:5180` registry page renders correctly with new layout.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| New CSS tokens conflict with dark mode | Use the existing token system; map UI_SPEC.md hex values to the project's HSL variables where possible, or add new scoped variables under `.registryLayout` |
| Backend GET endpoint performance | Reuse existing `_registry_payload` logic; only reshape output |
| Monolithic panel refactor breaks existing flows | Keep `ProductActionsRegistryContent` as the orchestrator but delegate rendering to new sub-components; preserve existing callback props (`onClose`, `onOpenProject`, `onOpenSession`) |
| Tests fail due to string-level assertions in existing `.test.mjs` | Update existing string-based tests to match new component text; add new structural tests |

---

## 7. File Inventory

### To Create (Frontend)
- `frontend/src/components/process/analysis/registry/RegistryLayout.jsx`
- `frontend/src/components/process/analysis/registry/RegistryHeader.jsx`
- `frontend/src/components/process/analysis/registry/ScopeTabs.jsx`
- `frontend/src/components/process/analysis/registry/MetricsRow.jsx`
- `frontend/src/components/process/analysis/registry/FiltersRow.jsx`
- `frontend/src/components/process/analysis/registry/WarningRow.jsx`
- `frontend/src/components/process/analysis/registry/AIControlsRow.jsx`
- `frontend/src/components/process/analysis/registry/DataTable.jsx`
- `frontend/src/components/process/analysis/registry/SourceSection.jsx`
- `frontend/src/components/process/analysis/registry/EmptyState.jsx`
- `frontend/src/components/process/analysis/registry/LoadingSkeleton.jsx`
- `frontend/src/components/process/analysis/registry/RegistryPage.test.mjs`

### To Modify (Frontend)
- `frontend/src/components/process/analysis/registry/index.js`
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` (major refactor)
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/lib/apiRoutes.js`
- `frontend/src/styles/tailwind.css` (append new registry UI spec styles)
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` (update)

### To Modify (Backend)
- `backend/app/routers/product_actions_registry.py`
- `backend/tests/test_product_actions_registry_api.py`

---

*End of PLAN.md*
