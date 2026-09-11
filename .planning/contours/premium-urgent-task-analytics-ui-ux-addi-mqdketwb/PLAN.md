# PLAN — Analytics UI/UX + Additional Fields + Excel Export

**Contour:** `premium-urgent-task-analytics-ui-ux-addi-mqdketwb`  
**Type:** `uiux`  
**Branch:** `feature/analytics-fields-export` from `origin/main`  
**Feature flag:** `USE_ANALYTICS_FIELDS_EXPORT = true`  
**Estimated effort:** 6–10 hours

---

## 1. Goal

Extend ProcessMap analytics dashboards with:
1. Additional sortable/filterable columns/fields on Session, Project, and Workspace surfaces.
2. Client-side Excel export of the current filtered/sorted view.
3. Table/filter UI/UX polish.
4. Deployment to `clearvestnic.ru:5177` with runtime proof.

---

## 2. Source/runtime truth (fixed at planning time)

- Working directory: `/opt/processmap-test`
- Current branch: `feature/analytics-nav-ux-fix` (legacy contour — do NOT reuse)
- Remote: `origin git@github.com:xiaomibelov/processmap_v1.git`
- Gateway build source: `/root/processmap_v1` (must receive synced frontend changes before deploy)
- Frontend path: `/opt/processmap-test/frontend`
- Analytics feature root: `/opt/processmap-test/frontend/src/features/analytics/`
- Existing dashboards: `SessionAnalyticsDashboard.jsx`, `ProjectAnalyticsDashboard.jsx`, `WorkspaceAnalyticsDashboard.jsx`
- Existing registry primitives: `registry/DataTable.jsx`, `registry/FiltersRow.jsx`
- `xlsx` (SheetJS) is not currently installed
- Tests are static regex tests in `*.test.mjs`

RAG preflight: RAG server returned `invalid_user` — no prior RAG context available.

---

## 3. Scope

**In scope:**
- `frontend/src/features/analytics/*`
- `frontend/src/lib/analyticsExport.js`
- `frontend/package.json` (add `xlsx`)
- `frontend/src/features/analytics/AnalyticsDashboards.test.mjs`
- CSS additions using existing `--analysis-*` tokens
- Sync changed frontend files to `/root/processmap_v1/frontend`
- Build + deploy to `clearvestnic.ru:5177`

**Out of scope / BLOCKED:**
- New backend API endpoints unless >10k rows force it
- Changes to `TopBarContainer`, `Mz`, `TG`, `_m`, `Td`, `xm`, `vm`, Auth guard
- Overlay navigation changes

---

## 4. Design tokens (ui-ux-pro-max)

- **Pattern:** Data-Dense Dashboard
- **Colors:** Primary `#1E40AF`, Secondary `#3B82F6`, CTA `#F59E0B`, Background `#F8FAFC`, Text `#1E3A8A`
- **Typography:** Fira Code / Fira Sans
- **Effects:** Hover tooltips, row highlighting, smooth filter animations, data loading spinners
- **Checklist:** No emoji icons, cursor-pointer on clickable elements, 150–300ms transitions, contrast >= 4.5:1, visible focus states, `prefers-reduced-motion`, responsive breakpoints 375/768/1024/1440px

---

## 5. Phase breakdown

### Phase 1 — Branch isolation
1. `git fetch origin`
2. Create `feature/analytics-fields-export` from `origin/main`
3. Tag `pre-fields-export` on current HEAD for rollback

### Phase 2 — Dependency
1. `cd /opt/processmap-test/frontend`
2. `npm install xlsx@0.18.5`
3. Verify `package.json` and `package-lock.json`

### Phase 3 — Shared utilities
1. `frontend/src/lib/analyticsExport.js` — build XLSX workbook, metadata sheet + data sheet, download with filename `processmap-analytics-{surface}-{YYYY-MM-DD}.xlsx`
2. `frontend/src/features/analytics/useAnalyticsFilters.js` — filter state, sort state, localStorage presets, reset
3. `frontend/src/features/analytics/AnalyticsTableToolbar.jsx` — export button, clear-all, filter chips, preset save/load
4. `frontend/src/features/analytics/AnalyticsDataTable.jsx` — sticky header, zebra striping, hover highlight, sortable headers, horizontal scroll, mobile card collapse, skeleton rows

