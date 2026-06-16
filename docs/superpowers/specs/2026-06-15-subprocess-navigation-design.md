# Subprocess Navigation Design

## Goal
Реализовать навигацию из основного BPMN-процесса внутрь подпроцесса (call activity) с фокусом на целевой task и обратную навигацию через breadcrumbs / кнопку "Назад".

## Constraints
- Не ломать существующую сессию `processmap.ru` (`project=4f18ffd92e&session=fdc4c7b53e`).
- Не менять формат хранения BPMN XML без миграции.
- Не удалять существующий viewer/rerenderer — только расширять.
- Никакого merge/deploy/PR без явного approve пользователя.

## Architecture
Навигация строится вокруг **навигационного стека**, хранящегося в дочерней сессии. Клик на call activity создаёт (или находит) дочернюю сессию, копирует BPMN подпроцесса и записывает путь. Frontend переключает активную сессию, восстанавливает breadcrumbs из стека и фокусируется на target task. Обратная навигация читает стек из дочерней сессии и возвращает parent + element_id.

## Data Model

### `sessions.navigation_stack`, `sessions.parent_session_id`, `sessions.element_id_in_parent`
Три новых nullable поля:
- `navigation_stack TEXT DEFAULT '[]'` — JSON-массив кадров навигации.
- `parent_session_id TEXT` — ссылка на родительскую сессию (для быстрого поиска).
- `element_id_in_parent TEXT` — id call activity в родительском BPMN.

```json
[
  {
    "session_id": "root-session-id",
    "parent_session_id": null,
    "element_id_in_parent": null,
    "entered_at": "2026-06-15T10:00:00Z"
  },
  {
    "session_id": "subprocess-session-id",
    "parent_session_id": "root-session-id",
    "element_id_in_parent": "call_activity_1",
    "entered_at": "2026-06-15T10:01:00Z"
  }
]
```

- Стек хранится **в дочерней сессии**.
- Последний frame всегда описывает текущую сессию.
- `parent_session_id` + `element_id_in_parent` используются для поиска существующей дочерней сессии и предотвращения дублирования.
- Для root-сессий стек `[]`, `parent_session_id` и `element_id_in_parent` — `NULL`.

### Migration
```sql
ALTER TABLE sessions ADD COLUMN navigation_stack TEXT DEFAULT '[]';
ALTER TABLE sessions ADD COLUMN parent_session_id TEXT;
ALTER TABLE sessions ADD COLUMN element_id_in_parent TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_parent_element ON sessions(parent_session_id, element_id_in_parent);
```
Добавляется в `backend/app/storage.py::_ensure_schema()` через conditional `ALTER TABLE` для SQLite/Postgres.

## Backend API

### `POST /api/sessions/{session_id}/subprocess/{element_id}/navigate`

**Query params:**
- `target_element_id` (optional) — явный фокус внутри subprocess.

**Auth:** JWT bearer, org context.

**Behavior:**
1. Загрузить parent session с проверкой read scope (`session_access_from_request`).
2. Найти BPMN-элемент с `id == element_id`.
3. Проверить, что тег — `callActivity` (или `subProcess` для embedded).
4. Прочитать `calledElement` для `callActivity`.
5. **Resolve subprocess BPMN:**
   a. Найти сессию в том же проекте, где `bpmn_meta.process_id == calledElement`.
   b. Если нет — найти сессию проекта, где `bpmn_xml` содержит `<bpmn:process id="calledElement">`.
   c. Если нет — найти embedded `<bpmn:process id="calledElement">` в текущем XML.
   d. Если BPMN не найден — 404.
6. **Resolve target element:**
   a. `target_element_id` из query.
   b. Первый `<userTask>` в subprocess BPMN.
   c. Первый `<task>` в subprocess BPMN.
   d. `null`.
7. **Lazy-create subprocess session:**
   - Сначала искать существующую сессию по `(parent_session_id == session_id, element_id_in_parent == element_id)`.
   - Если найдена — вернуть её id.
   - Если нет:
     - `project_id` = parent.project_id
     - `bpmn_xml` = resolved subprocess BPMN
     - `title` = "Подпроцесс: {element name or calledElement}"
     - `owner_user_id` = current user
     - `parent_session_id` = session_id
     - `element_id_in_parent` = element_id
     - `navigation_stack` = parent.navigation_stack + new frame
8. Вернуть:
   ```json
   {
     "subprocess_session_id": "sub-uuid",
     "target_element_id": "task-uuid",
     "breadcrumbs": [
       {"session_id": "root", "name": "Root session title", "element_id": null},
       {"session_id": "sub-uuid", "name": "Подпроцесс: ...", "element_id": "call_activity_1"}
     ]
   }
   ```

### `POST /api/sessions/{subprocess_session_id}/return`

**Auth:** JWT bearer, org context.

