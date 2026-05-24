# NAVIGATION_WIRING_REPORT.md

**Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Дата:** 2026-05-17

---

## 1. Замена точек входа

### Workspace sidebar (WorkspaceExplorer.jsx ~1055)
- **Было:** кнопка с `data-testid="workspace-product-actions-registry-nav"`, label «Реестр действий», onClick открывал реестр напрямую.
- **Стало:** кнопка с `data-testid="workspace-analytics-hub-nav"`, label «Аналитика», subtitle «Аналитика и реестры», onClick вызывает `onOpenAnalyticsHub?.({ workspaceId: activeWorkspaceId })`.

### Project pane (WorkspaceExplorer.jsx ~2590)
- **Было:** кнопка с `data-testid="project-product-actions-registry"`, label «Реестр действий», onClick открывал реестр напрямую.
- **Стало:** кнопка с `data-testid="project-analytics-hub"`, label «Аналитика», onClick вызывает `onOpenAnalyticsHub?.({ workspaceId, projectId })`.

---

## 2. Поведение Back / Close

### TopBar
- **Обычный режим:** кнопка «← Проекты» / «← К проекту» возвращает к списку проектов / сессий.
- **Analytics surface:** back-кнопка скрыта. Вместо неё показывается пассивная метка «Аналитика» (`data-testid="topbar-analytics-label"`). Это предотвращает дублирование close-функционала и не ломает нормальные project/session экраны.

### Закрытие Analytics Hub
- Кнопка «Закрыть» в самом компоненте `ProcessAnalyticsHub` вызывает `onClose` → `closeAnalyticsHub`.
- `closeAnalyticsHub` удаляет `surface` из URL и возвращает пользователя к текущему workspace/project/session.

### Закрытие реестра, открытого из хаба
- При открытии реестра из хаба в URL добавляется `return_to=analytics`.
- При закрытии реестра (`closeProductActionsRegistry`) проверяется `return_to`:
  - Если `return_to === "analytics"`, пользователь возвращается в Analytics Hub.
  - Иначе — обычное закрытие реестра (возврат к workspace/project/session).

---

## 3. URL-контракт

| Состояние | URL параметры |
|-----------|---------------|
| Analytics Hub | `?surface=analytics&workspace=...&project=...&session=...` |
| Реестр из хаба | `?surface=product-actions-registry&registry_scope=...&workspace=...&project=...&session=...&return_to=analytics` |
| Закрытие хаба | `?workspace=...&project=...&session=...` (surface удалён) |
| Закрытие реестра (из хаба) | `?surface=analytics&workspace=...&project=...&session=...` |

---

## 4. Безопасность

- Изменения не затрагивают backend, БД, BPMN XML, durable truth Product Actions.
- Навигация работает через `history.pushState`, не ломает browser back.
- Default behavior для non-analytics экранов не изменён.
