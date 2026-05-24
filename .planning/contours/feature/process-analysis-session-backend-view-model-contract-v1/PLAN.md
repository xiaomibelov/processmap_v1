# Plan: Process Analysis Session Backend View Model Contract v1

Контур: `feature/process-analysis-session-backend-view-model-contract-v1`  
Run ID: `20260520T224346Z-55320`  
Статус: `READY_FOR_EXECUTION`

## Зачем нужен контур

Поверхность `Анализ процессов` (Process Analysis) работает с данными, вложенными в `session.interview.analysis`. Сейчас нет dedicated backend view model, который бы представлял аналитическое состояние сессии как единый queryable contract. Вместо этого frontend:
- тянет полный session payload и вручную извлекает `analysis.product_actions`;
- ходит в registry endpoints (`/api/analysis/product-actions/registry/query`, `/api/analysis/properties/registry/query`) для cross-session агрегации;
- сам конструирует session-scoped представления из registry ответов.

Этот контур определяет **backend view model contract** для Process Analysis Session — стабильную структуру, через которую backend предоставляет аналитические данные одной сессии, а frontend становится тонким клиентом.

## Pain points

1. **Нет единого session-scoped analysis API**: данные размазаны между `interview.analysis`, registry query и AI suggestion endpoints.
2. **Frontend держит client-side assembly**: `ProductActionsRegistryPanel.jsx` строит session-scope rows из `interview.analysis.product_actions` отдельно от backend registry response.
3. **Дублирование нормализации**: backend (storage.py) и frontend (`interviewAnalysisNamespaceGuard`, `productActionsRegistryModel.js`) по-разному нормализуют `analysis.product_actions`.
4. **AI batch draft и analysis state не отделены от interview persistence**: `product_actions_batch_draft` пишется в `interview.analysis`, хотя это runtime/derived state.
5. **Нет unified envelope для session analysis**: registry endpoints уже имеют `rows/summary/page/filter_options/metrics/empty_state/source_state`, но для single-session analysis нет аналога.

## Non-goals

- Не менять frontend/backend product-code.
- Не делать UI redesign.
- Не делать backend/API implementation.
- Не делать schema migration.
- Не менять BPMN XML.
- Не открывать PR, не merge, не deploy.

## Source/runtime truth status

| Plane | Evidence |
|---|---|
| workspace | `pwd=/opt/processmap-test` |
| branch | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `a2359d8ce732ab89f8911ec0479500ecd660a764` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| status | Dirty: untracked planning/runtime artifacts only |
| diff cached | none |

Риск: workspace — не canonical repo root, ветка отличается от `origin/main`. Product implementation запрещён. Разрешены только артефакты в `.planning/contours/feature/process-analysis-session-backend-view-model-contract-v1/`.

## Текущий source map

### Session analysis data — backend truth

- `backend/app/storage.py` — `interview_json` содержит `analysis` с `product_actions`, `product_actions_batch_draft` и произвольными custom keys.
- `backend/app/routers/product_actions_ai.py` — читает/пишет `interview.analysis.product_actions_batch_draft` через session load/save.
- `backend/app/routers/product_actions_registry.py` — `list_product_actions_registry_sources()` читает `interview_json` только чтобы извлечь `analysis.product_actions[]`.
- `backend/app/routers/process_properties_registry.py` — аналогично, но читает `bpmn_meta_json` / `bpmn_xml` вместо `interview_json`.

### Session analysis data — frontend truth

