# Source Map — Worker 2

Текущий → целевой mapping per file.

## `ProductActionsRegistryPage.jsx`
- Изменений нет: страница уже передаёт `page` + `showWorkspaceScope` в `ProductActionsRegistryContent`. Структура отвечает спеку (`<main className="productActionsRegistryPage">`).

## `ProductActionsRegistryPanel.jsx` (ProductActionsRegistryContent)
- Было: Header → Scope tabs → Metrics → Filters → PrimaryActions (AI как карточка) → AI review (gradient block) → Incomplete banner (жёлтая подложка) → Preview/Table → Pagination → details «Источники данных» → Footer.
- Стало: Header → Scope tabs → **единый белый контейнер `.productActionsRegistryContainer`** с секциями в порядке: 1) Workspace scope (`<details>`, default collapsed) 2) Sessions workspace (compact list) 3) Metrics (текстовая строка) 4) Filters (компактная строка) 5) Warning row (text-only) 6) AI suggestions (label + chips + кнопка + counter) 7) Registry table 8) Pagination. AI-review (когда есть результаты) — отдельный белый контейнер ниже. Footer — после.

## `registry/ProductActionsRegistryHeader.jsx`
- Было: `Закрыть/Вернуться` как secondaryBtn + CSV/XLSX + exportMeta + exportStatus в одной правой колонке.
- Стало: title 18/700, subtitle 13/400; CSV/XLSX как outline 32px (border `#D1D5DB`); «Вернуться» — компактная text-ссылка 13/`#6B7280` (hover `#374151`); exportMeta/status — мелкие подписи. CSV/XLSX **только в header**, дублей нет.

## `registry/ProductActionsRegistryFilters.jsx`
- Было: framed reset-кнопка `secondaryBtn smallBtn productActionsRegistryFilterReset`, helper-text отсутствовал.
- Стало: reset как text-link (`<button className="productActionsRegistryFilterReset">` без border/bg, hover underline), добавлен `<p className="productActionsRegistryFiltersHint">Фильтры применяются к загруженным строкам.</p>`. Селекторы — 34px высоты, border `#E5E7EB`, radius 6px.

## `registry/ProductActionsRegistryMetrics.jsx`
- Было: 5 `<article className="productActionsRegistryMetricCard">` — карточки с border и фоном.
- Стало: один `<section>` flex gap 32, каждый Metric — пара `<span value>` 20/700 `#111827` + `<span label>` 11/uppercase `#9CA3AF`. Без подложек/карточек/разделителей. Число «неполных» — `#F59E0B` (через `data-accent="incomplete"`). «После фильтров» при равенстве со всем количеством — `data-muted="true"` (opacity 0.7).

## `registry/ProductActionsRegistryTable.jsx`
- Было: 4 grid-колонки `minmax(150px,0.9fr) minmax(220px,1.2fr) minmax(220px,1.2fr) minmax(116px,0.5fr)`, без раскрытия строки.
- Стало: header `bg #FAFAFA`, колонки 20/25/35/20, hover `#FAFAFA`. Каждая строка — `<button>` (chevron rotate + 4 ячейки), под ней `.productActionsRegistryRowExpansion` с max-height transition и 4-колоночным `<dl>` (ID · BPMN · Сессия · Дата). Badges — `#ECFDF5/#10B981` (полная) / `#FFFBEB/#F59E0B` (неполная). BPMN-код в `productActionsRegistryRowBpmn` 12/`#9CA3AF`.

## `frontend/src/styles/tailwind.css`
- Было: registry-классы в нескольких блоках в файле с тёмной палитрой `hsl(var(--analysis-*))`, gradient-фон у `.productActionsRegistryPanel`, dashed-border у `.productActionsRegistryWorkspaceNotice`, gradient у `.productActionsRegistryAiReview`, жёлтая подложка у `.productActionsRegistryIncompleteBanner`.
- Стало: добавлен **append-only override-блок** `=== Product Actions Registry — Noise Cleanup v1.0.138 ===` в конце файла. Все правила scoped под `.productActionsRegistryPanel--page`, чтобы не задеть модальный variant. Палитра — целевая (`#F3F4F6`/`#FFFFFF`/`#E5E7EB`/`#7C3AED`/`#10B981`/`#F59E0B`). Единый контейнер `.productActionsRegistryContainer` (radius 12, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, padding 0). Секции — `padding: 12px 24px`, разделитель — `border-top: 1px solid #F3F4F6`.

## `frontend/src/config/appVersion.js`
- Было: `currentVersion: "v1.0.137"`.
- Стало: `currentVersion: "v1.0.138"` + новая запись в `changelog[0]`.

## Файлы из white-list, которые НЕ потребовалось менять
- `ProductActionsRegistryPagination.jsx` — JSX-структура совместима с новым CSS, изменений не требуется.
- `registry/index.js` — экспорт без изменений.
