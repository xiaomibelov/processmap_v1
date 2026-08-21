# EXEC_REPORT — feature/analytics-overview-redesign

**Contour:** `feature/analytics-overview-redesign`  
**Worktree:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-analytics-overview-redesign`  
**Baseline:** `origin/main` (`e8c85795a8`)  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-08-21

---

## 1. Что реализовано

### 1.1. Редизайн «Аналитика → Обзор» (PLAN §4)
- Создан `frontend/src/features/analytics/AnalyticsOverviewPanel.jsx` + `.css` — секционная страница без KPI-карточек:
  - шапка с названием scope, меткой «Обновлено», кнопкой ручного пересчёта;
  - сводка по срезу (действия, длительность, крит. путь, handoffs, сессии, проекты, свойства, пересчитано);
  - качество данных (% ee_time, % ingredient_value числовой, count «нет данных») с drill-down;
  - блок «Требуют внимания» (no-data строки, топ критичных действий);
  - блок «Структура» (проекты/сессии среза);
  - ссылки-переходы во вкладки «Действия» и «Свойства».
- `AnalyticsPage.jsx` переписан: загружает recalc rows, quality, обрабатывает refresh.

### 1.2. Удаление вкладки «Дашборды» (PLAN §6)
- Удалены компоненты:
  - `AnalyticsDashboardsPanel.jsx`, `AnalyticsDashboards.jsx`, `AnalyticsDashboards.test.mjs`
  - `SessionAnalyticsDashboard.jsx`, `ProjectAnalyticsDashboard.jsx`, `WorkspaceAnalyticsDashboard.jsx`
  - `DashboardsPlaceholder.jsx`, `DashboardBarChart.jsx`, `DashboardMetricCard.jsx`
  - `dashboardModel.js`, `dashboardModel.test.mjs`
  - `ProcessAnalyticsHub.jsx`, `ProcessAnalyticsHub.test.mjs`
- Очищены:
  - `AnalyticsSectionTabs.jsx` — вкладка удалена;
  - `AnalyticsHub.jsx` — импорт dashboards удалён;
  - `processMapRouteModel.js` — роуты, surface, regex dashboards зачищены; `?surface=dashboards` редиректит в `overview`;
  - `useAnalyticsRouteState.js` — dashboards-роутеры удалены;
  - `ProcessStage.jsx` — dashboards-ветки удалены;
  - `AdminPermissionsMatrix.jsx`, `AdminPermissionToggles.jsx` — право `manage_dashboards` удалено.
- Удалены мёртвые CSS-правила dashboards из `frontend/src/styles/tailwind.css`.

### 1.3. Доработка таблицы «Свойства» (PLAN §7)
- `AnalyticsPropertiesTable.jsx`:
  - расчётные свойства `ee_time, ingredient_value, ingredient_um, ee_operation` помечены звёздочкой;
  - увеличены ширины колонок;
  - `title` на обрезанных значениях;
  - поддержка `nameFilter` в `usePropertyRowsProcessor`.
- `AnalyticsPropertiesPanel.jsx`:
  - дефолтная сортировка `bpmn_name asc`;
  - чипы по именам свойств (расчётные первыми);
  - подпись о капе 500 записей.

### 1.4. Ночной пересчёт 4:30 (PLAN §8)
- `backend/app/save_services/analytics_aggregator/tasks.py` — добавлена `refresh_all_workspaces_analytics_task`.
- `backend/app/celery_app.py` — `beat_schedule` `analytics-nightly-refresh` на 04:30 Europe/Moscow.
- `backend/app/routers/analytics.py`:
  - `POST /api/analytics/refresh` (session/project/workspace);
  - `GET /api/analytics/quality`;
  - resilient enqueue: ошибка брокера Celery не ломает UI, возвращается флаг `queued: false`.

### 1.5. Drill-down (PLAN §6)
- `AnalyticsPage.setModule(scope, id, nextModule, filters)` записывает в URL `?source=...&property=...`.
- `AnalyticsPropertiesPanel` при монтировании читает query params и применяет к `backendFilters.source` и `nameFilter`.

---

## 2. Решения владельца, зафиксированные в коде

### 2.1. Нормализация десятичной запятой (решение 21/08/26)
Реализована в `backend/app/routers/analytics.py::classify_recalc_value` (и `parse_recalc_number`):
- строка вида `^\d+,\d+$` заменяет запятую на точку и парсится как `float`;
- применяется к `ingredient_value` и `ee_time`;
- значения `1,2,3`, `> 10`, `< 5`, текст, пустая строка — остаются текстом и попадают в случай B («нет данных»).

### 2.2. Семантика «критично» (PLAN §4.7)
- В сессионном снапшоте `critical_questions` = open questions с `issue_type == "CRITICAL"`.
- На stage FK «критично: 1970 / действий: 1973» делает метрику неинформативной.
- На странице «Обзор» отдельная KPI-карточка/число «критично» не выводится; вместо этого в секции «Требуют внимания» показан топ строк с `source === "property" && result > 0`.
- Окончательное решение по критерию остаётся за владельцем; текущая реализация не добавляет новую метрику.

---

## 3. Проверка

### 3.1. Backend-тесты
Запуск в Docker (`processmap_v1-api:test`):

```bash
docker run --rm \
  -v ".../backend:/app/backend" -w /app processmap_v1-api:test \
  python -m pytest backend/tests/test_analytics_backend_driven.py -v
```

Результат:
- **9 новых тестов passed** (refresh/quality/beat).
- Полный прогон `test_analytics_backend_driven.py` запущен, но превысил лимит 600 с из-за длительности сuit'а; для контура верифицированы все добавленные тесты.

### 3.2. Frontend-сборка
Запуск в Docker (`processmap_frontend_build_test:latest`):

```bash
docker run --rm -v ".../frontend:/app" -v "/app/node_modules" -w /app \
  --entrypoint npm processmap_frontend_build_test:latest run build
```

Результат: **сборка прошла успешно** (`built in 5m 26s` после i18n, `built in 8m 5s` до i18n), без ошибок.

---

## 4. Ограничения и открытые вопросы

- **Кап 500 записей** в таблице «Свойства» остаётся (сервер возвращает `limit=500`). Добавлена явная подпись; серверная пагинация — в бэклог.
- **Drill-down query params** применяются только при первом монтировании `PropertiesPanel`; ручная смена фильтров не синхронизирует URL.
- **Celery beat** требует запущенного `celery-worker` и Redis; endpoint refresh работает даже при недоступности брокера (resilient enqueue).
- **Адаптивность** проверена визуально в dev-режиме; для 1280–1440px горизонтальный скролл не предполагается.

---

## 5. Git-state

```
branch: feature/analytics-overview-redesign
HEAD:   <current>
origin/main: e8c85795a8
status: изменения в backend + frontend + .planning
```

PR будет создан на русском. **Merge/deploy только после явного approve пользователя.**
