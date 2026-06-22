# WORKER_PROMPT — Analytics UI/UX + Additional Fields + Excel Export

**Contour:** `premium-urgent-task-analytics-ui-ux-addi-mqdo4sea`  
**Role:** Agent 2 (Executor / Worker)  
**Working directory:** `/opt/processmap-test`  
**Container mapping:** `/app` inside the build container maps to `/opt/processmap-test/frontend` on the host.  
**Gateway build source:** `/root/processmap_v1`  

Read `PLAN.md` first. This prompt contains the bounded implementation steps.

---

## 0. Hard constraints

- **Do NOT** modify `TopBarContainer`, `Mz()`, `TG()`, `_m`, `Td`, `xm`, `vm`, or the Auth guard.
- **Do NOT** break overlay navigation. After changes, opening/closing analytics from the top-bar button and the analytics tabs must still work.
- **Do NOT** create new backend API endpoints. Preserve existing fields in `frontend/src/lib/api.js`; mock missing backend fields with `// TODO(backend): …` comments.
- All new UI behavior must be gated by `USE_ANALYTICS_FIELDS_EXPORT === true` in `frontend/src/features/analytics/dashboardConfig.js`.
- Keep changes atomic and minimal. No broad refactors.

---

## 1. Files you will touch

| File | Purpose |
|------|---------|
| `frontend/src/lib/api.js` | Pass through analytics fields that the backend may already return. |
| `frontend/src/features/analytics/SessionAnalyticsDashboard.jsx` | Make `duration` filterable. |
| `frontend/src/features/analytics/ProjectAnalyticsDashboard.jsx` | Make `sessions_count` filterable; derive `last_activity` from `updated_at`. |
| `frontend/src/features/analytics/WorkspaceAnalyticsDashboard.jsx` | Make `member_count`, `projects_count`, `storage_used` filterable. |
| `frontend/src/features/analytics/AnalyticsDataTable.jsx` | Add active-filter empty state. |
| `frontend/src/lib/analyticsExport.js` | Add visible-columns list + row count to metadata sheet. |
| `frontend/src/styles/tailwind.css` | Add responsive card-collapse below 768px. |
| `frontend/src/features/analytics/AnalyticsDashboards.test.mjs` | Add explicit tests for table render, filter apply, export download. |

---

## 2. Step-by-step implementation

### Step 1 — Pass through backend fields in `frontend/src/lib/api.js`

Keep all existing keys; only add missing passthrough keys.

1. `apiGetSessionAnalytics`
   - Add `status: data.status ?? null`
   - Add `created_by: data.created_by ?? null`
2. `apiGetProjectAnalytics`
   - The `sessions` array is passed through as-is; do **not** strip per-session fields. If the current normalizer maps each session explicitly, preserve `updated_at`, `last_activity`, `owner`.
3. `apiGetWorkspaceAnalytics`
   - Add `member_count: data.member_count ?? null`
   - Add `storage_used: data.storage_used ?? null`

### Step 2 — Make all new columns filterable

1. In `SessionAnalyticsDashboard.jsx`, change the `duration` column to `filterable: true`.
2. In `ProjectAnalyticsDashboard.jsx`, change the `sessions_count` column to `filterable: true`. In the row mapper, derive:
   ```js
   last_activity: s.last_activity ?? s.updated_at ?? null,
   ```
3. In `WorkspaceAnalyticsDashboard.jsx`, change `member_count`, `projects_count`, and `storage_used` columns to `filterable: true`.

### Step 3 — Active-filter empty state

1. Update `AnalyticsDataTable.jsx` to accept new optional props: `activeFilters` (array of `[key, value]`) and `onResetFilters` (function).
2. When `!loading && rows.length === 0`, still render the existing empty title/message, but **also** render:
   - A list of active filter chips using the same `.analyticsFilterChip` class.
   - A "Clear filters" button using `.analyticsFilterReset` that calls `onResetFilters()`.
3. Update each dashboard so the new props are wired from the corresponding `useAnalyticsFilters` result.

### Step 4 — Excel metadata sheet

In `frontend/src/lib/analyticsExport.js`, extend `buildAnalyticsWorkbook` so the `Metadata` sheet contains at least:

```js
[
  ["Key", "Value"],
  ["surface", surface],
  ["generatedAt", new Date().toISOString()],
  ["rowCount", rows.length],
  ["columns", columns.map((c) => c.label || c.key).join(", ")],
  ["filters", JSON.stringify(filters || {})],
]
```

Keep the `Data` sheet unchanged.

### Step 5 — Responsive card collapse

In `frontend/src/styles/tailwind.css`, add a media query:

