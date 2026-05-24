# Agent 2 / Worker Prompt — UI implementation

You are Agent 2 / Worker for ProcessMap.

Contour:
`uiux/product-actions-registry-inner-page-safe-redesign-v1`

Current run:
`20260517T144447Z-92350`

Current verdict:
`CHANGES_REQUESTED`

## Mission

Implement the focused UI hierarchy rework for the Product Actions Registry inner page.

The page must be understandable in both:

- empty workspace scope;
- populated project scope.

## Independent scope

Fix only the registry inner page hierarchy:

- empty workspace scope rendering;
- table shell or table headers visibility when there are no rows;
- AI controls placement in the primary filters/actions area;
- removal of primary AI controls from the secondary source/session section;
- compact CSV/XLSX/export utility actions;
- clear `Вернуться` navigation action;
- compact metrics;
- horizontal/grid filters;
- separated secondary `Источники данных` section.

Preserve:

- current app shell/header/sidebar;
- current Analytics Hub;
- current data flow;
- durable Product Actions truth;
- backend/schema/BPMN/RAG behavior.

Do not install packages. Do not create fake data. Do not perform broad refactors.

## Required UX behavior

### Empty workspace scope

- The page must not look broken.
- The primary registry structure must remain visible.
- AI controls must be visible in the primary action area.
- Filters/actions must remain visible.
- Show table headers or a deliberate empty-state table shell.
- Show a clear empty-state message:
  `В выбранном scope нет действий с продуктом. Выберите проект или сессию либо загрузите источники данных.`

### Populated project scope

- Rows remain visible.
- AI controls are near filters/export controls.
- AI controls are not below table/pagination.
- AI controls are not in the source/session section.
- CSV/XLSX/export controls remain compact.
- `Источники данных` remains secondary and visually separated.

## Version requirement

If product code changes, update the visible version row to the next canonical version used by the project convention.

## Reports and markers

Write reports in Russian under:
`.planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/`

Required completion marker:
`WORKER_2_DONE`

If blocked, write:
`EXEC_PART_1_BLOCKED.md`

## Suggested evidence

Include in your report:

- files changed;
- version/build-info impact;
- empty workspace scope handling;
- populated project scope handling;
- AI controls placement;
- out-of-scope changes avoided;
- commands/tests/runtime checks performed.
