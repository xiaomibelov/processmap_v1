# EXECUTOR PART 1 — Frontend Implementation

**Agent:** Agent 2  
**Contour:** `uiux/registry-ui-spec-implementation-v1`  
**Run ID:** `20260522T072413Z-agent1-plan`  
**Scope:** All frontend components, API client updates, CSS, frontend tests  
**Depends on:** None (runs in parallel with Part 2 against the `view_model` contract in UI_SPEC.md)

---

## 0. CRITICAL: Read UI_SPEC.md First

Before writing any code, read `.planning/contours/uiux/registry-ui-spec-implementation-v1/UI_SPEC.md` in full. All visual rules, backend contracts, and anti-patterns are defined there.

---

## 1. Current State (Read-Only Context)

Existing files you will modify or replace:

- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — 1205-line monolith. Keep the data-loading orchestration (`ProductActionsRegistryContent`) but REPLACE all rendering with new sub-components.
- `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` — thin wrapper around `ProductActionsRegistryContent`.
- `frontend/src/components/process/analysis/registry/index.js` — exports old components.
- `frontend/src/lib/api.js` — has `apiQueryProductActionRegistry` (POST) and `apiGetSessionAnalysisViewModel` (GET).
- `frontend/src/lib/apiRoutes.js` — has `analysis.productActionsRegistryQuery()`.
- `frontend/src/styles/tailwind.css` — uses `--analysis-*` variables with gradients/cards.
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` — string-based tests.

The current backend endpoints (which you will keep calling during transition):
- `POST /api/analysis/product-actions/registry/query`
- `GET /api/sessions/{session_id}/analysis/view-model`

Agent 3 is building a NEW endpoint: `GET /api/analysis/product-actions/registry` returning `{view_model: {...}}`. You must ADD a new API function for this endpoint and update the Panel to consume `view_model`.

---

## 2. API Client Updates

### 2.1 Add new route in `frontend/src/lib/apiRoutes.js`
```js
productActionsRegistryViewModel: () => "/api/analysis/product-actions/registry",
```

### 2.2 Add new API function in `frontend/src/lib/api.js`
```js
export async function apiGetProductActionsRegistryViewModel(params = {}) {
  const query = new URLSearchParams();
  const scope = String(params.scope || "workspace").trim();
  query.set("scope", scope);
  if (params.workspace_id) query.set("workspace_id", String(params.workspace_id));
  if (params.project_id) query.set("project_id", String(params.project_id));
  if (params.session_id) query.set("session_id", String(params.session_id));
  // pass through any filter params as query string
  const url = `${apiRoutes.analysis.productActionsRegistryViewModel()}?${query.toString()}`;
  const r = okOrError(await request(url));
  if (!r.ok) return r;
  const data = r.data && typeof r.data === "object" ? r.data : {};
  return { ok: true, status: r.status, view_model: data.view_model || {} };
}
```

Keep the old `apiQueryProductActionRegistry` and `apiGetSessionAnalysisViewModel` for backward compatibility during transition, but the Panel should prefer the new endpoint when available.

---

## 3. New Components to Create

Create all components in `frontend/src/components/process/analysis/registry/`. Use functional React components. No external libraries beyond React.

### Design Token Mapping
The project uses Tailwind + custom CSS. The spec uses hex colors. **Map as follows** (add these as CSS custom properties scoped under `.registryLayout` in `tailwind.css`):

```css
.registryLayout {
  --registry-bg-canvas: #F5F5F5;
  --registry-bg-surface: #FFFFFF;
  --registry-text-primary: #1A1A1A;
  --registry-text-secondary: #6B7280;
  --registry-text-muted: #9CA3AF;
  --registry-border-light: #E5E7EB;
  --registry-border-hover: #D1D5DB;
  --registry-purple-primary: #7C3AED;
  --registry-purple-hover: #6D28D9;
  --registry-green-complete: #10B981;
  --registry-orange-partial: #F59E0B;
  --registry-red-error: #EF4444;
  --registry-blue-link: #2563EB;
}
```

Use `font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

