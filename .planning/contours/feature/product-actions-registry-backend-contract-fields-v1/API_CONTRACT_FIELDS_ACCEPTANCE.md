# API Contract Fields Acceptance

> **Run ID:** `20260519T133919Z-32264`

## Обязательные additive fields

Response `POST /api/analysis/product-actions/registry/query` должен включать:

- `filter_options`
- `applied_filters`
- `metrics`
- `empty_state`
- `source_state`

## Existing fields preservation

Не должны исчезнуть:

- `ok`
- `scope`
- `rows`
- `summary`
- `sessions`
- `session_summary`
- `page`

## `filter_options`

PASS если:

- содержит families: `product_groups`, `products`, `action_types`, `stages`, `object_categories`, `roles`, `completeness`;
- значения уникальные, непустые, стабильные по сортировке;
- options не ограничены только текущей page slice;
- пустой scope возвращает пустые arrays, а не missing key.

## `applied_filters`

PASS если:

- отражает нормализованные filters request;
- списки очищены от пустых значений и дублей;
- `completeness` нормализуется к `all | complete | incomplete`;
- invalid completeness остаётся `422`.

## `metrics`

PASS если явно различает:

- total/source universe;
- filtered rows;
- current page rows;
- complete/incomplete;
- sessions with/without actions;
- pagination values.

## `empty_state`

PASS если:

- есть `kind`, `scope`, `message_key`;
- `kind=not_empty` при наличии rows или sessions;
- empty workspace/project/session/filter states различимы;
- отсутствуют длинные UI-тексты.

## `source_state`

PASS если:

- `source=product_actions_registry_backend`;
- `namespace=/api/analysis/product-actions/registry`;
- `heavy_payload_excluded=true`;
- `mutation_allowed=false`;
- есть source counters или session/action scan facts.

