# API.md — AI-флоу: действия с продуктом + RAG-readiness

**Контур:** `feature/analysis-tabs-ux-overhaul-p2`  
**Цель:** описать бэкенд-контракты, state-машины и точки интеграции фронтенда для HITL-флоу генерации действий с продуктом.

---

## 1. Общая схема флоу

```
┌─────────────────┐     POST /analysis/product-actions/suggest      ┌──────────────────┐
│  Пользователь   │ ───────────────────────────────────────────────→ │  DeepSeek (LLM)  │
│  (вкладка AI)   │                                                  │  + prompt registry│
└─────────────────┘                                                  └──────────────────┘
         │                                                                     │
         │ ← suggestions [{action_type, object, method, step_id…}]            │
         ▼                                                                     │
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Список предложений (pending) → пользователь редактирует/approve/reject → pending→approved │
│  POST /analysis/product-actions/suggestions (create/update)                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
         │
         │  Когда все approved
         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  POST /analysis/product-actions/suggestions/apply (base_diagram_state_version)            │
│  → пишет approved в session.interview.analysis.product_actions                            │
│  → rag_readiness_status = ready                                                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
         │
         │  Пользователь нажимает «Отправить на RAG-индексацию»
         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PATCH /rag-readiness {rag_readiness_status: "queued"}                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
         │
         │  Ночной джоб 04:30
         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  celery beat → index_session_bpmn_xml.delay(session_id, org_id)                         │
│  → после успеха: rag_readiness_status = indexed, rag_indexed_at = now()                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. State-машина RAG-readiness

```
not_ready ──(apply approved suggestions)──► ready ──(PATCH queued)──► queued ──(night job)──► indexed
    ▲                                                                                        │
    └────────────────────(новые изменения product_actions)───────────────────────────────────┘
