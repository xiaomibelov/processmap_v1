# Plan: Process Analysis Session Frontend Thin Client Switch v1

Контур: `feature/process-analysis-session-frontend-thin-client-switch-v1`  
Run ID: `20260520T225839Z-57944`  
Статус: `PLANNING`

## Зачем нужен контур

Предыдущий контур `feature/process-analysis-session-backend-view-model-contract-v1` зафиксировал REVIEW_PASS и утвердил contract для `ProcessAnalysisSessionViewModel`. Однако backend endpoint `GET /api/sessions/{session_id}/analysis/view-model` в текущей ветке отсутствует. Frontend по-прежнему:

- Считает `countProductActionsForStep` и `productActionCountByStepId` в `InterviewStage.jsx` клиент-сайд из `data?.analysis?.product_actions`.
- В `ProductActionsRegistryPanel.jsx` при scope="session" собирает `currentRows` через `buildProductActionRegistryRows`, вычисляет `filterOptions`, `summary`, `filteredSummary` локально.
- Дублирует логику completeness (`productActionsRegistryModel.js`) и нормализации, которые backend уже делает для registry endpoints.

Этот контур **реализует минимальный backend endpoint** на основе утверждённого contract и **переключает frontend** на потребление backend view-model, сохраняя compatibility fallbacks.

## Pain points

1. **Backend endpoint отсутствует**: утверждённый contract не реализован в коде.
2. **Frontend держит client-side assembly**: `InterviewStage` пересчитывает action counts на каждый рендер; `ProductActionsRegistryPanel` дублирует нормализацию.
3. **Дублирование completeness/filters**: `productActionsRegistryModel.js` повторяет `_completeness` и `_matches_filters` из `product_actions_registry.py`.
4. **Нет единого источника truth для session-scoped analysis**: registry endpoint работает для workspace/project, но session scope в registry panel использует fallback на interview data.

## Goals

1. Реализовать `GET /api/sessions/{session_id}/analysis/view-model` с product_actions unified envelope.
2. Переключить `InterviewStage` на backend-provided `step_action_counts`.
3. Переключить `ProductActionsRegistryPanel` session scope на backend view-model fields (`rows`, `summary`, `filter_options`, `metrics`, `empty_state`, `source_state`).
4. Сохранить compatibility fallbacks при отсутствии backend fields.
5. Добавить/обновить тесты для endpoint и frontend consumption.

## Non-goals

- Не реализовывать `process_properties` в view model (отложено на future contour).
- Не реализовывать `POST /api/sessions/{session_id}/analysis/view-model/query` (только GET).
- Не менять registry endpoints для workspace/project scope.
- Не делать schema migration или moving `product_actions_batch_draft` из `interview_json`.
- Не делать UI redesign.
- Не открывать PR, не merge, не deploy без explicit approval.

## Source/runtime truth status

| Plane | Evidence |
|---|---|
| workspace | `pwd=/opt/processmap-test` |
| branch | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `a2359d8ce732ab89f8911ec0479500ecd660a764` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| status | Dirty: untracked planning/runtime artifacts only |
| diff cached | none |

Риск: workspace — не canonical repo root. Product implementation разрешён только в рамках bounded scope этого контура.

## Backend scope

### Новый endpoint

`GET /api/sessions/{session_id}/analysis/view-model`

Response shape (bounded to product_actions):
```json
{
  "ok": true,
  "session_id": "...",
  "session_title": "...",
  "project_id": "...",
  "project_title": "...",
  "workspace_id": "...",
  "analysis": {
    "product_actions": {
      "rows": [...],
      "summary": { "total": 0, "complete": 0, "incomplete": 0 },
      "filter_options": { "product_groups": [], "products": [], "action_types": [], "stages": [], "object_categories": [], "roles": [] },
      "applied_filters": {},
      "metrics": { "total_rows": 0, "complete": 0, "incomplete": 0 },
      "empty_state": { "kind": "not_empty", "scope": "session", "message_key": "" },
      "source_state": { "source": "process_analysis_session_view_model", "interview_loaded": true, "bpmn_elements_count": 0 }
    },
    "derived": {
      "step_action_counts": {}
    }
  },
  "interview_state": {
    "status": "draft|in_progress|completed",
    "stage": "...",
    "updated_at": 0
  }
}
```

### Implementation notes

