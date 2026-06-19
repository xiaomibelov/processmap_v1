# Runtime Proof Checklist — audit/analytic_01

## Goal

Collect lightweight runtime evidence for the analytics frontend audit. This checklist is optional; if local dev server is unavailable, mark each item as `N/A` and rely on static review.

## Required Proof Items

### 1. Analytics Surface Opens Without Console Errors
- [ ] Navigate to `?surface=analytics`.
- [ ] Screenshot of rendered analytics dashboard.
- [ ] Console error count = 0.

### 2. Header Active State Matches Surface
- [ ] Screenshot showing analytics header button highlighted when `surface=analytics`.
- [ ] Screenshot showing button not highlighted on a non-analytics surface.

### 3. Browser Back/Forward Updates State
- [ ] Navigate to analytics, then back.
- [ ] Screenshot after back navigation showing header inactive.
- [ ] Screenshot after forward navigation showing header active.

### 4. Skeleton State Visible
- [ ] Trigger slow network or refresh analytics surface.
- [ ] Screenshot of `AnalyticsSkeleton` with `role="status"`.

### 5. Error/Empty States Reachable
- [ ] If possible, force an API error and screenshot `AnalyticsErrorState`.
- [ ] If possible, view empty data and screenshot `AnalyticsEmptyState`.

### 5. Product Actions Registry Surface
- [ ] Navigate to `?surface=product-actions-registry`.
- [ ] Screenshot of registry surface.
- [ ] Console error count = 0.

### 6. CSS Token Verification
- [ ] Inspect analytics header button and confirm class uses design-system token.
- [ ] Inspect skeleton background and confirm token usage (not hardcoded color).

## Evidence Storage

Save screenshots and logs to:

```text
.planning/contours/audit/analytic_01/evidence/
```

Name files descriptively:

```text
evidence/analytics_surface_open.png
evidence/header_active_state.png
evidence/back_navigation_state.png
evidence/skeleton_state.png
evidence/console_errors_0.json
```

## Checklist Completion

At the end of the audit, update `AUDIT_REPORT.md` with a summary table:

| Proof Item | Status | Evidence File |
|------------|--------|---------------|
| Surface opens without errors | N/A / PASS / FAIL | ... |
| Header active state | N/A / PASS / FAIL | ... |
| Back/forward navigation | N/A / PASS / FAIL | ... |
| Skeleton state | N/A / PASS / FAIL | ... |
| Error/empty states | N/A / PASS / FAIL | ... |
| Registry surface | N/A / PASS / FAIL | ... |
| CSS tokens | N/A / PASS / FAIL | ... |
