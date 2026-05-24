# ui/analytics-workspace-cleanup-and-registry-redesign-v1

> **Role:** Agent 1 / Planner  
> **Scope:** Frontend UI/UX completion + backend endpoint for Product Actions Registry redesign; Analytics Hub integration cleanup  
> **Contour:** `ui/analytics-workspace-cleanup-and-registry-redesign-v1`  
> **Date:** 2026-05-22  
> **Status:** READY_FOR_EXECUTION  
> **Run ID:** `20260522T121703Z-96444`

---

## Source / Runtime Truth

| Field | Value |
|-------|-------|
| Repo root | `/opt/processmap-test` |
| Branch | `uiux/registry-ui-spec-implementation-v1` |
| HEAD | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| origin/main | `5affb5ff0abce2735df1c34fe369a39fe9c354e3` |
| git status | `M frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`, `M registry/index.js`, `M frontend/src/lib/api.js`, `M frontend/src/lib/apiRoutes.js`, `M frontend/src/styles/tailwind.css`; many `??` registry sub-components |
| Runtime URL | `http://clearvestnic.ru:5180` |
| API base | `http://clearvestnic.ru:8088` |
| Build tool | Vite (`npm run build` in `frontend/`) |

---

## Exact Reproduction

### Route
- Analytics Hub: `/` then click **Аналитика** or navigate directly to `?surface=analytics-hub`
- Registry: from Hub click **Реестр действий**, or direct `?surface=product-actions-registry&scope=workspace`

### Current State
1. Analytics Hub (`ProcessAnalyticsHub.jsx`) renders three cards: Реестр действий, Реестр свойств, Дашборды.
2. Clicking "Открыть" on "Реестр действий" navigates to registry surface.
3. Registry page (`ProductActionsRegistryPage.jsx` → `ProductActionsRegistryPanel.jsx`) currently shows a mix of old and new UI:
   - New sub-components exist in `frontend/src/components/process/analysis/registry/` but are not fully wired.
   - Old code still renders alongside or instead of new components.
   - Backend POST `/api/analysis/product-actions/registry/query` already returns `filter_options`, `metrics`, `empty_state`, `source_state`.
   - Frontend added `apiGetProductActionsRegistryViewModel` calling `GET /api/analysis/product-actions/registry` which **does not exist** on backend.

### UI/UX Problem Evidence
- Registry still looks inconsistent with the approved spec (`.planning/templates/processmap_registry_ui_ux_spec.md`).
- Workspace scope renders a dashed-border debug notice.
- Summary pills are still card-like instead of compact metric bar.
- Filters are in a grid instead of horizontal toolbar.
- Empty state is fragmented.
- Table density and hover behavior do not match spec.
- No single white container wrapping all content.

---

## Source Map

### Primary target files (Agent 2 modifies)

| # | Path | Why important |
|---|------|---------------|
| 1 | `backend/app/routers/product_actions_registry.py` | Add `GET /api/analysis/product-actions/registry` endpoint returning `{view_model: {...}}` wrapping existing `_registry_payload`. ~5 lines. |
| 2 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Main registry UI. Replace old rendering with new sub-components. Remove dead code. ~300–500 lines net change. |
| 3 | `frontend/src/components/process/analysis/registry/RegistryLayout.jsx` | Currently trivial wrapper. Add single white container styles per spec. |
| 4 | `frontend/src/components/process/analysis/registry/RegistryHeader.jsx` | Already exists. Verify it matches spec (title, subtitle, export dropdown, close button). |
| 5 | `frontend/src/components/process/analysis/registry/ScopeTabs.jsx` | Render scope tabs per spec. |
| 6 | `frontend/src/components/process/analysis/registry/MetricsRow.jsx` | Render metrics as compact text row (no cards). |
| 7 | `frontend/src/components/process/analysis/registry/FiltersRow.jsx` | Render filters as horizontal toolbar with compact selects. |
| 8 | `frontend/src/components/process/analysis/registry/WarningRow.jsx` | Soft text row (no yellow banner). |
| 9 | `frontend/src/components/process/analysis/registry/AIControlsRow.jsx` | Purple controls above table, no gradient. |
| 10 | `frontend/src/components/process/analysis/registry/DataTable.jsx` | Dense table with status dots, hover `#FAFAFA`, no horizontal scroll unless needed. |
| 11 | `frontend/src/components/process/analysis/registry/SourceSection.jsx` | Source provenance list inside same white container. |
| 12 | `frontend/src/components/process/analysis/registry/EmptyState.jsx` | Centered honest empty state. |
| 13 | `frontend/src/components/process/analysis/registry/LoadingSkeleton.jsx` | Skeleton rows, no full-page spinner. |
| 14 | `frontend/src/styles/tailwind.css` | Add/modify registry CSS classes. No global changes. |
| 15 | `frontend/src/lib/api.js` | Fix `apiGetProductActionsRegistryViewModel` or remove if using POST query. Align response shape. |
| 16 | `frontend/src/lib/apiRoutes.js` | Keep or remove `productActionsRegistryViewModel` route. |

