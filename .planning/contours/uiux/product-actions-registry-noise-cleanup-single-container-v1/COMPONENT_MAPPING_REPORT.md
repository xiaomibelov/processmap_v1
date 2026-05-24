# Component Mapping Report

Итоговый mapping компонентов; обоснование любых замен.

## Итоговый mapping

| Concept из спека | ProcessMap-файл | Изменён | Обоснование |
|---|---|---|---|
| `App.tsx` (рендер Header + MainCard) | `ProductActionsRegistryPage.jsx` | нет | JSX-структура уже корректна: `<main>` → `ProductActionsRegistryContent`. |
| `Header.tsx` | `registry/ProductActionsRegistryHeader.jsx` | **да** | Упрощён layout: title/subtitle/CSV·XLSX/«Вернуться» в одном header-блоке. Дубли экспорта убраны. |
| `MainCard.tsx` (единый контейнер) | `ProductActionsRegistryPanel.jsx` | **да** | Добавлен `<div className="productActionsRegistryContainer">` внутри `ProductActionsRegistryContent` — единый белый контейнер. |
| `MetricsPanel` | `registry/ProductActionsRegistryMetrics.jsx` | **да** | 5 карточек `MetricCard` → 5 `<span>` Metric в одной строке flex gap 32. |
| `FilterPanel` | `registry/ProductActionsRegistryFilters.jsx` | **да** | Framed reset-кнопка → text-link. Добавлен `<p className="productActionsRegistryFiltersHint">`. |
| `WarningBanner` | warning-блок внутри Panel | **да** | `productActionsRegistryIncompleteBanner`: жёлтая подложка/border → text row. Добавлена кнопка «Показать только неполные» (#7C3AED). |
| `DataTable` | `registry/ProductActionsRegistryTable.jsx` | **да** | Добавлен `useState` для раскрытия строки. Колонки 20/25/35/20. Chevron + expansion `<dl>` 4 read-only поля. |
| Sessions list | sessions-секция внутри Panel | **да** | `productActionsRegistrySessionSummaryTable` → `productActionsRegistrySessionCompactList` + `productActionsRegistrySessionSummaryRow` (compact flex, не таблица). |
| AI block | AI-блок реестра внутри Panel | **да** | Переведён в `productActionsRegistryPrimaryActions` — flat строка: label + chips + кнопка #7C3AED + counter. Без gradient/подложки. |
| CSS утилиты | `frontend/src/styles/tailwind.css` | **да** | Append-only override-блок (строки 11574+). Scoped под `.productActionsRegistryPanel--page`. |
| Pagination | `registry/ProductActionsRegistryPagination.jsx` | нет | JSX-структура совместима с новым CSS override. Изменений не потребовалось. |
| index.js | `registry/index.js` | нет | Экспорт без изменений. |

## Замены компонентов

Ни один компонент не удалён. Изменения — рефакторинг внутренней структуры и CSS:
- `MetricCard` (локальный sub-component) → `Metric` (локальный sub-component в том же файле). Публичный API `ProductActionsRegistryMetrics` не изменён (те же props).
- `StatusBadge` и `CompactChips` (в Table) — сохранены как `StatusBadge` и `ActionChips`.
- Добавлен `Row` — локальный sub-component для раскрытия строки; не экспортируется.

## Внешние импорты

- `ProductActionsRegistryTable.jsx` теперь импортирует `useState` из `react` (для expansion state). Это единственный новый импорт.
- Все остальные экспорты/импорты — без изменений.

## Не тронуты (DO NOT TOUCH)

- `ProcessAnalyticsHub.jsx` — подтверждено, что файл не изменён.
- `AppShell.jsx`, `TopBar.jsx`, `WorkspaceExplorer.jsx`, `ProcessStage.jsx`, `BpmnStage.jsx`, `InterviewStage.jsx` — не тронуты.
- Все BPMN/dark-theme/legacy CSS — не тронуты.
- Backend, schema, BPMN XML, Product Actions truth, RAG runtime, AI-логика — не тронуты.
