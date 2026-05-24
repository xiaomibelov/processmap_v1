# UX_SPEC_IMPLEMENTATION_MAP

## Назначение

Карта переводит UX/UI spec в implementation scope для `Реестр действий с продуктом`.

## Принцип 1 — One container

- Spec: all content below app shell must live inside one white container.
- Implementation: один top-level registry container с `#FFFFFF`, border `#E5E7EB`, radius `12px`, optional subtle outer shadow.
- Acceptance: нет внутренних независимых cards для scope/metrics/filters/AI/warning/table.

## Принцип 2 — One separator

- Spec: no margins between internal sections, only separators.
- Implementation: section rhythm через `border-top: 1px solid #F3F4F6`.
- Acceptance: внутренние секции читаются как части одного инструмента.

## Принцип 3 — Typography over decoration

- Spec: hierarchy must come from size, weight, color, spacing.
- Implementation: header 18/700, subtitle 13/400, metrics number 20/700, labels 11 uppercase.
- Acceptance: нет gradients, colored border accents, decorative cards.

## Header

- `Вернуться` как text action with arrow.
- Title/subtitle compact.
- CSV/XLSX только в header.

## Scope tabs

- `Workspace / Проект / Сессия` as compact tabs.
- Active state: dark text + purple underline.
- Inactive state: gray text.

## Metrics

- Text-only metrics row.
- `неполных` can use orange.
- `полных` not green.
- `после фильтров` subdued/hidden when equal to total.

## Filters

- 7 compact selects in one row where possible.
- Reset as text link.

## AI row

- Uppercase secondary label.
- Toggle chips.
- Purple primary CTA.
- No gradient/background card.
- Not in sources/data section.

## Warning

- Compact text row.
- Warning icon plus `#B45309`.
- No filled yellow banner.

## Table

- Primary visual object.
- Header `#FAFAFA`, uppercase `#6B7280`.
- Light row separators, hover `#FAFAFA`.
- Status badges only strong colors.
- Tags gray, BPMN code subdued.