### Secondary files (modify with caution)

| # | Path | Why important |
|---|------|---------------|
| 17 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Thin wrapper. Ensure it passes correct props. |
| 18 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | Update tests for new component structure. Keep `data-testid` attributes stable. |
| 19 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` | Verify navigation back from registry works. No structural changes unless needed. |

### Reference files (read-only)

| # | Path | Why important |
|---|------|---------------|
| 20 | `frontend/src/app/processMapRouteModel.js` | URL builders. |
| 21 | `frontend/src/features/process/analysis/productActionsRegistryModel.js` | Pure logic — read if needed, do not change. |
| 22 | `.planning/templates/processmap_registry_ui_ux_spec.md` | Authoritative design spec. |

---

## UX Problem Statement

1. **Incomplete refactor** — new sub-components exist but `ProductActionsRegistryPanel.jsx` still renders old UI paths.
2. **Missing backend endpoint** — frontend references `GET /api/analysis/product-actions/registry` which returns 404.
3. **Visual noise persists** — dashed workspace notice, card-like metrics, grid filters, fragmented empty states.
4. **No single container** — content is not wrapped in one white surface as spec requires.
5. **Dark theme issues** — layered translucent backgrounds create mud.

---

## Target UX (summary from approved spec)

### A. Single white container
- One `RegistryLayout` wrapping ALL content: header, tabs, metrics, filters, warning, AI, table, source.
- Background `#FFFFFF`, radius 12px, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`.
- No nested cards inside.

### B. Header
- Title "Реестр действий с продуктом" 18/700 `#111827`.
- Subtitle explaining workspace-level analytics.
- Export dropdown (CSV/XLSX) in header only.
- "Вернуться" button if `page=true`.

### C. Scope tabs
- Horizontal text buttons: Workspace / Проект / Сессия.
- Active: `#111827` + underline 2px `#7C3AED`.
- Inactive: `#9CA3AF`.

### D. Metrics row
- Single text line: `2 сессий  152 строк  149 полных  3 неполных  152 после фильтров`.
- No cards, no backgrounds, no borders.
- Value 20/700, label 11/500 uppercase `#9CA3AF`.

### E. Filters row
- Horizontal toolbar, compact selects (min-width 110px, height 34px).
- "Сбросить фильтры" as text link.

### F. Warning row
- Soft text only. Icon `#F59E0B`, text `#B45309`. No yellow banner.

### G. AI controls row
- No gradient, no card. Purple chips + button.

### H. Table
- Dense, hover `#FAFAFA`, no row height change.
- Status badges: colored dot + text, no background.
- Columns: Продукт, Действие, Процесс/Шаг, Статус.

### I. Empty state
- Centered, icon, honest message, optional CTA.
- No fake data.

### J. Source section
- Inside same white container, separated by `#F3F4F6` line.
- List with dot indicators, no cards.

---

## Scope

### In scope
- Add backend `GET /api/analysis/product-actions/registry` endpoint (thin wrapper around existing `_registry_payload`).
- Complete frontend refactor of `ProductActionsRegistryPanel.jsx` to use new sub-components exclusively.
- Wire `RegistryLayout`, `RegistryHeader`, `ScopeTabs`, `MetricsRow`, `FiltersRow`, `WarningRow`, `AIControlsRow`, `DataTable`, `SourceSection`, `EmptyState`, `LoadingSkeleton`.
- Update CSS in `tailwind.css` for registry classes per spec.
- Fix or remove `apiGetProductActionsRegistryViewModel` to align with actual backend.
- Update tests.
- Ensure build passes.
- Ensure Analytics Hub → Registry → Back navigation works.

### Out of scope (Non-goals)
- No Properties Registry redesign.
- No new backend analytics APIs beyond the single GET wrapper.
- No schema/storage changes.
- No Product Actions AI logic changes.
- No RAG changes.
- No BPMN XML mutation.
- No global app redesign.
- No Explorer/TopBar global rewrite.
- No auth/org/project selection changes.
- No fake analytics data.
- No merge/deploy/PR.

