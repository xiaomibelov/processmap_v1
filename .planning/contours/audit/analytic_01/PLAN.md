# PLAN — Audit: Analytics Frontend Implementation Quality (analytic_01)

## Contour Identity

| Field | Value |
|-------|-------|
| **Contour ID** | `audit/analytic_01` |
| **Type** | Audit-only (no fixes, no product code changes) |
| **Scope** | ProcessMap analytics frontend: route-state hook, dashboard shells, TopBar integration, CSS/a11y tokens |
| **Runtime Target** | Local dev server `:5177` (optional; tests can run headless) |
| **Backend Target** | `localhost:8088` (only if runtime proof is collected) |
| **Deliverables** | `AUDIT_REPORT.md` in contour directory |
| **Language** | English for agent prompts; Russian acceptable for findings if source text is Russian |

---

## Objective

Produce a structured, evidence-based audit report of the analytics frontend implementation currently on the checked-out branch. The audit must identify concrete issues in:

1. `useAnalyticsRouteState.js` — correctness of popstate handling, URL builders, scope change resets, hook dependencies.
2. Dashboard components (`SessionAnalyticsDashboard.jsx`, `ProjectAnalyticsDashboard.jsx`, `WorkspaceAnalyticsDashboard.jsx`) — loading/error/empty state wiring, data fetching, prop drilling.
3. Shared state components (`AnalyticsSkeleton.jsx`, `AnalyticsErrorState.jsx`, `AnalyticsEmptyState.jsx`) — accessibility roles, testability, reuse.
4. `TopBarContainer.jsx` integration of `useAnalyticsRouteState` — feature flag fallback, active-state derivation, legacy navigation coexistence.
5. CSS/token changes (`tailwind.css`, `tokens.css`) — token naming, contrast, dead code, a11y compliance.

The verdict must be a short ranked list of issues with severity, evidence (file/line), and a recommended next contour for each fix.

---

## Source Truth

- Repo root: `/opt/processmap-test`
- Current branch: `feature/analytics-nav-ux-fix`
- HEAD: `7fed6c0f0c93cd840a03ee641722e403e2c9b3fa`
- `origin/main`: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Merge-base: `e1143c14f901882c12dc550f71bfd6757d60b882`
- Status: working tree has untracked agent/planning directories; no uncommitted changes in tracked product files for this branch.
- Note: current branch is ahead of `origin/main`. The audit must treat the current checkout as the source truth because the contour is tied to the analytics UX fix branch.

---

## Scope

Allowed files to read and audit (read-only; no edits):

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
- `frontend/src/app/processMapRouteModel.js` (if route builders are referenced)

---

## Non-goals

- No modifications to product frontend or backend code.
- No DB/schema changes.
- No BPMN XML, canvas, overlay, AI/RAG, export, or discussion logic.
- No PR, merge, or deploy.
- No broad refactor outside the scoped files.

---

## Audit Strategy

### Phase 1: Static Code Review
1. Read each scoped source file.
2. Record suspicious patterns:
   - Missing or incorrect dependency arrays in `useCallback`/`useEffect`.
   - Multiple identical `popstate` listeners registered.
   - State setters exposed but unused or unsafe.
   - Hardcoded Russian strings without i18n hook.
   - Missing `useCallback` around passed event handlers.
   - Feature flag branches that can both be true simultaneously.
3. Cross-check `processMapRouteModel.js` helpers for URL builder parity.

### Phase 2: Test Coverage Review
1. Read `useAnalyticsRouteState.test.mjs` and compare assertions to hook implementation.
2. Identify gaps:
   - Missing tests for `openPropertiesRegistry`, `closePropertiesRegistry`, `openDashboards`, `closeDashboards`.
   - Missing tests for scope change effect.
   - Missing tests for `return_to` behavior when not from analytics.
3. Read `AnalyticsDashboards.test.mjs` and `TopBarContainer.test.mjs`.
4. Record whether tests are source-assertions (pattern matching) or runtime behavior tests.

### Phase 3: Accessibility & Token Review
1. Check skeleton/error/empty states for:
   - `role="status"`, `role="alert"`, `aria-live` usage.
   - Focus management and keyboard traps.
   - Color contrast via token values.
2. Check `tailwind.css` and `tokens.css` for:
   - New analytics-specific token names.
   - Duplication or overlap with existing tokens.
   - Hardcoded colors vs token usage.

### Phase 4: Runtime Verification (Optional but Preferred)
1. If dev server is running on `:5177`, navigate to analytics surfaces:
   - `?surface=analytics`
   - `?surface=product-actions-registry`
   - `?surface=process-properties-registry`
   - `?surface=dashboards`
2. Verify:
   - Header active state matches surface.
   - Browser back/forward updates active state.
   - Skeleton/error/empty states render without console errors.
3. If dev server is not running, note it in report and rely on static review.

---

## Evidence Collection Requirements

Every finding must include:
- **Severity**: `p0` (data loss / crash), `p1` (functional bug), `p2` (ux/a11y polish), `p3` (cleanup).
- **File and line range**.
- **Observation**: what the code does.
- **Impact**: why it matters.
- **Evidence**: test failure, code snippet, console error, or runtime screenshot.
- **Recommended next contour**: e.g. `fix/analytics-route-state-cleanup-v1`.

---

## Validation

- `git diff --check` must pass.
- Confirm no tracked product files were modified (only `.planning/contours/audit/analytic_01/` may change).
- Confirm tests in scope still pass if run: `cd frontend && node --test src/features/analytics/useAnalyticsRouteState.test.mjs src/features/analytics/AnalyticsDashboards.test.mjs src/features/topbar/TopBarContainer.test.mjs`.

---

## Runtime Proof

If runtime verification is performed, collect:
- Screenshot of analytics surface open.
- Screenshot after browser back navigation.
- Console error count (must be 0).
- Active tab/header state proof.

If runtime verification is skipped, state: `Runtime proof: static audit only; dev server not required`.

---

## Review Gate

Agent 3 (Reviewer) must verify:
1. `AUDIT_REPORT.md` follows the required structure.
2. Every finding has file/line evidence.
3. No product code was modified.
4. Tests pass or the report explains why any test is not run.
5. Severity ranking is justified.

---

## Success Criteria

- [ ] `AUDIT_REPORT.md` exists with all required sections.
- [ ] At least 5 findings documented with severity, evidence, and recommended next contour.
- [ ] No source files modified.
- [ ] `STATE.json` updated to `"done"`.
