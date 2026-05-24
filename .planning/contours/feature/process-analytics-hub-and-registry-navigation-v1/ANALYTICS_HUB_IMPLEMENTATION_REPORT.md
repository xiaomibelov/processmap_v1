# ANALYTICS_HUB_IMPLEMENTATION_REPORT.md

**Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Дата:** 2026-05-17

---

## 1. Компонент ProcessAnalyticsHub

**Путь:** `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx`

### Props
- `workspaceId` (string)
- `projectId` (string)
- `projectTitle` (string)
- `sessionId` (string)
- `sessionTitle` (string)
- `onOpenProductActionsRegistry` (function, optional)
- `onClose` (function, optional)

### Структура
- **Page wrapper:** `<main className="processAnalyticsHubPage" data-testid="process-analytics-hub-page">`
- **Header:** заголовок «Аналитика», описание, кнопка «Закрыть» (`data-testid="analytics-hub-close"`).
- **Summary cards:** 4 карточки (Действия, Свойства, Процессы, Неполные данные) со значениями `—` (placeholder).
- **Module cards:** 4 модуля в сетке:
  1. Реестр действий — CTA «Открыть», вызывает `onOpenProductActionsRegistry` с текущим scope.
  2. Реестр свойств — badge `Скоро`.
  3. Дашборды — badge `Скоро`.
  4. Экспорт — badge `В разработке`.

### Стиль
Используются существующие CSS custom properties (`--analysis-text`, `--analysis-muted`, `--analysis-border-soft`) и Tailwind utility-классы. Scoped CSS определены в `tailwind.css`.

---

## 2. Route Model — Analytics Hub

**Путь:** `frontend/src/app/processMapRouteModel.js`

### Добавленные экспорты
- `export const ANALYTICS_HUB_SURFACE = "analytics";`
- `readAnalyticsHubRoute(locationLike)` — возвращает `{ active, workspaceId, projectId, sessionId }`.
- `buildAnalyticsHubUrl(routeRaw, options)` — формирует URL с `surface=analytics`.
- `buildAnalyticsHubCloseUrl(routeRaw, options)` — удаляет `surface` и `registry_scope`, сохраняет workspace/project/session.

Стиль полностью повторяет существующие registry-функции.

---

## 3. Проводка в ProcessStage

**Путь:** `frontend/src/components/ProcessStage.jsx`

### State
- `analyticsHubRoute` — инициализируется `readAnalyticsHubRoute()`, синхронизируется по `popstate`.

### Callbacks
- `openAnalyticsHub(options)` — pushState с `surface=analytics`, обновляет `analyticsHubRoute` и `productActionsRegistryRoute`.
- `closeAnalyticsHub()` — pushState с `buildAnalyticsHubCloseUrl`, удаляет `surface`.

### Условный рендер
- В ветке `!hasSession` (workspace/project view): если `analyticsHubRoute.active`, рендерится `<ProcessAnalyticsHub>` перед проверкой `productActionsRegistryRoute.active`.
- В ветке `hasSession` (session view): аналогично, `<ProcessAnalyticsHub>` рендерится перед реестром и вкладками.

### Передача пропсов
- `onOpenProductActionsRegistry={openProductActionsRegistry}` — позволяет открыть реестр из хаба.
- `onClose={closeAnalyticsHub}` — закрывает хаб.
- `onOpenAnalyticsHub={openAnalyticsHub}` — передаётся в `WorkspaceExplorer`.

### Return-to behavior
- При открытии реестра из хаба (`openProductActionsRegistry`): если `analyticsHubRoute.active`, в URL добавляется `return_to=analytics`.
- При закрытии реестра (`closeProductActionsRegistry`): если `return_to=analytics`, вместо закрытия реестра выполняется `buildAnalyticsHubUrl` — пользователь возвращается в хаб.