---

## Agent 2 Execution Plan (Single-Lane)

1. Read this PLAN.md and `.planning/templates/processmap_registry_ui_ux_spec.md`.
2. In `backend/app/routers/product_actions_registry.py`:
   - Add `ProductActionsRegistryViewModelIn` Pydantic model (scope, workspace_id, project_id, session_id).
   - Add `@router.get("/api/analysis/product-actions/registry")` calling `_registry_payload` and returning `{"view_model": payload["data"]}`. Return 404 if scope invalid.
3. In `frontend/src/lib/api.js`:
   - Either fix `apiGetProductActionsRegistryViewModel` to use POST query (if GET endpoint not added), OR align it with the new GET response shape.
   - Ensure fallback to existing query endpoint works if GET is unavailable.
4. In `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`:
   - Remove all old rendering paths (dashed workspace notice, card-like pills, grid filters, fragmented empty states).
   - Import and wire all new sub-components.
   - Pass `view_model` data to each sub-component.
   - Preserve export functionality.
   - Preserve scope switching.
   - Preserve AI bulk suggest.
5. Update each new sub-component in `frontend/src/components/process/analysis/registry/` to render correctly with real data and match spec exactly.
6. Update `frontend/src/styles/tailwind.css` with new/modified registry styles.
7. Update `ProductActionsRegistryPanel.test.mjs`.
8. Run `npm run build` and verify no errors.
9. Run `npm run test` (or equivalent) and fix failures.
10. Write `EXEC_REPORT.md`.
11. Create `READY_FOR_REVIEW`.

---

## Agent 4 Review Plan

1. Read `PROCESSMAP_AGENT3_UI_REVIEW_SKILL.md` from Project Atlas (if available).
2. Open actual runtime via Playwright MCP or browser.
3. Navigate to Analytics Hub, then open Product Actions Registry.
4. Verify against spec:
   - Single white container.
   - No dashed workspace notice.
   - No card-like metrics.
   - Horizontal compact filters.
   - Soft warning row (no banner).
   - Purple AI row (no gradient).
   - Dense table with dot status badges.
   - Honest empty state when no data.
   - Source section inside same container.
   - Dark theme readability.
   - Light theme readability.
   - Navigation back to Hub works.
   - Export works.
   - Scope switching works.
   - No console/network errors.
5. Check forbidden patterns:
   - No gradients.
   - No dotted borders.
   - No internal shadows on rows.
   - No colored metric cards.
   - No fake data.
   - No duplicate export buttons.
   - No vertical filter stack on desktop.
6. Render verdict (`REVIEW_PASS`, `CHANGES_REQUESTED`, or `REVIEW_BLOCKED`).
7. Create correct marker files.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Backend GET endpoint conflicts with existing routes | Use distinct path; FastAPI handles method dispatch. |
| Frontend view-model shape mismatch | Align frontend parser with backend response; add safe fallbacks. |
| Removing old code breaks existing tests | Update tests; keep `data-testid` stable. |
| Dark theme contrast regressions | Use CSS vars; avoid hardcoded colors. |
| Playwright unavailable for Agent 4 review | Agent 4 uses runtime proof checklist + source review; if Playwright blocked, verdict is `REVIEW_BLOCKED`. |
| Working tree is dirty with unrelated changes | Agent 2 must only modify files in source map; document any accidental overlaps. |

---

## Validation

- Build passes (`npm run build`).
- Tests pass (`npm run test` or `npm run test:unit`).
- No console errors on registry screen.
- No network 404s for registry API.
- Backend GET endpoint returns valid JSON with `view_model`.
- Empty state shown when no data.
- Filters functional after redesign.
- Export buttons still functional.
- Scope switching still functional.
- Back to Hub navigation works.

---

## Gates

- [x] **Gate 1** — GSD discipline recorded
- [x] **Gate 2** — Source/runtime truth captured
- [x] **Gate 3** — Exact reproduction captured
- [x] **Gate 4** — Source map captured
- [x] **Gate 5** — UX target state defined
- [x] **Gate 6** — Non-goals locked
- [x] **Gate 7** — Executor prompt ready
- [x] **Gate 8** — Reviewer prompt ready
- [x] **Gate 9** — READY_FOR_EXECUTION marker created

---

> **Owner:** Agent 1 / Planner  
> **Next:** Agent 2 / Executor
