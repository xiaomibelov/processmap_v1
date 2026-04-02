# Enterprise User Flows (MVP)

## 1) Login -> Org/Workspace -> Projects -> Sessions

1. Пользователь логинится (`/api/auth/login`).
2. Backend возвращает access token + refresh cookie.
3. UI запрашивает `/api/auth/me` и список членств пользователя.
4. Если membership один — автоматически выбирается active org.
5. Если membership несколько — показывается org switcher.
6. После выбора org UI открывает список проектов текущего org.
7. Пользователь выбирает проект -> видит сессии проекта -> открывает сессию.

## 2) Invite -> Role -> Access

1. OrgOwner/OrgAdmin отправляет invite (`email`, `role`, optional `project_scope`).
2. Принимающий пользователь подтверждает инвайт.
3. Создаётся membership со статусом `active`.
4. UI/Backend проверяют роль:
  - Viewer не видит write-кнопки и получает `403` на write API.
  - Editor/Manager видят только разрешённые проекты (scoped).

## 3) Create/Delete flows + “кто создал/изменил”

### Project create/update/delete
1. Create project: записываются `org_id`, `created_by`, `updated_by`.
2. Update project: обновляются `updated_by`, `updated_at`.
3. Delete project: фиксируется audit event с actor и scope.

### Session create/update/delete
1. Create session в project: обязательны `org_id`, `project_id`, `created_by`.
2. Любой PATCH/PUT BPMN/meta пишет `updated_by`.
3. Delete session доступен только по role policy; событие уходит в audit.

### Reports create/delete
1. Создание версии отчёта пишет `created_by`.
2. Удаление версии отчёта пишет `deleted_by`/audit event.
3. В UI версии отчётов имеют author/timestamp/actual flags.

## 4) Видимость “кто создал/кто изменил”

- Project list/detail:
  - `created_by`, `updated_by`, `updated_at`.
- Session list/detail:
  - `created_by`, `updated_by`.
- Report versions:
  - `created_by`, `created_at`, `deleted_by` (если применимо).
- Audit viewer:
  - actor + действие + сущность + before/after.

## 5) Admin flows (users/orgs/roles/audit)

### Org admin console
1. Список пользователей org.
2. Изменение role membership.
3. Revoke invite / deactivate membership.
4. Поиск по audit log (entity/action/user/date).

### Org lifecycle
1. Create org (system-admin или self-serve policy).
2. Rename org / update policies.
3. Archive org (опционально не в MVP).

## Риски и неизвестные

1. Не зафиксирован UX для multi-org пользователя в мобильной/десктопной версии.
2. Не определено, нужен ли workspace selector в MVP или только org selector.
3. Не определён UX для конфликтов прав (например project manager вне org membership).
4. Не согласованы поля PII, отображаемые в audit UI.
