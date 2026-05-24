# PROPERTIES_REGISTRY_UX_ACCEPTANCE_CRITERIA

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Analytics entry

PASS only if:

- top-level section remains `Аналитика`;
- inside Analytics visible modules are:
  - `Реестр действий`;
  - `Реестр свойств`;
  - `Дашборды`;
- `Реестр действий` still opens;
- `Реестр свойств` opens from Analytics;
- `Дашборды` is honest future/placeholder if not implemented;
- no separate top-level `Экспорт` module is introduced for this contour.

## Page header

`Реестр свойств` page must show:

- title: `Реестр свойств`;
- subtitle: `Сводный список свойств BPMN-элементов и процессных объектов.`;
- `Вернуться` button that returns to Analytics;
- optional CSV/XLSX only if real export support exists for the same source.

## Scope selector

Required labels:

- `Workspace`;
- `Проект`;
- `Сессия`.

Acceptance:

- Active scope reflects actual input context.
- Disabled/unavailable scopes are visually honest.
- No fake active state.
- Scope label must not imply rows were loaded if only foundation mode is active.

## Metrics row

Required metric labels:

- `Источников`;
- `Элементов`;
- `Свойств`;
- `Типов свойств`;
- `После фильтров`.

Real-data mode formulas:

- `Источников`: number of distinct documented source groups actually used.
- `Элементов`: count of distinct element ids with at least one included real row.
- `Свойств`: count of included real rows after source normalization, before UI filtering.
- `Типов свойств`: count of distinct property groups/types backed by data.
- `После фильтров`: count after current filters/search.

Foundation mode:

- unavailable metrics show `—`;
- no zero/positive count unless calculated from real source rows;
- source truth note explains why foundation mode is active.

## Filters

Allowed only when backed by real row fields:

- `Тип объекта` -> `elementType` / BPMN type;
- `Тип свойства` -> extension property/listener/Robot Meta explicit group;
- `Группа свойства` -> documented source group;
- `Источник` -> source label such as `bpmn_meta.camunda_extensions_by_element_id`;
- `Процесс / сессия` -> real project/session identity;
- `Полнота / наличие значения` -> real empty/non-empty value calculation.

Not allowed:

- cosmetic filters with no data mapping;
- static fake options;
- filters copied from Product Actions unless field semantics match.

## Table

Real-data mode table columns:

- `Объект`;
- `Свойство`;
- `Значение`;
- `Источник / процесс`;
- `Тип / группа`;
- `Статус`.

Acceptance:

- every row has a real source path;
- empty values are shown as empty/unknown status, not filled with sample text;
- object id/title is traceable to current diagram/session data;
- source note or row detail identifies the extraction path.

## Foundation mode

Required message:

```text
Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.
```

Acceptance:

- page shell is complete;
- metrics are `—` where unavailable;
- planned groups may appear only as planned text;
- no fake rows;
- no fake counts;
- no fake filter options;
- source truth note says foundation mode is active.

## Visual acceptance

PASS only if:

- one main white container;
- light separators;
- no gradients;
- no dotted borders;
- no nested cards;
- no colored metric cards;
- typography over decoration;
- table or foundation empty state is the primary content object;
- global shell/header/sidebar are unchanged.
