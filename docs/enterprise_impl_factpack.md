# Enterprise Implementation Fact-Pack

Дата: 2026-03-03  
Репозиторий: `foodproc_process_copilot`  
Branch: `feat/bpmnstage-decompose-imperative-api-v1`  
HEAD: `9705c27`

## A) AS-IS точки (с line ranges)

## A1. Контекст хранилища и auth

### SQLite path + schema lifecycle
- DB path resolution: `backend/app/storage.py:68-74` (`_db_path`)
  - `PROCESS_DB_PATH` приоритетно
  - fallback: `PROCESS_STORAGE_DIR/processmap.sqlite3`
- DB connection: `backend/app/storage.py:77-80` (`_connect`)
- Schema init (create tables/indexes): `backend/app/storage.py:146-213` (`_ensure_schema`)
- Legacy JSON -> SQLite migration: `backend/app/storage.py:241-335` (`_maybe_migrate_legacy_files`)

### Auth store location (users/refresh)
- Auth store class + files:
  - `backend/app/auth.py:32-44` (`AuthStore.users_path`, `AuthStore.refresh_path`)
  - `_auth_users.json`
  - `_auth_refresh_tokens.json`
- Auth store base dir: `backend/app/auth.py:221-227` (`_storage_dir`, `get_auth_store`)
  - использует `PROCESS_STORAGE_DIR`

### Guard `/api/*`
- Public auth paths: `backend/app/main.py:59-63` (`AUTH_PUBLIC_PATHS`)
- HTTP middleware guard: `backend/app/main.py:1653-1678` (`auth_guard_middleware`)
  - проверяет bearer
  - кладёт request scope через `push_storage_request_scope(user_id, is_admin)`

## A2. Storage scoping (owner/admin)

### Scope primitives
- Context scope vars: `backend/app/storage.py:16-17`
- Push/pop scope: `backend/app/storage.py:29-46`
- Owner filter clause: `backend/app/storage.py:140-143` (`_owner_clause`)

### Session storage methods
- `Storage.load`: `backend/app/storage.py:441-457`
- `Storage.save`: `backend/app/storage.py:458-551`
- `Storage.delete`: `backend/app/storage.py:553-567`
- `Storage.list`: `backend/app/storage.py:580-625`
  - owner filter в list: `backend/app/storage.py:602-604`

### Project storage methods
- `ProjectStorage.list`: `backend/app/storage.py:671-683`
- `ProjectStorage.load`: `backend/app/storage.py:685-700`
- `ProjectStorage.save`: `backend/app/storage.py:702-743`
- `ProjectStorage.delete`: `backend/app/storage.py:744-758`

## A3. CRUD endpoints (projects/sessions/reports/export)

### Projects
- `GET /api/projects` -> `list_projects`: `backend/app/main.py:4403-4407`
- `POST /api/projects` -> `create_project`: `backend/app/main.py:4410-4417`
- `GET /api/projects/{project_id}` -> `get_project`: `backend/app/main.py:4420-4426`
- `PATCH /api/projects/{project_id}` -> `patch_project`: `backend/app/main.py:4429-4451`
- `PUT /api/projects/{project_id}` -> `put_project`: `backend/app/main.py:4454-4470`
- `DELETE /api/projects/{project_id}` -> `delete_project_api`: `backend/app/main.py:2501-2522`

### Sessions
- `POST /api/sessions` -> `create_session`: `backend/app/main.py:2260-2299`
- `GET /api/projects/{project_id}/sessions` -> `list_project_sessions`: `backend/app/main.py:2304-2340`
- `POST /api/projects/{project_id}/sessions` -> `create_project_session`: `backend/app/main.py:2341-2381`
- `GET /api/sessions` -> `list_sessions`: `backend/app/main.py:2382-2386`
- `GET /api/sessions/{session_id}` -> `get_session`: `backend/app/main.py:2389-2395`
- `PATCH /api/sessions/{session_id}` -> `patch_session`: `backend/app/main.py:2408-2498`
- `PUT /api/sessions/{session_id}` -> `put_session`: `backend/app/main.py:2536-2589`
- `DELETE /api/sessions/{session_id}` -> `delete_session_api`: `backend/app/main.py:2524-2533`

### Reports
- create version:
  - `POST /api/sessions/{session_id}/paths/{path_id}/reports`
  - `POST /api/sessions/{session_id}/path/{path_id}/reports`
  - `backend/app/main.py:3030-3127`
- list versions:
  - `GET /api/sessions/{session_id}/paths/{path_id}/reports`
  - `GET /api/sessions/{session_id}/path/{path_id}/reports`
  - `backend/app/main.py:3130-3154`
