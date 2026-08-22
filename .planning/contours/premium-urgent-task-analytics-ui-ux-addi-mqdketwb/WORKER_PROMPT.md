# WORKER_PROMPT — Analytics UI/UX + Additional Fields + Excel Export

**For:** Agent 2 / Worker  
**Contour:** `premium-urgent-task-analytics-ui-ux-addi-mqdketwb`  
**Working directory:** `/opt/processmap-test`  
**Note:** `/app` in container = `/opt/processmap-test/frontend` on host  
**Branch:** `feature/analytics-fields-export` from `origin/main`  
**Feature flag:** `USE_ANALYTICS_FIELDS_EXPORT = true`

---

## 0. Read first

Before coding, read:
1. `PLAN.md` (this contour)
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. Existing files:
   - `frontend/src/features/analytics/SessionAnalyticsDashboard.jsx`
   - `frontend/src/features/analytics/ProjectAnalyticsDashboard.jsx`
   - `frontend/src/features/analytics/WorkspaceAnalyticsDashboard.jsx`
   - `frontend/src/features/analytics/dashboardModel.js`
   - `frontend/src/features/analytics/AnalyticsSkeleton.jsx`
   - `frontend/src/features/analytics/registry/DataTable.jsx`
   - `frontend/src/features/analytics/registry/FiltersRow.jsx`
   - `frontend/src/lib/api.js` (analytics endpoints)
   - `frontend/package.json`

---

## 1. Git setup

```bash
cd /opt/processmap-test
git fetch origin
git checkout -b feature/analytics-fields-export origin/main
git tag pre-fields-export $(git rev-parse HEAD)
```

Verify with `git status -sb` and `git branch --show-current`.

---

## 2. Install dependency

```bash
cd /opt/processmap-test/frontend
npm install xlsx@0.18.5
```

Verify `xlsx` appears in `dependencies` in `package.json` and `package-lock.json` is updated.

---

## 3. Create shared components

### 3.1 `frontend/src/lib/analyticsExport.js`

Responsibilities:
- `buildAnalyticsWorkbook({ surface, columns, rows, filters })` using `xlsx`
- Sheet 1: "Metadata" with keys `surface`, `generatedAt`, `filters`
- Sheet 2: "Data" with all visible columns as headers
- `downloadAnalyticsXlsx({ surface, columns, rows, filters })` triggers download with filename `processmap-analytics-{surface}-{YYYY-MM-DD}.xlsx`
- Use `xlsx.utils.aoa_to_sheet` and `xlsx.writeFile` or manual blob download

Example filename helper:
```js
function analyticsFilename(surface) {
  const date = new Date().toISOString().slice(0, 10);
  return `processmap-analytics-${surface}-${date}.xlsx`;
}
```

### 3.2 `frontend/src/features/analytics/dashboardConfig.js`

```js
export const USE_ANALYTICS_FIELDS_EXPORT = true;
```

### 3.3 `frontend/src/features/analytics/useAnalyticsFilters.js`

Hook signature:
```js
export default function useAnalyticsFilters(surface, { initial = {}, columns = [] }) {
  const [filters, setFilters] = useState(initial);
  const [sort, setSort] = useState({ key: null, direction: 'asc' });
  // ... apply sort/filter, reset, presets via localStorage
  return { filters, setFilter, resetFilters, sort, setSort, applySortFilter, presets, savePreset, loadPreset };
}
```

Requirements:
- LocalStorage key: `processmap:analytics:filters:{surface}`
- Presets saved as array `{ name, filters, sort }`
- `applySortFilter(rows, columns)` returns filtered + sorted rows
- Text filter uses case-insensitive substring match
- Status/owner filters use exact match dropdown

### 3.4 `frontend/src/features/analytics/AnalyticsDataTable.jsx`

Props:
```js
{
  columns: [{ key, label, sortable, filterable, width, align }],
  rows: [{}],
  sort,
  onSort,
  loading,
  emptyTitle,
  emptyMessage,
  surface
}
```

Requirements:
- Sticky header (`position: sticky; top: 0`)
- Zebra striping (`:nth-child(even)`)
- Hover row highlight
- Sortable column headers show asc/desc indicator
- Horizontal scroll wrapper with `min-width` (e.g., `min-width: 640px`)
- Mobile (<768px): collapse to cards or keep horizontal scroll
- Skeleton rows matching column count when `loading`
- Use `data-testid="analytics-data-table"` and per-cell `data-testid="analytics-cell-{key}"`

### 3.5 `frontend/src/features/analytics/AnalyticsTableToolbar.jsx`

Props:
```js
{
  surface,
  columns,
  rows,
  filters,
  onChangeFilter,
  onResetFilters,
  presets,
  onSavePreset,
  onLoadPreset
}
```

Requirements:
- Export button top-right with `data-testid="analytics-export-excel"`
- Clear-all button when filters active
- Inline filter chips showing active filters
- Preset save/load dropdown

---

## 4. Modify dashboards

### 4.1 `SessionAnalyticsDashboard.jsx`

Current: cards + bar charts + summary.  
Add below summary:
- Section "Детали сессии" with `AnalyticsDataTable`
- Columns:
  - `Duration` → `analytics.timing.total_duration_min` formatted as `{value} мин`
  - `Status` → `analytics.status` (mock with `// TODO(backend): provide status`) fallback `—`
  - `Created By` → `analytics.created_by` (mock with `// TODO(backend): provide created_by`) fallback `—`
- Wrap new section behind `USE_ANALYTICS_FIELDS_EXPORT`
- If no data, show `AnalyticsEmptyState`

### 4.2 `ProjectAnalyticsDashboard.jsx`

