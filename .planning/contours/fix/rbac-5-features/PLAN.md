# fix/rbac-5-features — план

## Контур
- **contour_id:** `fix/rbac-5-features`
- **branch:** `fix/rbac-5-features` от `origin/main` (`f3a1eaa0f2cd7db93bba771f7461b5e527b26648`)
- **worktree:** `/opt/processmap-test/.worktrees/fix-rbac-5-features`
- **goal:** Аудит RBAC/permission-границ в 5 core-фичах ProcessMap, минимальные патчи критичных gap'ов, тестовое покрытие.
- **bounded scope:** Только authz-аудит и минимальные патчи в 5 фичах. Не трогаем user-access-redesign UI, не меняем storage schema, не рефакторим всю authz-систему.

## Связь с user-access-redesign
В контурe `feature/user-access-redesign` появились:
- колонка `org_memberships.permissions_json` (6 флагов: `view`, `create`, `edit`, `export`, `delete`, `manage_users`);
- админ API нормализует и сохраняет эти флаги;
- роль остаётся authoritative для совместимости.

Этот контур проверяет, **где реальные проверки доступа в 5 core-фичах до сих пор завязаны только на глобальные роли**, и закрывает критичные gap'ы минимальными патчами с учётом новых флагов (или, где это невозможно без broad refactor, документирует deferred-решение).

## 5 фич и ключевые файлы

| # | Фича | Backend | Frontend |
|---|------|---------|----------|
| 1 | Шаблоны | `backend/app/routers/templates.py` | `frontend/src/features/process/templates/CreateTemplateModal.jsx`, `TemplatesPicker.jsx` |
| 2 | Сессии | `backend/app/routers/sessions.py`, `backend/app/services/session_service.py` | процесс-стейдж, табы сессий |
| 3 | Версии сессий / snapshot | `backend/app/routers/sessions.py` (`/bpmn/versions`, `/bpmn/restore`), `session_service.py` | версионная панель, remote-save highlight |
| 4 | BPMN-элементы и оверлеи | `backend/app/routers/sessions.py` (`/nodes`, `/edges`, `/bpmn`), `bpmn.py`, drawio/overlay код | `frontend/src/features/process/bpmn/**/*`, `features/process/drawio/**/*`, `features/process/overlay/**/*` |
| 5 | Обсуждения и @mentions | `backend/app/routers/notes.py` | `frontend/src/features/process/notes/NotesMvpPanel.jsx`, `mentionAutocomplete.js` |

Общие authz-хелперы:
- `backend/app/utils/authz.py`
- `backend/app/services/org_workspace.py`
- `backend/app/auth.py`
- `frontend/src/features/admin/adminRoles.js`
- `frontend/src/features/workspace/workspacePermissions.js`

## Фаза 1 — Audit / Диагностика (5-plane proof)

### Что делаем
1. **Code plane:**
   - Для каждой из 5 фич перечислить endpoint'ы/backend-функции и конкретные authz-проверки.
   - Построить матрицу: endpoint × используемая проверка × роли, которые проходят.
   - Отметить, где используются `ORG_WRITE_ROLES`, `ORG_READ_ROLES`, `is_role_allowed`, `can_edit_workspace`, `can_manage_workspace`, `practical_role_for_org`, `require_org_member_for_enterprise`, `enterprise_require_project_access`, `session_access_from_request`.
2. **Disconnect с granular permissions:**
   - Сравнить с матрицей флагов `view/create/edit/delete/export/manage_users`.
   - Пример проблемы: `can_edit_workspace` разрешает `org_owner/org_admin/project_manager/editor` по имени роли, а не по флагу `edit=True`.
3. **Missing RBAC:**
   - Операции без проверок (например, `create_session` без org membership?);
   - Удаление/редактирование чужих объектов (чужой шаблон, чужая сессия, чужой комментарий);
   - Проектный scope: пользователь с ограниченным project scope может получить доступ к сессии другого проекта.
4. **Race / orphaned permissions:**
   - Что произойдёт, если membership удалён/изменён во время сессии (кеш, stale JWT/state, already loaded объекты).
5. **Workspace / env / serving plane:**
   - Зафиксировать текущий runtime: `git rev-parse HEAD`, `git branch`, `docker ps` для api/gateway, `/version`.

### Артефакт
- `AUDIT.md` — матрица endpoint × проверок × ролей, классификация gap'ов (critical/high/low), deferred-задачи.

## Фаза 2 — Исправление (минимальные патчи)

