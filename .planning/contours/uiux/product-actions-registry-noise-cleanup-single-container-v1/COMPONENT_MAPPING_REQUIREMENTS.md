# Component Mapping Requirements

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`

Спек упоминает гипотетические файлы `src/components/Header.tsx`, `MainCard.tsx`, `MetricsPanel`, `FilterPanel`, `WarningBanner`, `DataTable`. В ProcessMap они не существуют. Эта таблица — обязательное соответствие.

## A. Concept → ProcessMap file

| Concept из спека | ProcessMap-файл | Тип правки |
|---|---|---|
| `App.tsx` (рендер Header + MainCard) | `frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx` | Структурная: композиция Header + единого Panel-контейнера. |
| `Header.tsx` | `frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx` | Привести title/subtitle/CSV/XLSX/«Вернуться» к спеку, убрать дубли. |
| `MainCard.tsx` (единый белый контейнер) | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` | Один контейнер: radius 12, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, секции внутри + 1px divider. |
| `MetricsPanel` | `frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx` | Переписать «карточки» в текстовую строку. |
| `FilterPanel` | `frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx` | Компактная строка селекторов, text-link reset, helper. |
| `WarningBanner` | warning-блок внутри Panel | Снять подложку/бордер, оставить text row. |
| `DataTable` | `frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx` | Колонки 20/25/35/20, header `#FAFAFA`, badges, expansion. |
| Sessions list | sessions-секция внутри Panel | Compact flex rows, не таблица. |
| AI block | существующий AI-блок реестра внутри Panel | Без gradient/подложки. |
| `index.css` утилиты | `frontend/src/styles/*` локально в скоупе реестра | Только локальные правила; **не** трогать глобальные/BPMN/legacy. |

## B. Сохраняем (DO NOT TOUCH)

- `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` (Analytics shell).
- `frontend/src/components/AppShell.jsx`, `TopBar.jsx`, `WorkspaceExplorer.jsx`.
- `frontend/src/components/ProcessStage.jsx`, `BpmnStage.jsx`, `InterviewStage.jsx`.
- Все BPMN/dark-theme/legacy CSS.
- Backend, schema, BPMN XML, Product Actions truth, RAG runtime, AI-логика.

## C. Удаление / замена registry-local компонентов

Удалять `MetricsPanel/FilterPanel/WarningBanner/DataTable` нельзя как блок — они в ProcessMap уже мапятся на реальные registry-локальные файлы (см. таблицу A). Допустимо **встроить** содержимое warning в Panel, если это упрощает структуру; в этом случае Worker 2 в `COMPONENT_MAPPING_REPORT.md` фиксирует точную причину и безопасную замену (что вызывало старый компонент, кто теперь использует, нет ли внешних импортов).

## D. Stack-правила

- Файлы — JSX + обычный CSS. **Не** мигрировать на TS/Tailwind/shadcn/lucide.
- Иконки — текущий способ репозитория (если уже есть импорт `lucide-react`/SVG — допустимо переиспользовать).
- Новых зависимостей в `package.json` — **нет**.