### 3.1 RegistryLayout
- Single white container.
- `background: var(--registry-bg-surface)`
- `border-radius: 12px`
- `padding: 24px`
- `box-shadow: 0 1px 3px rgba(0,0,0,0.04)`
- No nested cards inside.

### 3.2 RegistryHeader
- Title: "Реестр действий" — `font-size: 20px`, `font-weight: 600`, `color: var(--registry-text-primary)`
- Subtitle: "Действия с продуктами из сессий и проектов" — `font-size: 13px`, `color: var(--registry-text-secondary)`
- Help icon: 32px circle button, `color: var(--registry-text-secondary)`, hover `var(--registry-text-primary)`. Tooltip on hover (300ms delay, max-width 280px, white bg, radius 8px, shadow `0 2px 8px rgba(0,0,0,0.1)`).
- Export dropdown: button with download icon + "Export" label. Dropdown options: CSV, XLSX. **Only here, never duplicated.**

### 3.3 ScopeTabs
- Horizontal row of text buttons, `font-size: 14px`.
- Active: `color: var(--registry-text-primary)`, `border-bottom: 2px solid var(--registry-purple-primary)`
- Inactive: `color: var(--registry-text-secondary)`, `border-bottom: 2px solid transparent`
- Hover: `color: var(--registry-text-primary)`
- Height: 40px
- Tabs from `view_model.scope_tabs`: `[{id, label, active, count?}]`. If `count` provided, show as `{label} ({count})`.

### 3.4 MetricsRow
- **NO cards, NO backgrounds, NO borders, NO shadows on individual metrics.**
- Horizontal flex row, `gap: 32px` between blocks.
- Each block: vertical stack.
  - Value: `font-size: 28px`, `font-weight: 700`, `color: var(--registry-text-primary)`
  - Label: `font-size: 12px`, `font-weight: 500`, `color: var(--registry-text-secondary)`
- Metrics from `view_model.metrics`: `[{label, value, unit?, status?}]`
- "Заполненность" value uses `var(--registry-green-complete)` if ≥ 80%, `var(--registry-orange-partial)` if < 80%.
- If value is `null` or missing — show `"—"` (em-dash).

### 3.5 FiltersRow
- **Single horizontal row.** Never stack vertically unless screen < 768px.
- Each filter: dropdown/select.
  - Height: 36px
  - Border: 1px `var(--registry-border-light)`, radius 6px
  - Background: white
  - Label: `font-size: 12px`, `color: var(--registry-text-secondary)`
  - Chevron icon on right
- Gap between filters: 12px
- "Сбросить фильтры" — text button, `font-size: 12px`, `color: var(--registry-purple-primary)`, appears only when filters are active.
- Data from `view_model.filter_options`: `[{id, label, options[], selected?}]`. Render what backend provides. **Do NOT hardcode filter lists.**

### 3.6 WarningRow
- Conditional. Hidden if `view_model.warnings` empty.
- Layout: full-width text block, `padding: 12px 0`.
- Icon: warning triangle (16px), `color: var(--registry-orange-partial)`.
- Text: `font-size: 13px`, `color: var(--registry-text-secondary)`.
- Multiple warnings: stack vertically with `gap: 8px`.

### 3.7 AIControlsRow
- Conditional. Hidden if `view_model.ai_suggestions.count === 0`.
- Positioned above table, separated by 1px `var(--registry-border-light)` line from filters.
- Icon: 16px sparkles/robot icon, `color: var(--registry-purple-primary)`.
- Text: `font-size: 13px`, `color: var(--registry-text-secondary)`.
- Button: "Показать рекомендации" — ghost style (no fill, no border), `color: var(--registry-purple-primary)`, hover `var(--registry-purple-hover)`.

