# API_RUNTIME_CHECKLIST

## Agent 3 API Checks

- Confirm route namespace remains `/api/analysis/product-actions/registry/*`.
- Confirm `/api/analytics/*` is not introduced by this contour.
- Confirm query response includes:
  - `filter_options`
  - `applied_filters`
  - `metrics`
  - `empty_state`
  - `source_state`
- Confirm `filter_options` are from filter universe, not only current page.
- Confirm `metrics.total_rows`, `metrics.filtered_rows`, `metrics.page_rows`, `metrics.has_more` are coherent with `rows` and `page`.
- Confirm empty states:
  - populated result: `not_empty`;
  - filtered no rows: `no_filtered_rows`;
  - project/session with no actions: `no_actions` or documented equivalent;
  - no sessions: `no_sessions` or documented equivalent.
- Confirm query/export parity for same filters.
- Confirm no mutation:
  - no BPMN XML mutation;
  - no Product Actions durable truth mutation;
  - no unsafe PUT/PATCH/DELETE caused by viewing/navigation.

## Agent 4 Runtime Checks

- Fresh `http://clearvestnic.ru:5180` proof.
- Confirm served build/runtime matches intended contour.
- Login/authenticated navigation if required.
- Open Analytics.
- Open `Реестр действий`.
- Check populated project scope.
- Check empty workspace scope.
- Check filters, metrics, sources, exports, AI controls.
- Capture console/network evidence.
- REVIEW_PASS only with coherent source/runtime/API evidence.
