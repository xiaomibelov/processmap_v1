# TESTS — feature/analytics-dashboards-v2

## 1. Backend Tests

### `backend/tests/test_analytics_dashboard.py`

- `test_dashboard_returns_kpi_section` — assert `kpi.total_sessions` etc.
- `test_dashboard_returns_task_statuses` — assert 4 statuses.
- `test_dashboard_returns_session_trend` — assert points array and granularity.
- `test_dashboard_returns_bpmn_element_types` — assert task/gateway/event/subprocess keys.
- `test_dashboard_returns_process_duration` — assert top-5 list.
- `test_dashboard_returns_activity_heatmap` — assert by_hour len 24, by_weekday len 7.

### `backend/tests/test_analytics_schema.py`

- Validate `AnalyticsDashboardOut` serialization with new fields.

## 2. Frontend Model Tests

### `frontend/src/features/analytics/dashboardModel.test.mjs`

- `normalizeDashboardKpi` — maps kpi fields to cards.
- `normalizeTaskStatuses` — maps status object to donut items.
- `normalizeSessionTrend` — maps points to line chart points.
- `normalizeBpmnElementTypes` — maps type counts to bar items.
- `normalizeProcessDuration` — maps process_duration to bar items (top-5).
- `normalizeActivityHeatmap` — maps by_hour/by_weekday to heatmap cells.
- `topUsedPropertiesToBarItems` — slices top 5 and sorts.

## 3. Frontend Component Tests

### `frontend/src/features/analytics/AnalyticsDashboardsPanel.test.mjs`

- `renders kpi ribbon`
- `renders task status donut`
- `renders session trend line`
- `renders bpmn element types bar`
- `renders process duration bar`
- `renders activity heatmap`
- `renders top-5 properties only (not top-20)`
- `shows loading state`
- `shows error state with retry`
- `shows empty state when no data`

### New component tests

- `frontend/src/features/analytics/dashboard/DashboardSessionTrendLine.test.mjs`
- `frontend/src/features/analytics/dashboard/DashboardActivityHeatmap.test.mjs`

## 4. Build & Lint

- `npm run build` — 0 errors.
- `node --test src/**/*.test.mjs` — all pass.
- `pytest tests/test_analytics_dashboard.py` — all pass.

## 5. Manual / Runtime Checks

- Open Analytics → Dashboards.
- Verify 7 rows layout.
- Verify no "Будет позже" placeholder.
- Verify dark/light switch.
- Verify mobile stacking.
