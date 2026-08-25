# PLAN.md — Реализация `feature/analysis-tabs-ux-overhaul-p2`

**Статус:** реализовано, ожидает PR  
**База:** `REGRESSION.md` + `UI.md` + `API.md`  
**Ветка:** `feature/analysis-tabs-ux-overhaul-p2` от `origin/main` (`c9abdb25`)  
**Merge/deploy:** только владелец вручную.

---

## 1. Цель итерации

1. Вернуть «съеденную» в PR #828/#829 функциональность вкладки «Анализ процессов».
2. Довести все 6 сабтабов до единого визуального языка (`AnalysisSection`, `--pm-tobe-*`, Fira Sans/Code).
3. Сделать сабтаб AI полноценным HITL-флоу генерации действий с продуктом через корпоративную LLM + RAG-readiness.

---

## 2. Контекст (из REGRESSION.md)

| Что потеряно | Где | Причина | Решение |
|--------------|-----|---------|---------|
| Summary: Mainline, средний шаг, привязка BPMN, Топ-3 ожидания, «Дополнительно» | `ProcessAnalysisSummaryTab` | PR #828 оставил только `kpi_cards` | Использовать `SummaryBlock` + `AnalysisKpiCard` |
| Branches: фильтры, add transition, condition badges, группировка | `VirtualBranchesTable` | PR #828 заменил на упрощённую таблицу | Перейти на `BpmnBranchesPanel` |
| Steps: subprocess collapsing, inline-детали, AI/ПА бейджи | `VirtualStepsTable` | PR #828 заменил `TimelineTable` | Вернуть `TimelineTable` для matrix view |
| Toolbar clutter, дубли «Порядок: BPMN» | `TimelineControls` | PR #829 убрал toggle | Двухуровневый toolbar |
| Companion-панели не сворачиваются | `InterviewStage` | PR #829 заменил `<details>` на `<div>` | `AnalysisSection collapsible` |
| Boundaries summary внизу | `BoundariesBlock` | PR #829 перенёс ниже карт | Поднять summary над stepper |

---

## 3. Дизайн-решения (из UI.md)

- Все сабтабы и боковые панели — в `AnalysisSection`.
- Toolbar: primary row (главные действия) + advanced row под «Дополнительно».
- Таблицы: sticky header, hover, badges, inline-edit, empty-state с CTA.
- Цвета/типографика из `design-system/processmap/MASTER.md`.
- Без emoji, с `cursor:pointer`, фокусами, `prefers-reduced-motion`.

### 3.1. Макеты ключевых экранов

**Границы:**
```
[ START: цех А ] → [ INTERMEDIATE: 3 lanes ] → [ FINISH: цех Б ] [Изменить]
Границы сохранены
[stepper START / INTERMEDIATE / FINISH]
```

**Действия:**
```
[+ Добавить шаг] [Поиск...] [Быстрый ввод] [Таблица][Сценарии][Граф] [Привязки] [Ещё]
── Дополнительно ──
[Лайны] [Тип] [Подпроцесс] [Привязки] [Аннотации] [AI] [Tier'ы] [Порядок] [Колонки]
[TimelineTable с subprocess collapse / details / badges]
[Шаг и продукт ▴▾] [RAG-агент ▴▾]
```

**Ветки:**
```
[+ Добавить переход]
[Поиск] [Откуда] [Куда] [Условия] [☐ Проблемные] [☐ Группировать по From]
[Таблица: Откуда | Куда | Условие | Действия]
```

**Итоги:**
```
[KPI-карточки: активное, Mainline, Lead, средний шаг, привязка BPMN, пропускная способность]
[Топ-3 ожидания]
[► Дополнительно: распределения, AI и диагностика покрытия]
```

**AI:**
```
[Анализ LLM]
[Действия с продуктом — статус RAG: ready] [Отправить на RAG]
[Сгенерировать] [Утвердить все] [Отклонить все]
[Таблица: Действие | Тип | Этап | Объект | Способ | Шаг | Статус]
```

---

## 4. AI-флоу (из API.md)

```
POST /analysis/product-actions/suggest  →  suggestions (pending)
        ↓
POST /analysis/product-actions/suggestions  (approve/reject)
        ↓
POST /analysis/product-actions/suggestions/apply  (base_diagram_state_version)
        ↓
rag_readiness_status = ready
        ↓
PATCH /rag-readiness {status: "queued"}
        ↓
ночной джоб 04:30 → index_session_bpmn_xml → status = indexed
```

---

## 5. Перечень изменений по файлам (выполнено)

### 5.1. Дизайн / функциональность