```

| Статус | Значение | Когда переходит |
|--------|----------|-----------------|
| `not_ready` | Нет заапрувленных действий | Начальное состояние; возвращается при новых изменениях после `indexed`. |
| `ready` | Есть заапрувленные, но не отправлены в очередь | Автоматически после `apply_approved_suggestions`. |
| `queued` | Поставлена в очередь на индексацию | После PATCH `ready → queued`. |
| `indexed` | BPMN проиндексирован | Ночной джоб. |

**Правила:**
- Вручную разрешён только переход `ready → queued`.
- После `indexed` любое новое `apply` сбрасывает статус в `ready` (frontend может показывать «есть неиндексированные изменения»).
- `rag_queued_at` / `rag_indexed_at` — unix timestamp (модель `Session`, миграция `027`).

---

## 3. Endpoint'ы (уже существующие)

### 3.1. Генерация предложений

```http
POST /api/sessions/{session_id}/analysis/product-actions/suggest
```

**Тело:**
```json
{
  "options": {
    "max_suggestions": 5,
    "selected_step": { "step_id": "step_123", "bpmn_element_id": "Activity_1", "label": "Взять котлету" }
  }
}
```

**Ответ (успех):**
```json
{
  "ok": true,
  "module_id": "ai.product_actions.suggest",
  "draft_id": "draft_...",
  "source": "llm",
  "prompt_id": "seed_ai_product_actions_suggest_v4",
  "prompt_version": "v4",
  "input_hash": "...",
  "suggestions": [
    {
      "id": "ai_pa_1",
      "step_id": "step_123",
      "bpmn_element_id": "Activity_1",
      "step_label": "Взять котлету",
      "product_name": "Куриная котлета",
      "product_group": "Курица",
      "action_type": "взять",
      "action_stage": "до разогрева",
      "action_object": "котлета",
      "action_object_category": "полуфабрикат",
      "action_method": "рукой",
      "role": "Повар",
      "confidence": 0.9,
      "evidence_text": "шаг 'Взять котлету'",
      "reason": "явно следует из шага",
      "duplicate_of": "",
      "duplicate_reason": "",
      "missing_fields": [],
      "warnings": [],
      "source": "ai_suggested"
    }
  ],
  "warnings": [],
  "summary": {
    "suggestions_count": 1,
    "duplicate_count": 0,
    "incomplete_count": 0
  }
}
```

**Коды ошибок:** `AI_PROVIDER_NOT_CONFIGURED`, `AI_PROMPT_NOT_CONFIGURED`, `AI_PROVIDER_ERROR`, `AI_RESPONSE_PARSE_ERROR`, `AI_RATE_LIMIT_EXCEEDED`.

**Где реализовано:**
- `backend/app/routers/product_actions_ai.py::suggest_product_actions`
- `backend/app/ai/product_actions_suggest.py::suggest_product_actions_with_deepseek`
- Prompt registry: `backend/app/ai/prompt_registry.py` (`module_id = ai.product_actions.suggest`).

---

### 3.2. Batch-генерация (для всех шагов)

```http
POST /api/sessions/{session_id}/analysis/product-actions/batch-suggest
```

```json
{
  "scope": "without_actions",
  "step_ids": [],
  "options": { "max_steps_per_chunk": 10 }
}
```

**Где реализовано:** `backend/app/routers/product_actions_ai.py::batch_suggest_product_actions`.

---

## 4. Endpoint'ы suggestions (HITL)

### 4.1. Список предложений

```http
GET /api/sessions/{session_id}/analysis/product-actions/suggestions
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": "sugg_1",
      "status": "pending",
      "source": "llm",
      "original_llm_output": { ... },
      "action": { ... },
      "binding": { "step_id": "step_123", "bpmn_element_id": "Activity_1" },
      "edited_by_user": 0,
      "created_at": 1234567890,
      "updated_at": 1234567890
    }
  ],
  "meta": {
    "counts": { "pending": 1, "approved": 0, "rejected": 0, "total": 1 }
  }
}
```

**Где реализовано:** `backend/app/routers/product_action_suggestions.py::list_suggestions`.

---

### 4.2. Создание / обновление предложения

```http
POST /api/sessions/{session_id}/analysis/product-actions/suggestions
```

**Тело (approve/reject):**
```json
{
  "id": "sugg_1",
  "status": "approved",
  "source": "llm",
  "action": {
    "product_name": "Куриная котлета",
    "action_type": "взять",
    "action_object": "котлета",
    "action_method": "рукой"
  },
  "binding": {
    "step_id": "step_123",
    "bpmn_element_id": "Activity_1",
    "step_label": "Взять котлету"
  },
  "edited_by_user": 1
}
```

**Допустимые статусы:** `pending`, `approved`, `rejected`.

**Где реализовано:** `backend/app/routers/product_action_suggestions.py::create_or_update_suggestion`.

---

### 4.3. Применить заапрувленные предложения

```http
POST /api/sessions/{session_id}/analysis/product-actions/suggestions/apply
```

**Тело:**
```json
{
  "base_diagram_state_version": 42
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "applied_count": 3,
    "new_diagram_state_version": 43,
    "rag_readiness_status": "ready"
  }
}
```

**CAS-защита:**
- `DIAGRAM_STATE_BASE_VERSION_REQUIRED` — если не передана версия.
- `DIAGRAM_STATE_CONFLICT` — если версия устарела.

**Где реализовано:** `backend/app/routers/product_action_suggestions.py::apply_approved_suggestions`.

---

## 5. Endpoint'ы RAG-readiness

### 5.1. Получить статус

```http
GET /api/sessions/{session_id}/rag-readiness
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "session_id": "sess_1",
    "rag_readiness_status": "ready",
    "rag_queued_at": null,
    "rag_indexed_at": null
  }
}
```

---

### 5.2. Перевести в очередь

```http
PATCH /api/sessions/{session_id}/rag-readiness
```

**Тело:**
```json
{
  "rag_readiness_status": "queued"
}
```

**Ограничение:** только `ready → queued`. Иначе `409 RAG_READINESS_INVALID_TRANSITION`.

**Где реализовано:** `backend/app/routers/product_action_suggestions.py::transition_rag_readiness`.

---

## 6. Ночной джоб индексации

### 6.1. Текущее состояние

- Celery-task уже есть: `backend/app/rag_tasks.py::index_session_bpmn_xml`.
- Он вызывается автоматически при сохранении сессии, если изменился `bpmn_xml` (`backend/app/storage.py:5008`).
- Beat-schedule в `backend/app/celery_app.py` сейчас содержит только `analytics-nightly-refresh` в 04:30.

### 6.2. Что добавить

Новый beat-таск `rag-index-nightly-refresh` в `backend/app/celery_app.py`:

```python
"rag-index-nightly-refresh": {
    "task": "app.rag_tasks.index_queued_sessions_bpmn_xml",
    "schedule": crontab(hour=4, minute=30),
    "options": {"queue": "celery"},
},
```

Новый task `index_queued_sessions_bpmn_xml` в `backend/app/rag_tasks.py`:

```python
@app.task(bind=True, max_retries=1, default_retry_delay=10)
def index_queued_sessions_bpmn_xml(self) -> Dict[str, Any]:
    storage = get_storage()
    sessions = storage.list_sessions_by_rag_status("queued")
    results = []
    for sess in sessions:
        result = index_session_bpmn_xml.delay(sess.id, sess.org_id)
        # или синхронно:
        # result = index_session_bpmn_xml.run(sess.id, sess.org_id)
        storage.set_rag_readiness(sess.id, "indexed", org_id=sess.org_id)
        results.append({"session_id": sess.id, "task_id": result.id, "status": "indexed"})
    return {"status": "ok", "indexed_count": len(results), "results": results}
