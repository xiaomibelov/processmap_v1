# PLAN — feature/analytics-dashboards-v2

## 1. Source / Runtime Truth

| Fact | Value |
|------|-------|
| repo root | `/opt/processmap-test` |
| worktree | `/opt/processmap-test/.worktrees/feature-analytics-dashboards-v2` |
| branch | `feature/analytics-dashboards-v2` |
| baseline | `origin/main` @ `d30f66da` |
| HEAD | `d30f66da` |
| status | clean |
| stage runtime | `http://clearvestnic.ru:5177` |
| frontend | React 18 + Vite + TailwindCSS |
| backend | Python FastAPI |

## 2. Problem Statement

Страница **Аналитика → Дашборды** (`AnalyticsDashboardsPanel`) сейчас показывает:
- Donut «Семейства свойств», «Типы значений»
- Bar «Категории», «Топ-20 используемых свойств»
- Bar «Действия по ролям», «Действия по секциям»
- Donut «Типы действий»

Пользователь просит:
1. Убрать громоздкий **Топ-20 используемых свойств** → заменить на компактный **Топ-5**.
2. Добавить новые плитки с реальными данными:
   - KPI-лентка
   - Статусы тасок (donut)
   - Динамика сессий (line chart)
   - Типы BPMN-элементов (bar)
   - Время выполнения по процессам (bar)
   - Heatmap активности
3. Сохранить текущую сетку (7 рядов согласно ТЗ).
4. Сохранить dark/light темы и адаптивность.

## 3. Bounded Scope

### IN SCOPE
- `frontend/src/features/analytics/AnalyticsDashboardsPanel.jsx` — перераскладка плиток по 7 рядам.
- `frontend/src/features/analytics/dashboardModel.js` — новые normalize-функции.
- `frontend/src/features/analytics/DashboardBarChart.jsx` — поддержка компактного Top-5.
- Новые презентационные компоненты в `frontend/src/features/analytics/dashboard/`:
  - `DashboardKpiRibbon.jsx`
  - `DashboardTaskStatusDonut.jsx`
  - `DashboardSessionTrendLine.jsx`
  - `DashboardBpmnElementTypesBar.jsx`
  - `DashboardProcessDurationBar.jsx`
  - `DashboardActivityHeatmap.jsx`
- `frontend/src/features/analytics/dashboardModel.test.mjs` — расширить тесты.
- `frontend/src/features/analytics/AnalyticsDashboardsPanel.test.mjs` — новые тесты рендера.
- Backend: расширить `GET /api/analytics/dashboard` новыми секциями (см. `API.md`).
- Backend schema `AnalyticsDashboardOut` — добавить новые поля.
- Backend read-model / snapshot — добавить расчёт новых метрик (см. `API.md`).

### OUT OF SCOPE
- Изменение layout/grid страницы вне `AnalyticsDashboardsPanel`.
- Изменение навигации, табов, scope switcher.
- Изменение Реестра действий / Реестра свойств / Обзора.
- Подключение внешних charting-библиотек (D3, Recharts, ECharts).
- Real-time WebSocket обновления.
- Export PDF/PNG.
- BPMN XML изменения.

## 4. Architecture

### Data Flow

```
AnalyticsPage.jsx
  └─ AnalyticsDashboardsPanel { scope, scopeId, data, loading, error }
       ├─ useAnalyticsDashboard(scope, scopeId)  → apiGetAnalyticsDashboard
       ├─ useAnalyticsSummaries(scope, scopeId)  → apiGetAnalyticsPropertiesSummary + apiGetAnalyticsActionsSummary
       └─ DashboardLayout (7 rows)
            ├─ Row 1: DashboardKpiRibbon
            ├─ Row 2: Donut PropertyFamilies | Donut ValueTypes
            ├─ Row 3: Bar Categories | Bar TaskStatuses
            ├─ Row 4: Line SessionTrend (full-width)
            ├─ Row 5: Bar Top5Properties | Bar BpmnElementTypes
            ├─ Row 6: Bar ProcessDuration | Heatmap Activity
            └─ Row 7: Bar Top5ProcessesByDuration (fallback)
```