- Реализовать в отдельном router-файле `backend/app/routers/process_analysis_session.py` или расширить `product_actions_registry.py`.
- Реиспользовать `_registry_row`, `_completeness`, `_summary` из `product_actions_registry.py`.
- Добавить unified envelope helpers: `_filter_options`, `_metrics`, `_empty_state`, `_source_state` (аналогично `process_properties_registry.py`).
- `step_action_counts` вычислять из `rows` как `Map<step_id, count>`.
- Данные читать через `get_storage().load(session_id)` → `interview_json → analysis.product_actions`.
- Проверять `project_access_allowed` для сессии.

## Frontend scope

### API client

- Добавить `apiGetSessionAnalysisViewModel(sessionId)` в `frontend/src/lib/api.js`.

### InterviewStage.jsx

- Добавить загрузку view model при mount / session change.
- Заменить `countProductActionsForStep(data?.analysis, step)` на `viewModel?.analysis?.derived?.step_action_counts?.[stepId] || 0`.
- Сохранить fallback на client-side count если view model отсутствует.
- `productActionCountByStepId` либо удалить, либо использовать как fallback.

### ProductActionsRegistryPanel.jsx (session scope)

- При `scope === "session"` и наличии `sessionId` вызывать `apiGetSessionAnalysisViewModel`.
- Использовать `viewModel.analysis.product_actions.rows` вместо `currentRows`.
- Использовать `viewModel.analysis.product_actions.filter_options` вместо `uniqueProductActionRegistryFilterOptions(rows)`.
- Использовать `viewModel.analysis.product_actions.summary` и `metrics` для display.
- Использовать `viewModel.analysis.product_actions.empty_state` и `source_state`.
- Сохранить fallback на `currentRows` / client-side computation если backend field отсутствует.

### Tests

- Backend: тесты для нового endpoint (happy path, 404, empty analysis, action counts).
- Frontend: тесты для `apiGetSessionAnalysisViewModel`, InterviewStage consumption, RegistryPanel session scope consumption.

## Worker split

### Mode: SINGLE_EXECUTOR_MODE

Backend endpoint и frontend switch связаны: frontend нельзя полностью верифицировать без работающего endpoint. Parallel split не оправдан токен-экономически.

### Agent 2 / Worker — substantive implementation lane

Scope:
1. Реализовать backend endpoint `GET /api/sessions/{session_id}/analysis/view-model`.
2. Добавить `apiGetSessionAnalysisViewModel` в frontend API client.
3. Переключить `InterviewStage.jsx` на `step_action_counts` из view model с fallback.
4. Переключить `ProductActionsRegistryPanel.jsx` session scope на backend view-model fields с fallback.
5. Добавить/обновить backend и frontend тесты.
6. Запустить dev server, проверить runtime на `:5180`.
7. Написать `WORKER_2_REPORT.md` и создать `WORKER_2_DONE`.

If blocked: создать `EXEC_PART_1_BLOCKED.md`.

### Agent 3: shell-only merge / no-LLM handoff

В `TOKEN_ECONOMY_SINGLE_EXECUTOR` режиме Agent 3 выполняет shell-only merge результатов Worker 2 в `EXEC_REPORT.md` и передаёт Agent 4.

## Deliverables

- `PLAN.md`
- `EXECUTOR_PART_1_PROMPT.md`
- `EXECUTOR_PART_2_PROMPT.md` (shell-only)
- `REVIEWER_PROMPT.md`
- `STATE.json`
- `AGENT_RUN_ID`
- `READY_FOR_EXECUTION`

## Review gates

Agent 4 может ставить `REVIEW_PASS` только если:
- Endpoint `GET /api/sessions/{session_id}/analysis/view-model` возвращает корректный unified envelope.
- Frontend использует backend view-model fields где они доступны.
- Fallback logic сохраняет работоспособность при отсутствии backend fields.
- InterviewStage step action counts корректны.
- RegistryPanel session scope корректно рендерит rows, summary, filters, metrics.
- Runtime на `:5180` verified fresh (HTTP 200, no-cache).
- No console errors.
- No unsafe PUT/PATCH/DELETE из view-навигации.
- Tests pass.

## Acceptance criteria

- [ ] Backend endpoint реализован и возвращает `ok`, `session_id`, `analysis.product_actions` с unified envelope.
- [ ] Frontend `apiGetSessionAnalysisViewModel` существует и вызывается.
- [ ] `InterviewStage` использует `step_action_counts` из view model (с fallback).
- [ ] `ProductActionsRegistryPanel` session scope использует backend rows/summary/filter_options/metrics (с fallback).
- [ ] Backend и frontend тесты добавлены/обновлены и проходят.
- [ ] Runtime proof на `:5180` подтверждён.
- [ ] No product code changed by Planner.
- [ ] STATE.json execution_mode = `single-lane`.
