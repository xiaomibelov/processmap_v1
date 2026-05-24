# Информационная архитектура Analytics

## Что такое `Аналитика`

`Аналитика` - это верхнеуровневая поверхность чтения и диагностики процесса: что есть в процессах, насколько данные полны, какие действия/свойства извлечены, какие источники участвовали, что можно экспортировать и что требует внимания.

Она не должна быть:
- редактором BPMN;
- местом auto-mutation;
- скрытым дублем Explorer;
- экраном только для одного `Product Actions Registry`.

## Модули сейчас

Подтверждение должен сделать Agent 2, но план ожидает следующие текущие/near-current modules:
- Analytics Hub;
- Product Actions Registry;
- registry route/navigation from app shell or process context;
- source/session summary blocks;
- metrics and filters;
- AI suggestions/read-only assistant touchpoints if present.

## Модули later

- Product Properties Registry.
- Dashboards: trend/completeness/quality views.
- Export Center: CSV/JSON/report packs with preparation status.
- Saved analytics views.
- Cross-session comparisons.
- Analytics entity search.

## Navigation model

Рекомендуемая структура:

| Level | Surface | Role |
|---|---|---|
| L0 | App shell / main navigation | Entry to Analytics |
| L1 | Analytics Hub | Overview, modules, current context, recent artifacts |
| L2 | Registry pages | Focused work: actions/properties |
| L3 | Entity detail | Expandable row, side panel, or detail route |
| L4 | Export / dashboard drilldown | Future focused surfaces |

Hub должен давать:
- прямой переход в `Реестр действий`;
- прямой переход в `Реестр свойств`;
- возврат из registry pages обратно в Hub;
- видимый текущий scope;
- карточки статуса модулей без marketing-style hero.

## Section hierarchy

Для registry pages:
1. Page title and purpose.
2. Scope bar: `Workspace / Проект / Сессия`.
3. Compact metrics strip.
4. Main work area: registry table/list + filters.
5. Detail/AI assistance area.
6. Data sources section as visually separate secondary block.

## UX acceptance for IA

- Пользователь за 5 секунд понимает, где находится: Hub, actions registry, properties registry или export/dashboard.
- Scope не выглядит как прозрачная строка без структуры.
- Метрики не доминируют над содержанием.
- `Источники данных` не смешиваются с основной registry surface.
- Возврат в Hub очевиден.
