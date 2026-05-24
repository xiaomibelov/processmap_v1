# Implementation scope report

## Implemented

- `Аналитика` remains the L1 surface and now has four module cards:
  - `Реестр действий`
  - `Реестр свойств`
  - `Дашборды`
  - `Экспорт`
- `Реестр действий` is the primary available card and opens the Product Actions Registry.
- Product Actions Registry hierarchy:
  - clear `Вернуться` in the header;
  - distinct `Workspace`, `Проект`, `Сессия` scope controls;
  - compact metrics rail;
  - filters before the table;
  - AI controls before the table;
  - CSV/XLSX utility actions in header;
  - table as primary content;
  - `Источники данных` as secondary collapsible section;
  - pagination shell.

## Not implemented

- Full Properties Registry: intentionally placeholder only.
- Row expansion: deferred. Current data fields can support detail later, but this slice avoids adding a new interaction contract during IA refactor.
- Backend/server split: not part of this contour.

## Tests updated

- Source-level tests now assert Analytics Hub/Registry navigation and split registry subcomponents instead of the old monolithic panel-only layout.
