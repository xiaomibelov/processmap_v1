# TESTS — analysis-tabs-ux-polish-p3

## Новые тесты

### 1. `frontend/src/features/process/analysis/analysisTabsI18n.smoke.test.mjs`
- Рендерит `ProcessAnalysisDashboard` со всеми 6 вкладками и `FULL_VIEW_MODEL`.
- Проверяет, что в `textContent` нет raw-ключей вида `processAnalysis.` и `analysis.`.
- Проверяет наличие всех 7 человекочитаемых KPI-лейблов.
- Запуск: `node --test src/features/process/analysis/analysisTabsI18n.smoke.test.mjs`

### 2. `frontend/src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs`
- Монтирует `ProductActionSuggestionsPanel` с моком fetch, возвращающим `AI_PROVIDER_NOT_CONFIGURED`.
- Проверяет, что основной блок ошибки содержит человекочитаемое сообщение.
- Проверяет, что сырой код не в основном блоке ошибки, но есть в техническом блоке.
- Проверяет, что empty-state не рендерится одновременно с error-state.
- Запуск: `node --test src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs`

## Обновлённые тесты

### `frontend/src/features/process/analysis/processAnalysisModel.test.mjs`
- `getKpiCards` теперь ожидает 7 карточек и проверяет отсутствие raw-ключей в лейблах.
- `mapProcessAnalysisViewModel` тоже проверяет 7 карточек и отсутствие raw-ключей.

## Покрытие критериев приёмки

| Критерий | Тест |
|----------|------|
| Ни один i18n-ключ не рендерится сырым | `analysisTabsI18n.smoke.test.mjs` |
| Ни один код ошибки не показывается как текст ошибки | `productActionSuggestionsPanel.error.test.mjs` |
| Error-state и empty-state не пересекаются | `productActionSuggestionsPanel.error.test.mjs` |
| Build green | `npm run build` |

## Как запускать

```bash
cd frontend
node --test src/features/process/analysis/processAnalysisModel.test.mjs
node --test src/features/process/analysis/processAnalysisDashboard.test.mjs
node --test src/features/process/analysis/analysisTabsI18n.smoke.test.mjs
node --test src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs
node --test src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs
node --test src/features/process/analysis/ui/analysisUiComponents.test.mjs
npm run build
```
