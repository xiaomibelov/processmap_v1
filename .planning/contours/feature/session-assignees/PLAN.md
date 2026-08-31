# PLAN — feature/session-assignees

## Контур
- **type:** `feature`
- **name:** `session-assignees`
- **роль:** Agent 1 (Planner)
- **baseline:** `origin/main`
- **ветка (после approve):** `feature/session-assignees` — создана, работа ведётся в worktree `p0-work-worktrees/feature-session-assignees`

## Цель
У сессии (схемы) появляется many-to-many связь с ответственными исполнителями. Пользователь назначает/изменяет исполнителей через меню «...» сессии в списке сессий проекта, результат виден в колонке «Исполнители».

## Существующие паттерны (что переиспользуем)

- **Ответственный за раздел / исполнитель проекта** — `AssigneeDialog` в `WorkspaceExplorer.jsx` (radio, single-select).
- **Права workspace** — `frontend/src/features/workspace/workspacePermissions.js` / backend `authz.py`.
- **Список назначаемых пользователей** — `GET /api/orgs/{id}/assignable-users`.
- **Список сессий проекта** — `GET /api/projects/{id}/explorer`.
- **Frontend helpers** — `explorerAssigneeModel.js` (`formatExplorerUserDisplay`, `filterExplorerAssignableUsers`).

## Границы

### В scope
- Таблица `session_assignees`, миграция Alembic (`033`) + bootstrap в `storage._ensure_schema`.
- Сервисный слой `AssignmentService` (`replace` / `list`) + доменное событие `SessionAssigneesChanged`.
- API `GET /api/sessions/{id}/assignees` и `PUT /api/sessions/{id}/assignees` (idempotent replace).
- UI: пункт меню «Назначить исполнителя»/«Изменить исполнителей», модалка мультивыбора, колонка в списке сессий проекта.
- Инвалидация кэшей сессий и explorer.

### Out of scope (backlog)
- Уведомления исполнителям.
- Фильтры/поиск по ответственному.
- Массовое назначение.
- История смен.
- Наследование с проекта.
- Назначение из меню на странице сессии — согласовано в ответах на открытые вопросы, но вынесено в follow-up, т.к. требует отдельного плинтуса в `ProcessStage.jsx`.

## Ответы на открытые вопросы (approve)
1. **Assignees в `GET /api/sessions/{id}`?** — только в списках проекта + отдельный endpoint. Назначение также должно быть доступно из меню «...» на странице самой сессии (реализуется отдельно).
2. **platform_admin без членства в орг?** — да, как у folder/project.
3. **Колонка в ExplorerPane?** — только в `ProjectPane`.

## План реализации (фактический)

### 1. Данные и миграция
- `backend/alembic/versions/033_session_assignees.py` — `CREATE TABLE session_assignees`.
- `backend/app/domains/storage/compat/repository.py` — `_ensure_schema`.
- `backend/app/domains/storage/canvas_session/repository.py` — `_load_session_assignees`, `_replace_session_assignees`, обогащение read paths.
- `backend/app/routers/explorer.py` — `SessionItem.assignees`.

### 2. Сервисный слой
- `backend/app/services/session_assignment_service.py` — `list_assignees`, `replace_assignees`.
- `backend/app/services/session_events.py` — `SessionAssigneesChanged`.
- Проверка прав: `is_admin` OR `org_admin` OR `project.owner_user_id` OR `project.executor_user_id`.

### 3. API
- `backend/app/routers/sessions.py` — `GET`/`PUT /api/sessions/{session_id}/assignees`.
- `backend/app/schemas/legacy_api.py` — `SessionAssigneeOut`, `SessionAssigneesReplaceIn`.

### 4. Frontend
- `frontend/src/lib/apiRoutes.js` — `sessions.assignees`.
- `frontend/src/lib/api.js` — `apiGetSessionAssignees`, `apiReplaceSessionAssignees`.
- `frontend/src/features/workspace/workspacePermissions.js` — `canAssignSessionAssignees`.
- `frontend/src/features/explorer/explorerAssigneeModel.js` — helpers для many-to-many session assignees.
- `frontend/src/features/explorer/WorkspaceExplorer.jsx` — `SessionAssigneesDialog`, `SessionAssigneesCell`, `SessionRow`/`ProjectPane` интеграция.

### 5. OpenAPI
- `scripts/dump_openapi.py --out docs/openapi.yaml` + `npx @redocly/cli lint docs/openapi.yaml`.

### 6. Тесты
- Backend: `backend/tests/test_session_assignees.py`.
- Frontend: `frontend/src/features/explorer/explorerAssigneeModel.test.mjs`, `frontend/src/lib/api.sessionAssignees.test.mjs`, `frontend/src/features/explorer/workspaceSessionAssignees.source.test.mjs`.

## Критерии приёмки
- [x] `PUT /api/sessions/{id}/assignees` заменяет список; `GET` возвращает актуальный список.
- [x] Назначать могут `admin` / `org_admin` / владелец проекта / исполнитель проекта; остальные — 403.
- [x] Назначение пользователя вне орг — 422.
- [x] В списке сессий проекта отображаются назначенные (имена/инициалы), при >2 — «+N».
- [x] Пустой `PUT` снимает всех исполнителей.
- [x] Backend-тесты проходят.
- [x] Frontend-тесты контура проходят.
- [x] `docs/openapi.yaml` актуален и проходит lint.
- [ ] PR reviewed и merged по отдельному approve.
