# Solution Plan — комплексная доработка админки ProcessMap

**Contour:** `feat/admin-redesign-v1`  
**Target:** `main` → stage (`clearvestnic.ru:5177`) → prod  
**Approach:** 4 фазы, checkpoint после каждой; no deploy без явного approve.

## Общие принципы

1. **Compact-стиль:** меньше padding, меньше font-size, плотные таблицы, inline-формы, `text-xs`/`text-[11px]` для меток. Выровнять Invites/Organizations/Git Mirror/System по уже обновлённому Users tab (`feature/user-access-redesign`).
2. **Shared UI primitives / reuse:**
   - Переиспользовать `AvatarInitials`, `PermissionMatrix` (уже есть в `frontend/src/features/admin/components/users/`).
   - `AdminCompactTable` — `<table>` с уменьшенными ячейками, sticky header.
   - `AdminUnderlineTabs` — улучшить существующий `AdminTabs` (уже underline-стиль, доработать compact-вариант).
   - `AdminExpandableRow` — строка таблицы с раскрывающейся деталью.
   - `AdminInlineForm` — компактная форма внутри таблицы/карточки.
   - `StatusPill` — дополнить варианты для git-mirror states.
3. **Server-state caching:** добавляем `@tanstack/react-query` (выбран за зрелость, devtools, staleTime, cacheTime, invalidation).
4. **No broad refactor:** не трогаем остальные модули за пределами admin + authz.
5. **Backward-compatible:** новые group-based permissions добавляем рядом с role-based, не удаляем старые до миграции.

## Фаза 1 — Кеширование (фундамент)

**Цель:** данные не перезагружаются при переключении табов; stale time 5 мин.

**Файлы:**
- `frontend/package.json` — добавить `@tanstack/react-query`.
- `frontend/src/features/admin/providers/AdminQueryProvider.jsx` — `QueryClient` с `staleTime: 5 * 60 * 1000`.
- `frontend/src/features/admin/hooks/useAdminQuery.js` — обёртка `useQuery` для admin endpoints.
- `frontend/src/features/admin/hooks/useAdminMutation.js` — обёртка `useMutation` с `invalidateQueries`.
- `frontend/src/features/admin/hooks/useAdminDataQuery.js` — либо deprecated-обёртка, либо рефактор.
- `frontend/src/features/admin/AdminApp.jsx` / `AdminShell.jsx` — обернуть админку в `AdminQueryProvider`.
- `frontend/src/features/admin/api/adminApi.js`, `adminOrgsApi.js` — добавить `queryKeys`.

**Изменяемые компоненты:**
- `AdminOrgInvitesPanel` — использовать `useAdminQuery(['invites', orgId])`.
- `AdminGitMirrorPanel` — `useAdminQuery(['gitMirror', orgId])`.
- `AdminSystemPanel` — `useAdminQuery(['systemDashboard'])`.
- `AdminPermissionsPanel` — `useAdminQuery(['permissions'])`, `(['permissionEntities', entityType])`.
- `AdminOrgsPanel` — `useAdminQuery(['orgs'])` (payload уже приходит сверху, но detail-организацию можно кешировать).

**Checkpoint 1:**
- [ ] `npm run build` проходит.
- [ ] Переключение табов не вызывает сетевых запросов (видно в DevTools / console) в течение 5 мин.
- [ ] Создание/редактирование инвайта/орги инвалидирует соответствующие query-ключи.

## Фаза 2 — Редизайн 4 табов

### 2.1 Invites

**Изменения:**
- `AdminOrgInvitesPanel` → `AdminInvitesPanel`.
- Inline-add form в шапке таблицы (email, роль, TTL, права — компактно).
- Dense table: `py-1.5`, `px-2`, `text-xs`.
- Permissions — переиспользовать существующий `PermissionMatrix` (6 флагов) при раскрытии строки (expandable row), без отдельного блока.
- Статусы — `StatusPill` compact.
- История инвайтов показывается сразу (не скрыта за кнопкой), с пагинацией если >20.

**Новые/обновляемые файлы:**
- `frontend/src/features/admin/components/invites/AdminInvitesPanel.jsx`
- `frontend/src/features/admin/components/invites/InviteInlineForm.jsx`
- `frontend/src/features/admin/components/invites/InvitesTable.jsx`
- удалить/депрекировать `AdminOrgInvitesPanel.jsx`.

