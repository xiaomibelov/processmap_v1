# ADR 003: Единый источник истины для реестра действий (Product Actions)

- **Статус:** Proposed
- **Дата:** 2026-07-14
- **Контур:** fix/p0-actions-audit (аудит `audit/sidebar-actions-analytics-2026-07-14`)

## Контекст

Действия с продуктом (Product Actions) сейчас читаются двумя независимыми путями,
которые показывают одни и те же логические данные в разных форматах.

**Источник истины (запись).** Действия хранятся в `interview.analysis.product_actions[]`
каждой сессии. Запись идёт через CAS `PATCH /api/sessions/:id`
(`productActionsPersistence.js` → `interviewAnalysisPatchHelper.js`), то есть истина —
JSON интервью сессии. Это зафиксировано проектным решением: «durable truth source is
interview.analysis.product_actions[]».

**Путь A — аналитический кэш.** `GET /api/analytics/actions` (+ `/summary`,
`/export.csv`, `/export.xlsx`).
- Frontend: `AnalyticsActionsPanel` (`frontend/src/features/analytics/AnalyticsPage.jsx:209`),
  helper `apiGetAnalyticsActions` (`frontend/src/lib/api.js:1944`).
- Backend: `backend/app/routers/analytics.py` — читает производный **аналитический кэш**.
- Формат ответа: плоская пагинация `{ rows[], total, page, limit, filter_options, meta }`,
  колонки `name / role / section / action_type / duration_min`.
- Экспорт: `apiExportAnalyticsActionsCsv/Xlsx` (GET).

**Путь B — реестр (читает источник истины).** `POST /api/analysis/product-actions/registry/query`
(+ `/export.csv`, `/export.xlsx`).
- Frontend: `ProductActionsRegistryContent`
  (`frontend/src/features/analytics/ProductActionsRegistryPanel.jsx:177`, вызов `:308`),
  helper `apiQueryProductActionRegistry` (`frontend/src/lib/api.js:172`).
- Backend: `backend/app/routers/product_actions_registry.py` — читает **JSON интервью сессий**
  (источник истины) напрямую.
- Формат ответа: богатая view-model `{ scope, rows[], sessions[], session_summary, summary,
  page, filter_options, applied_filters, metrics, empty_state, source_state }`.
- Экспорт уже есть: `apiExportProductActionRegistryCsv/Xlsx` (POST).

## Проблема

1. **Устаревший кэш (stale cache).** Путь A читает кэш, который обновляется отдельно от
   записи. Так как запись идёт через CAS PATCH сессии, а кэш аналитики пересчитывается не
   синхронно, вкладка «Действия» в Аналитике может показывать устаревшие/рассинхронные
   данные относительно Реестра и фактического JSON сессии.
2. **Два формата данных** для одной сущности: плоский `{rows,total}` (A) против view-model
   с `metrics/summary/source_state/sessions` (B). Это удваивает поддержку фильтров,
   экспорта и типов колонок на фронте и усложняет расследование расхождений.
3. **Две точки экспорта CSV/XLSX** (A и B) с разными параметрами — риск расхождения выгрузок.

## Варианты

### Вариант A — `AnalyticsActionsPanel` как read-only view над endpoint реестра
Перенацелить вкладку «Действия» в Аналитике с `GET /api/analytics/actions` на
`POST /api/analysis/product-actions/registry/query` (путь B как единственный источник чтения).
Эндпоинт аналитики остаётся для summary/dashboards, но таблица реестра больше его не использует.

- **Pros:** единый источник чтения = источник истины (нет staleness); UI-поверхность не
  удаляется (решение PO не требуется); backend не меняется; экспорт переводится на уже
  существующие endpoint'ы реестра.
- **Cons:** нужно отобразить фильтры аналитики (`section/role/type`) на payload реестра;
  view-model тяжелее плоского ответа; `AnalyticsActionsPanel` надо адаптировать под
  view-model (или добавить тонкий адаптер).
