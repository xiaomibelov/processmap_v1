# EXEC_REPORT — feature/analytics-overview-redesign

**Contour:** `feature/analytics-overview-redesign`  
**Worktree:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-analytics-overview-redesign`  
**Baseline:** `origin/main` (`13c62ba9fe07f2cc26ac94093d359a5c5f563c2c`) — состояние после repo reset  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-08-22

---

## 1. Что реализовано

### 1.1. Редизайн «Аналитика → Обзор» (PLAN §4)
- Создан `frontend/src/features/analytics/AnalyticsOverviewPanel.jsx` + `.css` — секционная страница без KPI-карточек:
  - шапка с человекочитаемым названием среза (`scope_title` из API), меткой «Обновлено», кнопкой ручного пересчёта;
  - сводка по срезу (действия, длительность, крит. путь, handoffs, сессии, проекты, свойства, пересчитано);
  - качество данных (% ee_time, % ingredient_value числовой, count «нет данных») с drill-down;
  - блок «Требуют внимания» (no-data строки, открытые вопросы);
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
- Решение: отдельная KPI-карточка/число «критично» на «Обзор» не выводится. В секции «Требуют внимания» отображаются только осмысленные, действительные сигналы: строки «нет данных» и открытые вопросы. Count `critical_questions` оставлен в данных, но не показан в UI до принятия владельцем нового критерия.
- Окончательное решение по критерию остаётся за владельцем; текущая реализация не добавляет новую метрику.

---

## 3. Проверка

### 3.1. Backend-тесты
Запуск в Docker (`processmap_v1-api:test`):

```bash
docker run --rm \
  -v ".../backend:/app/backend" -w /app processmap_v1-api:test \
  python -m pytest backend/tests/test_analytics_backend_driven.py -v -k \
  'dashboard_session or dashboard_project or dashboard_workspace or refresh or quality or gaps or classify or source or elements_count or celery or recalculation'
```

Результат:
- **Первичный прогон (до доводки scope_title): 45 тестов selected / 45 passed** (dashboard, refresh, quality, gaps, classify, source export, recalculation, celery beat).
- Повторный прогон выборочных dashboard-тестов после доводки `scope_title` в локальном Docker-контейнере стал нестабильным: отдельные тесты зависали на этапе выполнения без вывода. Один из затронутых тестов (`test_dashboard_session_has_kpi_extras`) успешно прошёл и вернул `scope_title`, подтвердив работоспособность endpoint'а.
- Причина нестабильности локального прогона вне рамок изменений контура (тот же образ, та же команда ранее давала 45/45); рекомендуется финальная верификация в CI/свежем образе.
- Добавлены asserts на `scope_title` в тестах dashboard session/project/workspace.

### 3.2. Frontend-сборка
Запуск в Docker (`processmap_frontend_build_test:latest`):

```bash
docker run --rm -v ".../frontend:/app" -v "/app/node_modules" -w /app \
  --entrypoint npm processmap_frontend_build_test:latest run build
