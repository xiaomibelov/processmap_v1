# Enterprise Migrations Plan (MVP Rollout)

## 1) Цель миграции

Перевести текущую owner-based модель в org-based multi-tenant модель без остановки сервиса и без потери данных:
- проекты/сессии/отчёты/артефакты получают `org_id`
- ownership становится `created_by/updated_by` + membership policy
- legacy API остаётся совместимым на переходный период

## 2) Стартовые данные (as-is)

- Есть `owner_user_id` в `projects` и `sessions`.
- Нет `org_id`, `workspace_id`, `created_by`, `updated_by`.
- Users/refresh tokens хранятся в json auth-store.

## 3) Поэтапная миграция

### Step 1: Schema expand (backward-compatible)
- Добавить таблицы:
  - `orgs`
  - `memberships`
  - `invites`
  - `audit_logs`
- Добавить поля:
  - `projects.org_id`, `projects.created_by`, `projects.updated_by`, `projects.workspace_id NULL`
  - `sessions.org_id`, `sessions.created_by`, `sessions.updated_by`, `sessions.workspace_id NULL`
  - (если отчёты отдельно) `reports.org_id`, `created_by`, `updated_by/deleted_by`
- Все новые поля сначала nullable/with default для безопасного развёртывания.

### Step 2: Create default org(s)
- Создать system default org (например `org_default`).
- Для каждого пользователя создать membership в default org:
  - владелец своих данных минимум `ProjectManager`/`Editor`
  - текущий `is_admin=true` -> `OrgAdmin`/`OrgOwner` policy mapping.

### Step 3: Backfill данных
- `projects`:
  - `org_id = default_org_id(owner_user_id)`
  - `created_by = owner_user_id` (если нет истории)
  - `updated_by = owner_user_id` (initial seed)
- `sessions`:
  - `org_id` по parent project (или по owner fallback)
  - `created_by/updated_by` аналогично.
- Отчёты/артефакты:
  - проставить `org_id` по session/project связи.

### Step 4: Read-path hardening
- Все list/get endpoints начинают фильтровать по `org_id` + membership policy.
- Legacy endpoints (`/api/projects`, `/api/sessions`) автоматически используют active/default org.
- Добавить audit записи для write/delete.

### Step 5: Write-path switch
- Новые create/update/delete требуют org context.
- Legacy write-path маппит контекст в default org и пишет те же tenant-поля.

### Step 6: UI rollout
- Добавить org selector после login.
- Переключить проектные/сессионные запросы на org-scoped API.
- Отобразить created_by/updated_by и ограничить кнопки по роли.

### Step 7: Enforcement
- Сделать `org_id` NOT NULL.
- Включить FK и индексы:
  - `idx_projects_org_updated`
  - `idx_sessions_org_project_updated`
  - `idx_audit_org_created`.

## 4) Совместимость со старым UI/API

- Период dual-mode:
  - old UI продолжает работать через legacy endpoints.
  - backend маппит legacy запрос в default org контекст.
- В ответы legacy API можно добавить `org_id` как дополнительное поле без breaking changes.

## 5) Деградации и rollback

### Rollback strategy
1. Feature-flag для org-scoped policy checks.
2. При инциденте выключить org-check флаг и вернуть owner-only filter.
3. Миграции schema-expand делать additive, без drop колонок до финальной стабилизации.

### Data safety
- Перед backfill:
  - бэкап sqlite
  - snapshot auth json store
- Идемпотентные backfill-скрипты (повторный запуск безопасен).

## 6) Acceptance gates

1. Пользователь видит только свои org/projects/sessions.
2. Роли блокируют write/delete согласно RBAC.
3. Все write/delete операции пишут audit event.
4. Legacy UI не ломается в период dual-mode.
5. Нет утечки cross-org данных по прямому id.

## Риски и неизвестные

1. Текущая auth-модель (json store) может стать bottleneck для enterprise scale.
2. Нужен план миграции/консолидации auth данных в БД (или внешний IdP).
3. Не определены требования по хранению deleted entities (hard vs soft delete).
4. Не определена стратегия tenant-aware файловых артефактов на filesystem/object storage.