```css
@media (max-width: 767px) {
  .analyticsDataTable,
  .analyticsDataTable thead,
  .analyticsDataTable tbody,
  .analyticsDataTable th,
  .analyticsDataTable td,
  .analyticsDataTable tr {
    display: block;
  }

  .analyticsDataTableHead {
    position: static;
  }

  .analyticsDataTableHead tr {
    display: none;
  }

  .analyticsDataTableRow {
    margin-bottom: 12px;
    border: 1px solid var(--analysis-border-soft);
    border-radius: 8px;
    padding: 8px;
    background: hsl(var(--bg));
  }

  .analyticsDataTableCell {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid var(--analysis-border-soft);
  }

  .analyticsDataTableCell::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--analysis-muted);
    margin-right: 12px;
  }

  .analyticsDataTableCell:last-child {
    border-bottom: none;
  }
}
```

To make `data-label` work, add `data-label={col.label}` to each `<td>` in `AnalyticsDataTable.jsx`.

### Step 6 — Tests

Extend `frontend/src/features/analytics/AnalyticsDashboards.test.mjs` with at least these three explicit cases:

1. **Table render**
   ```js
   test("Session analytics table renders Duration, Status and Created By columns", () => {
     assert.match(sessionSource, /key:\s*"duration"/);
     assert.match(sessionSource, /key:\s*"status"/);
     assert.match(sessionSource, /key:\s*"createdBy"/);
     assert.match(tableSource, /data-testid="analytics-data-table"/);
   });
   ```

2. **Filter apply**
   ```js
   test("Filter toolbar applies and resets filters", () => {
     assert.match(toolbarSource, /analytics-filter-/);
     assert.match(toolbarSource, /onChangeFilter/);
     assert.match(toolbarSource, /analytics-filters-reset/);
     assert.match(sessionSource, /onResetFilters/);
     assert.match(useFiltersSource, /matchesFilter/);
   });
   ```

3. **Export button triggers download**
   ```js
   test("Export button triggers Excel download", () => {
     assert.match(toolbarSource, /analytics-export-excel/);
     assert.match(toolbarSource, /downloadAnalyticsXlsx/);
     assert.match(exportSource, /XLSX\.writeFile/);
   });
   ```

Run:

```bash
cd /opt/processmap-test/frontend
node --test src/features/analytics/AnalyticsDashboards.test.mjs src/features/analytics/dashboardModel.test.mjs src/features/analytics/useAnalyticsRouteState.test.mjs
```

### Step 7 — Build + sync to `/root/processmap_v1`

1. In `/opt/processmap-test/frontend`:
   ```bash
   npm run build
   ```
2. Sync frontend changes to `/root/processmap_v1`:
   ```bash
   cd /root/processmap_v1
   git fetch local-opt
   # Align the working tree with /opt/processmap-test for frontend files only
   rsync -av --delete /opt/processmap-test/frontend/src/ /root/processmap_v1/frontend/src/
   rsync -av /opt/processmap-test/frontend/package.json /root/processmap_v1/frontend/package.json
   ```
3. In `/root/processmap_v1/frontend`:
   ```bash
   npm ci && npm run build
   ```

### Step 8 — Deploy + runtime proof

1. Deploy to `clearvestnic.ru:5177` using `deploy/deploy.sh` or the project's documented nginx path.
2. After deploy:
   - `curl -s -o /dev/null -w "%{http_code}\n" https://clearvestnic.ru:5177/`
   - Open analytics dashboards (Session, Project, Workspace) and capture screenshots showing the new columns.
   - Click "Export to Excel" and capture proof of the downloaded `.xlsx` file.
3. Write `RUNTIME_PROOF_5177.md` with curl output, screenshot paths, and verdict.

---

## 3. Definition of done

- [ ] All new columns are sortable **and** filterable.
- [ ] `api.js` preserves pass-through analytics fields without adding new endpoints.
- [ ] Excel metadata sheet lists visible columns + row count + filters.
- [ ] Empty state for no matching filters shows active filters and a clear CTA.
- [ ] Table collapses to cards below 768px and scrolls horizontally above it.
- [ ] At least three explicit tests are added/updated and pass.
- [ ] `npm run build` passes in `/opt/processmap-test/frontend` and `/root/processmap_v1/frontend`.
- [ ] Runtime proof on `clearvestnic.ru:5177` is recorded.
- [ ] `WORKER_REPORT.md` is written and `READY_FOR_REVIEW` marker is created.

## Dev Server Requirement

Before creating `WORKER_DONE`, ensure the dev server on `:5177` is running and serves the current build. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, start the dev server (`npm run dev` or equivalent in the frontend directory).
