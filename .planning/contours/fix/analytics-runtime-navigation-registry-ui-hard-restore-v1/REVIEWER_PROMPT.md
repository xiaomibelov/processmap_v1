# Reviewer Prompt — fix/analytics-runtime-navigation-registry-ui-hard-restore-v1

- **run_id**: `20260521T204044Z-38151`
- **contour**: `fix/analytics-runtime-navigation-registry-ui-hard-restore-v1`

## Review Scope

1. **Code correctness**: Verify that `onOpenAnalyticsHub` is now both declared in `WorkspaceSidebar` props AND passed from root `WorkspaceExplorer` to `WorkspaceSidebar`.
2. **Test quality**: Verify that the test assertion is strong enough to catch a missing prop pass (not just string presence in source).
3. **Build**: Verify `npm run build` output has no new warnings.
4. **Runtime proof** (mandatory for UI/runtime contours):
   - `curl -I http://clearvestnic.ru:5180` → HTTP 200, no-cache headers.
   - Open browser, log in, click sidebar "Аналитика" button.
   - Confirm analytics hub opens with 3 module cards and NO ReferenceError in console.
   - Click "Реестр свойств → Открыть" and confirm navigation works.
   - Click "Вернуться" and confirm back navigation works.
   - Save screenshots as evidence.
5. **Git hygiene**: Verify branch name, commit messages, and that only scoped files were changed.

## Review Output

- Write `REVIEW_REPORT.md` with verdict: `PASS`, `CHANGES_REQUESTED`, or `BLOCKED`.
- Include runtime proof screenshots.
- If PASS, touch `REVIEW_PASS`.
