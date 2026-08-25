# RENDER_MAP — Анализ процессов (stage, build `11226f6cc`)

## Цепочка маунта страницы

```
/app?project=...&session=...
  └── ProcessStage.jsx (или аналогичный роутер сессии)
        └── InterviewStage.jsx:1002
              └── ProcessAnalysisDashboard (frontend/src/features/process/analysis/ProcessAnalysisDashboard.jsx:78)
                    └── ProcessAnalysisPage (frontend/src/features/process/analysis/ProcessAnalysisPage.jsx:62)
                          └── role=tablist с 6 вкладками
```

## Сабтаб → строка → файл:строка → компонент → цепочка

| Сабтаб | Видимая строка | Файл:строка | React-компонент | Цепочка до экрана |
|--------|----------------|-------------|-----------------|-------------------|
| **Границы** | `A. Границы процесса` | `components/process/interview/BoundariesBlock.jsx:145` | `BoundariesBlock` | `InterviewStage.jsx:1013` → `ProcessAnalysisBoundariesTab` → `ProcessAnalysisDashboard` → `ProcessAnalysisPage` |
| **Границы** | `Сохранить границы` | `BoundariesBlock.jsx:157` | `BoundariesBlock` | тот же путь |
| **Границы** | `Стартовый lane` | `components/process/interview/BoundsCardStart.jsx:21` | `BoundsCardStart` | `BoundariesBlock.jsx:197` → `ProcessAnalysisBoundariesTab` → ... |
| **Границы** | `Фильтр lanes` | `components/process/interview/BoundsCardIntermediateMultiSelect.jsx:39` | `BoundsCardIntermediateMultiSelect` | `BoundariesBlock.jsx:208` → ... |
| **Границы** | `Финишный lane` | `components/process/interview/BoundsCardFinish.jsx:21` | `BoundsCardFinish` | `BoundariesBlock.jsx:228` → ... |
| **Границы** | `START не выбрано` | `components/process/interview/BoundsSummaryRow.jsx` (уточнить) | `BoundsSummaryRow` | `BoundariesBlock.jsx:179` → ... |
| **Действия** | `Шаги процесса` | не найдена в runtime grep; возможно, заменена на `Действия процесса` (i18n `analysis.tabs.steps`) | — | `ProcessAnalysisStepsTab` рендерит `VirtualStepsTable`, а `stepsTabToolbar` содержит `TimelineControls` |
| **Действия** | `+ Добавить шаг` | `components/process/interview/TimelineControls.jsx:244` | `TimelineControls` | `InterviewStage.jsx:1048` передаёт `toolbar={stepsTabToolbar}` → `ProcessAnalysisStepsTab` → ... |
| **Действия** | `Быстрый ввод` | `TimelineControls.jsx:263` | `TimelineControls` | тот же путь |
| **Действия** | `УСЛОВИЯ ПЕРЕХОДОВ` | не найдено в текущем stage; старый `TransitionsBlock` больше не используется | — | `ProcessAnalysisBranchesTab` рендерит `VirtualBranchesTable` |
| **Действия** | `Связи построены по BPMN sequenceFlow` | `components/process/interview/transitions/BpmnBranchesPanel.jsx:261` | `BpmnBranchesPanel` | не доходит до экрана; заменён `VirtualBranchesTable` |
| **Действия** | `+ Добавить переход` | `components/process/interview/transitions/BranchesToolbar.jsx:21` | `BranchesToolbar` | не доходит до экрана |
| **Ветки** | *(нет старых маркеров)* | — | `VirtualBranchesTable` | `ProcessAnalysisBranchesTab.jsx:103` → ... |
| **Итоги** | *(нет старых маркеров)* | — | `AnalysisKpiCard` | `ProcessAnalysisSummaryTab.jsx:53` → ... |
| **Исключения** | `D. Исключения (привязка к шагам)` | `components/process/interview/ExceptionsBlock.jsx:12` | `ExceptionsBlock` | `InterviewStage.jsx:1076` → `ProcessAnalysisExceptionsTab` → ... |
| **Исключения** | `Добавьте исключения процесса.` | `ExceptionsBlock.jsx:39` | `ExceptionsBlock` | тот же путь |
| **AI** | `Анализ LLM` | `components/process/interview/LlmAnalysisBlock.jsx:53` | `LlmAnalysisBlock` | `InterviewStage.jsx:1092` → `ProcessAnalysisAiTab` → ... |
| **AI** | `Оценка схемы целиком` | `LlmAnalysisBlock.jsx:55` | `LlmAnalysisBlock` | тот же путь |

## Контроль через Playwright

- Запуск: `node scripts/stage-render-map.mjs`
- Скриншоты: `.planning/contours/feature/analysis-tabs-ux-overhaul/evidence/stage-tab-*.png`
- Результат JSON: `stage-render-map.json`

Вывод: старые маркеры присутствуют в сабтабах **Границы**, **Действия** (toolbar), **Исключения**, **AI**. Сабтаб **Ветки** и **Итоги** уже используют новые компоненты (`VirtualBranchesTable`, `AnalysisKpiCard`).
