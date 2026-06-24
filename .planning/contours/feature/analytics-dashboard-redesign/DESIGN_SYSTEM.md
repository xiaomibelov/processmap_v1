# UI/UX Design System — Analytics Dashboard Redesign

Contour: `feature/analytics-dashboard-redesign`
Product Type: Analytics Dashboard
Generated: 2026-06-24

## Color palette (from project CSS variables)

- Primary accent: `hsl(var(--accent))` — indigo `#4F46E5`
- Secondary accent: `hsl(var(--accent2))` — cyan/blue
- Success: `hsl(var(--success))` — green
- Warning: `hsl(var(--warning))` — orange/amber
- Danger: `hsl(var(--danger))` — red
- Text: `var(--analysis-text)`
- Muted: `var(--analysis-muted)`
- Background card: `hsl(var(--bg-card))`
- Background soft: `hsl(var(--bg-soft))`
- Border: `hsl(var(--border))`

## Metric cards

- Layout: CSS Grid `grid-cols-2 md:grid-cols-4 xl:grid-cols-6`, gap 12px.
- Card: `bg-card`, 1px border, border-radius 10px, padding 14px, subtle shadow.
- Left accent border 3px with tone color (`success`, `warning`, `danger`, `accent`).
- Icon: 20×20 inline SVG, top-right, tinted by tone.
- Label: 10px uppercase, letter-spacing 0.04em, muted.
- Value: 24px bold, analysis-text.
- Unit: 12px muted next to value.
- Mini sparkline: bottom of card, 4 bars, accent color, height 18px.

## Charts

- Bar chart (vertical/horizontal): SVG or div-based, rounded bars, track `bg-soft`, animated width.
- Donut chart: SVG `<circle>` with stroke-dasharray, center label.
- Colors per segment from palette; legend below.
- Card wrapper: `rounded-xl border border-border bg-panel p-4`.

## Tables

- Wrap: `analyticsDataTableWrap` (overflow-x auto, rounded, border).
- Table: `analyticsDataTable` with sticky header.
- Header: uppercase 11px, muted, bg-soft.
- Rows: alternating bg, hover `accent2/8`.
- Badges: small rounded pills, color by type.
- Numeric values with unit as blue pill badge.

## Tabs

- Pill-style segmented control: `rounded-lg border border-border bg-panel p-1`.
- Active: `bg-accent text-white`.
- Inactive: `text-muted hover:text-fg hover:bg-panel2`.

## Scope switcher

- Segmented control: Workspace | Project | Session.
- Same pill style as tabs.

## Empty state

- Centered icon 48px, title 14px medium, description 12px muted.

## Responsive

- <1280px: metric cards 2 per row, tables horizontal scroll.
- 1280–1919px: metric cards 4 per row.
- >=1920px: metric cards 6 per row.

## Icons

Use inline SVG components (no icon library to keep bundle small):
- `ActivityIcon`, `ClockIcon`, `HandoffIcon`, `QuestionIcon`, `CriticalIcon`, `SessionIcon`, `ProjectIcon`, `FilterIcon`, `DownloadIcon`, `ChartBarIcon`, `ChartPieIcon`, `TableIcon`.
