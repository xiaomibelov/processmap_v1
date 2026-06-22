# Audit Report — analytic_01

## Source Truth

- Repo root: `/opt/processmap-test`
- Branch: `feature/analytics-nav-ux-fix`
- HEAD: `7fed6c0f0c93cd840a03ee641722e403e2c9b3fa`
- `origin/main`: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status: working tree has untracked agent/planning directories; no uncommitted changes in tracked product files.
- `git diff --check`: passes.

## Methodology

1. Pre-flight source truth verification.
2. Static review of scoped source files:
   - `frontend/src/features/analytics/useAnalyticsRouteState.js` and its test.
   - `frontend/src/features/analytics/AnalyticsDashboards.jsx`, `SessionAnalyticsDashboard.jsx`, `ProjectAnalyticsDashboard.jsx`, `WorkspaceAnalyticsDashboard.jsx` and dashboard tests.
   - `frontend/src/features/analytics/AnalyticsSkeleton.jsx`, `AnalyticsErrorState.jsx`, `AnalyticsEmptyState.jsx`.
   - `frontend/src/features/topbar/TopBarContainer.jsx` and its test.
   - `frontend/src/styles/tokens.css`, `frontend/src/styles/tailwind.css`.
   - `frontend/src/app/processMapRouteModel.js` (reference).
3. Test execution via `node --test`.
4. Runtime verification with Playwright against `http://localhost:5177`.

## Findings

### P0 — Critical

None.

### P1 — Functional

1. **useAnalyticsRouteState.js:53-71** — Four separate `popstate` listeners are registered (`syncAnalyticsHubRoute`, `syncProductActionsRegistryRoute`, `syncPropertiesRegistryRoute`, `syncDashboardsRoute`). Each listener reads the same `window.location` and updates a subset of state. On every `popstate`, four state setters run sequentially, causing four re-renders and potential race/interleaving issues. All four read functions are independent of anything but `window.location`, so a single listener that updates all four routes is sufficient.
   - Impact: unnecessary renders, higher bug surface, harder to reason about ordering.
   - Evidence: code shows four `useEffect` registrations with four different callbacks; tests assert `popstateListeners.size >= 2`.
   - Recommended contour: `fix/analytics-route-state-popstate-cleanup-v1`.

2. **useAnalyticsRouteState.js:250-267** — Raw state setters (`setAnalyticsHubRoute`, `setProductActionsRegistryRoute`, `setPropertiesRegistryRoute`, `setDashboardsRoute`) are returned from the hook. No consumer in the scoped files uses them; they bypass the URL-synchronization contract encoded in `open*` / `close*` actions. Exposing them allows callers to create state that is inconsistent with `window.location`.
   - Impact: breaks source-of-truth invariant (URL is truth); invites subtle navigation bugs.
   - Evidence: returned object contains all four setters; tests only assert `typeof` is function.
   - Recommended contour: `fix/analytics-route-state-encapsulation-v1`.

3. **useAnalyticsRouteState.test.mjs:234-365** — The test file contains an inline, simplified re-implementation of the hook rather than importing the real `useAnalyticsRouteState.js`. The inline copy only models two of the four route states and omits `propertiesRegistryRoute` and `dashboardsRoute` entirely. As a result, the tests do not verify the actual product code; they verify a hand-maintained mock.
   - Impact: source code can drift without test failures; new regressions in `openDashboards` / `closePropertiesRegistry` etc. will not be caught.
   - Evidence: test file does not import from `useAnalyticsRouteState.js`; it defines its own `useAnalyticsRouteState` function.
   - Recommended contour: `fix/analytics-route-state-tests-v1`.

4. **useAnalyticsRouteState.test.mjs** — Missing tests for `openPropertiesRegistry`, `closePropertiesRegistry`, `openDashboards`, `closeDashboards`, scope-change reset for all four routes, and `return_to` behavior when the user is not coming from analytics.
   - Impact: low confidence that the four-surface navigation model works end-to-end.
   - Evidence: only analytics-hub and product-actions-registry open/close paths are asserted.
   - Recommended contour: `fix/analytics-route-state-tests-v1`.