- detail:
  - `GET /api/reports/{report_id}`: `backend/app/main.py:3157-3162`
  - scoped detail variants: `backend/app/main.py:3165-3185`
- delete:
  - global `DELETE /api/reports/{report_id}`: `backend/app/main.py:3188-3197`
  - scoped `DELETE /api/sessions/{session_id}/paths/{path_id}/reports/{report_id}`: `backend/app/main.py:3200-3213`

### Export
- `GET /api/sessions/{session_id}/export`: `backend/app/main.py:4307-4352`
- `GET /api/sessions/{session_id}/export.zip`: `backend/app/main.py:4355-4384`
- filesystem destination: `WORKSPACE` from `PROCESS_WORKSPACE` (`backend/app/main.py:1683`, `4315-4316`)

## A4. UI boot/login и точка org-switcher

### Auth boot
- `AuthProvider` boot: `frontend/src/features/auth/AuthProvider.jsx:32-81`
  - `apiAuthMe()` then `apiAuthRefresh()`
- login/logout/refresh methods: `frontend/src/features/auth/AuthProvider.jsx:83-121`

### Router after login
- `AppRoutes`:
  - authed redirect to `/app`: `frontend/src/RootApp.jsx:58-63`
  - unauth `/app` -> `/?next=...`: `frontend/src/RootApp.jsx:66-69`
  - `showWorkspace` gate: `frontend/src/RootApp.jsx:110-116`
  - current place for org-switcher insertion: before rendering `<App />` in `RootApp.jsx:110-116`

### Frontend data boot for projects/sessions
- `App` state base: `frontend/src/App.jsx:955-985`
- initial projects fetch: `frontend/src/App.jsx:1160-1195` (`refreshProjects`)
- sessions fetch per selected project: `frontend/src/App.jsx:1328-1368` (`refreshSessions`)
- open session: `frontend/src/App.jsx:1371-1514` (`openSession`)
- refresh on mount: `frontend/src/App.jsx:3076-3080`
- TopBar project/session selectors (текущая точка расширения до org): `frontend/src/components/TopBar.jsx:232-276`

### API client points
- request core: `frontend/src/lib/api.js:262-388`
- auth me: `frontend/src/lib/api.js:436-447`
- projects API wrappers: `frontend/src/lib/api.js:463-528`
- sessions API wrappers: `frontend/src/lib/api.js:531-649`
- reports API wrappers: `frontend/src/lib/api.js:762-984`
- export wrapper: `frontend/src/lib/api.js:1082-1087`

## B) TO-BE точки (что куда встраивать)

## B1. Schema management
- Встраивание enterprise schema:
  - `backend/app/storage.py:146-213` (`_ensure_schema`)
  - добавить tables: `orgs`, `memberships`, `invites`, `audit_logs`
  - добавить колонки tenancy в `projects/sessions` (`org_id`, `created_by`, `updated_by`, `workspace_id`)
- Backfill hook:
  - `backend/app/storage.py:241-335` (`_maybe_migrate_legacy_files`)
  - добавить backfill `default_org_id(owner_user_id)` для legacy rows

## B2. Storage scoping (owner/admin -> org+policy)
- Scope context расширить в `backend/app/storage.py:16-33`
  - добавить `_REQ_ORG_ID`
  - расширить `push_storage_request_scope(...)`
- Ввести org clause рядом с `_owner_clause` (`backend/app/storage.py:140-143`)
- Применить org-filter в:
  - `Storage.load/save/delete/list` (`441-625`)
  - `ProjectStorage.list/load/save/delete` (`671-758`)

## B3. Guard + default org resolution
- Guard point: `backend/app/main.py:1653-1678`
  - распознавать org context:
    - из `/api/orgs/{org_id}/...`
    - или header `X-Active-Org-Id` для legacy
  - валидировать membership/policy
  - сохранять `request.state.active_org_id`
- Token claim point:
  - `backend/app/auth.py:302-310` (`create_access_token`)
  - `backend/app/auth.py:463-488` (`issue_login_tokens`)
  - добавить `active_org_id` claim (или deterministic fallback) для стабильного контекста

## B4. Router/API dual mode
- New org-scoped endpoints: добавить рядом с текущими в `backend/app/main.py`:
  - projects/sessions/reports/export under `/api/orgs/{org_id}/...`
- Legacy endpoints сохраняются:
  - текущие `/api/projects*`, `/api/sessions*`, `/api/reports*`, `/api/sessions/{sid}/export*`
  - внутри резолвят `default_org_id` и используют тот же service layer

## B5. Frontend org switch and propagation
- Root routing gate:
  - `frontend/src/RootApp.jsx:58-63`, `82-86`, `110-116`
  - вставить org-select step между auth success и `<App />`
