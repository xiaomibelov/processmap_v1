# PR — `feature/analysis-tabs-ux-overhaul-p2`

**Название (рус):** Доводка вкладки «Анализ процессов»: восстановление функциональности, единый визуальный язык, AI/HITL действия с продуктом + RAG

**Ветка:** `feature/analysis-tabs-ux-overhaul-p2`
**База:** `origin/main` (`c9abdb25`)
**Merge/deploy:** только владелец вручную.

---

## Что исправляет / закрывает

Продолжает эпик перерисовки вкладки «Анализ процессов» (PR #828/#829):

1. **Восстановление «съеденной» функциональности:**
   - «Итоги»: Mainline-время, средняя длительность шага, привязка к BPMN, Топ-3 ожидания, сворачиваемый блок «Дополнительно».
   - «Ветки»: фильтры, кнопка «+ Добавить переход», бейджи условий, русская локализация.
   - «Действия»: дерево подпроцессов, статусы шагов, панель «Шаг и продукт» + RAG-агент, разгреб toolbar (двухуровневый, без дублей).
2. **Единый визуальный язык** для всех 6 сабтабов (`AnalysisSection`, `--pm-tobe-*`, Fira Sans/Code).
3. **AI-сабтаб:** полноценный HITL-флоу генерации действий с продуктом через корпоративную LLM → approve/reject → apply → CTA RAG-готовности.
4. **RAG:** ночной beat-таск 04:30 переводит `queued` сессии в `indexed`.

---

## Основные изменения

### Frontend

- `frontend/src/components/process/interview/TimelineControls.jsx` — двухуровневый toolbar.
- `frontend/src/components/process/InterviewStage.jsx` — companion-панели в `AnalysisSection collapsible`; AI-таб получает `sessionId`, `baseDiagramStateVersion`, `steps`.
- `frontend/src/features/process/analysis/ProcessAnalysisSummaryTab.jsx` + `processAnalysisModel.js` — расширенные KPI, Топ-3, Дополнительно.
- `frontend/src/features/process/analysis/ProcessAnalysisStepsTab.jsx` — `TimelineTable` в matrix-режиме.
- `frontend/src/features/process/analysis/ProcessAnalysisBranchesTab.jsx` + `BpmnBranchesPanel.jsx` — русская локализация, бейджи.
- `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx` (новый) — HITL-флоу.
- `frontend/src/features/process/analysis/ProcessAnalysisAiTab.jsx` — размещение `LlmAnalysisBlock` + новой панели.
- `frontend/src/lib/api.js` — helpers для suggestions / apply / RAG-readiness.
- `frontend/src/features/process/analysis/ProcessAnalysis.module.css` — стили.

### Backend

- `backend/app/celery_app.py` — beat-таск `rag-index-nightly-refresh`.
- `backend/app/rag_tasks.py` — `index_queued_sessions_bpmn_xml` + `_do_index_session_bpmn_xml`.
- `backend/app/storage.py` — `list_sessions_by_rag_status` + исправление SQL-условия.

### Тесты

- `backend/tests/test_product_action_suggestions.py` — +3 теста (list by status, nightly task, beat schedule).
- `frontend/src/lib/api.productActionSuggestions.test.mjs` — unit helpers.
- `frontend/src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs` — source invariants.
- `frontend/src/components/process/interview/__tests__/TimelineControls.smoke.test.jsx` — обновлён.

---

## Как проверено

- `frontend/npm run build` — ✓ green.
- `backend/.venv/bin/python -m pytest tests/test_product_action_suggestions.py` — ✓ 11 passed.
- `node --test src/lib/api.productActionSuggestions.test.mjs src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs` — ✓ 12 passed.
- `vitest` не запускается из-за pre-existing `ERR_REQUIRE_ESM` (`html-encoding-sniffer` ↔ `@exodus/bytes`); покрыто node/source тестами.

---

## Что остаётся после merge

1. Владелец мержит PR.
2. Авто-деплой stage.
3. Playwright, настоящий Chrome, реальный stage: скриншоты всех 6 сабтабов + end-to-end AI-флоу.

---

## Артефакты контура

- `.planning/contours/feature/analysis-tabs-ux-overhaul-p2/PLAN.md`
- `.planning/contours/feature/analysis-tabs-ux-overhaul-p2/REGRESSION.md`
- `.planning/contours/feature/analysis-tabs-ux-overhaul-p2/API.md`
- `.planning/contours/feature/analysis-tabs-ux-overhaul-p2/UI.md`