```

**Нужен метод в storage:** `list_sessions_by_rag_status(status)` — выбрать `id, org_id` из `sessions WHERE rag_readiness_status = ?`.

**Альтернатива (минимальный патч):** в существующем `analytics-nightly-refresh` или отдельном таске перебирать `sessions WHERE rag_readiness_status = 'queued'` и для каждой вызывать `index_session_bpmn_xml.delay`, затем `set_rag_readiness(..., 'indexed')`.

---

## 7. Модели и миграции

### 7.1. Модель `Session`

`backend/app/models.py`:
```python
rag_readiness_status: str = "not_ready"
rag_queued_at: Optional[int] = None
rag_indexed_at: Optional[int] = None
```

### 7.2. Таблица `session_product_action_suggestions`

Миграция `backend/alembic/versions/027_analysis_tabs_product_actions_suggestions.py`:

```sql
CREATE TABLE IF NOT EXISTS session_product_action_suggestions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'llm',
    original_llm_output TEXT NOT NULL DEFAULT '{}',
    action TEXT NOT NULL DEFAULT '{}',
    binding TEXT NOT NULL DEFAULT '{}',
    edited_by_user INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT chk_session_product_action_suggestions_status
        CHECK (status IN ('pending', 'approved', 'rejected'))
);
```

---

## 8. Фронтенд: что добавить

### 8.1. Routes

В `frontend/src/lib/apiRoutes.js` в объект `sessions`:

```js
productActionsSuggestions: (sessionId) => `/api/sessions/${encode(sessionId)}/analysis/product-actions/suggestions`,
productActionsSuggestionsApply: (sessionId) => `/api/sessions/${encode(sessionId)}/analysis/product-actions/suggestions/apply`,
ragReadiness: (sessionId) => `/api/sessions/${encode(sessionId)}/rag-readiness`,
```

### 8.2. API helpers

В `frontend/src/lib/api.js`:

```js
export async function apiListProductActionSuggestions(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(apiRoutes.sessions.productActionsSuggestions(sid)));
}

export async function apiUpdateProductActionSuggestion(sessionId, payload) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = isPlainObject(payload) ? payload : {};
  return okOrError(await request(apiRoutes.sessions.productActionsSuggestions(sid), { method: "POST", body }));
}

export async function apiApplyProductActionSuggestions(sessionId, baseDiagramStateVersion) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  const body = { base_diagram_state_version: Number(baseDiagramStateVersion) || 0 };
  return okOrError(await request(apiRoutes.sessions.productActionsSuggestionsApply(sid), { method: "POST", body }));
}

export async function apiGetRagReadiness(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(apiRoutes.sessions.ragReadiness(sid)));
}

export async function apiTransitionRagReadiness(sessionId, status) {
  const sid = String(sessionId || "").trim();
  if (!sid) return { ok: false, status: 0, error: "missing session_id" };
  return okOrError(await request(apiRoutes.sessions.ragReadiness(sid), {
    method: "PATCH",
    body: { rag_readiness_status: String(status) },
  }));
}
```

### 8.3. Новый компонент

`frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx`:
- Загружает suggestions (`apiListProductActionSuggestions`).
- Кнопка «Сгенерировать» → `apiSuggestProductActions`.
- Таблица/карточки с полями + статус + кнопки approve/reject.
- Массовый approve/reject.
- После approve всех → показывает баннер RAG-ready + CTA.
- Привязка к шагу: select из `timelineView`.

---

## 9. Rate-limit и redaction

- `backend/app/ai/execution_log.py::check_ai_rate_limit` используется в `suggest_product_actions`.
- Секреты `api_key`/`base_url` redact'ятся в `_safe_error_message`.
- Execution log пишется через `record_ai_execution`.

---

## 10. Тесты (уже существующие)

`backend/tests/test_product_action_suggestions.py` покрывает:
- create/list/update suggestion;
- apply без base version → 409 `DIAGRAM_STATE_BASE_VERSION_REQUIRED`;
- apply stale version → 409 `DIAGRAM_STATE_CONFLICT`;
- apply success → `rag_readiness_status: ready`;
- RAG readiness get/transition.

**Что добавить:**
- Тест ночного джоба `index_queued_sessions_bpmn_xml`.
- Тест `suggest_product_actions` endpoint (если ещё нет).
- Frontend vitest на `ProductActionSuggestionsPanel` (статусы, RAG-бейдж).

---

## 11. Интеграция с PROCESSMAN

- PROCESSMAN использует `lastAnalysisStore` для LLM1-анализа (`frontend/src/features/process/processman/lastAnalysisStore.js`).
- Новый product-actions HITL не затрагивает PROCESSMAN: `ProductActionsPanel` в companion-таблице продолжает работать с уже сохранёнными `product_actions`.
- После `apply` approved suggestions обновляется `session.interview.analysis.product_actions`, что видно `ProductActionsPanel` и `ProcessmanAnalysis`.

---

## 12. Проверочный чек-лист

- [ ] `POST /analysis/product-actions/suggest` возвращает suggestions.
- [ ] `GET /analysis/product-actions/suggestions` возвращает список с counts.
- [ ] `POST /analysis/product-actions/suggestions` меняет статус.
- [ ] `POST /analysis/product-actions/suggestions/apply` требует `base_diagram_state_version`.
- [ ] После apply статус RAG = `ready`.
- [ ] `PATCH /rag-readiness` разрешает только `ready → queued`.
- [ ] Ночной джоб индексирует queued-сессии и ставит `indexed`.
- [ ] Frontend helpers добавлены в `api.js` / `apiRoutes.js`.
