# Enterprise Fact-Pack (AS-IS)

Обновлено: 2026-03-03  
Репозиторий: `foodproc_process_copilot`  
Branch: `feat/bpmnstage-decompose-imperative-api-v1`  
HEAD: `9705c27`

## 1) Auth / Identity (как устроено сейчас)

### Backend auth pipeline
- Middleware guard включен для всех `/api/*`, кроме public-путей (`backend/app/main.py:59-62`, `backend/app/main.py:1654-1678`).
- Public auth endpoints:
  - `POST /api/auth/login` (`backend/app/main.py:2184`)
  - `POST /api/auth/refresh` (`backend/app/main.py:2206`)
  - `POST /api/auth/logout` (`backend/app/main.py:2235`)
- Проверка текущего пользователя:
  - `GET /api/auth/me` (`backend/app/main.py:2245`)
- Токены:
  - Access token (JWT HS256), refresh token rotation (`backend/app/auth.py`).
  - Refresh хранится в httpOnly cookie.
- User-модель:
  - `User { id, email, password_hash, is_active, is_admin, created_at }` (`backend/app/models.py:134-140`).
  - Отдельной модели орг-ролей/членств нет.

### Frontend auth
- Access token хранится в `localStorage` (`fpc_auth_access_token`) (`frontend/src/lib/api.js:10,22,145-146`).
- Boot-flow:
  - сначала `apiAuthMe()`, затем fallback `apiAuthRefresh()` (`frontend/src/features/auth/AuthProvider.jsx`).
- Роутинг после логина: бинарный `isAuthed -> /app`, иначе `/` или `/login` (`frontend/src/RootApp.jsx`).

## 2) Domain (Project/Session/Reports/Artifacts) и ownership

### Project
- Модель:
  - `Project { id, title, passport, created_at, updated_at, version, owner_user_id }` (`backend/app/models.py:100-116`).
- Endpoints:
  - list/create/get/patch/put/delete (`backend/app/main.py:4403-4454`, `2501`).

### Session
- Модель:
  - `Session { ... project_id, mode, bpmn_xml, bpmn_meta, owner_user_id, created_at, updated_at }` (`backend/app/models.py:68-95`).
- Endpoints:
  - create/list/get/patch/delete/put (`backend/app/main.py:2260, 2382, 2389, 2408, 2524, 2536`).
  - project-scoped list/create (`backend/app/main.py:2304, 2341`).

### Reports
- Endpoints:
  - create/list/detail/delete версий отчёта (`backend/app/main.py:3030-3203`).
- Отчёты хранятся внутри session interview/path report структуры (по API/тестам).

### Ownership enforcement (фактический)
- В storage используется request scope через context vars:
  - `_REQ_USER_ID`, `_REQ_IS_ADMIN` (`backend/app/storage.py:16-17`).
  - guard кладёт user scope в storage (`backend/app/main.py:1662, 1671`).
- SQL фильтрация:
  - owner clause: `owner_user_id = ?` для non-admin (`backend/app/storage.py:140-143`).
  - `ProjectStorage.list/load/delete` и `Storage.list/load/delete` учитывают owner/admin (`backend/app/storage.py:589+, 671+, 685+, 744+`).

## 3) Storage (данные и артефакты)

### Основное хранилище
- SQLite:
  - `projects` и `sessions` таблицы с `owner_user_id` (`backend/app/storage.py:146-210`).
  - путь по env: `PROCESS_DB_PATH` или `PROCESS_STORAGE_DIR/processmap.sqlite3` (`backend/app/storage.py:58-71`).
- Auth storage отдельно:
  - `workspace/.session_store/_auth_users.json`
  - `workspace/.session_store/_auth_refresh_tokens.json`
  - (`backend/app/auth.py`, `AuthStore`).

### Экспорт/артефакты
- Экспорт пишет файловый пакет в `PROCESS_WORKSPACE` (`workspace/processes` по умолчанию):
  - `process.yml`, `process.bpmn`, sidecar `session_<id>.bpmnmeta.json`, zip (`backend/app/main.py:4307-4385`).
- Доступ к экспорту через session endpoint; отдельной ACL на файловом уровне нет.

### Риск “чужое по id/пути”
- Серверная фильтрация по owner/admin есть на уровне storage.
- Дополнительной tenant-изоляции по `org_id/workspace_id` сейчас нет (только owner scope).

## 4) UI (роутинг после логина и проверка прав)

- После логина пользователь попадает на `/app` (нет экрана выбора org/workspace) (`frontend/src/RootApp.jsx`).
- В UI нет ролевой матрицы для проектов/сессий; кнопки rename/delete доступны по выбранным сущностям (`frontend/src/components/TopBar.jsx`).
- `is_admin` во frontend только нормализуется в `apiAuthMe`, отдельного admin UI по коду не найдено (`frontend/src/lib/api.js:445`).
- В `App.jsx` есть local persistence:
  - `fpc_bpmn_meta_v1:<sessionId>` (`frontend/src/App.jsx:338, 366-531`).
  - Сервер + local meta смешиваются при `sessionToDraft` (`frontend/src/App.jsx:582+`).

## 5) Admin (что уже есть)

- Есть только флаг `is_admin` в user token/model.
- Нет отдельных сущностей/эндпоинтов:
  - `organizations`
  - `workspaces`
  - `memberships`
  - `invites`
  - `audit_logs`
- Нет admin панели на frontend (по текущему дереву `frontend/src`).

## Риски и неизвестные

1. Нет tenant-уровня (org/workspace), только owner-based scope.
2. Нет централизованного audit trail (кто/когда/что изменил по проектам и сессиям).
3. Auth users/refresh tokens живут в JSON-файлах, а не в той же БД.
4. В UI есть localStorage-слой для BPMN meta, что может давать расхождения с серверным состоянием.
5. Не зафиксированы юридические требования по retention/immutability аудита и invite lifecycle.
