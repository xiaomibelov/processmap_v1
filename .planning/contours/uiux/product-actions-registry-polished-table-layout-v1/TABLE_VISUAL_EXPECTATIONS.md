# Table Visual Expectations

Контур: `uiux/product-actions-registry-polished-table-layout-v1`

## Table dominance

- Table is the primary working area: widest content surface, strongest workflow affordance, and visually below the filters/actions stack.
- Metrics and warning do not crowd the table or make it feel secondary.
- Sources section appears after table/pagination and reads secondary.

## Header and columns

- Table header is calm, readable, and aligned with columns.
- Header contrast helps scanning but does not look like a critical banner.
- Column widths avoid severe truncation of product/action text.
- BPMN code column/treatment is muted and compact.

## Rows

- Rows have clear separation through spacing, border, or subtle background.
- Hover state is visible and does not shift layout.
- Dense content remains readable on desktop viewport.
- Tags under actions are compact and secondary.
- Row height is consistent enough for scanning; expanded/details UI is optional and must not be half-built.

## Status badges

- `Полная` and `Неполная` badges are visually consistent and aligned.
- `Неполная` can use soft warning color, but must not read like a destructive error.
- Badge text remains readable in light/dark theme contexts if both are supported by current page.

## Selection and sticky header

- Checkbox column is acceptable only with safe existing selection support.
- If no checkbox column is implemented, AI selected count must still be truthful and Agent 2 should document the boundary.
- Sticky header is optional; if implemented, it must not overlap global topbar, controls, or table content.

## Reject conditions

- Table is visually smaller than metrics/sources or appears as a narrow embedded panel.
- BPMN codes dominate row content.
- Tags or badges create clutter that blocks fast row scanning.
- Empty table state removes the working table shell entirely.
- Table review relies on fake populated data.