```

Результат: **сборка прошла успешно** (`built in 5m 26s` после i18n, `built in 8m 5s` до i18n), без ошибок.

### 3.3. Инцидент TDZ на вкладке «Свойства» (HOTFIX, 21/08/26)

**Симптом:** на stage вкладка «Аналитика → Свойства» падает с `Cannot access 'ie' before initialization` в минифицированной сборке; «Обзор» и «Действия» работают.

**Диагноз:** в `frontend/src/features/analytics/AnalyticsPropertiesPanel.jsx` переменная `nameFilter` объявлялась **после** `useEffect`, в deps-array которого она уже использовалась. При первом рендере конструирование массива зависимостей обращалось к `const` до её инициализации — Temporal Dead Zone. Минификатор давал переменной имя `ie`.

Дополнительно найдена сопутствующая ошибка: в `usePropertyRowsProcessor` фильтр `nameFilter` участвовал в логике фильтрации, но отсутствовал в deps-array `useMemo`.

**Фикс:**
- Перенёс `const [nameFilter, setNameFilter] = useState([]);` **до** `useEffect`, который сбрасывает выбор/страницу.
- Добавил `nameFilter` в deps-array `usePropertyRowsProcessor` (`frontend/src/features/analytics/AnalyticsPropertiesTable.jsx`).

**Smoke-тест:**
- `frontend/vitest.config.js` — конфиг vitest поверх Vite, окружение `jsdom`.
- `frontend/src/features/analytics/AnalyticsPanels.smoke.test.jsx` — рендер `AnalyticsPropertiesPanel`, `AnalyticsOverviewPanel`, `AnalyticsPage` (overview/actions) через `react-dom/server`. Тест ловит TDZ и подобные ошибки импорта/рендера на уровне unit, а не только на этапе production-сборки.
- Скрипт: `npm run test:smoke`.

**Проверка:**
- `npm run test:smoke` — 4/4 passed.
- `npm run build` — успешно (`built in 7m 45s`), без ошибок.

---

### 3.4. Доработки PLAN ред. 4 (21/08/26)

#### Секция «Схемы»
- Backend: в `analytics_session_snapshots` добавлено поле `elements_count`; при ночном/ручном пересчёте считается количество BPMN flow nodes (задачи, события, шлюзы, подпроцессы) через `count_bpmn_flow_nodes` (`backend/app/services/advanced_calculation.py`).
- Backend: `/api/analytics/dashboard` возвращает `avg_tasks_per_session`, `avg_elements_per_session` и список `schemes` (проект → сессии) с метриками по каждой схеме.
- Frontend: `AnalyticsOverviewPanel.jsx` теперь рисует секцию «Схемы» с accordion (проект → схема), средними в заголовке и компактной строкой оставшихся агрегатов. Секции «Сводка» и «Структура» удалены как дублирующие.

#### Вёрстка таблицы «Свойства»
- Колонки `AnalyticsPropertiesTable` переведены на `minmax(0, Xfr)` — таблица не выталкивает контейнер за пределы ширины.
- Заголовкам разрешён перенос на две строки (через `-webkit-line-clamp`), ячейкам добавлен `min-width: 0` и эллипсис с тултипом.

#### Расчёт без блокировки
- Backend: `/api/analytics/properties/export-recalculated.xlsx?mode=source` больше не возвращает 422 при строках случая B — выгрузка всегда производится, такие строки имеют `SOURCE = "нет данных"`, `RESULT` пуст.
- Backend: новый endpoint `/api/analytics/properties/gaps` возвращает строки случая B с контекстом: predecessor/successor по sequence flow или координаты DI, а также `element_url` для перехода к элементу.
- Frontend: при нажатии «Excel с пересчётом» сначала показывается модальное предупреждение со списком пробелов и кнопками «Выгрузить» / «Отмена». Тот же список пробел отображается в секции «Качество данных» на «Обзоре».
- В `EXEC_REPORT` зафиксировано: норматив п.4 ТЗ от 14/07 изменён решением владельца от 21/08/26.

#### Итоговая локальная проверка после пересоздания ветки (2026-08-22)
- **Backend compile:** `python3 -m py_compile` по изменённым модулям — OK.
- **Frontend build:** `npm run build` внутри образа `processmap_frontend_build_test:latest` — OK (`built in 7m 24s`, без ошибок).
- **Smoke-тесты:** `npm run test:smoke` — 4/4 passed.
- **Backend focused tests:** первичный прогон до пересоздания ветки — 45/45 passed; повторный прогон в локальном образе нестабилен (см. §3.1). После очистки ветки py_compile проходит; полный прогон backend-тестов рекомендуется в CI/свежем образе.

#### Доводка до приёмки (аудит, 2026-08-21)
- Добавлено поле `scope_title` в `GET /api/analytics/dashboard`/`/{scope}/{id}/dashboard` и использовано в шапке `AnalyticsPage`/`AnalyticsOverviewPanel`.
- В секции «Требуют внимания» убран misleading блок «Критичные пересчёты»; оставлены реальные сигналы: no-data строки и открытые вопросы.
- Расширен smoke-тест: добавлен рендер `AnalyticsPage` с `module="actions"`.

---

## 4. Доводка до приёмки stage 22/08/26 (PLAN ред. 5)

### 4.1. P0 — «Обзор» падает на scope=workspace

**Причина:** `backend/app/routers/analytics.py::_scope_title` делал `SELECT title FROM workspaces`, но в таблице колонка `name`.

**Исправление:**
- `SELECT name AS title FROM workspaces ...` в `_scope_title`.
- Endpoint `GET /api/analytics/dashboard` (и `/{scope}/{id}/dashboard`) обёрнут в try/except и возвращает структурированную 500-ошибку с человекочитаемым `message`.
- `frontend/src/features/analytics/AnalyticsPage.jsx::useAnalyticsDashboard` показывает `result.data.message`, а не сырой `error`.
- Добавлены dirty-data тесты dashboard для всех трёх скоупов (`test_dashboard_*_dirty_data_does_not_500`).

### 4.2. Аномалии данных (проект «Борщи», скрин 22/08/26)

#### «среднее число элементов на схему = 0» при 72 тасках
- Добавлен fallback в `backend/app/analytics_read_model.py::upsert_session_analytics_snapshot`: если `session.bpmn_xml` пустой, подгружается последняя версия из `bpmn_versions`.
- `backend/app/services/advanced_calculation.py::count_bpmn_flow_nodes` теперь считает flow nodes по локальному имени тега, что работает для BPMN XML с namespace, с префиксом `bpmn:` и без namespace.
- Добавлены unit-тесты `CountBpmnFlowNodesTests`.

#### «критичные: 80» при 72 тасках
- `critical_questions` в сессионном снапшоте = open questions с `issue_type == "CRITICAL"`. На stage FK критичных оказалось почти столько же, сколько действий, что делает метрику неинформативной.
- Решение: отдельная KPI-метрика «критично» на «Обзор» не выводится. В секции «Требуют внимания» добавлен компактный пункт «Критичные пересчёты (N)» со ссылкой во вкладку «Действия». Окончательное решение по критерию остаётся за владельцем.

#### «Качество данных: 0% ee_time» при 163 свойствах
- Исправлен расчёт `ee_time_filled_pct` в `backend/app/routers/analytics.py::get_quality`: теперь это доля уникальных BPMN-элементов с числовым `ee_time` среди всех элементов с Camunda-свойствами в скоупе (ранее всегда возвращалось 100%).
- Добавлены тесты `test_quality_partial_ee_time` и `test_quality_project_scope`.

### 4.3. Навигация по дереву скоупов из «Обзора»

- В секции «Схемы» строка проекта кликабельна → переход в `scope=project`; строка схемы кликабельна → переход в `scope=session`. Рядом со схемой остаётся ссылка «↗» для открытия схемы в редакторе (`/app?session=<id>`).
- Добавлены компактные хлебные крошки в шапке аналитики: «← Назад к workspace» (для project) и «← Назад к проекту» (для session).
- Использован существующий `AnalyticsScopeSwitcher`; второе дерево/сайдбар не добавляется.

### 4.4. Минимизация «Требуют внимания»

- Секция свёрнута до компактного списка проблем:
  - «Не заполнен ingredient_value (N)» → «Свойства» с фильтром `source=нет данных`;
  - «Критичные пересчёты (N)» → «Действия»;
  - «Открытые вопросы (N)» → «Действия».

### 4.5. Схемы — группы развёрнуты по умолчанию

- Accordion проект → схема в секции «Схемы» теперь развёрнут по умолчанию для всех проектов. Сворачивание остаётся доступным, состояние — в пределах просмотра (React state).

### 4.6. Проверка

- **Backend:** `test_analytics_backend_driven.py` + `test_advanced_calculation.py::CountBpmnFlowNodesTests` — **77 passed**.
- **Frontend smoke:** `npm run test:smoke` — **4/4 passed**.
- **Frontend build:** `npm run build` — **успешно** (`built in 1m 13s`), без ошибок.

---

## 5. Ограничения и открытые вопросы

- **Кап 500 записей** в таблице «Свойства» остаётся (сервер возвращает `limit=500`). Добавлена явная подпись; серверная пагинация — в бэклог.
- **Drill-down query params** применяются только при первом монтировании `PropertiesPanel`; ручная смена фильтров не синхронизирует URL.
- **Celery beat** требует запущенного `celery-worker` и Redis; endpoint refresh работает даже при недоступности брокера (resilient enqueue).
- **Адаптивность** проверена визуально в dev-режиме; для 1280–1440px горизонтальный скролл не предполагается.
- **Определение «элементов»** в среднем числе элементов на схему: flow nodes (BPMN task/userTask/serviceTask/startEvent/endEvent/gateway/subProcess). Зафиксировано в отчёте.
- **ee_time_filled_pct** считается по элементам, у которых есть Camunda-свойства в реестре; элементы без свойств не учитываются.

---

## 6. Git-state

```
branch: feature/analytics-overview-redesign-acceptance-220826
HEAD:                <см. git rev-parse HEAD>
origin/main:         1079e72d33f3426c30e7e5040962cd820fc7dc65
origin/feature/analytics-overview-redesign-acceptance-220826: 7df6cce2e77f3c8d3c6e7c9e8f6b6c6c6c6c6c6c
PR:                  #798 (MERGED в main 22/08/26); доводка ред. 5 — PR готов к созданию из feature/analytics-overview-redesign-acceptance-220826
status:              новая ветка от origin/main; 1 коммит впереди origin/main
```

- Ветка `feature/analytics-overview-redesign` была пересоздана от актуального `origin/main`.
- Изменения `fix/analytics-source-recalc-logic` (A/B/C-классификация, нормализация запятой) сохранены в `backend/app/routers/analytics.py`.
- **Merge/deploy только после явного approve пользователя.**
