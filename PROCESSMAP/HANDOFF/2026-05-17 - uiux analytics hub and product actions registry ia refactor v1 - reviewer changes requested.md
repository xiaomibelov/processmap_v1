# 2026-05-17 - uiux analytics hub and product actions registry ia refactor v1 - reviewer changes requested

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`

## Что сделано

Agent 4 выполнил reviewer RAG preflight, source/runtime truth proof, authenticated browser runtime review на `http://clearvestnic.ru:5180`, focused source tests и написал review artifacts:

- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/REVIEW_REPORT.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/RUNTIME_VISUAL_EVIDENCE.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/REWORK_REQUEST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/CHANGES_REQUESTED`

## Что доказано

- Visual IA в runtime в целом видна: Analytics Hub cards, Hub -> Registry navigation, scope/metrics/filters/AI/table/sources hierarchy, populated rows and empty workspace shell.
- Source tests passed: `25/25`.
- Served runtime is `processmap_test-gateway-1` on `:5180`, serving `/opt/processmap-test/frontend/dist`.
- Build-info does not match this contour: served `contourId` is `uiux/product-actions-registry-inner-page-safe-redesign-v1`, `dirty=true`.
- Served checkout includes unrelated BPMN/stage/runtime changes outside this contour.
- Navigation emitted `DELETE /api/sessions/4c515d1c6e/presence`, which violates the literal no unsafe `PUT/PATCH/DELETE` review gate.

## Что осталось

- Rebuild/serve the correct contour build with matching build-info.
- Isolate or remove unrelated dirty product changes from the served review build.
- Resolve or explicitly allowlist presence `DELETE` during pure viewing.
- Re-run authenticated fresh-browser review before `REVIEW_PASS`.
