# ANALYTICS_RESTORE_IMPLEMENTATION_REPORT

Статус: `DONE`

## Что восстановлено

- `Аналитика` возвращена как top-level surface.
- Внутри surface отображаются `Реестр действий`, `Реестр свойств`, `Дашборды`.
- `Реестр действий` открывается через Analytics route as `module=actions`.
- `Вернуться` из `Реестр действий`, `Реестр свойств` и `Дашборды` возвращает к hub `Аналитика`.

## Чего нет

- Нет отдельного top-level module/card `Экспорт`.
- Нет dashboard implementation.
- Нет fake analytics metrics.

## Scope guard

Глобальный shell/header/sidebar не редизайнились.
