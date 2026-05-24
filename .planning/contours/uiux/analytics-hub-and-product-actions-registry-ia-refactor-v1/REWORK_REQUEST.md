# Rework request

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`  
Вердикт: `CHANGES_REQUESTED`

## Required fixes

1. Make the served implementation reproducible:
   - commit the bounded implementation on `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1-agent2`, or document an explicit approved dirty-build exception;
   - rebuild and re-serve so `/build-info.json` points to the implementation commit, ideally with `dirty=false`.

2. Fix registry scope context:
   - direct project registry route must not show `Проект / Не выбран` when `project=b1c8a56b6e` is present and rows are loaded for that project;
   - session registry route reached from Analytics Hub must not show project as absent while route/project data exists;
   - show project title when hydrated, otherwise show a stable project id fallback.

3. Clean up empty-workspace runtime proof:
   - prefer a real empty workspace fixture; or
   - handle the synthetic not-found empty proof without a browser console error if this remains the accepted review scenario.

## Preserve

- The current visual hierarchy direction is acceptable: Hub cards, registry header/back, scope, compact metrics, filters, AI controls before table, main table, pagination and secondary sources.
- The previous unsafe presence `DELETE` blocker appears fixed; do not reintroduce session presence for read-only Analytics Hub / Registry surfaces.
- Do not change backend/schema/BPMN/RAG runtime for this contour.
