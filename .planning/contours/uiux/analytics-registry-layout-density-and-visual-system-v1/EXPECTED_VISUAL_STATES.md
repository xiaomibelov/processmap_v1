# Expected Visual States

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`

## Analytics Hub, wide screen

- `Аналитика` читается как top-level workspace page.
- Main content занимает большую часть доступной workspace ширины после sidebar/shell; нет ощущения, что весь экран состоит из маленькой карточки в центре.
- Верхний блок anchored near top-left of content area with comfortable margins, без крупной пустоты сверху.
- `Реестр действий` визуально primary: крупнее, контрастнее или сильнее anchored, чем future modules.
- `Реестр свойств`, `Дашборды`, `Экспорт` остаются secondary placeholders без fake implementation promise.
- Cards имеют clear rhythm: consistent gap, meaningful background/border contrast, readable labels/actions.
- Global shell, header and sidebar выглядят как раньше; hub polish не достигается через shell redesign.

## Registry, populated project scope

- Page sequence читается сверху вниз: back/navigation -> title/context -> scope selector -> metrics -> filters/actions -> warning if present -> table -> pagination/page size -> sources.
- Registry content width визуально близка к ширине workspace content area; side margins balanced and not excessive.
- Project scope показывает текущий project title. Если title еще не hydrated, допустим fallback project id, но не misleading `Не выбран`.
- Session scope не должен делать project block absent, если URL/data уже относятся к project.
- Rows показывают real existing Product Actions data. Reviewer не должен принимать fake/demo rows.
- Table header, rows and pagination выглядят как единый table surface.
- Export and AI actions доступны до таблицы; AI controls remain support controls, not canonical truth.

## Registry, empty workspace scope

- Empty state сохраняет тот же page skeleton: header, scope selector, metrics, filters/actions, table header/shell, pagination behavior if applicable, sources.
- Metrics show honest zero/empty values без fake counts.
- Table не заменяется одной большой пустой карточкой; empty message встроен в table/registry structure.
- Нет fake rows.
- Console remains clean. Nonexistent synthetic workspace с `404` console/resource error не является clean empty proof.
- Missing project/session states читаются как честное отсутствие selection, а не broken page.

## Scope selector

- `Workspace`, `Проект`, `Сессия` выглядят как controls/segments with state, not disabled gray placeholders.
- Selected state visually distinct through border/background/indicator/contrast.
- Каждый block имеет readable label, value and secondary hint/subtitle.
- Missing state формулируется конкретно: не выбран project/session, unavailable for workspace scope, loading/hydrating if applicable.
- Values не должны overflow/overlap at desktop width.

## Metrics rhythm

- Metrics compact and scan-friendly.
- Value visually stronger than label.
- Metrics support table understanding: total, complete/incomplete, generated/confirmed или другие реально доступные counts.
- Metrics do not dominate the page and do not look like identical inert gray tiles.
- At wide width metrics align with registry content width and filters/table grid.

## Filters and actions area

- Filters are visible, grouped and easy to scan before the table.
- Primary action area includes AI controls before table.
- CSV/XLSX are compact utility actions, not oversized primary CTA buttons.
- `Вернуться` remains clear navigation to Analytics Hub.
- Controls have stable dimensions; labels do not wrap into broken or overlapping layouts.

## Main table

- Table is the strongest working object on registry page.
- Table container width aligns with page sections and uses the available workspace.
- Header is readable; row density is useful for scanning, not sparse card-like rows.
- Pagination/page size controls are visually attached to the table and not floating in a disconnected footer.
- Horizontal/vertical empty space should support readability, not make the table look small.

## Sources section

- Sources appear after the table/pagination and read as secondary supporting context.
- Sources have lower visual weight than table and filters.
- Sources do not contain AI controls that belong to primary action area.
- Sources remain discoverable but not competitive with the main registry object.

