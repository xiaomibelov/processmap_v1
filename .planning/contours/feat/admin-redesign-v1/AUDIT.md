# Аудит админки ProcessMap — `feat/admin-redesign-v1`

**Branch:** `main` (новый контур)  
**Stage URL:** `http://clearvestnic.ru:5177`  
**Аудит выполнен:** 2026-06-30  

## Runtime/source truth

```
pwd: /opt/processmap-test
HEAD: 5ccbeb6875403c8132b40f308381866a11d993bb
origin/main: 5ccbeb6875403c8132b40f308381866a11d993bb
branch: main
status: clean except unrelated untracked .planning/feature/fix contours
```

## Scope

Доработка 4 табов админ-страницы организаций (`/admin/orgs`):
- Invites
- Organizations
- Git Mirror
- System

а также фундаментальные изменения:
- кеширование данных при переключении табов;
- группы пользователей (backend + frontend);
- переработка permissions-матрицы с учётом групп.

## RAG Preflight

- Инструмент `tools/rag/pm-rag-agent-preflight.mjs` **доступен** и работает при запуске из repo root (`/opt/processmap-test`).
- Первый неудачный запуск был вызван тем, что команда выполнялась с `cwd=/root`; tool резолвит `tools/rag/facts` относительно `cwd()`.
- Сгенерирован `RAG_PREFLIGHT.md` в этом контуре.
- Ключевой prior art:
  - `feature/user-access-redesign` (REVIEW_PASS, вмержен) — уже содержит обновлённый Users tab (`UserDrawer`, `UsersTable`, `PermissionMatrix`, `AvatarInitials`) и `org_memberships.permissions_json`.
  - `docs/audit_admin_users_membership_storage_profile_fields_v1.md` — рекомендует разделить overloaded страницу `Организации` и добавить durable user profile truth.
  - Stale runtime fact `current_git_branch: fix/lockfile-sync-test` игнорируем; текущий baseline — `main`.

## Текущее состояние UI

### 0. Users tab (`AdminUsersPanel.jsx`)

**Что есть (уже вмержено из `feature/user-access-redesign`):**
- `UsersTable`, `UserFilters`, `UserDrawer`, `AvatarInitials`, `PermissionMatrix`.
- Drawer-based создание/редактирование пользователя.
- Client-side фильтрация и поиск.
- `org_memberships.permissions_json` хранит 6 флагов (view/create/edit/export/delete/manage_users).

**Статус:** этот таб не входит в текущий редизайн, но служит эталоном compact-стиля для остальных.

### 1. Invites (`AdminOrgInvitesPanel.jsx`)

**Что есть:**
- Inline-форма создания инвайта (email, имя, должность, роль, TTL, права).
- История инвайтов в `<table>` со статусами, кнопками «Перевыпустить / Права / Отозвать».
- Inline-редактор прав через `AdminInvitePermissionEditor`.
- Копирование ключа/ссылки.

**Проблемы:**
- Таблица визуально «разреженная»: много пустого пространства, большие ячейки, не компактная.
- Форма и история смешаны в одном `SectionCard`.
- Нет явного inline-add в таблице; форма всегда открыта сверху.
- Права отображаются сводкой, редактируются в отдельном блоке — не интуитивно.

### 2. Organizations (`AdminOrgsPanel.jsx` + `AdminOrgDetailPanel.jsx`)

**Что есть:**
- Список организаций в `OrgsTable`.
- Карточка создания организации.
- Detail-панель справа: название, счётчики, форма редактирования названия.

**Проблемы:**
- Detail-панель статичная; нет expandable row.
- Нет вкладок внутри detail (Members / Settings / Danger zone и т.п.).
- Список и детали занимают много вертикального места.

### 3. Git Mirror (`AdminGitMirrorPanel.jsx`)

**Что есть:**
- Форма настроек (enabled, provider, repo, branch, base path).
- Блок состояния (health status, сообщение).
- Кнопки «Сохранить / Проверить».

**Проблемы:**
- Нет таблицы истории публикаций / статусов.
- Нет expandable detail с логами.
- UI не в едином compact-стиле с остальными табами.

### 4. System (`AdminSystemPanel.jsx`)

**Что есть:**
- Внутренние табы: Notes, Runtime, Audit, Feature flags.
- Виджеты Redis health, Jobs throughput, Recent audit, Feature flags.

**Проблемы:**
- Табы называются Runtime/Audit/Flags, а требуются Notes | Logs | Settings | Maintenance.
- Виджеты используют разную плотность; нет единой dense table.
- Нет compact-форм для настроек.

### 5. Permissions (`AdminPermissionsPanel.jsx`)

**Что есть:**
- Табы Matrix / Sessions / Folders / Workspaces / Analytics.
- Matrix: entity type × roles, inline toggle права.
- Entity overrides: expandable row с редактированием per role.

**Проблемы:**
- Матрица построена по ролям, а не по пользователям/группам.
- Нет групп.
- Нет bulk actions.
- Нет simplified/advanced toggle.

## Текущее состояние кеширования

- Все админ-данные грузятся через кастомный хук `useAdminDataQuery` (`frontend/src/features/admin/hooks/useAdminDataQuery.js`).
- Хук не имеет кеша: каждый `useEffect` срабатывает при `reloadCount`/deps; при переключении табов компонент размонтируется и данные запрашиваются заново.
- `loadInvites` в `AdminOrgInvitesPanel` вызывается в `useEffect` при монтировании — при возврате на таб инвайтов происходит повторная загрузка.
- `AdminSystemPanel` загружает dashboard при каждом монтировании.
- Нет централизованного `QueryClient` / SWR / Zustand.

## Backend: groups / permissions

- БД SQLite (`backend/app/storage.py`).
- Основные таблицы: `orgs`, `org_memberships`, `org_invites`, `admin_entity_permissions`.
- Групп нет; права хранятся либо в `admin_entity_permissions` (role × entity), либо в `org_invites.permissions`.
- Authz: `backend/app/utils/authz.py` — проверяет роль пользователя и project scope; группы не учитываются.
- API админки в `backend/app/routers/admin.py`: `/api/admin/permissions/*`, `/api/admin/invites/*`, `/api/admin/orgs`, `/api/admin/users`.
- Git mirror API в `backend/app/routers/org.py`: `/api/orgs/{org_id}/git-mirror`.

## Key findings / gaps

1. **Кеширование отсутствует** — UX табов страдает, растёт нагрузка на API.
2. **UI не в едином compact-стиле** — разная плотность; Invites/Organizations/Git Mirror/System отстают от уже обновлённого Users tab.
3. **Invites / Organizations / Git Mirror / System** не соответствуют описанному редизайну.
4. **Групп нет** — ни схемы, ни API, ни UI.
5. **Permissions matrix (`AdminPermissionsPanel`) ориентирована на роли**, а не на пользователей/группы × объекты.
6. **Нет dependency для server-state caching** — нужно добавить `@tanstack/react-query` (или SWR/Zustand).

## Risks

- Добавление групп затрагивает authz — нужно аккуратно обновлять проверки прав, не сломав existing flows.
- Переработка permissions matrix — breaking change для API/DB; нужна миграция или backward-compatible слой.
- UI-редизайн касается многих существующих тестов (`AdminOrgsPanel.usability.test.mjs`, `AdminOrgInvitesPanel.usability.test.mjs`, `AdminSystemPanel.usability.test.mjs`) — их придётся обновлять.
- Scope большой; рекомендуется разбить на 4 фазы с checkpoint между ними.
