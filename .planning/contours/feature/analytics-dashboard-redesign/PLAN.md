# PLAN — Analytics Dashboard UI/UX Redesign

Contour: `feature/analytics-dashboard-redesign`
Branch: `feature/analytics-dashboard-redesign` from `new-origin/main`
Created: 2026-06-24

## Goal
Redesign the backend-driven analytics UI embedded in workspace/project/session views:
- Polished metric cards with icons, tone colors, mini sparklines.
- Real data visualizations in the Dashboards tab (roles, sections, types, duration top-5).
- Styled tables with badges, hover, sticky header, empty states.
- Compact header with breadcrumb/scope switcher and pill tabs.

## Source truth

- Repo: `/root/processmap_v1` (canonical `/opt/processmap-test`)
- Remote: `new-origin https://github.com/xiaomibelov/processmap_v1.git`
- Base: `new-origin/main` @ `d1e6adba`
- Current branch: `feature/analytics-dashboard-redesign`

## Implementation phases

### Phase 1 — Foundation
- Create `frontend/src/features/analytics/icons/` with inline SVG icon components.
- Add tone-aware metric card styles to `tailwind.css`.
- Add chart wrapper styles (bar, donut, horizontal bar).

### Phase 2 — Overview tab
- Redesign `DashboardMetricCard.jsx`: accept `icon`, `tone`, `unit`, mini sparkline.
- Update `AnalyticsPage.jsx` Overview grid: 8 metrics with icons & tones.
- Map tones: actions=success, duration=default, critical path=warning, handoffs=accent, open=default, critical=danger, sessions/projects=default.

### Phase 3 — Dashboards tab
- Build reusable chart components:
  - `AnalyticsBarChart.jsx` (vertical/horizontal bars)
  - `AnalyticsDonutChart.jsx`
- Populate Dashboards panel with:
  - actions_by_role bar chart
  - actions_by_section bar chart
  - actions_by_type donut chart
  - top-5 elements by duration (horizontal bar) if data available
- Remove metric cards duplication from Dashboards panel.

### Phase 4 — Tables
- Create `AnalyticsDataTable.jsx` (styled, sticky header, badges).
- Refactor `AnalyticsActionsPanel.jsx` to use new table + empty state.
- Refactor `AnalyticsPropertiesPanel.jsx` to use new table + value pills + truncated JSON tooltip.
- Add badge color helpers for property type / action role / section.

### Phase 5 — Header & tabs
- Redesign header: larger title, breadcrumb path, compact scope switcher.
- Convert module tabs to pill-style segmented control.
- Style filter bar and export button inline with toolbar.

### Phase 6 — Verify
- `npm run build` PASS.
- Unit tests PASS.
- Smoke test all 4 tabs on `http://clearvestnic.ru:5177`.
- Create PR, wait for approval, merge with regular merge commit, deploy.

## Risks / Constraints

- No new libraries >50kb. Use SVG/custom components.
- Preserve existing API payload unwrap (`response.data.data`).
- Do not change backend analytics endpoints.
- No merge/deploy without explicit user approval (AGENTS.md §7).

## Acceptance criteria

- [ ] Overview cards with icons, tones, sparklines.
- [ ] Dashboards tab with 3+ charts using real data.
- [ ] Properties table with badges, pills, hover, sticky header.
- [ ] Actions table with badges/empty state.
- [ ] Scope switcher as segmented control.
- [ ] Pill-style tabs.
- [ ] Responsive at 1280px and 1920px.
- [ ] `npm run build` PASS.
- [ ] Deploy + smoke-test screenshots for all 4 tabs.
- [ ] PR merged with regular merge commit, no squash.
