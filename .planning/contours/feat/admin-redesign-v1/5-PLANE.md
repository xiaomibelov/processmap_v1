# 5-plane proof — `feat/admin-redesign-v1`

## 1. Code

- **Repo:** `/opt/processmap-test`
- **Remote:** `https://github.com/xiaomibelov/processmap_v1.git`
- **Baseline:** `main @ 5ccbeb6875403c8132b40f308381866a11d993bb` (= `origin/main`)
- **Контур:** `.planning/contours/feat/admin-redesign-v1/`
- **Затрагиваемые frontend-файлы (предварительно):**
  - `frontend/src/features/admin/pages/AdminOrgsPage.jsx`
  - `frontend/src/features/admin/components/orgs/AdminOrgsPanel.jsx`
  - `frontend/src/features/admin/components/orgs/AdminOrgInvitesPanel.jsx`
  - `frontend/src/features/admin/components/orgs/AdminOrgDetailPanel.jsx`
  - `frontend/src/features/admin/components/orgs/OrgsTable.jsx`
  - `frontend/src/features/admin/components/gitMirror/AdminGitMirrorPanel.jsx`
  - `frontend/src/features/admin/components/system/AdminSystemPanel.jsx`
  - `frontend/src/features/admin/components/permissions/AdminPermissionsPanel.jsx`
  - `frontend/src/features/admin/hooks/useAdminDataQuery.js`
  - `frontend/src/features/admin/api/*`
  - `frontend/src/lib/api.js`, `frontend/src/lib/apiModules/adminApi.js`, `frontend/src/lib/apiModules/orgApi.js`
- **Затрагиваемые backend-файлы (предварительно):**
  - `backend/app/storage.py` — новые таблицы `groups`, `group_memberships`, возможно `group_entity_permissions`.
  - `backend/app/routers/admin.py` — CRUD групп, permissions matrix API.
  - `backend/app/utils/authz.py` — учёт групп в проверках.
  - `backend/app/_legacy_main.py` / `backend/app/services/org_service.py` — если нужно.

## 2. Workspace

- Рабочая директория: `/opt/processmap-test`.
- `git status` показывает только unrelated untracked `.planning/...` контуры; нет незакоммиченных изменений в product code.
- Контур изолирован в `.planning/contours/feat/admin-redesign-v1/`.
- Разработка будет в отдельной ветке от `origin/main` (per AGENTS.md §2).

## 3. DB

- **Engine:** SQLite (`backend/app/storage.py`).
- **Путь:** `<base_dir>/processmap.sqlite3`.
- **Существующие relevant таблицы:**
  - `orgs` — организации, включая git-mirror колонки.
  - `org_memberships` — пользователь ↔ организация + роль.
  - `org_invites` — инвайты, колонка `permissions` (JSON).
  - `admin_entity_permissions` — role × entity_type × entity_id × permissions (JSON).
- **Необходимые additions:**
  - `groups` (`id`, `org_id`, `name`, `created_at`).
  - `group_memberships` (`group_id`, `user_id`, `created_at`).
  - (опционально) `group_entity_permissions` для group-based overrides.

## 4. Env / compose

- **Stage compose:** `docker-compose.stage.yml`.
- **Stage host:** `clearvestnic.ru:5177`.
- **Deploy:** GitHub Actions `Deploy to Stage`.
- **Локальная разработка:** `npm run dev` (vite) + `docker compose up` для api/postgres/redis.
- Перед локальным тестированием групп/permissions потребуется миграция схемы SQLite (авто-`_ensure_schema` при старте backend).

## 5. Serving mode

- **Stage target:** `clearvestnic.ru:5177`.
- **No deploy without user approve** (per task instructions & AGENTS.md §7).
- **Flow:** branch → push → PR → user approval → merge → auto-deploy stage → manual verify.
- После каждой фазы — checkpoint; deploy только после завершения всех фаз и финального approve.
