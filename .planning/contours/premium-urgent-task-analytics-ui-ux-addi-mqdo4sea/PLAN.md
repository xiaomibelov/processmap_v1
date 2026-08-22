# PLAN — PREMIUM/URGENT TASK: Analytics UI/UX + Additional Fields + Excel Export

**Contour:** `premium-urgent-task-analytics-ui-ux-addi-mqdo4sea`  
**Type:** `feat` (UI/UX + data surface + export)  
**Branch:** `feature/analytics-fields-export`  
**Working directory:** `/opt/processmap-test`  
**Gateway build source:** `/root/processmap_v1`  

---

## 1. Canonical state (per AGENTS.md §3)

| Check | Value |
|-------|-------|
| `pwd` | `/opt/processmap-test` |
| `git remote -v` | `origin git@github.com:xiaomibelov/processmap_v1.git` |
| `git branch --show-current` | `feature/analytics-fields-export` |
| `git rev-parse HEAD` | `4e8c0939b4c03ebc21297edb179866c61a1d75e1` |
| `git rev-parse origin/main` | `e1143c14f901882c12dc550f71bfd6757d60b882` |
| `git status -sb` | ahead of `origin/main` by 1; modified files include `.env`, `frontend/package.json`, `deploy/deploy.sh`, `tools/*.sh`; many deleted `.planning/contours/*` from unrelated closed contours |
| Build baseline | `npm run build` in `frontend/` **passes** (22.32s) |
| Analytics tests baseline | `node --test src/features/analytics/AnalyticsDashboards.test.mjs src/features/analytics/dashboardModel.test.mjs src/features/analytics/useAnalyticsRouteState.test.mjs` **passes** (37/37) |

> **Note:** The core analytics table/export/filter scaffolding is already in place on this branch. This plan is **verification + gap-closure**, not a greenfield build.

---

## 2. Already delivered (do NOT redo)

- `useAnalyticsRouteState` replaces `pushState` for analytics navigation.
- `AnalyticsHub`, `AnalyticsSectionTabs`, `AnalyticsDashboards` dispatcher.
- `AnalyticsDataTable`, `AnalyticsTableToolbar`, `AnalyticsSkeleton`, `AnalyticsEmptyState`, `AnalyticsErrorState`.
- `useAnalyticsFilters` with localStorage persistence, sort/filter, presets.
- `lib/analyticsExport.js` using `xlsx` (SheetJS) client-side.
- Feature flag `USE_ANALYTICS_FIELDS_EXPORT = true` in `dashboardConfig.js`.
- `--analysis-*` design tokens and a11y rules in `frontend/src/styles/tailwind.css`.

---

## 3. Remaining gaps against the requirements

### 3.1 Additional fields — sortable/filterable parity

| Dashboard | Field | Current state | Gap |
|-----------|-------|---------------|-----|
| Session | Duration | sortable, `filterable: false` | Must be filterable |
| Session | Status | sortable/filterable | OK (backend still mocked) |
| Session | Created By | sortable/filterable | OK (backend still mocked) |
| Project | Total Sessions | sortable, `filterable: false` | Must be filterable |
| Project | Last Activity | sortable/filterable, renders `s.last_activity` | Should fall back to `s.updated_at` when backend lacks the field |
| Project | Owner | sortable/filterable | OK (backend still mocked) |
| Workspace | Member Count | sortable, `filterable: false` | Must be filterable |
| Workspace | Project Count | sortable, `filterable: false` | Must be filterable |
| Workspace | Storage Used | sortable, `filterable: false` | Must be filterable |

- `frontend/src/lib/api.js` currently **drops** pass-through fields (`status`, `created_by` for session; `last_activity`/`owner` per session; `member_count`, `storage_used` for workspace). The normalizers should preserve them so the UI can display real values as soon as the backend returns them.

### 3.2 Excel export

- Metadata sheet currently contains `surface`, `generatedAt`, `filters`. Requirement: first sheet must include **all visible columns + current filters metadata**.
- No guard for >10k rows; client-side export is acceptable for current dataset sizes, but the code should at minimum avoid blocking the main thread and document the threshold.

### 3.3 UI/UX polish

- **Empty state for active filters with no matches:** `AnalyticsDataTable` only shows a generic empty block. It must show the active filters and a "Clear filters" CTA.
- **Responsive card collapse (<768px):** table still renders as a table on narrow screens. Requirement is to collapse rows to cards below 768px while keeping horizontal scroll for the table view above the breakpoint.
- **Skeleton parity:** `AnalyticsDataTable` already renders skeleton cells matching the column count; verify that the generic `AnalyticsSkeleton` is acceptable for the page-level loader.
- Optional column resize is **out of scope**; do not implement unless it becomes blocking.

### 3.4 Tests

- Existing `AnalyticsDashboards.test.mjs` uses static source assertions. Requirement asks for at least three cases covering **table render, filter apply, export button triggers download**. Either extend the existing static tests or add lightweight functional tests; the key is that the three behaviors are explicitly asserted.

### 3.5 Sync / deploy

- `/root/processmap_v1` has the same analytics files as uncommitted changes. The gateway image builds from `/root/processmap_v1`, so all frontend changes must be synced there before deploy.
- No runtime proof exists yet for `clearvestnic.ru:5177`.

