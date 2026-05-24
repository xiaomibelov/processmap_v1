# 2026-05-17 - uiux analytics hub and product actions registry ia refactor v1 - reviewer changes requested rework 2

Контур: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`  
Run ID: `20260517T202836Z-17191`

## Что сделано

Agent 4 повторно проверил rework в fresh authenticated browser context на `http://clearvestnic.ru:5180`, выполнил source/runtime truth proof, focused tests и production build.

Созданы:

- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/REVIEW_REPORT.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/RUNTIME_VISUAL_EVIDENCE.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/REWORK_REQUEST.md`
- `.planning/contours/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/CHANGES_REQUESTED`

## Что доказано

- Served contour id теперь соответствует `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`.
- Analytics Hub и Registry визуально работают; Hub `Открыть` ведет в registry.
- Runtime after rework не emit-ит unsafe `PUT/PATCH/DELETE` during viewing/navigation.
- Focused tests `11/11 PASS`.
- Production build PASS.

## Что осталось

- Served implementation остается dirty/uncommitted: build-info `sha=d805e1c...`, `dirty=true`; нет commit, который содержит fix.
- Registry scope block показывает `Проект / Не выбран` на project/session registry routes, хотя route/data относятся к `project=b1c8a56b6e`.
- Empty workspace proof использует synthetic workspace and still creates a `404` console/resource error.

## Verdict

`CHANGES_REQUESTED`.
