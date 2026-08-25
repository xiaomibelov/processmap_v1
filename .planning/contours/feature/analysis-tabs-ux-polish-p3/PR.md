# PR — UI/UX-полировка всех вкладок «Анализ процессов» (итерация 3)

**Ветка:** `feature/analysis-tabs-ux-polish-p3`  
**База:** `origin/main` (`7d8f836e`)  
**Тип:** feature / polish  
**Merge:** только владельцем вручную.

## Что починено

### P0.1 — сырые i18n-ключи в Итогах
- Добавлены недостающие ключи `processAnalysis.kpi.mainline`, `avgStep`, `bpmnBinding` и тултипы `processAnalysis.kpi.tooltip.*`.
- Добавлены ключи для секций `topWaits`, `advanced`, `exceptions`.
- `ProcessAnalysisSummaryTab` теперь использует эти ключи вместо fallback-строк.

### P0.2 — сырой `AI_PROVIDER_NOT_CONFIGURED`
- `ProductActionSuggestionsPanel` маппит коды ошибок на человекочитаемые сообщения.
- Технический код вынесен в отдельный мелкий блок (`data-testid="product-actions-error-code"`).

### P0.3 — конфликт error-state и empty-state
- Условие рендера изменено так, что при ошибке empty-state не показывается.

### P1 — полировка
- **Границы:** единая терминология статусов, START считается заполненным при заполненном Trigger, добавлен инфоблок о связи границ с KPI.
- **Итоги:** одно пустое состояние на блок, hint при нулевых KPI, тултипы на KPI.
- **AI:** RAG-статусы и CTA на индексацию через i18n.

## Файлы

```
frontend/src/shared/i18n/ru.js
frontend/src/shared/i18n/en.js
frontend/src/features/process/analysis/ProcessAnalysisSummaryTab.jsx
frontend/src/features/process/analysis/ui/AnalysisKpiCard.jsx
frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx
frontend/src/features/process/analysis/ProcessAnalysisAiTab.jsx
frontend/src/features/process/analysis/ProcessAnalysisDashboard.jsx
frontend/src/components/process/interview/BoundariesBlock.jsx
frontend/src/components/process/interview/BoundsCardStart.jsx
frontend/src/components/process/interview/BoundsCardIntermediateMultiSelect.jsx
frontend/src/components/process/interview/BoundsCardFinish.jsx
frontend/src/components/process/interview/BoundsSummaryRow.jsx
frontend/src/features/process/analysis/processAnalysisModel.test.mjs
frontend/src/features/process/analysis/analysisTabsI18n.smoke.test.mjs (new)
frontend/src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs (new)
```

## Чек-лист

- [x] Все новые строки вынесены в `ru.js` / `en.js`.
- [x] Регрессионный тест на i18n-утечки (все 6 табов).
- [x] Регрессионный тест на error-copy AI-панели.
- [x] Существующие тесты `processAnalysisModel.test.mjs` обновлены.
- [x] `npm run build` green.
- [x] `node --test` по затронутым файлам green.

## Известные ограничения / следующие итерации

- Полная переработка тулбара «Действия», группировка веток, индикаторы готовности на табах — вынесено за рамки этого минимального патча (см. `REGRESSION.md`).
- Полный прогон `node --test "src/**/*.test.mjs"` падает на не связанном с этим PR тесте `NotesPanel.advanced-badge-semantics.test.mjs` (предположительно pre-existing). Затронутые тесты проходят.

## Статус LLM-провайдера на stage

Проверка конфигурации бэкенда в этом PR не производилась. Если на stage `AI_PROVIDER_NOT_CONFIGURED` — это инфраструктурная задача (env/секреты), ключи не хардкодятся.
