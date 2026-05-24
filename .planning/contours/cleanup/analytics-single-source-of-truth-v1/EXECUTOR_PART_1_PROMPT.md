# Agent 2 / Executor Part 1 — cleanup/analytics-single-source-of-truth-v1

Run ID: `20260522T205346Z-85330`
Contour: `cleanup/analytics-single-source-of-truth-v1`

## Твоя задача

Выполнить cleanup контура `cleanup/analytics-single-source-of-truth-v1`: установить единый источник правды для analytics данных в ProcessMap frontend.

Это **single-lane** контур. Ты — единственный executor. Agent 3 будет shell-only merge finalizer.

## Правила

- Не меняй backend файлы.
- Не добавляй новые UI-экраны или функции.
- Не делай broad refactor за пределами указанных файлов.
- Сохраняй существующее поведение routing/navigation.
- Пиши тесты для нового кода.
- Коммить атомарно: отдельный коммит на каждый логический шаг.

## Шаг 1: Извлечь analytics routing state из ProcessStage.jsx

**Проблема:** `ProcessStage.jsx` содержит `analyticsHubRoute` и `productActionsRegistryRoute` как локальный `useState`, смешанный с diagram/interview state.

**Решение:** Создать `frontend/src/features/process/analysis/useAnalyticsRouteState.js`.

Требования к hook:
- Экспортирует `useAnalyticsRouteState()`.
- Внутри использует `useState` для hub route и registry route (как сейчас в ProcessStage).
- Предоставляет:
  - `analyticsHubRoute` / `setAnalyticsHubRoute`
  - `productActionsRegistryRoute` / `setProductActionsRegistryRoute`
  - Вспомогательные функции: `openAnalyticsHub`, `closeAnalyticsHub`, `openProductActionsRegistry`, `closeProductActionsRegistry` (или аналогичные по смыслу).
- Синхронизирует состояние с `window.location` через `readAnalyticsHubRoute()` / `readProductActionsRegistryRoute()` из `processMapRouteModel.js`.
- Сбрасывает состояние при смене сессии/проекта (аналогично текущему поведению useEffect в ProcessStage).

**Изменения в ProcessStage.jsx:**
- Удалить локальные `useState` для analytics hub и registry route.
- Импортировать `useAnalyticsRouteState`.
- Использовать его возвращаемые значения вместо локальных.
- Убедиться, что все вызовы `buildAnalyticsHubUrl`, `readAnalyticsHubRoute`, `buildProductActionsRegistryUrl`, `readProductActionsRegistryRoute` используют значения из hook.

**Тесты:**
- Создать `frontend/src/features/process/analysis/useAnalyticsRouteState.test.mjs`.
- Покрыть: инициализацию из location, открытие/закрытие hub, открытие/закрытие registry, сброс при смене scope.

## Шаг 2: Убрать клиентский fallback для Product Actions Registry

**Проблема:** `ProductActionsRegistryPanel.jsx` для session-scope использует `buildProductActionRegistryRows` из `productActionsRegistryModel.js` как fallback, строя rows из `interviewData.analysis.product_actions`.

**Решение:**
- В `ProductActionsRegistryPanel.jsx` для session-scope использовать **только** `apiGetSessionAnalysisViewModel` (уже импортирован и используется в некоторых путях).
- Удалить fallback на `interviewData?.analysis?.product_actions` через `buildProductActionRegistryRows`.
- Убедиться, что `normalizeBackendRows` применяется к результату view-model API.

**Проверка:**
- Убедиться, что `buildProductActionRegistryRows` больше не импортируется в `ProductActionsRegistryPanel.jsx`.
- Если `buildProductActionRegistryRows` больше нигде не используется — удалить из `productActionsRegistryModel.js`. Если используется в других местах (например, `InterviewStage.jsx`, `ProductActionsPanel.jsx`) — оставить, но не использовать в registry panel.

## Шаг 3: Убрать клиентский fallback для Properties Registry

**Проблема:** `ProcessPropertiesRegistryPage.jsx` содержит `buildCamundaRows`, которая строит rows из `bpmn_meta.camunda_extensions_by_element_id` локально для session-scope.

**Решение:**
- В `ProcessPropertiesRegistryPage.jsx` для session-scope использовать **только** `apiQueryProcessPropertiesRegistry` с `scope: "session"` и `session_id`.
- Удалить функцию `buildCamundaRows` и все её вызовы.
- Убедиться, что `normalizeBackendRow` применяется к результату API.

**Важно:** Проверить, что backend endpoint `/api/analysis/properties/registry/query` поддерживает `scope: "session"` и отдаёт корректные rows для сессии. Если API не возвращает данные для session-scope, зафиксировать это в `EXEC_PART_1_REPORT.md` и не ломать существующее поведение.

## Шаг 4: Проверить и зафиксировать

- Запустить существующие тесты для затронутых компонентов, если они есть.
- Проверить, что frontend собирается без ошибок.
- Записать `EXEC_PART_1_REPORT.md` с перечнем изменений, блокерами (если есть) и proof сборки.

## Key files

| Action | Path |
|---|---|
| Create | `frontend/src/features/process/analysis/useAnalyticsRouteState.js` |
| Create | `frontend/src/features/process/analysis/useAnalyticsRouteState.test.mjs` |
| Modify | `frontend/src/components/ProcessStage.jsx` |
| Modify | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` |
| Modify | `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` |
| Modify (conditional) | `frontend/src/features/process/analysis/productActionsRegistryModel.js` |
| Read-only | `frontend/src/app/processMapRouteModel.js` |
| Read-only | `frontend/src/lib/api.js` |
| Read-only | `frontend/src/lib/apiRoutes.js` |

## Acceptance criteria for Agent 2

- [ ] `useAnalyticsRouteState.js` создан и используется в `ProcessStage.jsx`.
- [ ] `ProcessStage.jsx` больше не содержит `useState` для analytics hub / registry route.
- [ ] `ProductActionsRegistryPanel.jsx` не использует `buildProductActionRegistryRows` / `interviewData.analysis.product_actions`.
- [ ] `ProcessPropertiesRegistryPage.jsx` не использует `buildCamundaRows`.
- [ ] Новые тесты проходят.
- [ ] Frontend собирается без ошибок (или зафиксированы известные блокеры).
- [ ] `EXEC_PART_1_REPORT.md` записан.