---

## 4. Phase breakdown

### Phase 0 — Pre-flight / isolation

1. Confirm the branch contains only the intended analytics contour; if unrelated deletions block the diff, document them but do not fix them in this contour.
2. Record baseline: `git status -sb`, `git diff --name-only`, `npm run build`, targeted analytics tests.

### Phase 1 — Data model pass-through + column config

1. `frontend/src/lib/api.js`
   - `apiGetSessionAnalytics`: pass through `status` and `created_by` from `data`.
   - `apiGetProjectAnalytics`: pass through per-session `updated_at`, `last_activity`, `owner` (keep existing shape).
   - `apiGetWorkspaceAnalytics`: pass through `member_count` and `storage_used`.
2. `frontend/src/features/analytics/ProjectAnalyticsDashboard.jsx`
   - Derive `last_activity` as `s.last_activity ?? s.updated_at ?? null`.
3. Column configs in dashboards:
   - Session: set `filterable: true` on `duration`.
   - Project: set `filterable: true` on `sessions_count` (Total Sessions).
   - Workspace summary: set `filterable: true` on `member_count`, `projects_count`, `storage_used`.
4. Leave `// TODO(backend): …` comments for fields that are still not provided by the backend.

### Phase 2 — UI/UX polish

1. `frontend/src/features/analytics/AnalyticsDataTable.jsx`
   - Accept `activeFilters` / `onResetFilters` props.
   - When `!loading && rows.length === 0`, render the active filter chips + "Clear filters" button (reuse `analyticsFilterChip` / `analyticsFilterReset` classes).
2. `frontend/src/styles/tailwind.css`
   - Add `@media (max-width: 767px)` card-collapse styles for `.analyticsDataTable` rows (stacked label/value cards) while preserving `min-width` horizontal scroll above the breakpoint.
3. `frontend/src/lib/analyticsExport.js`
   - Extend the `Metadata` sheet with a visible-columns list and row count.
   - Keep `Data` sheet unchanged.

### Phase 3 — Tests

1. Extend `frontend/src/features/analytics/AnalyticsDashboards.test.mjs` with explicit cases:
   - `SessionAnalyticsDashboard renders Duration, Status, Created By columns in the table`
   - `Filter toolbar applies and resets filters`
   - `Export button triggers Excel download handler`
2. Run analytics-focused tests: `node --test src/features/analytics/*.test.mjs`.
3. Run `npm run build` and confirm no new build errors.

### Phase 4 — Sync to gateway build source

1. In `/root/processmap_v1`:
   - `git fetch local-opt`
   - Merge or fast-forward the analytics branch changes into the gateway working tree (the tree already has the files as uncommitted modifications; align them with `/opt/processmap-test`).
2. `cd /root/processmap_v1/frontend && npm ci && npm run build`.
3. If the build fails only because of unrelated pre-existing issues, document them; do not fix unrelated contours here.

### Phase 5 — Deploy + runtime proof

1. Use the existing deploy path for `clearvestnic.ru:5177` (see `deploy/deploy.sh` and `deploy/nginx/`).
2. After deploy:
   - `curl -s -o /dev/null -w "%{http_code}" https://clearvestnic.ru:5177/`
   - Capture screenshot of Session/Project/Workspace analytics dashboards showing the new columns.
   - Capture screenshot/video of the "Export to Excel" button producing a file.
3. Write `RUNTIME_PROOF_5177.md` with curl output, screenshot paths, and a short verdict.

### Phase 6 — Review handoff

1. Create `WORKER_REPORT.md` summarizing changes, tests, and any blockers.
2. Run `./tools/pm-agent-mirror-report.sh "premium-urgent-task-analytics-ui-ux-addi-mqdo4sea" worker`.
3. Mark `READY_FOR_REVIEW`.

---

## 5. Acceptance criteria (for reviewer)

1. All three analytics dashboards render the requested new columns when `USE_ANALYTICS_FIELDS_EXPORT === true`.
2. Every new column is both sortable and filterable.
3. "Export to Excel" button is present on each dashboard, downloads `processmap-analytics-{surface}-{YYYY-MM-DD}.xlsx`, and the workbook contains a `Metadata` sheet and a `Data` sheet.
4. Empty state for no matching filters displays applied filters + "Clear filters" CTA.
5. Table is horizontally scrollable and collapses to cards below 768px.
6. At least three explicit test cases cover table render, filter apply, and export download.
7. `npm run build` passes in both `/opt/processmap-test/frontend` and `/root/processmap_v1/frontend`.
8. Runtime proof on `clearvestnic.ru:5177` shows new fields and working export.

---

## 6. Risks and constraints

- **Backend fields missing:** Some columns will display `"—"` until backend returns the data. This is expected; do **not** create new API endpoints in this contour.
- **Overlay navigation:** Do not touch `TopBarContainer`, URL builders (`Mz`, `TG`), or the auth guard. Verify analytics open/close still works after changes.
- **Unrelated test failures:** `ProcessAnalyticsHub.test.mjs` has pre-existing failures (stale expectations); do not fix them here unless they directly block analytics tests.
- **Large dataset export:** Current implementation is client-side. If a dashboard ever has >10k rows, the export may lag; document this in `analyticsExport.js` as a known threshold.