### Phase 4 — Dashboard additions
- **Session Analytics Dashboard:** add Session Details registry table with `Duration`, `Status`, `Created By` columns
- **Project Analytics Dashboard:** extend Recent Sessions table with `Total Sessions`, `Last Activity`, `Owner`
- **Workspace Analytics Dashboard:** add/extend summary/table with `Member Count`, `Project Count`, `Storage Used`
- Mock missing backend fields with `// TODO(backend): provide {field}` comments and fallback `—`

### Phase 5 — Feature flag
- Create `frontend/src/features/analytics/dashboardConfig.js` with `USE_ANALYTICS_FIELDS_EXPORT = true`
- Guard new tables, export button, filter chips behind flag

### Phase 6 — UI/UX polish
- Sticky headers, zebra striping, hover highlight
- Filter chips, clear-all, saved presets in localStorage
- Responsive: cards below 768px or horizontal scroll
- Empty state for no matching filters
- Skeleton rows matching column count

### Phase 7 — Tests
Extend `AnalyticsDashboards.test.mjs` with >=3 tests:
1. New columns render in source
2. Filter apply/clear logic present
3. Export button triggers download

### Phase 8 — Build + sync
1. `npm ci && npm run build`
2. Fix build errors
3. Sync changed files to `/root/processmap_v1/frontend`

### Phase 9 — Deploy + verify
1. Deploy to `clearvestnic.ru:5177`
2. `curl` health check
3. Screenshots of new fields and Excel export
4. Fill `RUNTIME_PROOF_CHECKLIST.md`

### Phase 10 — Handoff
1. Mirror report as executor
2. Create `EXEC_REPORT.md`
3. Mark `READY_FOR_REVIEW`
4. Do NOT merge without user approval

---

## 6. File inventory

### New
- `frontend/src/features/analytics/dashboardConfig.js`
- `frontend/src/features/analytics/useAnalyticsFilters.js`
- `frontend/src/features/analytics/AnalyticsTableToolbar.jsx`
- `frontend/src/features/analytics/AnalyticsDataTable.jsx`
- `frontend/src/lib/analyticsExport.js`

### Modified
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/features/analytics/SessionAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/ProjectAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/WorkspaceAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/dashboardModel.js`
- `frontend/src/features/analytics/AnalyticsSkeleton.jsx`
- `frontend/src/features/analytics/AnalyticsDashboards.test.mjs`
- `frontend/src/index.css`

### Sync target
- `/root/processmap_v1/frontend/*`

---

## 7. Acceptance criteria

- [ ] New fields/columns on all three dashboards
- [ ] Columns sortable and filterable
- [ ] Export button top-right, filename correct
- [ ] Workbook has metadata + data sheets
- [ ] Feature flag gates new functionality
- [ ] Sticky header, zebra striping, hover highlight, responsive behavior
- [ ] >=3 tests passing
- [ ] `npm ci && npm run build` passes
- [ ] Deployed and verified on `clearvestnic.ru:5177`
- [ ] Changes synced to `/root/processmap_v1`
- [ ] Git tag `pre-fields-export` exists

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| Missing backend fields | Mock with TODO + fallback |
| Bundle bloat | Use client-side xlsx; escalate if >10k rows |
| Shared components affected | Avoid overlay/auth code |
| Responsive breakage | Horizontal scroll + card fallback |
| Build failure | Pin xlsx version, build early |
| Sync missed | Explicit file list + git diff verification |
| Deploy failure | Curl + screenshots; rollback tag ready |

---

## 9. Handoff

**Agent 2 / Worker:** implement phases 1–9, produce `EXEC_REPORT.md`, mark `READY_FOR_REVIEW`.  
**Agent 3 / Reviewer:** verify against `REVIEWER_PROMPT.md` acceptance criteria.  
**Merge gate:** user approval required per AGENTS.md §7.

---

*PLAN.md v1 — generated by Agent 1 / Planner*
*Next: WORKER_PROMPT.md*