- `frontend/src/components/process/InterviewStage.jsx` — `data?.analysis` используется для step-scoped product actions count.
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` — `session?.interview?.analysis?.product_actions` используется как fallback/currentAnalysis.
- `frontend/src/features/process/analysis/interviewAnalysisPatchHelper.js` — PATCH `interview.analysis` через generic session save.
- `frontend/src/components/process/interview/utils.js` — `normalizeInterview` сохраняет `analysis` и custom keys.

### Existing registry endpoints (for reference)

- `POST /api/analysis/product-actions/registry/query` — unified envelope: `rows`, `summary`, `page`, `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`.
- `POST /api/analysis/properties/registry/query` — аналогичный unified envelope.

## Target: Process Analysis Session View Model

### Принципы

1. **Backend owns assembly**: вся нормализация, фильтрация, агрегация и summary для session-scoped analysis — на backend.
2. **Frontend owns UI state**: active tab, selected step, expanded rows, viewport — на frontend.
3. **Session view model — read-only по умолчанию**: мутирующие операции (save product action, accept AI draft) идут через dedicated mutation endpoints, а не через view model.
4. **Unified envelope**: session analysis endpoint возвращает ту же стабильную структуру, что и registry endpoints, но scoped к одной сессии.
5. **Derived state отделён от durable interview**: `batch_draft`, `suggestions`, `metrics` — runtime-derived, не пишется в `interview_json`.

### Предлагаемый unified envelope (draft)

```json
{
  "session_id": "...",
  "session_title": "...",
  "project_id": "...",
  "project_title": "...",
  "workspace_id": "...",
  "analysis": {
    "product_actions": {
      "rows": [...],
      "summary": { "total": 0, "complete": 0, "incomplete": 0 },
      "filter_options": { "products": [], "action_types": [], "stages": [], "roles": [], "object_categories": [] },
      "applied_filters": {},
      "metrics": { "total_actions": 0, "complete_rows": 0, "incomplete_rows": 0 },
      "empty_state": { "reason": "no_sources|no_rows|filters_too_strict", "message": "..." },
      "source_state": { "interview_loaded": true, "bpmn_elements_count": 0 }
    },
    "process_properties": {
      "rows": [...],
      "summary": { "total": 0, "complete": 0, "incomplete": 0 },
      "filter_options": { "property_types": [], "groups": [], "sources": [], "element_types": [] },
      "applied_filters": {},
      "metrics": { "total_properties": 0, "complete_rows": 0, "incomplete_rows": 0 },
      "empty_state": { "reason": "...", "message": "..." },
      "source_state": { "bpmn_meta_loaded": true, "bpmn_elements_count": 0 }
    },
    "derived": {
      "product_actions_batch_draft": null,
      "ai_suggestions": [],
      "step_action_counts": {},
      "coverage_metrics": {}
    }
  },
  "interview_state": {
    "status": "draft|in_progress|completed",
    "stage": "...",
    "updated_at": 0
  }
}
```

### API endpoints (draft)

- `GET /api/sessions/{session_id}/analysis/view-model` — unified session analysis view model.
- `POST /api/sessions/{session_id}/analysis/view-model/query` — query с фильтрами/пагинацией внутри session-scoped analysis.

## Worker split

### Mode: SINGLE_EXECUTOR_MODE

Это planning-only/API-contract-only контур. Parallel split не нужен.

### Agent 2 / Worker: backend source-truth and contract design lane

Задача: зафиксировать текущее состояние session analysis data, выявить divergence между interview-embedded analysis и registry-derived analysis, описать target view model contract.

Основные outputs:
- `WORKER_2_REPORT.md`
- `CURRENT_SESSION_ANALYSIS_SOURCE_TRUTH.md`
- `SESSION_ANALYSIS_VS_REGISTRY_DIVERGENCE.md`
- `TARGET_VIEW_MODEL_CONTRACT.md`
- `WORKER_2_DONE`

### Agent 3: shell-only merge / no-LLM handoff

В `TOKEN_ECONOMY_SINGLE_EXECUTOR` режиме Agent 3 выполняет shell-only merge результатов Worker 2 в `EXEC_REPORT.md` и передаёт Agent 4.

## Deliverables

- `PLAN.md`
- `CURRENT_SESSION_ANALYSIS_SOURCE_TRUTH.md`
- `SESSION_ANALYSIS_VS_REGISTRY_DIVERGENCE.md`
- `TARGET_VIEW_MODEL_CONTRACT.md`
- `MUTATION_ENDPOINTS_GAP_ANALYSIS.md`
- `STATE.json`
- `AGENT_RUN_ID`
- Worker/reviewer prompts
- `READY_FOR_EXECUTION`

## Review gates

Agent 4 может ставить `REVIEW_PASS` только если:
- current state grounded in source/runtime truth;
- confirmed facts и hypotheses чётко разделены;
- unified response envelope описан достаточно конкретно для implementation contour;
- frontend/backend split корректен и не смешивает computation с DOM-рендерингом;
- derived state отделён от durable interview persistence;
- mutation endpoints не смешаны с view model queries;
- no product code changes by Planner.

## Acceptance criteria

- [ ] Required proof files non-empty и содержат run id.
- [ ] Worker prompt независимо исполняем.
- [ ] API contracts помечены draft, если не доказаны source.
- [ ] Plan различает backend computation и frontend DOM-рендеринг.
- [ ] No product code changed by Planner.
- [ ] STATE.json execution_mode = `single-lane`.