### Component Structure

```
frontend/src/features/analytics/
  ├─ AnalyticsDashboardsPanel.jsx          (изменить)
  ├─ DashboardBarChart.jsx                 (изменить — compact mode)
  ├─ dashboardModel.js                     (расширить)
  ├─ dashboardModel.test.mjs               (расширить)
  ├─ AnalyticsDashboardsPanel.test.mjs     (новый/расширить)
  └─ dashboard/
       ├─ DashboardKpiRibbon.jsx
       ├─ DashboardTaskStatusDonut.jsx
       ├─ DashboardSessionTrendLine.jsx
       ├─ DashboardBpmnElementTypesBar.jsx
       ├─ DashboardProcessDurationBar.jsx
       ├─ DashboardActivityHeatmap.jsx
       └─ index.js
```

### Backend Endpoints

- `GET /api/analytics/dashboard?scope={workspace|project|session}&scope_id=...`
  - Расширить ответ новыми секциями (см. `API.md`).
- `GET /api/analytics/properties/summary` — оставить как есть (используется для PropertyFamilies/ValueTypes/Categories/Top5).
- `GET /api/analytics/actions/summary` — оставить как есть (используется для ActionsByRole/Section/Type, опционально TaskStatuses).

## 5. Acceptance Criteria

### AC-1: Раскладка по 7 рядам
- Все 7 рядов отображаются в порядке, заданном пользователем.
- Ряды 1, 4 — full-width.
- Ряды 2, 3, 5, 6 — две колонки на desktop, стопка на mobile.
- Ряд 7 — отображается только если в ряду 6 не хватило места (условно: если process_duration > 5 элементов).

### AC-2: KPI-лентка
- Отображает 5 карточек: Всего сессий, Всего тасок, Активных сейчас, Среднее время сессии, Уникальных процессов.
- Значения берутся из `apiGetAnalyticsDashboard`.

### AC-3: Топ-5 используемых свойств
- Вместо Топ-20 показывается горизонтальный bar с 5 строками.
- Компактный вид: уменьшенные отступы, шрифт 12px.

### AC-4: Новые плитки
- Статусы тасок — donut/pie с 4 сегментами.
- Динамика сессий — line chart по дням/неделям.
- Типы BPMN-элементов — горизонтальный bar.
- Время выполнения по процессам — горизонтальный bar.
- Heatmap активности — mini-heatmap или столбцы.

### AC-5: Темы и адаптивность
- Dark/light темы корректны (используются CSS-переменные).
- На `< 768px` плитки стопкой.

### AC-6: Тесты
- `npm run build` без ошибок.
- `node --test src/**/*.test.mjs` — все существующие + новые тесты pass.
- Новые тесты проверяют рендер каждой плитки и корректность данных из API.

### AC-7: Backend
- `GET /api/analytics/dashboard` возвращает все необходимые секции.
- Backend unit tests pass.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Недостающие данные на backend | Описать в `API.md`, реализовать расширение snapshot/read-model в рамках контура. |
| Большой объём данных для heatmap | Агрегировать на backend, отдавать только 24 часа × 7 дней. |
| Отсутствие line-chart компонента | Реализовать лёгкий SVG line chart без внешних зависимостей. |
| Scope=session: некоторые плитки неприменимы | Показывать empty-state («Нет данных для сессии») или fallback на project/workspace. |

## 7. Context Sources

- RAG preflight: `.planning/contours/feature/analytics-dashboards-v2/RAG_PREFLIGHT.md`
- Obsidian: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feat/analytics-pages-v1/PLAN.md`
- Obsidian: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feat/analytics-pages-v1/RUNTIME_NAVIGATION.md`
- Obsidian: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feat/analytics-registries-viewmodel-ui-v1/PLAN.md`

## 8. Handoff Notes

- Не изменять `AnalyticsHub.jsx`, `AnalyticsPage.jsx` (кроме передачи `data` в panel), `useAnalyticsRouteState.js`.
- Все цвета — из существующих CSS-переменных.
- Не добавлять новые npm-зависимости.