### 2.2 Organizations

**Изменения:**
- `AdminOrgsPanel` — dense table, без правой detail-панели.
- Expandable row: при клике на строку раскрывается detail с underline tabs:
  - Details (название, ID, счётчики)
  - Members (список участников)
  - Git mirror (краткая сводка + ссылка на таб)
  - Settings / Danger zone
- Inline создание организации — либо первая строка таблицы, либо кнопка над таблицей.

**Новые/обновляемые файлы:**
- `frontend/src/features/admin/components/orgs/AdminOrgsPanel.jsx`
- `frontend/src/features/admin/components/orgs/OrgsTable.jsx`
- `frontend/src/features/admin/components/orgs/OrgDetailTabs.jsx`
- `frontend/src/features/admin/components/orgs/OrgInlineCreate.jsx`

### 2.3 Git Mirror

**Изменения:**
- Dense table: список попыток публикации (state, session, version, time, error).
- Status badges: `unknown` / `valid` / `invalid` / `synced` / `failed`.
- Expandable row: detail с логом/ошибкой и compact-формой настроек.
- Основная форма настроек остаётся, но в compact-стиле.

**Новые/обновляемые файлы:**
- `frontend/src/features/admin/components/gitMirror/AdminGitMirrorPanel.jsx`
- `frontend/src/features/admin/components/gitMirror/GitMirrorTable.jsx`
- `frontend/src/features/admin/components/gitMirror/GitMirrorDetailForm.jsx`
- Backend: возможно, endpoint для истории публикаций (если нет) — `/api/orgs/{org_id}/git-mirror/logs`.

### 2.4 System

**Изменения:**
- Underline tabs: Notes | Logs | Settings | Maintenance.
- Notes — compact markdown/текстовый блок.
- Logs — dense table recent audit/error events.
- Settings — compact forms (LLM, RAG, Feature flags).
- Maintenance — health checks, restart/cleanup actions (кнопки с подтверждением).
- Переиспользовать существующие dashboard-виджеты, но обернуть в compact cards / tables.

**Новые/обновляемые файлы:**
- `frontend/src/features/admin/components/system/AdminSystemPanel.jsx`
- `frontend/src/features/admin/components/system/SystemNotesTab.jsx`
- `frontend/src/features/admin/components/system/SystemLogsTab.jsx`
- `frontend/src/features/admin/components/system/SystemSettingsTab.jsx`
- `frontend/src/features/admin/components/system/SystemMaintenanceTab.jsx`

**Checkpoint 2:**
- [ ] Все 4 таба отображаются в едином compact-стиле.
- [ ] `npm run build` проходит.
- [ ] Существующие usability-тесты (`AdminOrgsPanel.usability.test.mjs`, `AdminOrgInvitesPanel.usability.test.mjs`, `AdminSystemPanel.usability.test.mjs`) проходят или обновлены.
- [ ] Визуальная проверка на stage.

## Фаза 3 — Группы

### Backend

