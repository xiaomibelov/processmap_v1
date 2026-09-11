PREMIUM/URGENT TASK — Analytics UI/UX + Additional Fields + Excel Export

Context:
- ProcessMap frontend: React 18 + Vite + Tailwind + React Router v6
- Repo: /opt/processmap-test (working), /root/processmap_v1 (gateway build source)
- tools/agent-ui/ and agent-ui/ are NOT in git (untracked/.gitignore) — changes here must be explicitly handled
- Gateway image builds from /root/processmap_v1 — all frontend changes must be synced there before deploy
- Overlay team works in parallel — do NOT break shared components (header, URL builders Mz/TG, location-sync hooks)

Completed (do NOT redo):
- Analytics navigation fixed: useAnalyticsRouteState replaces pushState
- Skeleton, error, empty states added
- --analysis-* tokens and a11y rules added

NEW REQUIREMENTS:

1. ADDITIONAL FIELDS IN ANALYTICS INTERFACE
   - Session Analytics Dashboard: add "Duration", "Status", "Created By" columns to registry table
   - Project Analytics Dashboard: add "Total Sessions", "Last Activity", "Owner" columns
   - Workspace Analytics Dashboard: add "Member Count", "Project Count", "Storage Used" fields
   - All fields must be sortable and filterable
   - Use existing data model — do NOT create new API endpoints unless necessary. If backend fields missing, mock with TODO comments.

2. EXCEL EXPORT
   - Add "Export to Excel" button to each analytics dashboard (top-right, near filters)
   - Export current filtered/sorted view as .xlsx
   - Library: use xlsx (SheetJS) client-side, or if data is large (>10k rows), implement server-side endpoint /api/analytics/export
   - Filename: processmap-analytics-{surface}-{YYYY-MM-DD}.xlsx
   - Include all visible columns + current filters metadata in first sheet, data in second sheet

3. UI/UX POLISH (incremental on top of existing)
   - Table: sticky header, zebra striping, hover row highlight, column resize (optional)
   - Filters: inline filter chips, clear-all button, saved filter presets (localStorage)
   - Responsive: collapse to cards on <768px, horizontal scroll on tables with min-width
   - Empty state for "no matching filters": show applied filters + "Clear filters" CTA
   - Loading: skeleton rows matching table column count (already have skeleton cards, extend to table)

4. DEPLOYMENT & SYNC
   - All frontend changes must be in /opt/processmap-test AND synced to /root/processmap_v1
   - Build must pass: npm ci && npm run build
   - Deploy to test: clearvestnic.ru:5177
   - Verify: curl + screenshot proof of new fields and Excel export working
   - Rollback plan: git tag pre-fields-export, feature flag if touching shared components

CONSTRAINTS:
- DO NOT modify TopBarContainer, Mz(), TG(), _m, Td, xm, vm, Auth guard
- DO NOT break overlay navigation
- ui-ux-pro-max-skill must be used for table, filter, and export button design
- Feature flag: USE_ANALYTICS_FIELDS_EXPORT = true (toggle in Analytics dashboard config)
- Tests: at least 3 test cases (table render, filter apply, export button triggers download)

DELIVERABLES:
- PLAN.md with phase breakdown
- WORKER_PROMPT.md with implementation steps
- REVIEWER_PROMPT.md with acceptance criteria
- STATE.json with estimated time
- Working code in /opt/processmap-test
- Deployed and verified on clearvestnic.ru:5177