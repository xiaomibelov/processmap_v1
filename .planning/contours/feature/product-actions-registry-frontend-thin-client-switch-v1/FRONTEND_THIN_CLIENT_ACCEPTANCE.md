# FRONTEND_THIN_CLIENT_ACCEPTANCE

## Acceptance Criteria

Frontend Product Actions Registry должен использовать backend view-model fields как primary source:

- `filter_options` для filter controls/options;
- `applied_filters` как normalized backend echo where useful;
- `metrics` для counters/summary where available;
- `empty_state` для machine-readable empty state;
- `source_state` для source/provenance display where available.

## Compatibility

Fallbacks должны остаться:

- если backend field отсутствует, frontend может использовать текущие локальные вычисления;
- существующий response shape `rows`, `summary`, `sessions`, `session_summary`, `page` должен продолжать работать;
- CSV/XLSX export payload and buttons must remain compatible.

## UI Preservation

Не менять визуальный дизайн без необходимости:

- Analytics остается top-level section;
- `Реестр действий` остается inner module Analytics;
- AI controls remain visible in the same logical area;
- no global shell redesign;
- no fake data.

## Tests

Agent 2 должен добавить/обновить frontend tests for:

- populated registry response with backend view-model fields;
- empty state response;
- filter options from backend;
- metrics from backend;
- export behavior still uses current endpoint namespace;
- fallback behavior when additive fields are absent.
