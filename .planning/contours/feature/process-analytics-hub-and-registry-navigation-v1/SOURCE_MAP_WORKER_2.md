# SOURCE_MAP_WORKER_2.md

**Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
**Дата:** 2026-05-17

---

## Прочитанные файлы (до реализации)

| Файл | Цель |
|------|------|
| `frontend/src/app/processMapRouteModel.js` | Понять `PRODUCT_ACTIONS_REGISTRY_SURFACE`, `readProductActionsRegistryRoute`, `buildProductActionsRegistryUrl` и стиль функций |
| `frontend/src/components/ProcessStage.jsx` | Понять `productActionsRegistryRoute` state pattern (~915-952, ~6451-6488) |
| `frontend/src/features/explorer/WorkspaceExplorer.jsx` | Понять кнопки `workspace-product-actions-registry-nav` и `project-product-actions-registry` |
| `frontend/src/components/AppShell.jsx` | Понять передачу пропсов в `TopBar` |
| `frontend/src/components/TopBar.jsx` | Понять рендеринг back-кнопки |
| `frontend/src/config/appVersion.js` | Формат версионного журнала |
| `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Паттерн thin page wrapper |
| `frontend/src/styles/tailwind.css` | Проверить наличие CSS custom properties |

---

## Изменённые файлы

### Новые
1. `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` — компонент Analytics Hub.
2. `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` — тесты компонента.

### Модифицированные
3. `frontend/src/app/processMapRouteModel.js` — добавлен `ANALYTICS_HUB_SURFACE` и три хелпера для analytics-маршрута.
4. `frontend/src/components/ProcessStage.jsx` — добавлены `analyticsHubRoute`, `openAnalyticsHub`, `closeAnalyticsHub`, `return_to=analytics` при открытии реестра из хаба, рендер `<ProcessAnalyticsHub>`.
5. `frontend/src/features/explorer/WorkspaceExplorer.jsx` — кнопки workspace и project теперь ведут в Analytics Hub (`workspace-analytics-hub-nav`, `project-analytics-hub`).
6. `frontend/src/components/AppShell.jsx` — добавлена `isAnalyticsSurface()` и проп `analyticsSurfaceActive` для `TopBar`.
7. `frontend/src/components/TopBar.jsx` — при `analyticsSurfaceActive` back-кнопка заменена на метку «Аналитика» (`data-testid="topbar-analytics-label"`).
8. `frontend/src/styles/tailwind.css` — добавлены scoped CSS классы для Hub.
9. `frontend/src/config/appVersion.js` — bump до `v1.0.134`, changelog entry.
10. `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` — исправлены stale assert-ожидания (labels, data-testids).
11. `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` — исправлены stale assert-ожидания (explorer data-testids, кнопки экспорта).
