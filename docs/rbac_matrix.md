# RBAC Matrix (Org-level + Project-level)

## Роли (минимум 5)

1. `OrgOwner` — владелец организации, полный контроль и биллинг/политики.
2. `OrgAdmin` — администратор организации (users, roles, projects, audit read).
3. `ProjectManager` — управление проектами/сессиями в рамках назначенных проектов.
4. `Editor` — редактирование сессий/BPMN/репортов в доступных проектах.
5. `Viewer` — только чтение.
6. `Auditor` (опционально, но рекомендуется) — read-only + полный доступ к audit/export.

## Матрица прав

Легенда: `A` allow, `-` deny, `S` scoped (только назначенные проекты/workspaces)

| Scope | Action | OrgOwner | OrgAdmin | ProjectManager | Editor | Viewer | Auditor |
|---|---|---|---|---|---|---|---|
| Org | View org settings | A | A | - | - | - | A |
| Org | Update org settings | A | A | - | - | - | - |
| Org | Manage members (invite/change role/remove) | A | A | - | - | - | - |
| Org | View members | A | A | S | - | - | A |
| Org | View audit logs | A | A | - | - | - | A |
| Org | Export audit logs | A | A | - | - | - | A |
| Project | Create project | A | A | A | - | - | - |
| Project | View project | A | A | S | S | S | A |
| Project | Update project metadata | A | A | S | - | - | - |
| Project | Delete project | A | A | S | - | - | - |
| Project | Manage project members | A | A | S | - | - | - |
| Session | Create session | A | A | S | S | - | - |
| Session | View session | A | A | S | S | S | A |
| Session | Update session/BPMN/meta | A | A | S | S | - | - |
| Session | Delete session | A | A | S | - | - | - |
| Reports | Generate report | A | A | S | S | - | - |
| Reports | View report versions | A | A | S | S | S | A |
| Reports | Delete report version | A | A | S | - | - | - |
| Artifacts | Download export/artifact | A | A | S | S | S | A |
| Admin | Impersonation/support tooling | A | A (optional) | - | - | - | - |

## Org-level vs Project-level разграничение

### Org-level
- управление пользователями, ролями, инвайтами, политиками, аудитом.

### Project-level
- CRUD проектов/сессий/отчётов и доступ к артефактам только в рамках назначений.

## Базовые policy-правила (MVP)

1. Любой запрос обязан иметь org-context.
2. Проверка начинается с org membership + role.
3. Для project/session/report действий дополнительно проверяется project scope.
4. `Viewer` не имеет write/delete прав.
5. `Auditor` не имеет write/delete, но видит audit и отчёты во всем org.

## Риски и неизвестные

1. Не определена модель project assignment (direct user vs group/team).
2. Не согласован policy для shared sessions между несколькими project teams.
3. Не определён режим временного elevate прав (break-glass).
4. Не определён набор сервисных ролей (CI/bot интеграции).
