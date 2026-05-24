# Acceptance criteria: восстановление Analytics Hub

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Роль: Agent 3 / Worker 3  
Дата: 2026-05-18

## Обязательный результат

`Аналитика` должна быть самостоятельной верхнеуровневой surface, а не alias/direct route для `Реестр действий`.

Целевая IA:

```text
Аналитика
  ├─ Реестр действий
  ├─ Реестр свойств
  └─ Дашборды
```

## PASS-критерии

- `Аналитика` открывается как отдельная верхнеуровневая surface из shell/explorer/runtime navigation.
- На surface видны entries: `Реестр действий`, `Реестр свойств`, `Дашборды`.
- `Реестр действий` открывает текущую страницу `Реестр действий с продуктом`.
- `Реестр свойств` открывает отдельную foundation/placeholder surface с заголовком `Реестр свойств`.
- `Дашборды` явно помечены как future/placeholder и не показывают fake metrics.
- `Вернуться` с внутренних registry страниц возвращает в `Аналитика`.
- CSV/XLSX export доступен только внутри registry pages, где есть реальные данные и export endpoint.
- Global ProcessMap shell/header/sidebar не редизайнится.
- Viewing/navigation не отправляет unsafe `PUT`, `PATCH`, `DELETE`.

## CHANGES_REQUESTED-критерии

- `Аналитика` отсутствует или сразу bypassed в `Реестр действий`.
- `Реестр действий` заменяет верхнеуровневую Analytics surface.
- `Реестр свойств` отсутствует полностью.
- `Дашборды` показывают реальные-looking fake counts/rows/metrics.
- В `Аналитика` есть отдельная top-level карточка/module `Экспорт`.
- Placeholder `Реестр свойств` содержит fake rows или fake counts.
- В контур попали backend/schema/BPMN XML/RAG runtime изменения.

## Source note

На момент Worker 3 source inspection текущий dirty файл `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` содержит `analytics-hub-module-export`. Это противоречит плану текущего контура и должно быть проверено Agent 4 как blocker, если осталось в served runtime.
