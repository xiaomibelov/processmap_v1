# Obsidian Context Used — Planner

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- launcher_run_id: `20260518T164643Z-83747`
- Obsidian root: `/srv/obsidian/project-atlas/ProcessMap`

## Поисковые команды

```bash
ls /srv/obsidian/project-atlas/ProcessMap
ls /srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux
ls /srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-single-surface-visual-system-v1
ls /srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-inner-page-safe-redesign-v1
```

## Прочитанные/учтённые заметки

| Файл | Релевантность | Принятое решение |
|---|---|---|
| `AgentReports/uiux/product-actions-registry-single-surface-visual-system-v1/PLAN.md` | прямой предшественник «одной поверхности» | Использовать тот же принцип «один белый контейнер + 1px-разделители», но без расширения scope. |
| `AgentReports/uiux/product-actions-registry-single-surface-visual-system-v1/EXEC_REPORT.md` | какие правки уже применялись | Не дублировать выполненное, фокус — на оставшемся визуальном шуме (карточки метрик, баннеры, AI). |
| `AgentReports/uiux/product-actions-registry-inner-page-safe-redesign-v1/CHANGES_REQUESTED` + `PLAN.md` | прошлый отклон | Учесть прошлые причины отклонения: жёлтые баннеры, gradient в AI, dotted, дубли экспортов. |
| `AgentReports/uiux/product-actions-registry-ia-layout-rework-v2/*` | IA — Аналитика / Реестр / Свойства / Дашборды | Подтверждает: «Реестр действий» — внутренний модуль Analytics, Analytics не удаляем. |
| `AgentReports/uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1/*` | архитектура Analytics Hub | Не трогать Hub. Контур только об inner page. |
| `AgentReports/uiux/analytics-registry-layout-density-and-visual-system-v1/*` | плотность layout-а | Шаг 24/12px, dividers 1px #F3F4F6 — согласовано. |
| `AgentReports/uiux/product-actions-registry-polished-table-layout-v1/*` | таблица как primary content | Принять колоночную сетку 20/25/35/20, header #FAFAFA, hover #FAFAFA. |
| `AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/*` | workspace scope collapsible | Подтверждает default-collapsed состояние и `Workspace scope · N сессий, M строк`. |
| `RAG/INDEX_SOURCES_DRAFT.md` | какие файлы попадают в RAG | План попадает в RAG-индекс автоматически. |

## Решения, взятые из Obsidian

- IA сохраняется: **Аналитика → Реестр действий | Реестр свойств | Дашборды**. Контур редактирует только «Реестр действий».
- Прошлые отклоны Agent 4 фиксировали жёлтый баннер и градиент AI как блокеры — оба переведены в forbidden patterns.
- Прошлый «single-surface» контур ввёл единый белый контейнер — настоящий контур доводит работу до строгого формализма (метрики строкой, фильтры компактным рядом, warning текстом, AI без подложки).
- Реальные файлы реестра проверены: `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx`, `ProductActionsRegistryPanel.jsx`, `ProcessAnalyticsHub.jsx`, и подпапка `registry/` (Header, Filters, Metrics, Table, Pagination). Эти файлы — целевые для правок Worker 2.
