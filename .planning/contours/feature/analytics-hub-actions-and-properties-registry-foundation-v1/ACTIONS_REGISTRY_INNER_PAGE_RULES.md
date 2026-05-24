# Правила inner page `Реестр действий с продуктом`

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Scope

Эти правила применяются только к внутренней странице `Реестр действий с продуктом`.

Они не требуют превращать весь Analytics Hub в single-container design.

## Visual contract

- Один unified white content container.
- No gradients.
- No dotted borders.
- No colored metric cards.
- No internal shadows.
- Light separators only.
- Table is primary content.
- Header содержит `Реестр действий с продуктом`.
- CSV/XLSX controls находятся в header.
- Scope selector/tabs компактные.
- Metrics are compact text metrics.
- Filters are compact and near table.
- AI row is in the primary area, without gradient/background.
- Warning row is soft, not aggressive banner.
- Sources/data-source section is secondary and separated.

## Data states

- Empty workspace scope still shows page structure.
- Populated project scope shows rows and controls.
- No fake data.
- No fake metrics.
- Existing registry behavior must remain functional.

## Non-goals

- No durable Product Actions truth mutation.
- No backend/schema work.
- No BPMN XML mutation.
- No RAG runtime changes.
- No global ProcessMap shell/header/sidebar redesign.