### 3.8 DataTable
- Header row: `font-size: 12px`, `font-weight: 500`, `color: var(--registry-text-secondary)`, uppercase, `letter-spacing: 0.5px`.
  - Height: 40px
  - Border-bottom: 1px `var(--registry-border-light)`
  - Transparent background
- Row height: 48px
- Row separator: 1px `var(--registry-border-light)` (full bleed)
- Row hover: `background: #FAFAFA`
- Cell padding: `12px 16px`
- Text: `font-size: 14px`, `color: var(--registry-text-primary)`
- Empty cell: `"—"`, `color: var(--registry-text-muted)`

**Columns (from `view_model.items`):**
| Column | Width | Align | Notes |
|---|---|---|---|
| Действие | flex-grow 2 | left | May wrap 2 lines, clamp with ellipsis if > 2 |
| Продукт | flex-grow 1 | left | If null — show "—" muted |
| Сессия | 120px | left | Monospace-ish if ID format |
| Источник | 140px | left | Badge style if needed |
| Статус | 120px | center | Badge with color dot |
| Дата | 100px | right | `font-size: 13px`, `color: var(--registry-text-secondary)` |

**Status Badges:**
- "Полная" — `font-size: 12px`, `color: var(--registry-green-complete)`, small dot (8px circle) left of text.
- "Неполная" — `font-size: 12px`, `color: var(--registry-orange-partial)`, same dot.
- "Не определена" — `font-size: 12px`, `color: var(--registry-text-muted)`.
- **No colored backgrounds on status cells.**

**Pagination (if `view_model.pagination` provided):**
- Below table, right-aligned.
- Minimal text buttons "← Назад" / "Вперед →" + counter "1 – 50 из 1 247".
- `font-size: 12px`, `color: var(--registry-text-secondary)`. Active page: `var(--registry-text-primary)`.

### 3.9 SourceSection
- Title: "Источники данных" — `font-size: 16px`, `font-weight: 600`
- Separator: 1px `var(--registry-border-light)` above, `margin-top: 24px`.
- Layout: table-like list, NOT cards.
- Each row: 40px height, flex row.
  - Indicator: 8px circle. Filled = active (`var(--registry-green-complete)`), empty/outline = inactive (`var(--registry-text-muted)`).
  - Source name: `font-size: 14px`, `color: var(--registry-text-primary)`
  - Count: `font-size: 13px`, `color: var(--registry-text-secondary)` (or "недоступно" / "не подключен")
  - Action: text link, `font-size: 12px`, `color: var(--registry-blue-link)` or `var(--registry-purple-primary)`
- **NO dotted border. NO card wrapper.**

### 3.10 EmptyState
- Centered vertically and horizontally in table area (min-height 300px).
- Icon: 48px, `color: var(--registry-text-muted)`, stroke-only (no fill).
- Title: `font-size: 16px`, `font-weight: 600`, `color: var(--registry-text-primary)`.
- Description: `font-size: 14px`, `color: var(--registry-text-secondary)`, max-width 480px, centered.
- CTA button (optional): primary button only if `empty_state.action` provided.
- **NO fake rows. NO fake counts.** If empty, metrics row shows "—" or is hidden.

### 3.11 LoadingSkeleton
- **Skeletons, not spinners.**
- Table header visible but text replaced by gray bars (4px radius, `#E5E7EB`).
- 5 skeleton rows, each 48px height.
- Metrics row: 4 skeleton blocks (80px wide each).
- Filters: inputs disabled with `#F5F5F5` background.
- **No full-page overlay. No blocking modal.**

---

## 4. Refactor ProductActionsRegistryPanel

`ProductActionsRegistryPanel.jsx` currently does everything in one file. Refactor it so that `ProductActionsRegistryContent` becomes a thin orchestrator:

