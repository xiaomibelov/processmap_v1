# Query / Export Parity Checklist

> **Run ID:** `20260519T133919Z-32264`

## Query endpoints

- `POST /api/analysis/product-actions/registry/query`

## Export endpoints

- `POST /api/analysis/product-actions/registry/export.csv`
- `POST /api/analysis/product-actions/registry/export.xlsx`

## Parity requirements

PASS если:

- query и export используют один request contract;
- filters одинаково применяются для query и export;
- `project_id`, `project_ids`, `session_id`, `session_ids`, `workspace_id`, `scope` дают одинаковый universe;
- export zero rows возвращает только header;
- export не включает heavy payload;
- CSV/XLSX content соответствует filtered rows, а не unfiltered universe;
- invalid scope/filter guards совпадают с query;
- access guard для inaccessible project/session совпадает с query.

## Tests expected

Agent 2 должен добавить или расширить backend tests:

- filtered query vs filtered CSV;
- filtered query vs filtered XLSX или достаточный XLSX smoke with same filter;
- zero-row export remains header-only;
- pagination does not alter `filter_options`/`metrics` semantics;
- no mutation proof around query/export.

