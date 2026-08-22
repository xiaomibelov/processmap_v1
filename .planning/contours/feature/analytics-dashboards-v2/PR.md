# PR — feature/analytics-dashboards-v2

## Заголовок
`feature/analytics-dashboards-v2`: новые плитки на странице Дашборды

## Описание

Доработана страница **Аналитика → Дашборды**:
- Убран громоздкий «Топ-20 используемых свойств», заменён на компактный «Топ-5».
- Добавлены новые плитки:
  - KPI-лентка
  - Статусы тасок (donut)
  - Динамика сессий (line chart)
  - Типы BPMN-элементов (bar)
  - Время выполнения по процессам (bar)
  - Heatmap активности
- Сохранена существующая сетка (7 рядов), dark/light темы и адаптивность.

## Изменения

### Frontend
- `frontend/src/features/analytics/AnalyticsDashboardsPanel.jsx` — новая раскладка плиток.
- `frontend/src/features/analytics/DashboardBarChart.jsx` — compact mode для Top-5.
- `frontend/src/features/analytics/dashboardModel.js` — normalize-функции.
- `frontend/src/features/analytics/dashboard/*` — новые презентационные компоненты.
- `frontend/src/features/analytics/*.test.mjs` — новые тесты.

### Backend
- `backend/app/routers/analytics.py` — расширение `GET /api/analytics/dashboard`.
- `backend/app/schemas/analytics.py` — новые секции в `AnalyticsDashboardOut`.
- `backend/tests/test_analytics_dashboard.py` — тесты новых секций.

## Как проверить

1. `npm run build` — без ошибок.
2. `node --test src/**/*.test.mjs` — все тесты pass.
3. `pytest tests/test_analytics_dashboard.py` — все тесты pass.
4. Открыть `/app?surface=dashboards` и убедиться, что отображаются все 7 рядов плиток.

## Чек-лист

- [ ] Код прошёл self-review.
- [ ] Тесты добавлены и проходят.
- [ ] Build проходит.
- [ ] Runtime smoke-test выполнен.
- [ ] Нет secrets в diff.

## Связанные артефакты

- `.planning/contours/feature/analytics-dashboards-v2/PLAN.md`
- `.planning/contours/feature/analytics-dashboards-v2/API.md`
- `.planning/contours/feature/analytics-dashboards-v2/UI.md`
- `.planning/contours/feature/analytics-dashboards-v2/TESTS.md`
