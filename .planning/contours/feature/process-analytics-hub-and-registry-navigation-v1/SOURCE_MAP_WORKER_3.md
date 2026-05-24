# SOURCE_MAP_WORKER_3.md

> **Контур:** `feature/process-analytics-hub-and-registry-navigation-v1`  
> **Агент:** Agent 3 / Worker (Work Package B)  
> **Дата:** 2026-05-17  
> **Run ID:** 20260517T084454Z-64313

---

## Независимая инспекция исходного кода

### Проинспектированные файлы

| # | Путь | Найдено | Статус |
|---|------|---------|--------|
| 1 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` | Компонент Hub-страницы: заголовок «Аналитика», описание, 4 summary-карточки с placeholder «—», 4 module-карточки (Реестр действий, Реестр свойств, Дашборды, Экспорт), кнопка «Закрыть», CTA «Открыть» для registry. | ✅ Корректно |
| 2 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` | 14 тестов: testid, title, module cards, close button, onOpenProductActionsRegistry, onClose, summary placeholders без fake чисел, route model helpers, ProcessStage wiring, WorkspaceExplorer buttons, AppShell detection, TopBar handling, CSS классы, версия v1.0.134. | ✅ Все проходят |
| 3 | `frontend/src/app/processMapRouteModel.js` | `ANALYTICS_HUB_SURFACE = "analytics"`, `readAnalyticsHubRoute()`, `buildAnalyticsHubUrl()`, `buildAnalyticsHubCloseUrl()`. Реализация следует паттерну существующего registry route. | ✅ Корректно |
| 4 | `frontend/src/components/ProcessStage.jsx` | `analyticsHubRoute` state, `openAnalyticsHub`, `closeAnalyticsHub`, условный рендер `<ProcessAnalyticsHub>` до workspace/registry, передача `onOpenAnalyticsHub` в WorkspaceExplorer, `return_to=analytics` при открытии registry из Hub. | ✅ Корректно |
| 5 | `frontend/src/features/explorer/WorkspaceExplorer.jsx` | Кнопка «Аналитика» в sidebar (`data-testid="workspace-analytics-hub-nav"`) и в project pane (`data-testid="project-analytics-hub"`). Callback `onOpenAnalyticsHub`. | ✅ Корректно |
| 6 | `frontend/src/components/AppShell.jsx` | `isAnalyticsSurface()` определяет analytics по `?surface=analytics`. Прокидывает `analyticsSurfaceActive` в TopBar. | ✅ Корректно |
| 7 | `frontend/src/components/TopBar.jsx` | При `analyticsSurfaceActive` показывает пассивную метку «Аналитика» (`data-testid="topbar-analytics-label"`) вместо back-кнопки. | ✅ Корректно |
| 8 | `frontend/src/config/appVersion.js` | `currentVersion: "v1.0.134"`. Changelog entry содержит описание Analytics Hub. | ✅ Корректно |
| 9 | `frontend/src/styles/tailwind.css` | Scoped CSS классы: `.processAnalyticsHubPage`, `.processAnalyticsHubHeader`, `.processAnalyticsHubSummaryCards`, `.processAnalyticsHubSummaryCard`, `.processAnalyticsHubModuleCards`, `.processAnalyticsHubModuleCard`. Responsive breakpoints 980px и 640px. | ✅ Корректно |
| 10 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Тонкая обёртка `ProductActionsRegistryContent`. Без изменений в рамках контура. | ✅ Без изменений |
| 11 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Основной registry UI. Инспектирован первые 150 строк — durable truth (`interview.analysis.product_actions[]`) не изменена. | ✅ Без мутаций |

### Дополнительные файлы, упомянутые в diff

- `frontend/src/components/process/BpmnStage.jsx` — минимальные изменения (5 строк), не связанные с Analytics Hub напрямую.
- `frontend/src/components/process/InterviewStage.jsx` — минимальные изменения (6 строк).
- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` — 18 строк, связано с interaction mode.
- `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` — 7 строк.
- `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` — 20 строк.
- `frontend/src/styles/app/02/02-02-bpmn-viewer-core.css` — 6 строк.
- `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` — 36 строк.
- `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` — 6 строк.
- `frontend/src/styles/app/06-final-structure.css` — 7 строк.
- `frontend/src/styles/legacy/legacy_bpmn.css` — 44 строки.

### Вывод

Все целевые файлы Analytics Hub существуют и реализованы в соответствии с планом. Изменения ограничены frontend scope. Ни один backend-файл не затронут.