**Behavior:**
1. Загрузить subprocess session с проверкой read scope.
2. Прочитать `navigation_stack`.
3. Если stack пуст — 404.
4. Взять предпоследний frame (parent) или последний frame, если он описывает parent.
5. Вернуть:
   ```json
   {
     "parent_session_id": "parent-uuid",
     "element_id_in_parent": "call_activity_1"
   }
   ```

## Frontend Flow

### Click on call activity
1. `BpmnStage` перехватывает double-click или контекстное меню на элементе типа `callActivity`.
2. Вызывается `apiNavigateToSubprocess(sessionId, elementId)`.
3. После ответа:
   - `pushProcessMapHistory({ project, session: subprocess_session_id, parent: sessionId, focus: target_element_id })`
   - Сохраняем `breadcrumbs` в session state.

### Loading subprocess viewer
1. `App.jsx` видит `session` в URL, вызывает `openSession(subprocess_session_id)`.
2. `BpmnStage` загружает BPMN дочерней сессии.
3. После `importXML`:
   - Если `focus` есть: `canvas.scrollToElement(focusElementId)` + `canvas.zoom('fit-viewport', 'auto')` + `overlays.add(focusElementId, highlight)`.
   - Иначе: обычный `fit`.

### Breadcrumbs
1. Новый компонент `SubprocessBreadcrumbs` монтируется в `AppShell` рядом с `TopBar`.
2. Источники breadcrumbs:
   - Ответ от `apiNavigateToSubprocess`.
   - При прямом заходе по URL — `GET /api/sessions/{id}` возвращает `navigation_stack`, из которого строится breadcrumbs.
3. Каждый crumb кликабелен: `openSession(crumb.session_id)`.

### Back button
1. `apiReturnToParent(subprocess_session_id)`.
2. Переход на `parent_session_id`.
3. После загрузки parent BPMN: `canvas.scrollToElement(element_id_in_parent)` + highlight.

### Direct URL support
URL формат:
```
/app?project={project}&session={subprocess_session_id}&parent={parent_session_id}&focus={target_element_id}
```
- `parent` используется как fallback, если `navigation_stack` пуст.
- `focus` — element id для фокуса после загрузки.

## UI/UX Details

### Highlight styles
- Target task в subprocess: жёлтая/синяя рамка (`bpmn-js` overlay с CSS-классом `subprocess-focus-highlight`).
- Call activity при возврате: оранжевая рамка (`subprocess-return-highlight`).

### Breadcrumbs layout
- Горизонтальная цепочка в `AppShell` под `TopBar`.
- Последний элемент неактивен (текущая сессия).
- Кнопка "Назад" слева от breadcrumbs (стрелка ←).

## Error Handling

| Сценарий | Статус | Сообщение |
|----------|--------|-----------|
| Пользователь не авторизован | 403 | "Доступ запрещён" |
| Parent session не найдена / нет прав | 404 | "Сессия не найдена" |
| Элемент не найден в BPMN | 404 | "Элемент не найден" |
| Элемент не callActivity/subProcess | 400 | "Элемент не является подпроцессом" |
| Subprocess BPMN не найден | 404 | "Подпроцесс не найден" |
| Target element не найден | 200 с `target_element_id: null` | — |

## Testing Strategy

### Backend tests (`tests/test_subprocess_navigation.py`)
- Embedded subprocess → navigate → target auto-resolve.
- Call activity → lazy-create child session → target userTask.
- Query `target_element_id` overrides auto-resolve.
- Return endpoint restores parent + element_id.
- 403 for unauthorized user.
- Breadcrumbs shape.
- Backward compatibility: existing session loads without navigation_stack.

### Frontend tests
- Unit: `apiNavigateToSubprocess` / `apiReturnToParent` wrappers.
- Integration (Playwright): click call activity → subprocess loaded → breadcrumb visible.

## Rollback Plan
1. Откатить миграцию: `ALTER TABLE sessions DROP COLUMN navigation_stack;` (если не деплоили) или игнорировать поле.
2. Откатить frontend: удалить компонент breadcrumbs и обработчики клика.
3. Fallback: восстановить `is_admin=True` и предыдущий viewer behavior.

## Files to Touch
- `backend/app/storage.py` — schema migration + navigation_stack helpers.
- `backend/app/models.py` — add `navigation_stack` field.
- `backend/app/services/session_service.py` — `navigate_to_subprocess`, `return_to_parent`.
- `backend/app/routers/sessions.py` — two new endpoints.
- `backend/app/repositories/session_repo.py` — load/create helpers.
- `backend/tests/test_subprocess_navigation.py` — new tests.
- `frontend/src/lib/api/sessionApi.js` — `apiNavigateToSubprocess`, `apiReturnToParent`.
- `frontend/src/App.jsx` — handle `parent`/`focus` query params.
- `frontend/src/components/process/BpmnStage.jsx` — click handler + focus/highlight.
- `frontend/src/components/AppShell.jsx` — render breadcrumbs.
- `frontend/src/features/process/SubprocessBreadcrumbs.jsx` — new component.
- `frontend/src/app/processMapRouteModel.js` — add `parent`/`focus` params.
