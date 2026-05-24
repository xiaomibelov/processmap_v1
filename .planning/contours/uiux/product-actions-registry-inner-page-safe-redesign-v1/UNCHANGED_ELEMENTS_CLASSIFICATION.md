# UNCHANGED_ELEMENTS_CLASSIFICATION — классификация неизменяемых элементов

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T134517Z-85981`  
**Agent:** Agent 3 / Executor Part 2  
**Дата:** `2026-05-17`

## Правило

Этот контур ограничен внутренней страницей Product Actions Registry. Любое изменение вне локальной registry UI/layout зоны требует отдельного доказательства scope или должно считаться блокером для merge.

| Элемент | Почему неизменен | Как проверить |
|---|---|---|
| `AppShell.jsx` | Shell вне scope; редизайн касается только inner page реестра | `git diff origin/main -- frontend/src/components/AppShell.jsx`; визуально shell прежний |
| `TopBar.jsx` | Header/global actions вне scope | `git diff origin/main -- frontend/src/components/TopBar.jsx`; те же кнопки, цвета, размеры |
| Global sidebar / navigation | Навигация приложения вне scope | Проверить пункты меню и глобальные переходы на runtime |
| `ProcessAnalyticsHub.jsx` / Analytics Hub | Hub является контейнером/точкой входа; он не редизайнится этим контуром | Открыть Analytics Hub и убедиться, что карточки/иерархия сохранены |
| `processMapRouteModel.js` | Routing вне scope; registry должен оставаться вложенным surface | `git diff origin/main -- frontend/src/app/processMapRouteModel.js`; route smoke |
| Backend API | Данные вне scope; UI rework не добавляет endpoint'ы и не меняет contracts | `git diff origin/main -- backend/app/`; Network только существующие registry endpoints |
| Database schema | Durable data вне scope | Нет миграций/изменений models/schema |
| BPMN XML | Диаграмма вне scope; registry не должен писать XML | Нет PUT `/bpmn` при открытии/фильтрации/export registry |
| RAG runtime | Поиск/knowledge layer вне scope | `git diff origin/main -- tools/rag/ docs/rag/` пустой для этого контура |
| Product Actions durable truth | UI не меняет источник истины product actions | Строки/метрики читаются из backend; нет frontend mock/durable mutation |
| Explorer code | Scope semantics можно визуально вдохновлять Explorer labels, но Explorer UI/code не копируется и не меняется | `git diff origin/main -- frontend/src/features/explorer/` не содержит registry-driven redesign |
| Global CSS outside registry selectors | Broad style drift вне scope | CSS diff ограничен registry selectors; нет глобальных body/shell/table overrides |

## Reviewer commands

```bash
git diff origin/main -- frontend/src/components/AppShell.jsx
git diff origin/main -- frontend/src/components/TopBar.jsx
git diff origin/main -- frontend/src/app/processMapRouteModel.js
git diff origin/main -- frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx
git diff origin/main -- backend/app/
git diff origin/main -- tools/rag/ docs/rag/
git diff origin/main -- frontend/src/features/explorer/
```

## Runtime signs of accidental out-of-scope change

- Header/sidebar visually changed while opening registry.
- Analytics Hub no longer looks like the existing hub.
- Registry navigation causes full-page reload instead of SPA surface transition.
- Opening/filtering/exporting registry emits PUT/PATCH requests to sessions/BPMN.
- Registry metrics or rows differ from backend responses without documented transform.
