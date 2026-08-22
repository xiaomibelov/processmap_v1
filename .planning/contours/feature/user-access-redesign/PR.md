# PR: Полный UX-редизайн страницы «Пользователи и доступ»

> **Ветка:** `feature/user-access-redesign`
> **База:** `origin/main @ f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
> **Контур:** `feature/user-access-redesign`

---

## Что меняется

Переработан раздел «Пользователи и доступ» в админке (`/admin/orgs`):

1. **Таблица как первичный интерфейс.**
   - Аватары с инициалами пользователей.
   - Поиск по имени, email, должности и организации.
   - Фильтры-теги: Все / Админы / Редакторы / Наблюдатели / Активные / Неактивные.
   - Статусы — цветные бейджи.
   - Организации отображаются вертикальным списком с ролью.

2. **Создание и редактирование в Drawer.**
   - Slide-out панель справа вместо inline-формы.
   - Поля формы в 2 колонки.
   - Тогглы «Активен» и «Платформенный админ».
   - Включение «Платформенный админ» скрывает блок организаций.

3. **Матрица прав по организациям.**
   - Селект роли: Наблюдатель / Редактор / Администратор.
   - 6 чекбоксов: Просматривать, Создавать, Редактировать, Экспортировать, Удалять, Управлять пользователями орг.
   - При смене роли флаги перестраиваются по шаблону, но остаются доступными для ручной корректировки.
   - «Просматривать» обязателен и disabled для всех ролей.

4. **Backend-хранение permissions.**
   - В `org_memberships` добавлена колонка `permissions_json`.
   - API `GET/POST/PATCH /api/admin/users` теперь работает с `memberships[].permissions`.
   - Backward-compatible: отсутствие permissions заполняется шаблоном по роли.

---

## Почему так

- Текущая страница смешивает пользователей, инвайты, организации и Git mirror в одном inline-интерфейсе.
- Inline-форма занимает много места и мешает сканировать список пользователей.
- Нет быстрого поиска и фильтрации.
- Ранее роль была единственным способом выразить права; матрица даёт гибкость и прозрачность.

---

## Ключевые файлы

### Frontend
- `frontend/src/features/admin/components/users/UserAccessTable.jsx`
- `frontend/src/features/admin/components/users/UserAccessFilters.jsx`
- `frontend/src/features/admin/components/users/UserAccessDrawer.jsx`
- `frontend/src/features/admin/components/users/UserAccessForm.jsx`
- `frontend/src/features/admin/components/users/PermissionMatrix.jsx`
- `frontend/src/features/admin/components/users/AvatarInitials.jsx`
- `frontend/src/features/admin/hooks/useUserAccessForm.js`
- `frontend/src/features/admin/components/users/userAccessUtils.js`
- `frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx` (переработан)
- `frontend/src/lib/apiModules/adminApi.js` (permissions)

### Backend
- `backend/app/routers/admin.py` (Pydantic-модели + нормализация)
- `backend/app/storage.py` (схема + upsert/list functions)
- `backend/tests/test_admin_user_management_api.py` (новые тесты)

---

## Как проверить

### Локально

```bash
# backend
cd /opt/processmap-test/backend
python -m pytest tests/test_admin_user_management_api.py -v

# frontend unit
cd /opt/processmap-test/frontend
npm test

# frontend build
cd /opt/processmap-test/frontend
npm run build
```

### E2E

```bash
cd /opt/processmap-test/frontend
npm run test:e2e
```

### Ручной smoke

1. Авторизоваться как platform admin.
2. Открыть `/admin/orgs`.
3. Нажать «Добавить» → откроется Drawer.
4. Создать пользователя с ролью «Редактор», проверить матрицу прав.
5. Сохранить, убедиться, что пользователь появился в таблице.
6. Кликнуть строку → Drawer редактирования.
7. Сменить роль на «Администратор», сохранить.
8. Проверить фильтры и поиск.

---

## Что НЕ входит в этот PR

- Миграция `_auth_users.json` в Postgres (отдельный контур).
- Переписывание всей authz-системы: ролевые проверки в `backend/app/utils/authz.py` и других роутах не менялись.
- Изменения в Git mirror, инвайтах, организациях.
- Пагинация таблицы пользователей.

---

## Риски

- Drawer — новый UI-паттерн для админки; нужно проверить на мобильных ширинах.
- Введение `permissions_json` требует миграции БД; отсутствующие значения корректно fallback'ятся на шаблон роли.

---

## Screenshots / Loom

_Добавить после выполнения контуром executor/reviewer._

---

## Чек-лист перед merge

- [ ] Backend tests PASS.
- [ ] Frontend source tests PASS.
- [ ] Frontend build PASS.
- [ ] E2E smoke PASS.
- [ ] Ручная проверка пройдена.
- [ ] Reviewer approval получен.

**Не мержить без явного approve пользователя.**
