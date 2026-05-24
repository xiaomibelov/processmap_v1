# Empty And Populated Scope Expectations

Контур: `uiux/product-actions-registry-polished-table-layout-v1`

## Populated project scope

Agent 4 должен открыть populated project/session scope с реальными `interview.analysis.product_actions[]` и проверить:

- Header показывает страницу `Реестр действий с продуктом`, а не generic analytics view.
- Scope/title/subtitle не вводят в заблуждение: если project/session route активен, UI не должен показывать `Не выбран` как primary truth.
- Metrics отражают реальные total/complete/incomplete/filtered counts.
- Filters построены из реальных values текущего dataset.
- Applied filters меняют rows/counts без fake rows.
- Warning появляется только если есть реальные incomplete rows.
- Table rows содержат реальные product/action/stage/category/role/completeness/source values.
- Pagination/table footer, если есть, связан с реальным filtered row set.
- Sources section остается secondary и не скрывает primary table workflow.

## Empty workspace scope

Agent 4 должен проверить default/empty workspace path без Product Actions rows:

- Page shell сохраняется: header, primary actions/filter shell, table or table-empty shell, sources/empty state where applicable.
- Empty state честно сообщает отсутствие строк и не показывает fake rows.
- Metrics не fake: zero/empty values выглядят calm и вторично.
- CSV/XLSX не должны создавать впечатление наличия данных; disabled/empty export behavior должен быть предсказуемым.
- AI controls не должны обещать batch suggestion for nonexistent visible rows; selected counter должен быть truthful.
- Console не должен содержать runtime error из-за пустого dataset.
- Network не должен показывать unsafe mutation от простого просмотра.

## Filters without applied values

- All main filters visible and grouped.
- Secondary filters/reset visible but reset is quiet/inactive if nothing applied.
- No active-chip visual noise when no filters are applied.
- Table shows all real rows for current scope.

## Filters with applied values

- Applied state is visually discoverable.
- `После фильтров` count changes or remains truthful if filter result equals total.
- Reset clears all filters back to full real row set.
- Empty result after filters shows no-results state, not empty workspace state and not fake rows.

## Reviewer note

Empty workspace and populated project checks must both use actual runtime state. A nonexistent workspace/project that produces backend `404` is not a valid proof of empty-state quality unless the contour explicitly targets error handling.
