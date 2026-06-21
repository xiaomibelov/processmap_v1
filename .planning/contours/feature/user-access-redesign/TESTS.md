# Test Plan — «Пользователи и доступ» redesign

> Контур: `feature/user-access-redesign`

---

## 1. Backend tests

### Файл: `backend/tests/test_admin_user_management_api.py`

Дополнить существующий класс `AdminUserManagementApiTest` новыми методами:

#### `test_create_user_with_custom_permissions`
- Создать пользователя с `memberships=[{org_id, role:"editor", permissions:{create:false, edit:true, export:true, delete:false, manage_users:false}}]`.
- Проверить, что `item.memberships[0].permissions.view === true` (fallback) и `edit === true`, `create === false`.

#### `test_patch_user_preserves_custom_permissions`
- Создать пользователя с permissions.
- PATCH без `memberships` — permissions в БД не должны измениться.
- PATCH с `memberships` и другим `permissions` — заменить.

#### `test_missing_permissions_falls_back_to_role_template`
- Создать пользователя без `permissions`.
- Проверить, что ответ содержит шаблон editor: `{view:true, create:true, edit:true, export:true, delete:false, manage_users:false}`.

#### `test_view_permission_is_always_true`
- Создать пользователя с `permissions:{view:false}`.
- Проверить, что backend сохранил/вернул `view:true` (или normalized).

#### `test_storage_functions_return_permissions`
- Напрямую вызвать `upsert_org_membership` с permissions и `list_user_org_memberships`.
- Проверить round-trip.

### Команды запуска

```bash
cd /opt/processmap-test/backend
python -m pytest tests/test_admin_user_management_api.py -v
```

Ожидаемый результат: все тесты PASS.

---

## 2. Frontend source tests

### `frontend/src/features/admin/components/users/PermissionMatrix.test.mjs`

Сценарии:
1. При роли `org_viewer` только `view` checked и disabled.
2. При роли `editor` checked: view, create, edit, export.
3. При роли `org_admin` все checked.
4. Смена роли с `org_viewer` на `editor` включает create/edit/export.
5. Пользователь может вручную отключить `create` после автоустановки.
6. `view` нельзя отключить.

### `frontend/src/features/admin/components/users/UserAccessFilters.test.mjs`

Сценарии:
1. Ввод текста вызывает `onQueryChange`.
2. Клик по тегу `Админы` вызывает `onFilterChange("admins")`.
3. Поиск фильтрует пользователей по `full_name`, `email`, `job_title`, `org_name`.

### `frontend/src/features/admin/components/users/UserAccessTable.test.mjs`

Сценарии:
1. Отображаются инициалы аватара.
2. Организации отображаются вертикальным списком.
3. Клик по строке вызывает `onSelect`.
4. Бейдж статуса `Активен` / `Отключён`.

### `frontend/src/features/admin/components/users/UserAccessDrawer.test.mjs`

Сценарии:
1. Drawer открывается/закрывается.
2. При `user === null` заголовок «Новый пользователь».
3. При `user` заголовок «Редактировать пользователя».
4. Включение «Платформенный админ» скрывает блок организаций.

### Регрессионные тесты (существующие)

- `frontend/src/features/admin/components/orgs/AdminUsersPanel.profile-fields.test.mjs`
- `frontend/src/features/admin/pages/AdminOrgsPage.ia.test.mjs`

После изменений `AdminUsersPanel` эти тесты, возможно, потребуют обновления selectors, но логика profile-fields и section order должна сохраниться.

### Команды запуска

```bash
cd /opt/processmap-test/frontend
npm test
```

Ожидаемый результат: все source tests PASS.

---

## 3. E2E tests

### Файл: `frontend/e2e/admin-users-access-redesign.spec.mjs`

Предусловия:
- `DEV_SEED_ADMIN=1`, platform admin авторизован.
- Страница `/admin/orgs` открыта.

Сценарии:
1. **Открытие Drawer создания**
   - Кликнуть «Добавить».
   - Проверить, что Drawer открылся, заголовок «Новый пользователь».

2. **Создание пользователя с ролью Редактор**
   - Заполнить email, имя, должность, пароль.
   - Выбрать организацию и роль «Редактор».
   - Проверить, что checked: view, create, edit, export.
   - Сохранить.
   - Проверить, что пользователь появился в таблице с ролью «Редактор».

3. **Редактирование пользователя — смена роли**
   - Кликнуть по строке созданного пользователя.
   - Сменить роль на «Администратор».
   - Проверить, что все чекбоксы включились.
   - Сохранить.

4. **Фильтрация**
   - Нажать тег «Админы» — в таблице только platform admin + созданный admin.
   - Нажать «Редакторы» — только редакторы.
   - Ввести в поиск имя созданного пользователя — только он.

5. **Платформенный админ**
   - Открыть Drawer, включить «Платформенный админ».
   - Проверить, что блок организаций скрылся.
   - Сохранить.
   - В таблице у пользователя бейдж «Администратор» и «Доступ ко всем организациям».

### Команды запуска

```bash
cd /opt/processmap-test/frontend
npm run test:e2e
```

Ожидаемый результат: сценарии PASS.

---

## 4. Ручная проверка (checklist)

- [ ] Страница `/admin/orgs` загружается без ошибок консоли.
- [ ] Drawer открывается и закрывается.
- [ ] Создание пользователя работает end-to-end.
- [ ] Редактирование сохраняет permissions.
- [ ] Фильтры и поиск работают.
- [ ] Статусы отображаются цветными бейджами.
- [ ] Аватары показывают инициалы.
- [ ] При перезагрузке страницы сохранённые permissions загружаются корректно.

---

## 5. CI/локальная верификация

Перед PR обязательно запустить:

```bash
cd /opt/processmap-test/backend && python -m pytest tests/test_admin_user_management_api.py -v
cd /opt/processmap-test/frontend && npm test
cd /opt/processmap-test/frontend && npm run build   # проверить сборку
```

Если доступен docker compose:

```bash
cd /opt/processmap-test
docker compose up --build -d
# дождаться 200 на http://localhost:8011/api/meta
# прогнать e2e
```
