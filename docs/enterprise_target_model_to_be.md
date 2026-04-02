# Enterprise Target Model (TO-BE, MVP)

## 1) Целевая иерархия

`Org -> Workspace (optional for MVP) -> Project -> Session -> Reports/Artifacts`

### MVP-решение по иерархии
- Обязательный уровень: `Org`.
- `Workspace` вводится как опциональный слой (можно включить позже feature-flag’ом).
- Все операционные сущности (`project`, `session`, `report`, `artifact`) должны иметь tenant-привязку к `org_id`.

## 2) Сущности и атрибуты (что добавить)

### Org
- `id`, `name`, `slug`, `status`, `created_at`, `updated_at`.

### Workspace (опционально в MVP)
- `id`, `org_id`, `name`, `slug`, `created_at`, `updated_at`.

### Membership (org-level)
- `id`, `org_id`, `user_id`, `role`, `status`, `invited_by`, `created_at`, `updated_at`.

### Project
- Добавить:
  - `org_id` (required)
  - `workspace_id` (nullable для MVP)
  - `created_by`, `updated_by`
- Оставить:
  - `owner_user_id` как legacy-поле на переходный период (read-only compat).

### Session
- Добавить:
  - `org_id` (required, денормализованно для быстрого policy-filter)
  - `workspace_id` (nullable)
  - `created_by`, `updated_by`
- Оставить:
  - `owner_user_id` на период миграции.

### Reports / Artifacts
- Добавить:
  - `org_id` (required)
  - `project_id`, `session_id` (required where applicable)
  - `created_by`, `updated_by` (или `deleted_by` для soft-delete сценария)

### AuditLog
- `id`, `org_id`, `actor_user_id`, `entity_type`, `entity_id`, `action`, `before_json`, `after_json`, `created_at`, `request_id`, `ip`, `user_agent`.

## 3) Multi-tenant стратегия

### Доступ (tenant boundary)
- Любая бизнес-операция требует `org_id` контекста.
- Все list/get/update/delete фильтруются по `org_id` + policy role.
- Никаких чтений по “глобальному id” без tenant-scoping.

### Контекст организации
- После логина пользователь выбирает active org (и workspace, если включен слой).
- Active context передаётся в API:
  - через path (`/api/orgs/{org_id}/...`) и/или
  - через claims/token + header guard.
- Для MVP рекомендовано path-based scoping (`/api/orgs/{org_id}/...`) для явности и traceability.

### Data isolation
- Минимум для MVP:
  - row-level tenancy в текущей БД.
- Эволюция:
  - при необходимости `db-per-org`/schema-per-org в enterprise tier.

## 4) Source of truth и консистентность

- Source of truth для проектов/сессий/отчётов — backend DB.
- Клиентские локальные кэши допускаются только как ephemeral UI state.
- Любые persisted domain-данные (включая метаданные процесса и версии отчётов) сохраняются в backend DB под `org_id`.

## 5) Минимальный MVP-контур

1. Добавить `orgs` + `memberships`.
2. Привязать `projects/sessions/reports/artifacts` к `org_id`.
3. Ввести org-level RBAC (owner/admin/member/viewer + service roles).
4. Добавить org-aware endpoints и UI выбор org после login.
5. Включить audit logging для write/delete операций.

## Риски и неизвестные

1. Не определён окончательный lifecycle workspace (нужен ли в MVP).
2. Не зафиксирован формат миграции legacy `owner_user_id -> created_by/org_id`.
3. Не подтверждена стратегия soft-delete vs hard-delete для audit-compliance.
4. Не определены enterprise требования по SSO/SCIM (влияют на identity model).
5. Не согласован объём ретеншена audit/artifacts по org.
