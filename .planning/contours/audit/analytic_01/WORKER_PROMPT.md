# WORKER_PROMPT — Agent 2 / Executor

## Identity

You are **Agent 2 / Worker** executing the `audit/analytic_01` contour.

**Scope:** Static and runtime audit of the ProcessMap analytics frontend implementation.
**Constraint:** Audit-only. No code changes. No fixes. Collect evidence and write `AUDIT_REPORT.md`.

---

## Pre-flight Checklist

Before starting, verify and record in `AUDIT_REPORT.md`:

1. [ ] `pwd` — confirm `/opt/processmap-test`
2. [ ] `git branch --show-current` — record branch name
3. [ ] `git rev-parse HEAD` — record commit SHA
4. [ ] `git status -sb` — confirm no uncommitted changes in tracked product files
5. [ ] `git diff --check` passes
6. [ ] Read `PLAN.md` and this `WORKER_PROMPT.md`

If the checkout is dirty with unrelated changes, stop and report the blocker.

---

## Scope

Read only these files:

- `frontend/src/features/analytics/useAnalyticsRouteState.js`
- `frontend/src/features/analytics/useAnalyticsRouteState.test.mjs`
- `frontend/src/features/analytics/AnalyticsDashboards.jsx`
- `frontend/src/features/analytics/AnalyticsDashboards.test.mjs`
- `frontend/src/features/analytics/SessionAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/ProjectAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/WorkspaceAnalyticsDashboard.jsx`
- `frontend/src/features/analytics/AnalyticsSkeleton.jsx`
- `frontend/src/features/analytics/AnalyticsErrorState.jsx`
- `frontend/src/features/analytics/AnalyticsEmptyState.jsx`
- `frontend/src/features/topbar/TopBarContainer.jsx`
- `frontend/src/features/topbar/TopBarContainer.test.mjs`
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/tailwind.css`
- `frontend/src/app/processMapRouteModel.js` (reference only)

Do not modify any of them.

---

## Audit Steps

### Step 1: Source Truth
Run the source truth commands from `PLAN.md` and record them in the report.

### Step 2: Hook Audit
Review `useAnalyticsRouteState.js` for:
- Duplicate `popstate` listeners (four separate `useEffect` registrations).
- `useCallback` dependency correctness.
- Scope change reset logic.
- Missing handlers (`openPropertiesRegistry`, `closePropertiesRegistry`, `openDashboards`, `closeDashboards`) in tests.
- Exposure of raw state setters.

### Step 3: Dashboard Audit
Review the three dashboard components for:
- Correct use of skeleton/error/empty states.
- Data fetch lifecycle and error handling.
- Hardcoded strings.
- Prop drilling depth.

### Step 4: Shell State Audit
Review `AnalyticsSkeleton.jsx`, `AnalyticsErrorState.jsx`, `AnalyticsEmptyState.jsx` for:
- Accessibility roles and `aria-*` attributes.
- Testability (`data-testid`).
- Visual consistency with design system.

### Step 5: TopBar Integration Audit
Review `TopBarContainer.jsx` for:
- Feature flag `USE_ANALYTICS_ROUTE_STATE_NAV` usage.
- Legacy fallback coexistence.
- Active state derivation from `analyticsHubRoute.active`.

### Step 6: CSS/Token Audit
Review `tailwind.css` and `tokens.css` for:
- New analytics-specific tokens.
- Contrast and a11y.
- Dead or duplicated CSS.

### Step 7: Test Gap Audit
Compare tests to implementation. List untested branches.

### Step 8: Optional Runtime Proof
If `localhost:5177` is reachable:
- Navigate to `?surface=analytics`, `?surface=product-actions-registry`, etc.
- Verify header active state and back/forward navigation.
- Take screenshots and record console errors.

If not reachable, state so explicitly.

### Step 9: Run Existing Tests
Run:

```bash
cd /opt/processmap-test/frontend
node --test src/features/analytics/useAnalyticsRouteState.test.mjs
node --test src/features/analytics/AnalyticsDashboards.test.mjs
node --test src/features/topbar/TopBarContainer.test.mjs
```

Record pass/fail status.

---

## Report Structure

Write `AUDIT_REPORT.md` in the contour directory with:

```markdown
# Audit Report — analytic_01

## Source Truth
- Branch: ...
- HEAD: ...
- Status: ...

## Methodology
Brief list of audit phases performed.

## Findings

### P0 — Critical
None (or list).

### P1 — Functional
1. **File:line** — observation — impact — evidence — recommended contour.
...

### P2 — UX / Accessibility
...

### P3 — Cleanup / Test Coverage
...

## Test Results
- useAnalyticsRouteState.test.mjs: PASS/FAIL
- AnalyticsDashboards.test.mjs: PASS/FAIL
- TopBarContainer.test.mjs: PASS/FAIL

## Runtime Proof
Screenshots or "static audit only".

## Recommended Next Contours
Ranked list of fix contours with scope and rationale.
```

---

## Final Deliverables

1. `AUDIT_REPORT.md` in `.planning/contours/audit/analytic_01/`.
2. Any screenshots saved to `.planning/contours/audit/analytic_01/evidence/` (optional).
3. Update `STATE.json` to:

```json
{
  "status": "done",
  "audit_report": "AUDIT_REPORT.md",
  "findings_count": 0,
  "test_status": {
    "useAnalyticsRouteState": "PASS|FAIL|NOT_RUN",
    "AnalyticsDashboards": "PASS|FAIL|NOT_RUN",
    "TopBarContainer": "PASS|FAIL|NOT_RUN"
  },
  "runtime_proof": "static|runtime"
}
```

4. Create marker `READY_FOR_REVIEW` (empty file) in the contour directory.

## Dev Server Requirement

Before creating `WORKER_DONE`, ensure the dev server on `:5177` is running and serves the current build. Check the `Date` response header; if it is stale (>1 minute old) or the server is down, start the dev server (`npm run dev` or equivalent in the frontend directory).
