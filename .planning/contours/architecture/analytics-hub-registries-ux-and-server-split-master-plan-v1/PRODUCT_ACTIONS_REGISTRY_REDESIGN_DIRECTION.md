# Направление редизайна Product Actions Registry

## Проблема

Текущая страница воспринимается как слабая визуально и трудно сканируемая. Основной дефект - не отдельный цвет или отступ, а недостаток иерархии: scope, metrics, filters, AI suggestions, rows and sources выглядят как элементы одной плоскости.

## Target layout direction

1. Header block:
   - короткий title: `Реестр действий`;
   - контекстная подпись: scope and last updated, если подтверждено runtime;
   - secondary link: back to Analytics Hub.

2. Scope selector:
   - три distinct segments: Workspace, Проект, Сессия;
   - каждый segment показывает current value and availability state;
   - визуально отделен от metrics.

3. Compact metrics:
   - заменить wide equal cards на compact metric rail/chips;
   - primary metrics: total rows, complete, incomplete, filtered;
   - secondary metrics collapse into tooltip/popover or small secondary row.

4. Registry work area:
   - filters and actions above table/list;
   - main content has stronger background and boundaries;
   - empty state and populated state share same structure.

5. Row model:
   - Phase 1 should evaluate table + expandable row as safest first step;
   - master-detail side panel may follow if row detail grows beyond simple reveal;
   - flat table remains acceptable only for compact summary, not full explanation.

6. AI suggestions:
   - move from awkward inline area to support panel or contextual callout;
   - suggestions are read-only and explain/filter/search, not apply mutations;
   - AI output should name confidence/source and never pretend to be canonical.

7. Data sources:
   - separate section below or side rail;
   - lower visual priority than registry content;
   - source/session diagnostics should not compete with row comprehension.

## Interaction options

| Option | Use now? | Notes |
|---|---:|---|
| Flat table only | Partial | Good for summary, weak for detail and sources |
| Expandable rows | Yes, Phase 1 candidate | Low route complexity, direct detail close to row |
| Master-detail side panel | Maybe | Better for rich detail, but higher interaction scope |
| Separate detail route | Later | Useful only after stable entity IDs/API |

## Phase 1 target

Implement a bounded UI/IA refactor, not a new data model:
- clearer header/scope/metrics hierarchy;
- compact metrics;
- separated data sources;
- expandable row/detail affordance if existing data supports it;
- AI suggestions as read-only assistance area;
- no backend schema change.

## Validation criteria

- Visual anchors visible on 1280px desktop without scroll gymnastics.
- Scope selector, metrics and main registry surface are distinct.
- Metrics no longer consume the dominant horizontal space.
- Empty/populated states both readable.
- AI suggestions do not block primary registry flow.
- Sources are secondary and clearly separated.