**DB schema additions (`backend/app/storage.py`):**
```sql
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

CREATE TABLE IF NOT EXISTS group_memberships (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**API (`backend/app/routers/admin.py`):**
- `GET /api/admin/groups?org_id={id}` — список групп с members count.
- `POST /api/admin/groups` — создание группы.
- `PATCH /api/admin/groups/{group_id}` — переименование.
- `DELETE /api/admin/groups/{group_id}` — удаление.
- `GET /api/admin/groups/{group_id}/members` — участники.
- `POST /api/admin/groups/{group_id}/members` — добавить пользователя.
- `DELETE /api/admin/groups/{group_id}/members/{user_id}` — удалить пользователя.

**Authz update (`backend/app/utils/authz.py`):**
- Вспомогательная функция `user_group_ids(user_id, org_id)`.
- При оценке прав на объект сначала проверяются личные role-based grants, затем групповые.

### Frontend

**Новые компоненты:**
- `frontend/src/features/admin/components/groups/AdminGroupsPanel.jsx`
- `frontend/src/features/admin/components/groups/GroupsTable.jsx`
- `frontend/src/features/admin/components/groups/GroupMembersPanel.jsx`
- `frontend/src/features/admin/components/groups/AddGroupMemberDialog.jsx`

**Профиль пользователя:**
- `frontend/src/features/admin/components/users/UserDrawer.jsx` — отображать группы пользователя.
- `frontend/src/features/admin/components/users/UsersTable.jsx` — колонка Groups (badges).

**API module:**
- `frontend/src/features/admin/api/adminGroupsApi.js`.

**Checkpoint 3:**
- [ ] Группы создаются, переименовываются, удаляются.
- [ ] Пользователей можно добавлять/удалять из группы.
- [ ] Группы отображаются в профиле/таблице пользователей.
- [ ] Backend unit-тесты на CRUD групп.
- [ ] `npm run build` проходит.

## Фаза 4 — Permissions-матрица

### Backend

**Расширение модели:**
- Вариант A (минимальный): использовать существующую `admin_entity_permissions`, но добавить поле `principal_type` (`role` | `user` | `group`) и `principal_id`.
- Вариант B (чистый): новая таблица `entity_permissions` с колонками `principal_type`, `principal_id`, `entity_type`, `entity_id`, `permissions`.

**Рекомендуется Вариант A с nullable `principal_type` default `'role'`** для backward compatibility.

**API (`backend/app/routers/admin.py`):**
- `GET /api/admin/permissions/matrix?org_id={id}` — principals (users + groups) × entities с merged permissions.
- `PATCH /api/admin/permissions/matrix` — inline edit single cell.
- `POST /api/admin/permissions/matrix/bulk` — bulk actions (set/unset для выбранных principal × entity).
- `GET /api/admin/permissions/principals?org_id={id}` — список users + groups.
- `GET /api/admin/permissions/objects?org_id={id}&type={type}` — объекты для матрицы.

**Authz:**
- Обновить `is_role_allowed` / `scope_allowed_project_ids` для учёта group-based grants.

### Frontend

**Компоненты:**
- `frontend/src/features/admin/components/permissions/AdminPermissionsMatrix.jsx`
  - Режимы simplified/advanced (toggle).
  - Rows: users + groups; columns: objects (sessions, folders, workspaces, analytics) или наоборот (toggle orientation).
  - Inline editing ячеек (checkbox/select).
  - Bulk actions: выделить несколько ячеек → применить право.
  - Переиспользовать `PermissionMatrix` для редактирования флагов в ячейке.
- `frontend/src/features/admin/components/permissions/AdminPermissionsPanel.jsx` — заменить текущую реализацию или добавить таб Matrix v2.

**API module:**
- `frontend/src/features/admin/api/adminPermissionsApi.js` — новые методы matrix.

**Checkpoint 4 / Final:**
- [ ] Матрица отображает users/groups × objects.
- [ ] Inline edit сохраняется.
- [ ] Bulk actions работают.
- [ ] Simplified/advanced toggle влияет на набор видимых прав.
- [ ] Authz unit-тесты проходят.
- [ ] `npm run build` проходит.
- [ ] Stage verify: все сценарии работают.

## Verification matrix

| Критерий | Как проверить |
|----------|---------------|
| Кеширование 5 мин | Переключить табы, убедиться что повторных запросов нет; подождать 5 мин, убедиться что обновился. |
| Compact UI | Визуальная проверка 4 табов на stage. |
| Invites inline add | Создать инвайт из таблицы, увидеть его в списке. |
| Organizations expandable | Кликнуть строку организации — раскрыть detail tabs. |
| Git Mirror status badges | Проверить цвета badge для valid/invalid/failed. |
| System underline tabs | Переключить Notes/Logs/Settings/Maintenance. |
| Groups CRUD | Создать группу, добавить пользователя, удалить группу. |
| Groups in profile | Открыть пользователя, увидеть его группы. |
| Permissions matrix | Изменить право в ячейке, bulk action, simplified/advanced toggle. |
| No regression | Запустить существующие admin-тесты, `npm run build`. |

## Rollback

- Все изменения frontend-only (кроме фаз 3–4) — revert коммита.
- Фазы 3–4 требуют DB-migration; rollback через revert + ручное удаление таблиц `groups`, `group_memberships` (если не продуктив).
- No env/secrets changes.
