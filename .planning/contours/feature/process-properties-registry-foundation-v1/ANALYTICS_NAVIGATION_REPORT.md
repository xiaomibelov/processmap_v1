# ANALYTICS_NAVIGATION_REPORT

Статус: `DONE`

## Реализованная модель

```text
Аналитика
  ├─ Реестр действий
  ├─ Реестр свойств
  └─ Дашборды
```

## Navigation

- Добавлен `analytics` surface.
- Workspace Explorer теперь открывает `Аналитика`, а не заменяет её прямой ссылкой на один registry.
- Project pane также открывает `Аналитика`.
- Из Analytics:
  - `Реестр действий` открывает существующий Product Actions registry;
  - `Реестр свойств` открывает новый properties registry;
  - `Дашборды` остаются future/placeholder без fake implementation.
- `Вернуться` из registry возвращает в `Аналитика`, если registry был открыт из Analytics.
- Existing direct Product Actions flow из session analysis сохранён.

## Out of scope

- Global shell/sidebar redesign не выполнялся.
- Backend routes не добавлялись.
- Product Actions persistence не менялась.