### Принципы
- **Backward-compatible:** существующие тесты `test_templates_rbac.py`, `test_session_read_rbac.py`, `test_bpmn_save_rbac_scope.py`, `test_notes_mvp1_api.py` не должны сломаться.
- **Минимальный патч:** не менять сигнатуры storage/helpers без крайней необходимости.
- **Deferred by default:** если для закрытия gap требуется broad refactor — вынести в `AUDIT.md` как deferred, не исправлять в этом контуре.

### Ожидаемые направления патчей (уточняются после аудита)
1. **Шаблоны:**
   - Добавить проверку `edit`/`delete` флагов (наряду с ролью) в `_template_can_manage` / `_template_folder_can_manage`.
   - Убедиться, что `org_viewer` с `edit=True` может редактировать org-шаблон, а `editor` с `edit=False` — нет.
2. **Сессии:**
   - `delete_session`: проверять флаг `delete` (или ownership/admin), а не только owner/admin.
   - `patch_session` (title/status): проверять флаг `edit`.
   - `create_project_session` / `create_session`: проверять флаг `create`.
3. **Версии / snapshot:**
   - `bpmn_restore`, `bpmn_clear`: проверять флаг `edit`/`delete`.
   - `bpmn_versions_list` / `bpmn_version_detail`: проверять флаг `view`.
4. **BPMN-элементы:**
   - `patch_node`, `add_node`, `delete_node`, `add_edge`, `delete_edge`: проверять флаг `edit`.
   - `session_bpmn_save`: проверять флаг `edit`.
5. **Обсуждения / mentions:**
   - `_load_session_for_notes(..., write=True)`: проверять флаг `edit` вместо/наряду с `can_edit_workspace`.
   - Убедиться, что редактирование/удаление чужого комментария запрещено (ownership check).
   - `@mentions`: разрешать упоминать только пользователей с `view` доступом к сессии/проекту.

### Артефакт
- `FIX.md` — описание каждого патча, мотивация, diff-ссылки.

## Фаза 3 — Тестовое покрытие

### Backend
- `backend/tests/test_rbac_5_features.py` — новый файл.
- Для каждого исправленного gap:
  - тест, который падает до патча;
  - тест, который проходит после патча.
- Сохранить существующие тесты:
  - `test_templates_rbac.py`
  - `test_session_read_rbac.py`
  - `test_bpmn_save_rbac_scope.py`
  - `test_notes_mvp1_api.py`

### Frontend
- Добавить/расширить `node:test` в:
  - `frontend/src/features/templates/model/templatesRbac.test.mjs`
  - `frontend/src/features/process/notes/...test.mjs` (если фронтенд принимает решения о видимости кнопок)
- Проверить, что UI не показывает действия, запрещённые backend (defense in depth).

### E2E
- Если инфраструктура готова: сценарий «пользователь без права X не видит кнопку Y / получает 403».
- В этом контуре E2E — опционально, не блокер.

### Артефакт
- `TESTS.md` — список новых тестов, команды запуска.

## Риски и ограничения
- **Broad refactor trap:** много legacy-проверок в `_legacy_main.py`. Если патч требует переделки `_legacy_main` — deferred.
- **Role vs permission dual source:** пока `permissions_json` не читается вне admin API, фичи не могут использовать флаги. Возможно, потребуется минимальный helper для получения `permissions` для текущего пользователя/org.
- **Project scope vs org permissions:** project-scoped access может конфликтовать с org-level permission flags. Нужно сохранить поведение project scope.
- **Frontend caching:** templates/list cache может показывать `can_edit: true` после изменения роли. Тесты и патчи должны инвалидировать кеш.

## Acceptance criteria
- [ ] AUDIT.md содержит матрицу endpoint × проверок × ролей для 5 фич.
- [ ] Каждый critical/high gap задокументирован; критичные закрыты патчами.
- [ ] Новые backend-тесты проходят (`pytest backend/tests/test_rbac_5_features.py`).
- [ ] Существующие RBAC-тесты проходят без регрессий.
- [ ] Frontend `npm test` проходит без регрессий.
- [ ] Каждый патч покрыт ≥1 тестом, который падает до патча и проходит после.
- [ ] Нет изменений user-access-redesign UI, storage schema, broad authz refactor.
- [ ] Артефакты замиррорены в Obsidian.
- [ ] Пользователь explicit approve перед merge/deploy/PR.

## Команды для повторения
```bash
cd /opt/processmap-test/.worktrees/fix-rbac-5-features
# backend
PYTHONPATH=/opt/processmap-test/.worktrees/fix-rbac-5-features .venv/bin/pytest backend/tests/test_rbac_5_features.py -q
# frontend
cd frontend && node --test src/**/*.test.mjs
```