1. Load data via the new `apiGetProductActionsRegistryViewModel` endpoint.
2. Maintain local state for `scope`, `filters`, `loading`, `error`.
3. Render:
   ```jsx
   <RegistryLayout>
     <RegistryHeader ... />
     <ScopeTabs ... />
     <MetricsRow ... />
     <FiltersRow ... />
     {warnings.length > 0 && <WarningRow ... />}
     {ai_suggestions.count > 0 && <AIControlsRow ... />}
     {loading ? <LoadingSkeleton /> : items.length === 0 ? <EmptyState ... /> : <DataTable ... />}
     <SourceSection ... />
   </RegistryLayout>
   ```

Preserve these existing callback props on `ProductActionsRegistryContent`: `onScopeChange`, `onClose`, `onOpenProject`, `onOpenSession`.

Keep the old `apiQueryProductActionRegistry` and `apiGetSessionAnalysisViewModel` as fallbacks if the new endpoint returns an error or is not yet deployed.

---

## 5. CSS

Append new styles to `frontend/src/styles/tailwind.css`. Use the `.registryLayout` scope pattern to avoid leaking styles. Do NOT remove existing `.productActionsRegistry*` styles yet — just add the new ones. The new Panel should use the new CSS classes.

---

## 6. Tests

Create `frontend/src/components/process/analysis/registry/RegistryPage.test.mjs` and update `ProductActionsRegistryPanel.test.mjs`.

Minimum test coverage:
1. `RegistryLayout` renders single white container with correct class.
2. `RegistryHeader` renders title "Реестр действий" and export dropdown.
3. `ScopeTabs` renders tabs from `view_model.scope_tabs` and marks active tab.
4. `MetricsRow` renders metrics, colors Заполненность ≥80% green and <80% orange, shows "—" for null.
5. `FiltersRow` renders backend-driven filters; does NOT hardcode filter lists.
6. `WarningRow` hidden when `warnings` empty; renders when present.
7. `AIControlsRow` hidden when `ai_suggestions.count === 0`.
8. `DataTable` renders correct columns; status badges use dots not backgrounds.
9. `EmptyState` renders when `items` empty; DOES NOT render fake rows.
10. `LoadingSkeleton` renders skeleton bars, not spinners.
11. `ProductActionsRegistryPanel` calls new API endpoint and passes `view_model` to children.
12. Build passes: `npm run build` exits 0.

Use Node.js native test runner (`node --test`). You may use `jsdom` for DOM testing if available, or keep tests as structural string checks if jsdom is not configured. **At minimum**, verify source code contains required strings and does NOT contain forbidden patterns (gradients, internal shadows, hardcoded filter lists).

---

## 7. Constraints (Anti-Patterns to Avoid)

| Forbidden | Why |
|---|---|
| Gradient backgrounds | Violates no-visual-noise rule |
| Dotted borders | Looks cheap |
| Internal shadows on rows/cards | Creates visual noise |
| Colored metric cards | Metrics must be clean text |
| Fake data / fake counts | Breaks source-truth principle |
| Duplicate export buttons | One export control in header only |
| Vertical filter stacks (desktop) | Wastes space |
| Fake table headers with empty body | Show honest empty state |
| AI controls inside source section | AI is primary action, must be above table |
| Frontend hardcoding filter lists | Backend must own filter_options |

---

## 8. Commands

```bash
cd /opt/processmap-test/frontend
npm run build        # must exit 0
npm test             # must exit 0
```

If `npm test` fails, fix the tests or the code until it passes. Do not leave failing tests.

---

## 9. Deliverables

1. All new component files listed in §3.
2. Updated `ProductActionsRegistryPanel.jsx` and `ProductActionsRegistryPage.jsx`.
3. Updated `api.js`, `apiRoutes.js`, `registry/index.js`.
4. Updated `tailwind.css` with new registry styles.
5. Updated/created `.test.mjs` files.
6. `npm run build` passes with 0 errors.
7. `npm test` passes.
8. Brief handoff in `PROCESSMAP/HANDOFF/` (optional but recommended).

---

*End of EXECUTOR_PART_1_PROMPT.md*
