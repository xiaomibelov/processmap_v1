# fix/session-assignees-hotfix — PLAN

## Цель

Починить regression после #891: runtime ReferenceError в WorkspaceExplorer, стабильный API-контракт `/api/sessions/{id}/assignees`, мультиназначение исполнителей с optimistic rollback и геометрию стыка сайдбар ↔ workspace.

## Затронутые компоненты

- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/features/explorer/explorerAssigneeModel.js`
- `frontend/src/lib/api.js`
- `backend/app/routers/sessions.py`
- `backend/app/services/session_assignment_service.py`
- `backend/app/domains/storage/canvas_session/repository.py`
- `.github/workflows/*`
- `.planning/contours/fix/session-assignees-hotfix/*`

## План

1. RED: зафиксировать падение по отсутствующему импорту tooltip, single-select dialog, отсутствующей колонке assignees в project sessions, endpoint-level API contract и geometry guards.
2. GREEN frontend crash: импортировать `getSessionAssigneesTooltip`, добавить render smoke `WorkspaceExplorer` с сессиями с/без assignees.
3. GREEN multiple assignees: перевести `AssigneeDialog` для `session_assignees` на checkbox multi-select; сохранять массив `user_ids`; optimistic update в react-query cache с rollback и `console.warn` при ошибке API.
4. GREEN project table: добавить колонку `Исполнители` и диалог назначения в `ProjectPane`, чтобы мультиназначение работало не только в раскрытом tree view.
5. GREEN API: закрепить HTTP-контракт GET/PUT assignees и обновить `API.md`.
6. CI: добавить frontend lint job с ESLint `no-undef:error`.
7. UI geometry: сделать правую границу сайдбара единственной осью, inset highlights, общий header height token для левого и правого блока; зафиксировать checklist/screenshots в `UI.md`.
8. Verify: frontend node tests, smoke tests, backend assignees tests, lint, build; затем reports и `READY_FOR_REVIEW`.

## Prior Art / Existing Patterns

- RAG точного контекста по assignees не нашёл; использую существующие файлы #891 на `origin/main`.
- Existing tests: `workspaceSessionAssignees.source.test.mjs`, `explorerAssigneeModel.test.mjs`, `backend/tests/test_session_assignees.py`.
- Existing endpoint code: `backend/app/routers/sessions.py` уже объявляет `GET/PUT /api/sessions/{session_id}/assignees`.