- Auth context expansion:
  - `frontend/src/features/auth/AuthProvider.jsx:25-30` and login flow
  - хранить memberships + `activeOrgId`
- API propagation:
  - `frontend/src/lib/api.js:262-388`
  - передавать `X-Active-Org-Id` (legacy mode)
  - и/или использовать org-path builder для new routes
- App data loaders:
  - `frontend/src/App.jsx:1160-1195`, `1328-1368`
  - запускать загрузку проектов/сессий после определения `activeOrgId`

## B6. Error contract convergence
- Проблемный as-is: часть handlers возвращает `{ "error": "not found" }` с 200
  - примеры: `backend/app/main.py:2394`, `2541`, `3161`, `4312`
- Новые org routes:
  - строгие HTTP статусы 401/403/404/422 + единый `error.code/message/details`
- Legacy routes:
  - transitional: сохранять payload-совместимость, но статус отдавать корректный
  - frontend уже умеет нормализовать payload-error через `okOrError` (`frontend/src/lib/api.js:106-133`)

## C) Dual-routing карта

## C1. New route space (enterprise)
- `/api/orgs/{org_id}/projects`
- `/api/orgs/{org_id}/projects/{project_id}`
- `/api/orgs/{org_id}/projects/{project_id}/sessions`
- `/api/orgs/{org_id}/sessions/{session_id}`
- `/api/orgs/{org_id}/sessions/{session_id}/paths/{path_id}/reports`
- `/api/orgs/{org_id}/reports/{report_id}`
- `/api/orgs/{org_id}/sessions/{session_id}/export`
- `/api/orgs/{org_id}/sessions/{session_id}/export.zip`

## C2. Legacy endpoints, которые должны продолжить работать без org-path
- `/api/projects` (GET/POST)
- `/api/projects/{project_id}` (GET/PATCH/PUT/DELETE)
- `/api/projects/{project_id}/sessions` (GET/POST)
- `/api/sessions` (GET/POST)
- `/api/sessions/{session_id}` (GET/PATCH/PUT/DELETE)
- `/api/sessions/{session_id}/paths/{path_id}/reports` (+ `/path/` вариант)
- `/api/reports/{report_id}`
- `/api/sessions/{session_id}/export`
- `/api/sessions/{session_id}/export.zip`

## C3. Где вычислять `default_org_id` и как пробрасывать `active_org_id`

### Backend
1. Login/refresh issuance:
   - `backend/app/main.py:2184-2232` вызывает `issue_login_tokens`
   - `backend/app/auth.py:463-488`, `302-310`
   - точка добавления org claim/fallback
2. Request-time fallback:
   - `backend/app/main.py:1653-1678` middleware
   - если path не содержит org_id: взять `X-Active-Org-Id`, иначе `default_org_id(user_id)`
3. Storage context:
   - расширение `backend/app/storage.py:29-33` push scope до `(user_id, is_admin, active_org_id)`

### Frontend
1. Active org state:
   - `frontend/src/features/auth/AuthProvider.jsx` (context state)
2. Router gate:
   - `frontend/src/RootApp.jsx:110-116`
3. API propagation:
   - `frontend/src/lib/api.js:262-388` (headers/path builder)
4. Data loaders:
   - `frontend/src/App.jsx:1160-1195`, `1328-1368`

## C4. Error contract на новых и legacy путях

| Path type | 401 | 403 | 404 | 422 |
|---|---|---|---|---|
| New org routes | HTTP 401 + `{error:{code:\"unauthorized\"...}}` | HTTP 403 + policy code | HTTP 404 scoped not_found | HTTP 422 validation_error |
| Legacy routes (transition) | HTTP 401 (без 200-wrapping) | HTTP 403 | HTTP 404; при необходимости совместимый `error` payload | HTTP 422 |

Точка frontend-нормализации ошибок:
- `frontend/src/lib/api.js:106-133` (`okOrError`)
- `frontend/src/lib/api.js:262-388` (`request`)

## D) Таблица “что менять” (без реализации)

