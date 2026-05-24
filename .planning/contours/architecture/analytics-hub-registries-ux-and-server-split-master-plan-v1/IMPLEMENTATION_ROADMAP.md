# Implementation roadmap

## Phase 0 - architecture / IA / UX direction approved

- Objective: утвердить master architecture for Analytics, registry roles, AI/RAG boundary and server split sequence.
- Scope: planning docs, worker reports, reviewer pass.
- Non-goals: code, schema, API implementation, deploy.
- Likely frontend files/surfaces: none changed; referenced only by Worker 2.
- Likely backend/API implications: none implemented.
- Validation: Agent 4 review gates, confirmed vs hypothesis matrix, roadmap actionable.
- Risks: vague plan, unsupported facts, mixing implementation with architecture.
- Suggested contour ID: `architecture/analytics-master-ia-ux-server-split-approval-v1`.

## Phase 1 - bounded Product Actions Registry IA/UI refactor

- Objective: сделать actions registry визуально структурированным и понятным.
- Scope: page hierarchy, scope selector, compact metrics, section boundaries, filters/actions arrangement, sources separation, AI suggestions placement, expandable row pilot if supported.
- Non-goals: new backend APIs, schema migration, properties registry, AI runtime.
- Likely frontend files/surfaces: `ProcessAnalyticsHub`, `ProductActionsRegistryPanel`, registry subcomponents, related tests/styles.
- Likely backend/API implications: none or only read-only compatibility checks.
- Validation: screenshots at desktop widths, empty/populated state, direct route and hub navigation, no product data mutation.
- Risks: decorative restyle without IA improvement; overloading a single page.
- Suggested contour ID: `uiux/product-actions-registry-ia-ui-refactor-v1`.

## Phase 2 - Product Properties Registry first version

- Objective: создать первый read-only concept implementation for `Реестр свойств`.
- Scope: source-truth definition, property groups, minimal registry page/card, filters, confirmed/hypothesis labeling.
- Non-goals: schema migration unless separately approved, BPMN XML mutation, AI auto-fill.
- Likely frontend files/surfaces: Analytics Hub module entry, new properties registry page/components, routing tests.
- Likely backend/API implications: first version may use existing confirmed/derived data; API proposal only if needed.
- Validation: property groups display source/confidence; unsupported data is marked as proposed/future.
- Risks: inventing fake durable truth; merging properties with actions registry too tightly.
- Suggested contour ID: `feature/product-properties-registry-readonly-v1`.

## Phase 3 - analytics server-side aggregation/export split

- Objective: move heavy aggregation, row shaping and export preparation toward server-side contracts.
- Scope: design and implement bounded read-only APIs/view models for actions/properties registries and exports.
- Non-goals: dashboards, AI mutations, broad backend rewrite.
- Likely frontend files/surfaces: registry data loaders/hooks, export UI consumers.
- Likely backend/API implications: analytics endpoints, pagination/filtering contracts, tests.
- Validation: API contract tests, frontend parity against previous data, export reproducibility.
- Risks: breaking existing frontend assumptions; mixing aggregation and UI redesign in one contour.
- Suggested contour ID: `feature/analytics-server-side-registry-view-models-v1`.

## Phase 4 - AI/RAG-assisted analytics enhancements

- Objective: add safe read-only AI/RAG assistance over analytics entities.
- Scope: explanation, filtering help, summary, export assistance, search over analytics entities.
- Non-goals: auto-mutation, BPMN XML changes, direct application of product actions.
- Likely frontend files/surfaces: AI side panel/callouts in actions/properties registries, hub summary card.
- Likely backend/API implications: optional server-prepared RAG context and batch summary support.
- Validation: AI outputs include source/confidence/status; no save/mutation side effects.
- Risks: AI answer perceived as canonical; unclear source attribution.
- Suggested contour ID: `feature/analytics-rag-readonly-assistant-v1`.

## Phase 5 - dashboards/advanced analytics expansion

- Objective: expand Analytics beyond registries into dashboards, trends and comparative analysis.
- Scope: dashboard modules, cross-session comparisons, quality/completeness trend cards.
- Non-goals: replace registries, write process data, unbounded BI platform.
- Likely frontend files/surfaces: Analytics Hub dashboard area, dashboard pages/components.
- Likely backend/API implications: aggregate dashboard endpoints and caching strategy.
- Validation: dashboard metrics trace back to registry/server sources; performance acceptable.
- Risks: dashboard visuals without reliable metrics; one-note information architecture.
- Suggested contour ID: `feature/analytics-dashboards-advanced-insights-v1`.
