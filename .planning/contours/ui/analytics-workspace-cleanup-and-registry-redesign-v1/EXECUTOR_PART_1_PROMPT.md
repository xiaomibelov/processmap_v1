# Agent 2 / Executor — Part 1

## Identity
- You are Agent 2 / Executor for ProcessMap.
- Contour: `ui/analytics-workspace-cleanup-and-registry-redesign-v1`
- Run ID: `20260522T121703Z-96444`
- Branch: `uiux/registry-ui-spec-implementation-v1`

## Contract
- Read `PLAN.md` in this directory first.
- Read `.planning/templates/processmap_registry_ui_ux_spec.md` for the authoritative design spec.
- Do NOT modify files outside the source map in PLAN.md.
- Do NOT write fake data.
- Do NOT merge, deploy, or open a PR.
- Keep `data-testid` attributes stable.
- Write `EXEC_REPORT.md` when done.
- Create `READY_FOR_REVIEW` when done.

---

## Task

Complete the Product Actions Registry redesign and fix the analytics workspace integration.

### 1. Backend — Add GET view-model endpoint

File: `backend/app/routers/product_actions_registry.py`

The frontend already calls `GET /api/analysis/product-actions/registry` via `apiGetProductActionsRegistryViewModel`, but this endpoint does not exist.

Add it:
```python
class ProductActionsRegistryViewModelIn(BaseModel):
    scope: str = "workspace"
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None

@router.get("/api/analysis/product-actions/registry")
def get_product_actions_registry_view_model(
    scope: str = "workspace",
    workspace_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    request: Request = None,
):
    from ..schemas.product_actions_registry import ProductActionsRegistryQueryIn
    inp = ProductActionsRegistryQueryIn(
        scope=scope,
        workspace_id=workspace_id,
        project_id=project_id,
        session_id=session_id,
    )
    payload = _registry_payload(inp, request, paginate=True)
    return {"view_model": payload.get("data") or {}}
```

**Important:** The existing `ProductActionsRegistryQueryIn` schema may be in `backend/app/schemas/product_actions_registry.py`. Import it. If it only accepts POST body fields, create a minimal inline model or query params.

### 2. Frontend — Complete component refactor

File: `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`

**Remove old rendering paths:**
- Remove `SummaryPill` component and all usage.
- Remove `productActionsRegistryWorkspaceNotice` rendering (the dashed debug block).
- Remove old grid-based filter rendering.
- Remove old table rendering if it duplicates `DataTable`.
- Consolidate empty states into `EmptyState` component.

**Wire new sub-components:**
The new sub-components already exist in `frontend/src/components/process/analysis/registry/`:
- `RegistryLayout` — wrap everything.
- `RegistryHeader` — title, subtitle, export, close.
- `ScopeTabs` — workspace/project/session.
- `MetricsRow` — compact text metrics.
- `FiltersRow` — horizontal toolbar.
- `WarningRow` — soft text warning.
- `AIControlsRow` — purple chips + button.
- `DataTable` — dense table.
- `SourceSection` — source list.
- `EmptyState` — honest empty state.
- `LoadingSkeleton` — skeleton loading.

**Data flow:**
- Use the existing POST query response OR the new GET view-model.
- The POST response already includes `filter_options`, `metrics`, `empty_state`, `source_state` inside `data`.
- If using GET, response shape is `{view_model: {...}}`.
- Map backend rows to the format each sub-component expects.

**Preserve functionality:**
- Export CSV/XLSX must still work.
- Scope switching must still work.
- AI bulk suggest must still work.
- `onClose` / back to Analytics Hub must still work.

### 3. Frontend — Fix or align API client

File: `frontend/src/lib/api.js`

`apiGetProductActionsRegistryViewModel` currently calls `apiRoutes.analysis.productActionsRegistryViewModel()` which resolves to `GET /api/analysis/product-actions/registry`.

**Option A (preferred):** Keep it and ensure it works with the new backend endpoint.
**Option B:** Remove it and use `apiQueryProductActionRegistry` which already returns the needed fields.

If keeping Option A, ensure the response parser expects `data.view_model`.

File: `frontend/src/lib/apiRoutes.js`
- Keep `productActionsRegistryViewModel` route if using Option A; remove if Option B.

### 4. Frontend — Update sub-components

For each sub-component in `frontend/src/components/process/analysis/registry/`, verify it renders correctly with real data and matches the spec:

**RegistryLayout.jsx:**
- Must be a single white container: bg `#FFFFFF`, radius 12px, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, padding 24px.

**RegistryHeader.jsx:**
- Title 18/700 `#111827`.
- Subtitle 13/400 `#6B7280`.
- Export dropdown (CSV/XLSX) only in header.
- "Вернуться" button when `page=true`.

**ScopeTabs.jsx:**
- Horizontal text buttons.
- Active: `#111827` + underline 2px `#7C3AED`.
- Inactive: `#9CA3AF`.

**MetricsRow.jsx:**
- Single horizontal flex row, gap 32px.
- No cards, no backgrounds.
- Value 20/700 `#111827`.
- Label 11/500 uppercase `#9CA3AF`.
- "Неполных" value in `#F59E0B`.

**FiltersRow.jsx:**
- Horizontal flex row.
- Compact selects: min-width 110px, height 34px, border `#E5E7EB`, radius 6px.
- "Сбросить фильтры" text link.

**WarningRow.jsx:**
- No yellow banner.
- Icon `#F59E0B`, text `#B45309`.

**AIControlsRow.jsx:**
- No gradient, no card background.
- Purple chips and button.

**DataTable.jsx:**
- Header: 11/600 uppercase `#6B7280`, letter-spacing 0.5px.
- Row height 48px, hover `#FAFAFA`.
- Status: colored dot + text, no background.
- Empty cell: `"—"` muted.

**SourceSection.jsx:**
- Title "Источники данных".
- List with dot indicators.
- No dotted border, no card wrapper.

**EmptyState.jsx:**
- Centered, icon 48px muted.
- Title + description.
- Optional CTA.

**LoadingSkeleton.jsx:**
- 5 skeleton rows.
- No full-page spinner.

### 5. CSS

File: `frontend/src/styles/tailwind.css`

- Add/modify registry-specific classes only.
- Do NOT change global AppShell, BPMN, or sidebar styles.
- Use CSS custom properties where possible.
- Ensure dark theme works.

### 6. Tests

File: `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs`

- Update for new component structure.
- Keep stable `data-testid` values.
- Add tests for empty state and scope switching if missing.

### 7. Build

```bash
cd /opt/processmap-test/frontend && npm run build
```

Fix any errors before marking done.

---

## Forbidden Patterns (from spec)

- NO gradient backgrounds.
- NO dotted borders.
- NO internal shadows on rows/cards.
- NO colored metric cards.
- NO fake data / fake counts.
- NO marketing animations (stagger, bounce).
- NO aggressive warning banners.
- NO duplicate export buttons.
- NO vertical filter stacks on desktop.
- NO fake table headers with empty body.
- NO AI controls inside source section.
- NO frontend hardcoding filter lists.

---

## Deliverables

1. Modified backend router with GET endpoint.
2. Refactored `ProductActionsRegistryPanel.jsx` using new sub-components.
3. Updated sub-components matching spec.
4. Updated CSS.
5. Updated tests.
6. Clean build.
7. `EXEC_REPORT.md` in this contour directory.
8. `READY_FOR_REVIEW` marker file.
