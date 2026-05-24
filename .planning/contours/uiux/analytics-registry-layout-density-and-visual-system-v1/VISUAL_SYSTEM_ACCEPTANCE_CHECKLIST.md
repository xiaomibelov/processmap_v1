# Visual system acceptance checklist

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`

## Analytics Hub

- [ ] `Аналитика` выглядит как top-level workspace page, а не маленькая карточка.
- [ ] Content area использует широкую viewport ширину с комфортными margins.
- [ ] Верхняя часть не содержит неоправданной пустоты.
- [ ] Cards визуально anchored: размер, spacing и background separation создают rhythm.
- [ ] `Реестр действий` является primary доступным модулем.
- [ ] Future modules остаются visibly secondary и не обещают fake implementation.
- [ ] Global shell/header/sidebar не изменены.

## Registry layout

- [ ] На wide viewport основной контент не выглядит узким centered panel.
- [ ] Header/navigation, scope, metrics, filters/actions, table, sources читаются как разные уровни иерархии.
- [ ] Table container является самым сильным рабочим объектом страницы.
- [ ] Pagination/page size визуально привязаны к table.
- [ ] Sources section отделен и вторичен.

## Scope selector

- [ ] `Workspace / Проект / Сессия` выглядят как controls, а не как disabled gray placeholders.
- [ ] Selected state различим.
- [ ] Label, value и subtitle readable.
- [ ] Project/session missing states честно показаны без ощущения поломки.

## Metrics

- [ ] Metrics compact.
- [ ] Label/value contrast достаточен.
- [ ] Metrics помогают scan страницы, но не конкурируют с table.
- [ ] Нет ощущения набора одинаковых серых блоков.

## Filters/actions

- [ ] Filters visible and structured.
- [ ] AI controls находятся в primary action area before table.
- [ ] CSV/XLSX compact utility actions.
- [ ] `Вернуться` ясно читается как navigation.

## Empty workspace scope

- [ ] Empty state сохраняет table shell/header.
- [ ] Нет fake rows.
- [ ] Scope, metrics, filters/actions и sources остаются понятными.
- [ ] Empty message не заменяет всю структуру страницы.

