# EXECUTOR PART 2 — Backend Implementation + Runtime Proof

**Agent:** Agent 3  
**Contour:** `uiux/registry-ui-spec-implementation-v1`  
**Run ID:** `20260522T072413Z-agent1-plan`  
**Scope:** Backend endpoint, view_model builder, backend tests, API integration, runtime proof  
**Depends on:** None (runs in parallel with Part 1 against the `view_model` contract in UI_SPEC.md)

---

## 0. CRITICAL: Read UI_SPEC.md First

Before writing any code, read `.planning/contours/uiux/registry-ui-spec-implementation-v1/UI_SPEC.md` in full, especially §7.1 (Backend View-Model Contract) and §3 (Реестр действий).

---

## 1. Current State

- **File:** `backend/app/routers/product_actions_registry.py` (~740 lines)
- **Existing endpoints:**
  - `GET /api/sessions/{session_id}/analysis/view-model` — returns session-level analysis view model
  - `POST /api/analysis/product-actions/registry/query` — returns `{ok, scope, rows, summary, sessions, session_summary, page}`
  - `POST /api/analysis/product-actions/registry/export.csv` — CSV export
  - `POST /api/analysis/product-actions/registry/export.xlsx` — XLSX export
- **Tests:** `backend/tests/test_product_actions_registry_api.py` (~373 lines, unittest)

The current `_registry_payload()` function does the heavy lifting of loading sessions, building rows, filtering, sorting, and paginating. You will **reuse** this logic and reshape the output into the new `view_model` contract.

---

## 2. New Endpoint: GET /api/analysis/product-actions/registry

### 2.1 Add the route

Add a new FastAPI route in `backend/app/routers/product_actions_registry.py`:

```python
@router.get("/api/analysis/product-actions/registry")
def get_product_actions_registry(
    scope: str = "workspace",
    workspace_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    request: Request,
) -> Dict[str, Any]:
    ...
```

It should accept the same scope parameters as the POST query endpoint, but as query parameters. It should also accept filter parameters as optional query params (e.g., `period`, `product`, `session_filter`, `status`, `source`).

### 2.2 View-Model Shape

The response MUST wrap everything in `view_model` exactly as specified in UI_SPEC.md §7.1:

```json
{
  "view_model": {
    "title": "Реестр действий",
    "subtitle": "Действия с продуктами из сессий и проектов",
    "scope_tabs": [
      {"id": "all", "label": "Все действия", "active": true, "count": 1247},
      {"id": "by_product", "label": "По продуктам", "active": false},
      {"id": "by_session", "label": "По сессиям", "active": false}
    ],
    "metrics": [
      {"label": "Всего", "value": 1247},
      {"label": "С продуктом", "value": 892},
      {"label": "Без продукта", "value": 355},
      {"label": "Заполненность", "value": 71.9, "unit": "%", "status": "partial"}
    ],
    "filter_options": [
      {"id": "period", "label": "Период", "options": [...], "selected": null},
      {"id": "product", "label": "Продукт", "options": [...]},
      {"id": "session", "label": "Сессия", "options": [...]},
      {"id": "status", "label": "Статус", "options": [...]},
      {"id": "source", "label": "Источник", "options": [...]}
    ],
    "applied_filters": [],
    "warnings": ["Неполные данные: 3 сессии не содержат привязки к продуктам."],
    "ai_suggestions": {
      "count": 12,
      "action_label": "Показать рекомендации",
      "action_url": "/api/ai/suggestions/product-actions"
    },
    "items": [
      {
        "id": "...",
        "action_name": "Согласовать договор",
        "product_name": "CRM",
        "session_id": "S-42",
        "source": "BPMN",
        "status": "complete",
        "date": "2026-05-21"
      }
    ],
    "pagination": {"page": 1, "per_page": 50, "total": 1247},
    "source_state": {
      "sources": [
        {"name": "BPMN диаграммы", "count": 842, "active": true},
        {"name": "Ручной ввод", "count": 312, "active": true},
        {"name": "Внешний API", "count": null, "active": false}
      ]
    },
    "empty_state": null
  }
}
```

### 2.3 Field Mapping from Existing Data

