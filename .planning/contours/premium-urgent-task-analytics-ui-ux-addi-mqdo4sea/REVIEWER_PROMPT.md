# REVIEWER_PROMPT — Analytics UI/UX + Additional Fields + Excel Export

**Contour:** `premium-urgent-task-analytics-ui-ux-addi-mqdo4sea`  
**Role:** Agent 3 (Reviewer)  
**Working directory:** `/opt/processmap-test`  
**Review target:** changes made by Agent 2 (Worker) per `WORKER_PROMPT.md` and `PLAN.md`.

---

## 1. Scope boundary

Review only the analytics-fields-export contour. Do **not** review unrelated deletions in `.planning/contours/`, pre-existing `ProcessAnalyticsHub.test.mjs` failures, or canvas/overlay changes.

Files in scope:
- `frontend/src/lib/api.js`
- `frontend/src/features/analytics/SessionAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/ProjectAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/WorkspaceAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/AnalyticsDataTable.jsx`
- `frontend/src/features/analytics/AnalyticsTableToolbar.jsx`
- `frontend/src/features/analytics/useAnalyticsFilters.js`
- `frontend/src/lib/analyticsExport.js`
- `frontend/src/features/analytics/dashboardConfig.js`
- `frontend/src/styles/tailwind.css`
- `frontend/src/features/analytics/AnalyticsDashboards.test.mjs`
- `deploy/deploy.sh` and nginx config only if changed by the worker.

---

## 2. Acceptance criteria (MUST pass)

### 2.1 Additional fields

- [ ] `SessionAnalyticsDashboard` renders columns: **Duration**, **Status**, **Created By**.
- [ ] `ProjectAnalyticsDashboard` renders columns: **Total Sessions**, **Last Activity**, **Owner**.
- [ ] `WorkspaceAnalyticsDashboard` summary table renders fields: **Member Count**, **Project Count**, **Storage Used**.
- [ ] Every new column has `sortable: true` and `filterable: true`.
- [ ] Missing backend fields are mocked with `// TODO(backend): …` comments; no new API endpoints were created.

### 2.2 Excel export

- [ ] Each analytics dashboard shows an "Export to Excel" button near the filters.
- [ ] Clicking the button downloads a file named `processmap-analytics-{surface}-{YYYY-MM-DD}.xlsx`.
- [ ] The workbook contains two sheets: `Metadata` and `Data`.
- [ ] The `Metadata` sheet includes: surface, generatedAt, row count, visible columns list, and active filters.
- [ ] The `Data` sheet contains the currently visible columns and filtered/sorted rows.

### 2.3 UI/UX polish

- [ ] Table header is sticky.
- [ ] Zebra striping and hover row highlight are present.
- [ ] Filter chips and a "Clear all" / "Сбросить" button are rendered when filters are active.
- [ ] Saved filter presets can be saved/loaded via localStorage.
- [ ] Below 768px, table rows collapse to cards; at wider widths the table has horizontal scroll with `min-width`.
- [ ] Empty state for "no matching filters" displays the active filters and a "Clear filters" CTA.
- [ ] Loading skeleton rows match the column count of the table.

### 2.4 Tests

- [ ] At least three explicit test cases exist for: table render, filter apply, export button triggers download.
- [ ] All analytics-focused tests pass:
  ```bash
  cd /opt/processmap-test/frontend
  node --test src/features/analytics/AnalyticsDashboards.test.mjs src/features/analytics/dashboardModel.test.mjs src/features/analytics/useAnalyticsRouteState.test.mjs
  ```
- [ ] `npm run build` passes in `/opt/processmap-test/frontend`.
- [ ] `npm run build` passes in `/root/processmap_v1/frontend` after sync.

### 2.5 Deployment / runtime proof

- [ ] Frontend changes exist in both `/opt/processmap-test` and `/root/processmap_v1`.
- [ ] `clearvestnic.ru:5177` responds with HTTP 200.
- [ ] `RUNTIME_PROOF_5177.md` contains curl output and screenshots of:
  - Session dashboard with new columns.
  - Project dashboard with new columns.
  - Workspace dashboard with new summary fields.
  - Excel export button + downloaded file evidence.

### 2.6 Safety / isolation

- [ ] `TopBarContainer`, URL builders (`Mz`, `TG`), and Auth guard were not modified.
- [ ] Overlay navigation still opens/closes analytics correctly.
- [ ] Feature flag `USE_ANALYTICS_FIELDS_EXPORT` gates the new UI; setting it to `false` restores the previous simple UI.
- [ ] No secrets are printed in logs, test output, or runtime proof.

---

## 3. Review commands

```bash
# Git diff stat (bounded)
cd /opt/processmap-test
git diff --stat -- frontend/src/lib/api.js frontend/src/features/analytics frontend/src/styles/tailwind.css frontend/src/features/analytics/AnalyticsDashboards.test.mjs

# Analytics tests
cd /opt/processmap-test/frontend
node --test src/features/analytics/AnalyticsDashboards.test.mjs src/features/analytics/dashboardModel.test.mjs src/features/analytics/useAnalyticsRouteState.test.mjs

# Build in working repo
cd /opt/processmap-test/frontend
npm run build

# Build in gateway repo
cd /root/processmap_v1/frontend
npm ci && npm run build

# Runtime smoke
curl -s -o /dev/null -w "%{http_code}\n" https://clearvestnic.ru:5177/
```

---

## 4. Review verdict

- **PASS** if all acceptance criteria are met and runtime proof is present.
- **CHANGES_REQUESTED** if any MUST item fails. Create `REWORK_REQUEST.md` with:
  - Failing criterion.
  - Minimal reproduction / command.
  - Suggested fix.
- **BLOCKED** if the worker mixed unrelated contours, modified forbidden files, or the branch state does not match the intended scope. Do not approve until isolation is restored.

After review, create `REVIEW_REPORT.md` and run:

```bash
./tools/pm-agent-mirror-report.sh "premium-urgent-task-analytics-ui-ux-addi-mqdo4sea" reviewer
```