5. **TopBarContainer.jsx:8-12,50-54** — `isAnalyticsSurface()` duplicates the list of analytics surface names already defined as constants in `processMapRouteModel.js` (`ANALYTICS_HUB_SURFACE`, `PRODUCT_ACTIONS_REGISTRY_SURFACE`, `PROPERTIES_REGISTRY_SURFACE`, `DASHBOARDS_SURFACE`). `TopBarContainer.jsx` also derives active state by OR-ing `analyticsHubRoute.active || productActionsRegistryRoute.active || propertiesRegistryRoute.active || dashboardsRoute.active`, while the legacy helper uses the duplicated local list; the two can drift.
   - Impact: inconsistent surface list between route model and TopBar; future surface additions risk partial recognition.
   - Evidence: hardcoded array `["analytics", "product-actions-registry", "process-properties-registry", "dashboards"]` in `TopBarContainer.jsx`.
   - Recommended contour: `fix/topbar-analytics-active-state-v1`.

6. **TopBarContainer.jsx:6,50,56-66** — Feature flag `USE_ANALYTICS_ROUTE_STATE_NAV` is a module-level `const` set to `true`. The legacy fallback branch is dead code at runtime and is not exercised by any automated tests. If the flag is meant as a kill-switch, there is no runtime mechanism to flip it without a code change.
   - Impact: legacy branch rots; rollback requires a commit/redeploy.
   - Evidence: `const USE_ANALYTICS_ROUTE_STATE_NAV = true`; tests only assert the flag string exists.
   - Recommended contour: `fix/topbar-analytics-active-state-v1`.

### P2 — UX / Accessibility

7. **SessionAnalyticsDashboard.jsx:54,64,70,82,91,101; ProjectAnalyticsDashboard.jsx:47,57,73,81-84; WorkspaceAnalyticsDashboard.jsx:45,54,68,78-81; AnalyticsErrorState.jsx:2,19; AnalyticsEmptyState.jsx:2-3** — Hardcoded Russian UI strings are used throughout the analytics dashboards and state components. The rest of the application appears to use an i18n hook for strings, but these components do not.
   - Impact: blocks localization; inconsistent UX; strings cannot be overridden per deployment.
   - Evidence: multiple literal Cyrillic strings (e.g., `"Аналитика сессии"`, `"Ошибка загрузки"`, `"Повторить"`).
   - Recommended contour: `fix/analytics-i18n-v1`.

8. **AnalyticsEmptyState.jsx:5-6** — Empty state wrapper has no `role` or `aria-live` attribute. Unlike `AnalyticsSkeleton` (`role="status" aria-live="polite"`) and `AnalyticsErrorState` (`role="alert"`), the empty state is not announced to screen readers when it appears after loading.
   - Impact: screen-reader users may not perceive that content is intentionally empty.
   - Evidence: root `<div>` only has `data-testid="analytics-empty"`.
   - Recommended contour: `fix/analytics-a11y-empty-state-v1`.

9. **ProjectAnalyticsDashboard.jsx:78-85; WorkspaceAnalyticsDashboard.jsx:75-82** — Data tables use `<th>` headers without `scope="col"`. While visual presentation is clear, explicit scope improves screen-reader navigation.
   - Impact: minor screen-reader ergonomics issue.
   - Evidence: `<th>Сессия</th>` etc. with no `scope` attribute.
   - Recommended contour: `fix/analytics-a11y-tables-v1`.

10. **SessionAnalyticsDashboard.jsx:60-67** — On retry, focus remains on the retry button; there is no focus reset to the loaded content or an announcement that a retry is in progress. This is a minor usability issue for keyboard/screen-reader users.
    - Impact: users may not be notified that content is reloading.
    - Evidence: `onRetry={() => setRetryNonce((n) => n + 1)}` with no focus management.
    - Recommended contour: `fix/analytics-a11y-focus-v1`.

### P3 — Cleanup / Test Coverage

11. **tailwind.css:12011-12021** — `.analyticsDashboardsLoading`, `.analyticsDashboardsError`, `.analyticsDashboardsEmpty` classes are defined but not used. The components import `AnalyticsSkeleton`, `AnalyticsErrorState`, `AnalyticsEmptyState` instead.
    - Impact: dead CSS increases bundle size and maintenance noise.
    - Evidence: grep shows no component referencing these class names.
    - Recommended contour: `fix/analytics-css-cleanup-v1`.

