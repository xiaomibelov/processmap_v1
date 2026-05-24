# SCOPE_CLASSIFICATION_REPORT — Файлы рабочей директории

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T112506Z-72991`  
**Ветка:** `fix/lockfile-sync-test`  
**HEAD:** `5b20bc2d1292f419647238eaf37dac55f9315942`  
**origin/main:** `d805e1c64c1107b9e3fe6854e031694bf741b187`  
**Дата:** `2026-05-17`  

---

## Методология классификации

1. Прочитан `git diff --name-only` и `git status -sb`.
2. Каждый изменённый файл проанализирован через `git diff HEAD -- <file>`.
3. Файлы разделены по контексту изменений:
   - **Category A** — Analytics Hub v1.0.134 (pre-existing, до начала контура редизайна реестра).
   - **Category B** — Registry redesign v1.0.135 (целевой контур).
   - **Category C** — Несвязанные изменения (диаграмма/производительность v1.0.131–1.0.133).

---

## Таблица классификации

### Category A — Analytics Hub v1.0.134 (pre-existing)

| # | Путь | Статус | Описание изменений | Оценка безопасности |
|---|------|--------|-------------------|---------------------|
| A1 | `frontend/src/components/AppShell.jsx` | M | Добавлен `isAnalyticsSurface()` и прокинут `analyticsSurfaceActive` в TopBar | Безопасно, не касается реестра |
| A2 | `frontend/src/components/TopBar.jsx` | M | Добавлен проп `analyticsSurfaceActive`, условный рендер метки «Аналитика» вместо кнопки «← Проекты» | Безопасно, не касается реестра |
| A3 | `frontend/src/components/ProcessStage.jsx` | M | Добавлены `openAnalyticsHub`, `closeAnalyticsHub`, `syncAnalyticsHubRoute`, монтирование `ProcessAnalyticsHub` и `ProductActionsRegistryPage` как sibling surfaces | Безопасно, pre-existing routing для Analytics Hub и реестра |
| A4 | `frontend/src/features/explorer/WorkspaceExplorer.jsx` | M | Кнопки sidebar и project pane изменены с «Реестр действий» на «Аналитика», прокинут `onOpenAnalyticsHub` | Безопасно, навигация на уровне хаба |
| A5 | `frontend/src/app/processMapRouteModel.js` | M | Добавлены `ANALYTICS_HUB_SURFACE`, `readAnalyticsHubRoute`, `buildAnalyticsHubUrl`, `buildAnalyticsHubCloseUrl` | Безопасно, routing-утилиты |
| A6 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` | ?? (untracked) | Новый компонент Analytics Hub | Безопасно, v1.0.134 |
| A7 | `frontend/src/components/process/analysis/ProcessAnalyticsHub.test.mjs` | ?? (untracked) | Тесты Analytics Hub | Безопасно, v1.0.134 (1 тест устарел из-за bump версии) |

### Category B — Registry redesign v1.0.135 (контур scope)

| # | Путь | Статус | Описание изменений | Оценка безопасности |
|---|------|--------|-------------------|---------------------|
| B1 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | M | God-компонент декомпозирован: извлечены Header, Metrics, Filters, Table, Pagination; добавлена пагинация `pageState`/`pageSize`; сохранён весь data flow | Безопасно, в рамках контура |
| B2 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | M (0 diff) | Обёртка не изменилась, уже импортировала `ProductActionsRegistryContent` | Безопасно |
| B3 | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.test.mjs` | M | Адаптирован под разбиение компонента | Безопасно, тесты проходят |
| B4 | `frontend/src/components/process/analysis/ProductActionsRegistryPage.test.mjs` | M | Адаптирован под разбиение | Безопасно, тесты проходят |
| B5 | `frontend/src/config/appVersion.js` | M | Бамп с `v1.0.130` → `v1.0.135`, добавлены записи changelog v1.0.131–1.0.135 | Безопасно, версия контура |
| B6 | `frontend/src/styles/tailwind.css` | M | Добавлены CSS-классы для `.productActionsRegistryMetrics`, `.productActionsRegistryPagination`, `.productActionsRegistryTableHead`, `.productActionsRegistryRow` и т.д.; также содержит pre-existing Analytics Hub стили | Безопасно, registry-стили изолированы по префиксу |
| B7 | `frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx` | ?? (new) | Извлечённый компонент заголовка | Безопасно, в рамках контура |
| B8 | `frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx` | ?? (new) | Извлечённый компонент метрик (5 карточек) | Безопасно, в рамках контура |
| B9 | `frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx` | ?? (new) | Извлечённый компонент фильтров (7 полей + сброс) | Безопасно, в рамках контура |
| B10 | `frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx` | ?? (new) | Извлечённый компонент таблицы (4 колонки) | Безопасно, в рамках контура |
| B11 | `frontend/src/components/process/analysis/registry/ProductActionsRegistryPagination.jsx` | ?? (new) | Извлечённый компонент пагинации (25/50) | Безопасно, в рамках контура |
| B12 | `frontend/src/components/process/analysis/registry/index.js` | ?? (new) | Barrel-экспорты новых компонентов | Безопасно, в рамках контура |

### Category C — Несвязанные изменения (диаграмма/производительность v1.0.131–1.0.133)

| # | Путь | Статус | Описание изменений | Оценка безопасности |
|---|------|--------|-------------------|---------------------|
| C1 | `frontend/src/components/process/BpmnStage.jsx` | M | Добавлен `memo` вокруг `BpmnStage` | Не связано с реестром, pre-existing perf |
| C2 | `frontend/src/components/process/InterviewStage.jsx` | M | Добавлен `memo` вокруг `InterviewStage` | Не связано с реестром, pre-existing perf |
| C3 | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | M | Добавлен `bindDiagramInteractionMode`, guard `applyPropertiesOverlayDecorForZoomChange` при pan/drag | Не связано с реестром, pre-existing perf |
| C4 | `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` | M | Стабилизация пропов оверлеев диаграммы | Не связано с реестром, pre-existing perf |
| C5 | `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` | M | Оптимизация контролов диаграммы | Не связано с реестром, pre-existing perf |
| C6 | `frontend/src/styles/app/02/02-02-bpmn-viewer-core.css` | M | Изменены stroke/fill цвета BPMN-элементов | Не связано с реестром, pre-existing |
| C7 | `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` | M | Тёмная тема BPMN + `shape-rendering: crispEdges` при interaction | Не связано с реестром, pre-existing |
| C8 | `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` | M | Контраст текста BPMN, `--bpmn-task-fill`/`--bpmn-task-stroke` | Не связано с реестром, pre-existing |
| C9 | `frontend/src/styles/app/06-final-structure.css` | M | `will-change: transform` при interaction вместо `filter` | Не связано с реестром, pre-existing |
| C10 | `frontend/src/styles/legacy/legacy_bpmn.css` | M | Удалён grid-background `.bpmnStack::before` | Не связано с реестром, pre-existing |

---

## Выводы по классификации

- **Backend / schema / BPMN XML / RAG:** изменений **нет**. Все изменения — frontend-only.
- **Package.json / package-lock.json:** изменений **нет**.
- **Category A (Analytics Hub)** и **Category B (Registry redesign)** — логически разделены и не конфликтуют.
- **Category C (диаграмма perf)** — независимая группа изменений, не мешает контуру реестра.
- Ни один файл из Category A не был переписан ради редизайна реестра — все изменения A относятся к Analytics Hub v1.0.134.
