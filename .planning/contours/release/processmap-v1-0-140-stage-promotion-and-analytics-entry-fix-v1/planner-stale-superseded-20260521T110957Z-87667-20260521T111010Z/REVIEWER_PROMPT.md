# REVIEWER PROMPT — release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1

- run_id: `20260521T101201Z-83263`
- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- agent: Agent 4 / Reviewer

## Review Scope

1. **Analytics Entry Fix** — verify minimal, correct changes to `WorkspaceExplorer.jsx` and `ProcessAnalyticsHub.test.mjs`.
2. **Version Bump** — verify `appVersion.js` bumped to `v1.0.141` with appropriate Russian changelog.
3. **Stage Promotion** — verify branch was pushed, merge approval obtained, and runtime is serving.

## Verification Checklist

### Code Review
- [ ] `WorkspaceExplorer.jsx` destructures `onOpenAnalyticsHub` in default export props.
- [ ] `WorkspaceExplorer.jsx` passes `onOpenAnalyticsHub` into `ProjectPane`.
- [ ] `ProjectPane` destructures `onOpenAnalyticsHub` and uses it.
- [ ] Workspace-level analytics nav button exists with `data-testid="workspace-analytics-hub-nav"`.
- [ ] Project-level analytics nav button exists with `data-testid="project-analytics-hub"`.
- [ ] Buttons use `onOpenAnalyticsHub?.({ workspaceId })` and `onOpenAnalyticsHub?.({ workspaceId, projectId })` correctly.
- [ ] No other files modified outside scope (TopBar, AppShell, CSS unchanged).
- [ ] `ProcessAnalyticsHub.test.mjs` updated to assert navigation IS exposed (not missing).
- [ ] Tests pass: `node --test ProcessAnalyticsHub.test.mjs` and `node --test ProductActionsRegistryPanel.test.mjs`.

### Version & Build
- [ ] `appVersion.js` has `currentVersion: "v1.0.141"`.
- [ ] Changelog entry describes the fix in Russian.
- [ ] Frontend dist builds without errors.
- [ ] `build-info.json` (if present) has `dirty: false`.

### Git & Merge
- [ ] Branch pushed to origin.
- [ ] Merge to main was preceded by explicit user approval (check git log or handoff notes).
- [ ] No secrets in diff.

### Runtime Proof (5 planes)
- [ ] **Code**: `main` branch contains the fix commits.
- [ ] **Workspace**: checkout on build host matches `main` HEAD.
- [ ] **DB**: no schema changes required for this contour.
- [ ] **Env/Compose**: stage stack is active and healthy.
- [ ] **Serving mode**: `curl -I http://clearvestnic.ru:5180` returns HTTP 200 with fresh `Last-Modified`.

## Verdict Options

- `PASS` — all checks pass, minimal changes, runtime verified.
- `CHANGES_REQUESTED` — specific issues found; list them with file/line references.
- `BLOCKED` — runtime not serving, merge happened without approval, or scope violation.

## Rules
- Do not approve without independent runtime verification.
- Do not substitute a different test scenario — verify the exact analytics entry navigation.
- Report must fit in `REVIEW_REPORT.md`.
