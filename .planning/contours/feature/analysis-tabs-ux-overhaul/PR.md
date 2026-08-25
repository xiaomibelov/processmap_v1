# PR — Перерисовка страницы «Анализ процессов»

**Ветка:** `feature/analysis-tabs-ux-overhaul`  
**База:** `origin/main` (`0fd01f16`)  
**Merge/deploy:** только владелец вручную.

---

## Что изменилось

Перерисованы 4 сабтаба страницы **«Анализ процессов»**, которые до сих пор использовали legacy-вёрстку `interviewBlock`:

1. **Границы** — трёхсерых-плашечный интерфейс заменён на горизонтальный степпер `START → INTERMEDIATE → FINISH` с узлами-выборами, статусами и связующей линией.
2. **Действия** — toolbar свёрнут в одну primary-строку (добавление шага, поиск, фильтры, вид, сортировка, дополнительные действия); companion-панель с `ProductActionsPanel` и `RagSearchPanel` оформлена карточками.
3. **Исключения** — таблица в едином стиле: sticky header, hover-строки, empty-state с primary CTA.
4. **AI** — блок «Анализ LLM» и таблица AI-вопросов обёрнуты в `AnalysisSection`, результаты LLM выведены карточками.

Общий компонент:
- `frontend/src/features/process/analysis/ui/AnalysisSection.jsx` — reusable заголовок секции.

---

## Файлы

- `frontend/src/features/process/analysis/ui/AnalysisSection.jsx` (+ `.module.css`, `index.js`)
- `frontend/src/features/process/analysis/ProcessAnalysis.module.css`
- `frontend/src/components/process/interview/BoundariesBlock.jsx`
- `frontend/src/components/process/interview/BoundsCardStart.jsx`
- `frontend/src/components/process/interview/BoundsCardIntermediateMultiSelect.jsx`
- `frontend/src/components/process/interview/BoundsCardFinish.jsx`
- `frontend/src/components/process/interview/BoundsSummaryRow.jsx`
- `frontend/src/components/process/interview/TimelineControls.jsx`
- `frontend/src/components/process/interview/ExceptionsBlock.jsx`
- `frontend/src/components/process/interview/LlmAnalysisBlock.jsx`
- `frontend/src/components/process/interview/AiQuestionsBlock.jsx`
- `frontend/src/components/process/InterviewStage.jsx`
- `frontend/src/config/appVersion.js`
- Тесты:
  - `frontend/src/components/process/interview/__tests__/BoundariesBlock.smoke.test.jsx`
  - `frontend/src/components/process/interview/__tests__/TimelineControls.smoke.test.jsx`
  - `frontend/src/components/process/interview/__tests__/ExceptionsBlock.smoke.test.jsx`
  - `frontend/src/components/process/interview/__tests__/LlmAnalysisBlock.smoke.test.jsx`
  - `frontend/src/components/process/interview/__tests__/AiQuestionsBlock.smoke.test.jsx`
  - `frontend/src/features/process/analysis/ui/__tests__/AnalysisSection.smoke.test.jsx`
  - `frontend/src/components/process/interview/interviewSurfaceSimplification.test.mjs`

---

## Как проверено

- `npm run test:smoke` — 7 файлов, 18 тестов, все `pass`.
- `node --test src/components/process/interview/interviewSurfaceSimplification.test.mjs` — 6/6 `pass`.
- `npm run build` — production-сборка успешна.
- Локальный скриншот вкладки «Границы» (dev-сервер + seeded-сессия) — см. `evidence/local-after-tab-boundaries.png`.

### Скриншоты локального прогона

**Границы:**
![local-after-tab-boundaries](https://raw.githubusercontent.com/xiaomibelov/processmap_v1/feature/analysis-tabs-ux-overhaul/.planning/contours/feature/analysis-tabs-ux-overhaul/local-after-tab-boundaries.jpg)

**Действия:**
![local-after-tab-actions](https://raw.githubusercontent.com/xiaomibelov/processmap_v1/feature/analysis-tabs-ux-overhaul/.planning/contours/feature/analysis-tabs-ux-overhaul/local-after-tab-actions.jpg)

**Исключения:**
![local-after-tab-exceptions](https://raw.githubusercontent.com/xiaomibelov/processmap_v1/feature/analysis-tabs-ux-overhaul/.planning/contours/feature/analysis-tabs-ux-overhaul/local-after-tab-exceptions.jpg)

**AI:**
![local-after-tab-ai](https://raw.githubusercontent.com/xiaomibelov/processmap_v1/feature/analysis-tabs-ux-overhaul/.planning/contours/feature/analysis-tabs-ux-overhaul/local-after-tab-ai.jpg)

**Ветки (не изменялись):**
![local-after-tab-branches](https://raw.githubusercontent.com/xiaomibelov/processmap_v1/feature/analysis-tabs-ux-overhaul/.planning/contours/feature/analysis-tabs-ux-overhaul/local-after-tab-branches.jpg)

**Итоги (не изменялись):**
![local-after-tab-summary](https://raw.githubusercontent.com/xiaomibelov/processmap_v1/feature/analysis-tabs-ux-overhaul/.planning/contours/feature/analysis-tabs-ux-overhaul/local-after-tab-summary.jpg)

---

## Что остаётся после merge

1. Владелец мержит PR.
2. Авто-деплой stage (Deploy to Stage).
3. Проверка на `https://stage.processmap.ru/app?project=9f4c3f90be&session=05e59e4aea` — все 6 сабтабов, скриншоты, маркерная таблица.

---

## Запреты соблюдены

- Нет новых флагов / параллельных dashboard.
- `ProductActionsPanel` и `RagSearchPanel` сохранены с неизменными пропсами.
- Merge/deploy не выполнялись.