Current: cards + "Последние сессии" table.  
Extend table columns:
- Existing: `Сессия`, `Длительность`, `Действий`, `Крит. вопросы`
- Add: `Total Sessions` → `sessions_count` (already available)
- Add: `Last Activity` → `s.last_activity` (mock TODO) fallback `—`
- Add: `Owner` → `s.owner` (mock TODO) fallback `—`
- Replace table with `AnalyticsDataTable` wrapped in toolbar when flag is on
- Keep existing table as fallback when flag is off

### 4.3 `WorkspaceAnalyticsDashboard.jsx`

Current: cards + "Последние сессии" table.  
Add a new section "Сводка workspace" above or beside recent sessions:
- Fields: `Member Count`, `Project Count`, `Storage Used`
- `Project Count` → `projects_count` (available)
- `Member Count` → `member_count` (mock TODO)
- `Storage Used` → `storage_used` (mock TODO)
- Also extend recent sessions table with sortable/filterable columns using `AnalyticsDataTable`

---

## 5. UI/UX polish implementation

Add CSS to `frontend/src/index.css` under existing analytics section or create `frontend/src/features/analytics/analytics.css` and import it.

Required CSS classes:
- `.analyticsDataTableWrap` — overflow-x auto
- `.analyticsDataTable` — min-width, border-collapse
- `.analyticsDataTableHead` — sticky, background, z-index
- `.analyticsDataTableRow:nth-child(even)` — zebra
- `.analyticsDataTableRow:hover` — hover highlight
- `.analyticsDataTableHeadCell--sortable` — cursor pointer
- `.analyticsFilterChip` — inline chip style
- `.analyticsExportBtn` — CTA amber color per design tokens
- Responsive: `@media (max-width: 768px)` cards or horizontal scroll

Use existing `--analysis-*` tokens. Do not break existing analytics styles.

---

## 6. Skeleton extension

Update `AnalyticsSkeleton.jsx` to include a table skeleton matching typical column count (4–7 columns):
```jsx
<div className="analyticsSkeletonTable" aria-hidden="true">
  <div className="analyticsSkeletonRow"><div/><div/><div/><div/><div/></div>
  <div className="analyticsSkeletonRow"><div/><div/><div/><div/><div/></div>
  <div className="analyticsSkeletonRow"><div/><div/><div/><div/><div/></div>
</div>
```

---

## 7. Tests

Extend `frontend/src/features/analytics/AnalyticsDashboards.test.mjs` with at least 3 new tests:

```js
test("Session dashboard renders new registry columns", () => {
  assert.match(sessionSource, /Duration/);
  assert.match(sessionSource, /Status/);
  assert.match(sessionSource, /Created By/);
  assert.match(sessionSource, /data-testid="analytics-data-table"/);
});

test("Filter toolbar and clear-all are present", () => {
  assert.match(source, /AnalyticsTableToolbar/);
  assert.match(source, /onResetFilters/);
  assert.match(source, /analytics-export-excel/);
});

test("Excel export utility triggers download", () => {
  const exportSource = read("../../../lib/analyticsExport.js");
  assert.match(exportSource, /processmap-analytics-/);
  assert.match(exportSource, /\.xlsx/);
  assert.match(exportSource, /xlsx/);
});
```

Run tests:
```bash
npm test
```

---

## 8. Build and sync

```bash
cd /opt/processmap-test/frontend
npm ci && npm run build
```

If build passes, sync to gateway source:
```bash
rsync -av --delete \
  /opt/processmap-test/frontend/src/ \
  /root/processmap_v1/frontend/src/
rsync -av \
  /opt/processmap-test/frontend/package.json \
  /opt/processmap-test/frontend/package-lock.json \
  /root/processmap_v1/frontend/
```

Verify both repos with `git status -sb` and `git diff --stat`.

---

## 9. Deploy and verify

Use project deploy script (check `deploy/deploy.sh` or `deploy/scripts/`):
```bash
cd /opt/processmap-test/deploy
./deploy.sh stage
```

Target: `clearvestnic.ru:5177`

Verification commands:
```bash
curl -s https://clearvestnic.ru:5177/health || curl -s -k https://clearvestnic.ru:5177/
```

Manual checks:
- Open each dashboard
- Confirm new columns/fields visible
- Apply a filter, confirm results update
- Click "Export to Excel", verify filename and sheets
- Test clear-all and preset save/load

Record proof in `RUNTIME_PROOF_CHECKLIST.md`.

---

## 10. Handoff

After verification:
1. Write `EXEC_REPORT.md` in this contour directory with git-proof and runtime proof
2. Run mirror report:
   ```bash
   ./tools/pm-agent-mirror-report.sh "premium-urgent-task-analytics-ui-ux-addi-mqdketwb" executor
   ```
3. Create marker:
   ```bash
   mkdir -p /opt/processmap-test/.planning/contours/premium-urgent-task-analytics-ui-ux-addi-mqdketwb/READY_FOR_REVIEW
   ```
4. Do NOT merge, do NOT open PR, do NOT deploy to prod without user approval.

---

## 11. Constraints reminder

- Do NOT modify `TopBarContainer`, `Mz()`, `TG()`, `_m`, `Td`, `xm`, `vm`, Auth guard
- Do NOT break overlay navigation
- Use existing data model — mock missing fields with TODO comments
- Atomic writes only
- No secrets in logs or files

---

*WORKER_PROMPT.md v1 — generated by Agent 1 / Planner*

## Dev Server Requirement

Before creating `WORKER_DONE`, ensure the dev server on `:5177` is running and serves the current build. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, start the dev server (`npm run dev` or equivalent in the frontend directory).
