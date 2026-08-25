# PLAN — UI/UX-полировка всех вкладок «Анализ процессов» (итерация 3)

**Контур:** `feature/analysis-tabs-ux-polish-p3`  
**Ветка:** `feature/analysis-tabs-ux-polish-p3` от `origin/main` (`7d8f836e`)  
**Цель:** закрыть P0-дефекты (сырые i18n-ключи, сырой код ошибки AI, конфликт состояний AI) и провести минимальную визуальную полировку Границ/Итогов/AI без потери функционала итераций 1–2.

## Концепция (brainstorming)

Все 6 вкладок — это этапы настройки анализа. UI должен говорить на одном языке:
- одна терминология статусов («Не выбрано» / «Заполнено»);
- единые пустые и ошибочные состояния (AnalysisEmptyState / AnalysisErrorState);
- тултипы на всех KPI и на значимых элементах;
- человекочитаемые ошибки вместо кодов;
- если метрики нулевые — объяснение, почему, и CTA (перейти к Границам).

## RENDER_MAP (файлы, задействованные в правке)

| Файл | Зачем |
|------|-------|
| `frontend/src/shared/i18n/ru.js` | недостающие ключи `processAnalysis.kpi.*`, `processAnalysis.ai.*`, `processAnalysis.boundaries.*`, `processAnalysis.summary.*` |
| `frontend/src/shared/i18n/en.js` | парные английские ключи |
| `frontend/src/features/process/analysis/processAnalysisModel.js` | KPI-карточки используют `processAnalysis.kpi.*` (уже использовали, ключи отсутствовали) |
| `frontend/src/features/process/analysis/ProcessAnalysisSummaryTab.jsx` | подписи KPI, пустое состояние top-waits, zero-KPI-hint, тултипы KPI |
| `frontend/src/features/process/analysis/ui/AnalysisKpiCard.jsx` | prop `tooltip` → `title` |
| `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx` | маппинг кодов ошибок, взаимоисключающие состояния, i18n RAG-статусов |
| `frontend/src/features/process/analysis/ProcessAnalysisAiTab.jsx` | прокидываем `t` в панель |
| `frontend/src/features/process/analysis/ProcessAnalysisDashboard.jsx` | прокидываем `t` во все табы |
| `frontend/src/components/process/interview/BoundariesBlock.jsx` | единая терминология, инфоблок, логика `startFilled` |
| `frontend/src/components/process/interview/BoundsCardStart.jsx` | статус «Триггер заполнен», i18n-лейблы |
| `frontend/src/components/process/interview/BoundsCardIntermediateMultiSelect.jsx` | i18n-лейблы статуса |
| `frontend/src/components/process/interview/BoundsCardFinish.jsx` | i18n-лейблы статуса |
| `frontend/src/components/process/interview/BoundsSummaryRow.jsx` | i18n-лейблы |

## Перечень правок

### P0.1 — сырые i18n-ключи в Итогах
- Добавлены ключи `processAnalysis.kpi.mainline`, `avgStep`, `bpmnBinding` и `processAnalysis.kpi.tooltip.*`.
- Добавлены `processAnalysis.topWaits.title/empty`, `processAnalysis.advanced.title`, `processAnalysis.exceptions.title/addMin`.
- `ProcessAnalysisSummaryTab` переведён на эти ключи.

### P0.2/P0.3 — AI-панель
- `ProductActionSuggestionsPanel` маппит `AI_PROVIDER_NOT_CONFIGURED`, `missing_api_key`, `provider_error`, `ai_rate_limit_exceeded` на человекочитаемые сообщения.
- Технический код показывается мелким отдельным блоком, а не заголовком.
- Error-state и empty-state теперь взаимоисключающие (`!error && !hasSuggestions`).
- RAG-статусы и кнопка отправки на индексацию используют i18n-ключи.

### P1 — полировка
- **Границы:** единые лейблы «Не выбрано» / «Заполнено», статус START учитывает заполненный Trigger, добавлен инфоблок о связи границ с KPI.
- **Итоги:** одно пустое состояние на блок top-waits, hint при нулевых KPI, тултипы на всех KPI.
- **AI:** восстановлена иерархия («Действия с продуктом» — основной сценарий), RAG-статус вынесен в заметный баннер.

## Тесты

- `analysisTabsI18n.smoke.test.mjs` — рендер всех 6 табов, проверка на отсутствие raw-ключей.
- `productActionSuggestionsPanel.error.test.mjs` — ошибка провайдера рендерит человекочитаемый текст, сырой код не в основном блоке, empty-state не показывается.
- Обновлён `processAnalysisModel.test.mjs` — 7 KPI-карточек, нет raw-ключей.
- Build green.

## Критерии приёмки

- [ ] На stage ни один i18n-ключ не рендерится сырым.
- [ ] На stage AI-панель не показывает `AI_PROVIDER_NOT_CONFIGURED` как текст ошибки.
- [ ] На stage error-state и empty-state в AI не пересекаются.
- [ ] Границы: статус START соответствует реальным данным.
- [ ] Все 6 вкладок открываются без ошибок в консоли.