| view_model field | Source |
|---|---|
| `title`, `subtitle` | Hardcode per spec |
| `scope_tabs` | Build from scope context. Count rows for each tab. |
| `metrics` | Compute from rows: total = len(rows); with_product = rows with product_name; without_product = total - with_product; fill_rate = round(with_product / total * 100, 1) if total > 0 else 0. Status = "complete" if ≥80 else "partial". |
| `filter_options` | Derive from rows: unique products, sessions, sources, statuses. Also add period ranges. Each option: `{id, label, options: [{value, label}], selected?}`. |
| `applied_filters` | Reflect current query params. |
| `warnings` | Add warning if any rows have missing product_name: `"Неполные данные: N сессий не содержат привязки к продуктам. Результаты могут быть неточными."` |
| `ai_suggestions` | Query `product_actions_ai.py` or return `{count: 0, ...}` as MVP. Do NOT block on AI integration. |
| `items` | Map existing `rows` to spec columns: `action_name` from `action_type` or `action_object`, `product_name`, `session_id`, `source`, `status` from `completeness` ("complete" → "Полная", etc.), `date` from `updated_at`. |
| `pagination` | Map from existing `page`: `{page: offset/limit + 1, per_page: limit, total: total}` |
| `source_state` | Build from row sources: count rows per source, mark active if count > 0. |
| `empty_state` | If `items` empty, return `{title: "Нет действий с продуктами", description: "Данные будут собраны из BPMN диаграмм и сессий анализа по мере их создания.", action: null}` |

### 2.4 Reuse Strategy

Reuse `_registry_payload()` internally. Call it with `paginate=True` (or `False` if you want to compute metrics over the full set, then paginate items separately). The key is:

1. Get the full payload from `_registry_payload()`.
2. Compute metrics, filter_options, warnings, source_state over ALL rows (before pagination) if possible, or accept that metrics reflect the current filtered set.
3. Map `page_rows` to `items`.
4. Return wrapped in `view_model`.

---

## 3. Backend Tests

Add tests to `backend/tests/test_product_actions_registry_api.py`:

1. `test_get_registry_view_model_returns_correct_shape` — call new GET endpoint, assert `view_model` exists, assert all required keys present.
2. `test_get_registry_view_model_metrics_calculated_correctly` — seed data with complete/incomplete rows, assert metrics values.
3. `test_get_registry_view_model_empty_state_when_no_rows` — assert `empty_state` is populated, `items` is empty.
4. `test_get_registry_view_model_filter_options_backend_driven` — assert `filter_options` contains products/sessions/sources derived from data.
5. `test_get_registry_view_model_warnings_when_incomplete_data` — seed row without product_name, assert warning present.
6. `test_get_registry_view_model_pagination` — seed 5 rows, request limit=2, assert pagination fields.
7. `test_get_registry_preserves_scope_guard` — viewer cannot access unauthorized project.

Run tests:
```bash
cd /opt/processmap-test/backend
python -m pytest tests/test_product_actions_registry_api.py -v
```

All tests must pass.

---

## 4. Frontend API Integration (Agent 3 also does this)

Agent 2 is building the frontend components. You must ensure the backend contract actually matches what the frontend expects. After your backend changes:

1. Update `frontend/src/lib/apiRoutes.js` to add `productActionsRegistryViewModel: () => "/api/analysis/product-actions/registry"` if Agent 2 hasn't done it.
2. Update `frontend/src/lib/api.js` to add `apiGetProductActionsRegistryViewModel` if Agent 2 hasn't done it.

If Agent 2 already made these changes, do NOT duplicate — just verify they work with your endpoint.

---

## 5. Runtime Proof

After backend and frontend are both implemented and merged:

1. **Build frontend:**
   ```bash
   cd /opt/processmap-test/frontend
   npm run build
   ```
2. **Restart backend** (if needed) to pick up new endpoint.
3. **Verify runtime on `http://clearvestnic.ru:5180`:**
   - Navigate to the registry page.
   - Confirm the page loads with the new single-container layout.
   - Confirm `GET /api/analysis/product-actions/registry` returns 200 and correct JSON.
   - Take a screenshot for evidence.
4. **Run all tests:**
   ```bash
   cd /opt/processmap-test/frontend && npm test
   cd /opt/processmap-test/backend && python -m pytest tests/test_product_actions_registry_api.py -v
   ```

Record results in `EXEC_REPORT.md`.

---

## 6. Constraints

- Do NOT remove existing POST endpoints (`/query`, `/export.csv`, `/export.xlsx`). Keep them for backward compatibility.
- Do NOT change the existing `_registry_payload()` signature or behavior in a breaking way.
- Do NOT hardcode fake data in the view_model.
- Do NOT block on AI integration for `ai_suggestions` — return `{count: 0}` if the AI service is unavailable.

---

## 7. Deliverables

1. Updated `backend/app/routers/product_actions_registry.py` with new GET endpoint.
2. Updated `backend/tests/test_product_actions_registry_api.py` with new tests.
3. Updated `frontend/src/lib/api.js` and `frontend/src/lib/apiRoutes.js` (if not already done by Agent 2).
4. All backend tests pass.
5. Runtime proof on `:5180` with screenshot.
6. `EXEC_REPORT.md` summarizing what was done, what passed, and any blockers.

---

*End of EXECUTOR_PART_2_PROMPT.md*