12. **tokens.css:177-182; tailwind.css:5-10** — `--registry-bg-canvas`, `--registry-bg-surface`, `--registry-text-primary`, `--registry-purple-primary`, `--registry-green-complete`, `--registry-orange-partial` are declared in both `tailwind.css` (root) and `tokens.css` dark section. This duplication is confusing and may cause specificity surprises.
    - Impact: token source of truth is split.
    - Evidence: identical declarations in two files.
    - Recommended contour: `fix/analytics-css-cleanup-v1`.

13. **AnalyticsDashboards.jsx:11-13** — `onClose`, `onOpenProductActionsRegistry`, and `onOpenPropertiesRegistry` props are accepted but never used inside the component.
    - Impact: misleading public API; consumers may pass handlers that silently do nothing.
    - Evidence: destructured props are absent from the returned JSX and child prop calls.
    - Recommended contour: `fix/analytics-dashboards-props-v1`.

14. **AnalyticsDashboards.test.mjs** — Tests are source-assertion (regex / string inclusion) rather than runtime behavior tests. They read implementation files and check for patterns but do not mount components or exercise data fetching, error handling, retry, or empty branches.
    - Impact: high pass rate but low confidence in actual behavior.
    - Evidence: every test uses `assert.match(source, ...)` or `assert.equal(source.includes(...), false)`.
    - Recommended contour: `fix/analytics-dashboards-tests-v1`.

15. **TopBarContainer.test.mjs** — Tests are also source-assertion only; they do not render `TopBarContainer`, toggle the feature flag, or verify active-state derivation under different surfaces.
    - Impact: active-state bugs will not be caught by tests.
    - Evidence: tests assert that source strings exist.
    - Recommended contour: `fix/topbar-analytics-tests-v1`.

## Test Results

- `useAnalyticsRouteState.test.mjs`: PASS (12/12)
- `AnalyticsDashboards.test.mjs`: PASS (13/13)
- `TopBarContainer.test.mjs`: PASS (4/4)

All tests pass, but note findings #3, #4, #14, and #15: the tests are mostly source-assertion style and do not fully exercise the implementation.

## Runtime Proof

- Dev server `localhost:5177` is running and returns HTTP 200 for all requested surfaces.
- Playwright navigation was attempted for:
  - `?surface=analytics`
  - `?surface=product-actions-registry`
  - `?surface=process-properties-registry`
  - `?surface=dashboards`
- Each surface redirected to the login page (`/?next=...`) because the browser session is unauthenticated. Therefore, header active state and back/forward navigation inside analytics surfaces could not be observed directly.
- Console errors observed: 8 × `401 (Unauthorized)` from API calls / route guards (see `evidence/runtime-report.json`).
- Screenshots saved to `.planning/contours/audit/analytic_01/evidence/`:
  - `surface-analytics.png`
  - `surface-product-actions-registry.png`
  - `surface-process-properties-registry.png`
  - `surface-dashboards.png`
  - `back-forward-final.png`
- Conclusion: runtime proof is partial. The server is healthy, but analytics surface rendering requires an authenticated session, which was not available in the worker environment. Static review is the primary evidence base for this audit.

## Recommended Next Contours

1. `fix/analytics-route-state-tests-v1` — rewrite `useAnalyticsRouteState.test.mjs` to import and test the real hook; add tests for all `open*` / `close*` handlers and scope-change reset. Highest priority because the current tests do not guard the product code.
2. `fix/analytics-route-state-popstate-cleanup-v1` — consolidate the four `popstate` listeners into one.
3. `fix/analytics-route-state-encapsulation-v1` — remove exposed raw setters or document their valid use case.
4. `fix/topbar-analytics-active-state-v1` — derive active state from route-model constants; decide whether the feature flag should be runtime-configurable.
5. `fix/analytics-i18n-v1` — replace hardcoded Russian strings with i18n keys.
6. `fix/analytics-css-cleanup-v1` — remove dead CSS classes and deduplicate registry tokens.
7. `fix/analytics-dashboards-tests-v1` / `fix/topbar-analytics-tests-v1` — add component-level behavior tests.
8. `fix/analytics-a11y-empty-state-v1` / `fix/analytics-a11y-tables-v1` / `fix/analytics-a11y-focus-v1` — address accessibility polish.