- **Трудоёмкость:** ~1–2 дня (frontend + маппинг фильтров + перевод экспорта + тесты).
- **Риски:** различие форм `filter_options` (A — массивы `*_filter`, B — свой payload) →
  риск неполного покрытия фильтров; низкий риск регресса, т.к. меняется только один таб.
- **Backward compatibility:** сохраняется; `GET /api/analytics/actions` не удаляется
  (используется summary/dashboards), меняется только потребитель таблицы.

### Вариант B — упразднить `AnalyticsActionsPanel`, экспорт перенести в Реестр
Полностью убрать таб «Действия» из Аналитики; CSV/XLSX остаются только в Реестре
(endpoint'ы экспорта там уже есть).

- **Pros:** одна UI-поверхность → никакой двойной поддержки; минимальный код.
- **Cons:** удаление UI-поверхности меняет навигацию/UX; теряется быстрый доступ к действиям
  из раздела Аналитики.
- **Трудоёмкость:** ~0.5–1 день frontend (+ последующая чистка backend endpoint'а).
- **Риски:** UX-регресс; **требуется решение Product Owner** об удалении поверхности.
- **Backward compatibility:** ломает привычный путь пользователя; endpoint аналитики можно
  оставить, но UI-точка удаляется.

### Вариант C — единый backend endpoint `GET /api/product-actions?format=analytics|registry` + один кэш
Один endpoint обслуживает оба формата; один кэш, инвалидируемый при CAS-записи
(`productActionsPersistence` → invalidate). Оба UI ходят в один endpoint с параметром формата.

- **Pros:** настоящий единый источник на уровне backend; один кэш с корректной инвалидацией
  → staleness устранён системно; форматы явно параметризованы.
- **Cons:** самая большая работа; требует изменений backend (новый endpoint, политика
  инвалидации кэша), миграции обоих UI и набора тестов.
- **Трудоёмкость:** ~3–5 дней (backend + cache-invalidation + миграция UI + тесты).
- **Риски:** риск некорректной инвалидации кэша; затрагивает backend (вне рамок данного
  P0-контура).
- **Backward compatibility:** новый endpoint аддитивен (совместим); старые можно
  deprecate постепенно.

## Рекомендация

**Вариант A** — как ближайший шаг. Он устраняет главную проблему (stale cache) для
реестра действий, делая источником чтения источник истины, при этом **не требует изменений
backend** и **не удаляет UI-поверхность** (решение PO не нужно). Вариант B отложен до
решения Product Owner об упразднении таба «Действия» в Аналитике. Вариант C — целевая
долгосрочная архитектура (единый endpoint + один кэш с инвалидацией), к которой стоит
перейти после A, когда появится бюджет на backend-работы.

> Примечание: удаление UI-поверхности (вариант B) — продуктовое решение, требует
> подтверждения PO. Данный ADR фиксирует статус **Proposed** и не меняет код.

## Последствия

- Краткосрочно (A): один источник чтения для реестра; таб «Действия» всегда консистентен
  с JSON сессий и Реестром; экспорт консолидируется на endpoint'ах реестра.
- Долгосрочно (C): единый endpoint и кэш с инвалидацией на записи — системное устранение
  рассинхрона для всех потребителей.

## Ссылки

- Frontend путь A: `frontend/src/features/analytics/AnalyticsPage.jsx:209`,
  `frontend/src/lib/api.js:1944`.
- Frontend путь B: `frontend/src/features/analytics/ProductActionsRegistryPanel.jsx:177`,
  `frontend/src/lib/api.js:172`.
- Запись (источник истины): `frontend/src/features/process/analysis/productActionsPersistence.js`
  → `interviewAnalysisPatchHelper.js` (CAS `PATCH /api/sessions/:id`).
- Endpoints: `frontend/src/lib/apiRoutes.js:108-110` (registry), `:303/:330/:346` (analytics).
- Backend (read-only, не меняется в этом контуре): `backend/app/routers/analytics.py`,
  `backend/app/routers/product_actions_registry.py`.
