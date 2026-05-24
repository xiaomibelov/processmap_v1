# Требования восстановления Analytics

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Обязательная IA

```text
Аналитика
  ├─ Реестр действий
  ├─ Реестр свойств
  └─ Дашборды
```

## Acceptance

- `Аналитика` существует как top-level surface.
- `Реестр действий` не заменяет `Аналитика`.
- `Реестр действий` является inner module внутри Analytics.
- `Реестр свойств` доступен как foundation page или honest placeholder.
- `Дашборды` доступен как future placeholder.
- `Вернуться` из inner pages возвращает в Analytics.
- Separate top-level `Экспорт` card/module отсутствует.
- Global ProcessMap shell/header/sidebar остаётся без redesign.

## Запрещено

- Удалять или обходить `Аналитика`.
- Превращать Actions Registry в top-level replacement для Analytics.
- Добавлять fake metrics/data.
- Реализовывать dashboard system.
- Добавлять backend/schema/BPMN/RAG runtime changes.