| Файл | Что сделано |
|------|------------|
| `frontend/src/components/process/interview/BoundariesBlock.jsx` | Поднят `BoundsSummaryRow` над степпером; summary-режим и кнопка «Изменить» сохранены. |
| `frontend/src/components/process/interview/TimelineControls.jsx` | Двухуровневый toolbar: primary row (+ шаг, поиск, быстрый ввод, режимы, привязки, выделено, ещё) + advanced row (фильтры, порядок BPMN) под toggle; убран дублирующий bottom hint. |
| `frontend/src/components/process/InterviewStage.jsx` | Companion-панели (`ProductActionsPanel`, `RagSearchPanel`) обёрнуты в `AnalysisSection` с `collapsible`; `ProcessAnalysisAiTab` получает `sessionId`, `baseDiagramStateVersion`, `steps`. |
| `frontend/src/features/process/analysis/ProcessAnalysisStepsTab.jsx` | В matrix-режим рендерит `TimelineTable` через `timelineTableProps`. |
| `frontend/src/features/process/analysis/ProcessAnalysisBranchesTab.jsx` | Рендерит `BpmnBranchesPanel` внутри `AnalysisSection`. |
| `frontend/src/components/process/interview/transitions/BpmnBranchesPanel.jsx` | Обёртка в `AnalysisSection`; локализованы заголовки/кнопки (`Откуда`/`Куда`/`Условие`/`Действия`, `Назад`/`Вперёд`, `Сохранить`/`Отмена`, бейджи `условный`/`по умолчанию`). |
| `frontend/src/features/process/analysis/ProcessAnalysisSummaryTab.jsx` | KPI-grid расширен `mainline`, `avg_step`, `bpmn_binding`; добавлен блок «Топ-3 ожидания» и сворачиваемое «Дополнительно» с распределениями/AI/исключениями. |
| `frontend/src/features/process/analysis/processAnalysisModel.js` | Дополнены `kpi_cards`, `top_waits`, `distributions`, `coverage`, `extremes`, `exceptions`. |
| `frontend/src/features/process/analysis/ProcessAnalysis.module.css` | Стили stepper, таблиц, карточек, toolbar, suggestion-панели. |

### 5.2. AI-флоу

| Файл | Что сделано |
|------|------------|
| `frontend/src/lib/apiRoutes.js` | Routes: `productActionsSuggestions`, `productActionsSuggestionsApply`, `ragReadiness` (уже были добавлены ранее). |
| `frontend/src/lib/api.js` | Helpers: `apiListProductActionSuggestions`, `apiUpdateProductActionSuggestion`, `apiApplyProductActionSuggestions`, `apiGetRagReadiness`, `apiTransitionRagReadiness`. |
| `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx` | Новый компонент HITL-флоу: загрузка suggestions, генерация через LLM, approve/reject + массовые действия, редактор тегов, привязка к шагу, apply, CTA «Отправить на RAG-индексацию». |
| `frontend/src/features/process/analysis/ProcessAnalysisAiTab.jsx` | Размещены `LlmAnalysisBlock` + `ProductActionSuggestionsPanel`. |
| `backend/app/celery_app.py` | Beat-таск `rag-index-nightly-refresh` на 04:30. |
| `backend/app/rag_tasks.py` | Task `index_queued_sessions_bpmn_xml` + общая `_do_index_session_bpmn_xml`. |
| `backend/app/storage.py` | Метод `list_sessions_by_rag_status`; исправлено формирование SQL-условия по org. |

### 5.3. Тесты

| Файл | Что сделано |
|------|------------|
| `backend/tests/test_product_action_suggestions.py` | Добавлены тесты `list_sessions_by_rag_status`, `index_queued_sessions_bpmn_xml`, beat-schedule. |
| `frontend/src/lib/api.productActionSuggestions.test.mjs` | Unit-тесты на новые API-helpers. |
| `frontend/src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs` | Source-тест: отсутствие авто-вызовов, наличие data-testid, экспорты helpers. |
| `frontend/src/components/process/interview/__tests__/TimelineControls.smoke.test.jsx` | Обновлён под `interview-advanced-toggle`. |

## 6. Верификация

- `frontend/npm run build` — ✓ green.
- `backend/pytest tests/test_product_action_suggestions.py` — ✓ 11 passed.
- `node --test src/lib/api.productActionSuggestions.test.mjs src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs` — ✓ 12 passed.
- `vitest` — не стартует из-за pre-existing `ERR_REQUIRE_ESM` (`html-encoding-sniffer` ↔ `@exodus/bytes/encoding-lite.js`); покрыт source/node тестами.

---

## 6. Порядок работы (выполнено)

1. **Подготовка:** ветка `feature/analysis-tabs-ux-overhaul-p2` от `origin/main`.
2. **Шаг A — дизайн/функциональность:** Boundaries, Toolbar + TimelineTable, Branches, Summary, Companion collapsible.
3. **Шаг B — AI-флоу:** API helpers, `ProductActionSuggestionsPanel`, ночной RAG-джоб.
4. **Шаг C — тесты:** backend pytest + frontend source/node тесты.
5. **Шаг D — PR:** русское описание, ссылки на артефакты.

---

## 7. Критерии приёмки

- [x] Ни одной молчаливой потери: таблица `REGRESSION.md` закрыта.
- [x] Все 6 сабтабов на одном визуальном языке, русская локаль, без мёртвых зон.
- [x] AI-сабтаб: HITL-флоу сгенерировано → approve/reject → apply → CTA RAG-готовности.
- [x] RAG: `ready → queued → indexed` работает (beat-таск 04:30).
- [x] Ничего не сломано: `ProductActionsPanel`, `RagSearchPanel`, PROCESSMAN, notes/ai/CAS-контуры не затронуты.
- [x] Backend tests green, frontend build green.
- [ ] После merge/deploy владельцем: Playwright, настоящий Chrome, stage — скриншоты всех 6 сабтабов + end-to-end AI-флоу.
