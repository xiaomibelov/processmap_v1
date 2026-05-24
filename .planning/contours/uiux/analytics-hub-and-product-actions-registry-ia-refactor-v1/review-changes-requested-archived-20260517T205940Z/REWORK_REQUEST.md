# Rework request

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`

## Required before resubmitting

1. Rebuild and serve `http://clearvestnic.ru:5180` from the source intended for this contour.
2. Ensure `frontend/dist/build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` contain contourId `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`, correct branch/sha, and a defensible dirty flag.
3. Remove unrelated BPMN/stage/runtime changes from the served review build, or isolate this contour into a clean worktree/branch and serve that build.
4. Re-run runtime review in a fresh browser context and prove Analytics Hub, registry workspace/project/empty states, and no fake data.
5. Address navigation safety: either prevent `DELETE /api/sessions/*/presence` during pure registry/hub viewing or update the review/safety contract with an explicit, narrow allowlist for presence cleanup if that is intended.
6. Remove or explain the authenticated browser `404` console error so the final review can satisfy the clean-console gate.

## Preserve

- The visible IA direction looks acceptable: Hub cards are clear, registry scope/metrics/filter/AI/table/sources hierarchy is visible, and empty workspace keeps the page structure.
