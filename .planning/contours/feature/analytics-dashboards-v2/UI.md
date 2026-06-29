# UI — feature/analytics-dashboards-v2

## 1. Layout (сохраняем текущую сетку)

```text
┌─────────────────────────────────────────────────────────────┐
│ Row 1: KPI Ribbon (full-width, low height)                  │
├───────────────────────────┬─────────────────────────────────┤
│ Row 2: Donut Property     │ Donut ValueTypes                │
│        Families           │                                 │
├───────────────────────────┼─────────────────────────────────┤
│ Row 3: Bar Categories     │ Bar TaskStatuses                │
├───────────────────────────┴─────────────────────────────────┤
│ Row 4: Line SessionTrend (full-width)                       │
├───────────────────────────┬─────────────────────────────────┤
│ Row 5: Bar Top-5 Props    │ Bar BPMN ElementTypes           │
├───────────────────────────┼─────────────────────────────────┤
│ Row 6: Bar ProcessDuration│ Heatmap Activity                │
├───────────────────────────┴─────────────────────────────────┤
│ Row 7: Bar Top-5 Processes by Duration (fallback)           │
└─────────────────────────────────────────────────────────────┘
```

## 2. CSS / Grid

- Родитель: `.analyticsDashboardsGrid` — 2 колонки на `≥1024px`, 1 колонка на меньших.
- Full-width плитки (Row 1, Row 4): дополнительный класс `.analyticsDashboardCard--full` с `grid-column: 1 / -1`.
- Row-контейнеры: обёртка `.analyticsDashboardsRow` из двух карточек; для full-width — одна карточка.

```css
.analyticsDashboardsRow {
  display: contents; /* или grid sub-layout */
}

.analyticsDashboardCard--full {
  grid-column: 1 / -1;
}
```

## 3. Presentational Components

### DashboardKpiRibbon

- 5 мини-карточек в row flex/grid.
- Использует `DashboardMetricCard` с иконками.
- Compact: padding 12px, font 13px.

### DashboardTaskStatusDonut

- Reuses `AnalyticsDonutChart`.
- Colors: completed = success, active = accent, failed = danger, pending = warning.

### DashboardSessionTrendLine

- New lightweight SVG line chart.
- X-axis: labels (даты/недели).
- Y-axis: auto-scale.
- Stroke: `hsl(var(--accent))`.
- Area fill: `hsl(var(--accent) / 0.1)`.
- Empty state: «Нет данных».

### DashboardBpmnElementTypesBar

- Reuses `DashboardBarChart`.
- 4 items: task, gateway, event, subprocess.

### DashboardProcessDurationBar

- Reuses `DashboardBarChart`.
- Items: `{ label: process_title, value: avg_duration_min }`.
- Top-5, sorted desc.

### DashboardActivityHeatmap

- Grid 7 rows × 24 columns OR 2 separate mini-bars:
  - `by_hour`: 24 vertical columns.
  - `by_weekday`: 7 horizontal bars.
- Color intensity via `hsl(var(--accent) / opacity)`.

### DashboardBarChart — compact mode

Add prop `compact`:
- smaller padding
- label font 12px
- max 5 rows (slice)

## 4. Tokens

- Background: `hsl(var(--bg-card) / 0.98)`
- Border: `1px solid hsl(var(--border))`
- Text: `var(--analysis-text)`
- Muted: `var(--analysis-muted)`
- Accent: `hsl(var(--accent))`
- Success: `hsl(var(--success))`
- Warning: `hsl(var(--warning))`
- Danger: `hsl(var(--danger))`

## 5. Responsive

- Desktop (`≥1024px`): 2-col grid, KPI ribbon horizontal.
- Tablet (`768px–1023px`): 2-col grid, KPI ribbon wraps.
- Mobile (`<768px`): 1-col, KPI ribbon vertical, charts full-width.

## 6. Accessibility

- All tiles have `data-testid`.
- Charts have `role="img"` and `aria-label`.
- Color contrast via existing tokens.
