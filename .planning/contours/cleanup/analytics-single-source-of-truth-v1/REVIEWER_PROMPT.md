# Agent 4 / Reviewer — cleanup/analytics-single-source-of-truth-v1

Run ID: `20260522T205346Z-85330`
Contour: `cleanup/analytics-single-source-of-truth-v1`

## Твоя задача

Независимо проверить выполнение cleanup контура `cleanup/analytics-single-source-of-truth-v1`.

## Что проверять

### 1. Source truth — analytics state extraction
- [ ] `ProcessStage.jsx` больше не содержит `useState` для `analyticsHubRoute` или `productActionsRegistryRoute`.
- [ ] Существует `frontend/src/features/process/analysis/useAnalyticsRouteState.js`.
- [ ] Hook покрывает все сценарии: открытие/закрытие analytics hub, открытие/закрытие product actions registry, сброс при смене scope.
- [ ] `ProcessStage.jsx` использует hook корректно — нет regression в routing/navigation.

### 2. Source truth — Product Actions Registry
- [ ] `ProductActionsRegistryPanel.jsx` не импортирует `buildProductActionRegistryRows`.
- [ ] Для session-scope используется только backend API (`apiGetSessionAnalysisViewModel`), нет fallback на `interviewData.analysis.product_actions`.
- [ ] Для workspace/project-scope по-прежнему используется `apiQueryProductActionRegistry`.

### 3. Source truth — Properties Registry
- [ ] `ProcessPropertiesRegistryPage.jsx` не содержит `buildCamundaRows`.
- [ ] Для всех скоупов используется только backend API (`apiQueryProcessPropertiesRegistry`).

### 4. Regression check
- [ ] Нет изменений в backend файлах.
- [ ] Нет изменений в diagram engine, bpmn-js overlay code.
- [ ] Нет изменений в `ProductActionsPanel.jsx` или `InterviewStage.jsx` (если `buildProductActionRegistryRows` всё ещё нужен им — это ок).

### 5. Runtime proof (если frontend собран и доступен)
- [ ] `http://clearvestnic.ru:5180/` возвращает HTTP 200.
- [ ] Analytics hub открывается и закрывается.
- [ ] Product Actions Registry открывается для workspace/project/session scope.
- [ ] Properties Registry открывается для workspace/project/session scope.
- [ ] Навигация "назад" из реестра работает.

### 6. Tests
- [ ] `useAnalyticsRouteState.test.mjs` существует и покрывает основные сценарии.
- [ ] Существующие тесты для `ProcessAnalyticsHub`, `ProductActionsRegistryPanel`, `ProcessPropertiesRegistryPage` не сломаны.

## Review output

- `REVIEW_REPORT.md` с вердиктом: `PASS`, `CHANGES_REQUESTED`, или `BLOCKED`.
- Конкретные файлы и строки для каждого замечания.
- Runtime proof скриншоты/логи, если проверял runtime.