| Файл | Функция/блок | Что добавить/изменить | Риск/побочки | Как протестировать |
|---|---|---|---|---|
| `backend/app/storage.py` | `_ensure_schema` (`146-213`) | Добавить org/membership/invite/audit таблицы и tenancy-колонки | Миграционные конфликты на существующей sqlite | Integration migration test + проверка schema version |
| `backend/app/storage.py` | `_maybe_migrate_legacy_files` (`241-335`) | Backfill `org_id`, `created_by`, `updated_by` из owner | Неверное сопоставление owner->org | Backfill dry-run + idempotency test |
| `backend/app/storage.py` | Context vars + `push_storage_request_scope` (`16-33`) | Добавить `active_org_id` в request scope | Поломка старых вызовов scope | Unit: push/pop scope backwards compatibility |
| `backend/app/storage.py` | `_owner_clause` (`140-143`) + list/load/save/delete | Ввести org clause + policy gating | Утечки cross-org при неполной замене | Unit scope leakage matrix |
| `backend/app/storage.py` | `Storage.list/load/save/delete` (`441-625`) | Включить org filter на sessions | Потеря видимости legacy данных до backfill | Integration: list/get under org context |
| `backend/app/storage.py` | `ProjectStorage.*` (`671-758`) | Включить org filter на projects | Ошибки delete cascade в mixed org data | Integration: project delete scoped |
| `backend/app/auth.py` | `create_access_token` (`302-310`) | Добавить `active_org_id` claim | Несовместимость decode с existing tokens | Auth unit: old/new token decode |
| `backend/app/auth.py` | `issue_login_tokens` (`463-488`) | Резолв default org при выдаче токена | Неправильный default org для multi-org user | Unit: login picks expected org |
| `backend/app/main.py` | `auth_guard_middleware` (`1653-1678`) | Path/header org resolution + membership check + scope push | 403/404 regressions на legacy endpoints | API integration: auth + policy matrix |
| `backend/app/main.py` | Projects endpoints (`4403-4470`, `2501-2522`) | Добавить org-scoped route handlers поверх shared services | Дубли логики при прямом копировании | Tests for parity new vs legacy |
| `backend/app/main.py` | Sessions endpoints (`2260-2590`) | Org-scoped handlers + legacy default_org mapping | Сбои старого UI при изменении статусов | E2E create/open/delete session |
| `backend/app/main.py` | Reports endpoints (`3030-3213`) | Org-scoped report CRUD + scoped global report lookup | Report id collision across org | Integration: report list/detail/delete scoped |
| `backend/app/main.py` | Export endpoints (`4307-4384`) | Org-aware export access checks | Чтение чужого export по session id | Integration: export 403/404 cross-org |
| `backend/app/main.py` | Error returns (`2394`, `2541`, `3161`, `4312` etc.) | Унифицировать 401/403/404/422 | Ломает клиентов, ожидающих `200 + error` | Contract tests + frontend adapter tests |
| `frontend/src/RootApp.jsx` | `AppRoutes` (`58-63`, `82-86`, `110-116`) | Вставить org-switcher этап после login и до `<App />` | Зацикливание redirect | E2E auth->org select->/app |
| `frontend/src/features/auth/AuthProvider.jsx` | `hydrateUser/login` (`25-30`, `83-95`) | Хранить memberships/activeOrgId в auth context | Race condition boot/refresh | Unit auth context boot sequence |
| `frontend/src/lib/api.js` | `request` (`262-388`) | Проброс `X-Active-Org-Id`, request_id, unified error parsing | Неконсистентный retry/refresh chain | Unit request wrapper with mock fetch |
| `frontend/src/lib/api.js` | project/session/report wrappers (`463-984`) | Добавить org-path builders + legacy fallback | Ошибочная маршрутизация на mixed backend | API contract tests with mocked endpoints |
| `frontend/src/App.jsx` | `refreshProjects/refreshSessions/openSession` (`1160-1514`) | Блокировать загрузку без active org; очищать state при org-switch | Потеря текущего выбора session/project | E2E org switch retains/clears correctly |
| `frontend/src/components/TopBar.jsx` | selects/actions (`232-276`) | Добавить org selector + role-based disable/delete visibility | UX regression topbar layout | E2E viewer/editor button visibility |
| `backend/tests/test_storage_sqlite_scope.py` | scope tests (`45-85`) | Расширить на org + role matrix | Флак из-за env reuse | Isolated temp DB fixtures |
| `frontend/e2e` | auth/report/project flows | Добавить enterprise scenarios (org switch, scoped reports) | Тестовая нестабильность на shared data | Dedicated fixtures per org/user |

## Риски и неизвестные

1. Сейчас auth-store и domain-store разделены (JSON + SQLite); enterprise membership в auth.py потребует явного source-of-truth решения.
2. В текущем backend смешаны `HTTPException` и `return {"error": ...}`; переход на единый contract нужен аккуратно с legacy adapter.
3. В `frontend/src/lib/api.js` есть множественные fallback endpoints для reports; dual-routing может усложнить приоритеты без явной стратегии.
4. В `App.jsx` много логики начальной загрузки на mount; org-switch потребует строгого порядка boot state.
