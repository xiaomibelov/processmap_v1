# feature/user-access-redesign — полный UX-редизайн страницы «Пользователи и доступ»

> **Контур:** `feature/user-access-redesign`
> **Роль:** Agent 1 / Planner
> **Ветка:** `feature/user-access-redesign`
> **Baseline:** `origin/main @ f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
> **Язык артефактов:** PLAN.md / UI.md / API.md / TESTS.md — русский/английский (технический); PR.md — русский.

---

## Runtime/source truth (AGENTS.md §3)

- `pwd`: `/opt/processmap-test`
- `git remote -v`: `origin git@github.com:xiaomibelov/processmap_v1.git`
- `git fetch origin`: выполнен, `origin/main = f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
- `git branch --show-current`: `feature/user-access-redesign`
- `git rev-parse HEAD`: `f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
- `git rev-parse origin/main`: `f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
- `git status -sb`: clean (`## feature/user-access-redesign...origin/main`)
- `git diff --name-only`: пусто
- `git diff --cached --name-only`: пусто

---

## RAG Preflight

- command run:
  ```bash
  node tools/rag/pm-rag-agent-preflight.mjs \
    --role planner \
    --contour user-access-redesign \
    --area "users access permissions roles organizations" \
    --query "user access redesign UX permissions roles organizations" \
    --top-k 5 --format md \
    --out .planning/contours/feature/user-access-redesign/RAG_PREFLIGHT_PLANNER.md
  ```
- role: planner
- query/area: users access permissions roles organizations
- facts used:
  - `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` (REVIEW_PASS)
  - `feature/processmap-agent-rag-source-registry-and-index-policy-v1` (REVIEW_PASS)
  - `feature/processmap-agent-rag-bm25-manifest-search-v1` (REVIEW_PASS)
  - `feature/processmap-agent-rag-coverage-and-validation-hardening-v1` (REVIEW_PASS)
- supporting documents used:
  - `docs/audit_admin_users_membership_storage_profile_fields_v1.md` (#1 Product/UI problem map, #2 UI map, #3 API map, #5 Bounded next implementation plan)
  - `backend/app/storage.py` (#4 storage.py)
  - `backend/app/_legacy_main.py` (#6/#7 access helpers)
- user rejections considered: нет активных rejections для users/access-контура.
- decisions/rules considered:
  - No PR/merge/deploy без явного approve пользователя.
  - Agent 1 не пишет product code.
  - Bounded scope: только страница «Пользователи и доступ», без broad refactor.
- accepted context:
  - Аудит рекомендует разделить «Пользователи и доступ» и «Организации»; текущая страница `AdminOrgsPage` смешивает пользователей, инвайты, организации и Git mirror.
  - `org_memberships` хранит только `role`; гранулярных прав нет.
  - `AdminUsersPanel` уже имеет `full_name`, `job_title`, `is_admin`, `memberships`.
- ignored/deprecated context:
  - Рекомендация аудита о миграции `_auth_users.json` в Postgres вынесена в отдельный контур; в этом контуре не меняем способ хранения auth-identity.
- resulting plan changes:
  - Вводим новую сущность `membership.permissions` (6 boolean-флагов) на уровне API/DB/UI, но **не переписываем всю authz-систему** — роль остаётся авторитетной для существующих endpoint'ов, чтобы избежать broad refactor.

---

## Цель

Переработать страницу «Пользователи и доступ» так, чтобы:
1. Таблица пользователей стала первичным интерфейсом.
2. Создание/редактирование происходило в Drawer, а не в inline-форме.
3. Права в организации задавались через матрицу чекбоксов с ролью по умолчанию.
4. Поиск и фильтрация позволяли быстро находить пользователей по имени/email/организации и статусу.

---

## Архитектура

**Frontend**
- `AdminUsersPanel` перестаёт содержать inline-форму; он отвечает за загрузку списока, фильтрацию и открытие Drawer.
- Новый компонент `UserAccessDrawer` — slide-out панель (аналог Modal, но прижата к правому краю) с формой создания/редактирования.
- `UserAccessTable` — переиспользуемая таблица с аватарами-инициалами, бейджами статуса и вертикальным списком организаций.
- `UserAccessFilters` — строка поиска + теги-фильтры.
- `PermissionMatrix` — селект роли + 6 чекбоксов, пересчитываемых по шаблону роли.
- `useUserAccessForm` — хук состояния формы, нормализации membership'ов и permissions.

**Backend**
- Расширяем `AdminUserMembershipIn` полем `permissions: dict[str, bool]`.
- Добавляем в `org_memberships` колонку `permissions_json TEXT NOT NULL DEFAULT '{}'`, хранящую 6 флагов.
- Обновляем `upsert_org_membership`, `_replace_user_memberships`, `_membership_payload_for_user` для чтения/записи permissions.
- В API-ответе каждая membership теперь содержит `role` + `permissions`.
- **Authz-граница:** флаги `permissions` сохраняются и возвращаются, но существующие проверки `ORG_WRITE_ROLES` / `ORG_READ_ROLES` в `backend/app/utils/authz.py` не меняются. Это оставляет контур bounded и позволяет в следующем контуре заменить ролевые проверки на permission-based.

---

## Файловая структура

### Создаются
- `frontend/src/features/admin/components/users/UserAccessTable.jsx`
- `frontend/src/features/admin/components/users/UserAccessFilters.jsx`
- `frontend/src/features/admin/components/users/UserAccessDrawer.jsx`
- `frontend/src/features/admin/components/users/UserAccessForm.jsx`
- `frontend/src/features/admin/components/users/PermissionMatrix.jsx`
- `frontend/src/features/admin/components/users/AvatarInitials.jsx`
- `frontend/src/features/admin/hooks/useUserAccessForm.js`
- `frontend/src/features/admin/components/users/userAccessUtils.js`

### Изменяются
- `frontend/src/features/admin/components/orgs/AdminUsersPanel.jsx` — заменя inline-таблицу и форму на новые компоненты.
- `frontend/src/features/admin/pages/AdminOrgsPage.jsx` — минимальные правки секции users (ID, скролл-якорь).
- `frontend/src/lib/apiModules/adminApi.js` — `apiAdminCreateUser` / `apiAdminPatchUser` передают `permissions`.
- `backend/app/routers/admin.py` — Pydantic-модели `AdminUserMembershipIn`, `_normalize_admin_memberships`, `_replace_user_memberships`, `_membership_payload_for_user`.
- `backend/app/storage.py` — схема `org_memberships`, `upsert_org_membership`, `list_user_org_memberships`, `list_org_memberships`, `_normalize_org_membership_role`, миграция.
- `frontend/src/styles/tokens.css` или `tailwind.css` — возможно добавить классы Drawer.

### Тесты
- `frontend/src/features/admin/components/users/UserAccessFilters.test.mjs`
- `frontend/src/features/admin/components/users/PermissionMatrix.test.mjs`
- `frontend/src/features/admin/components/users/UserAccessTable.test.mjs`
- `backend/tests/test_admin_user_management_api.py` — дополнить проверками permissions.
- `frontend/e2e/admin-users-access-redesign.spec.mjs` — UX-сценарии (опционально, если e2e-инфраструктура готова).

---

## Матрица прав (обязательные требования)

Флаги:
1. `view` — «Просматривать»
2. `create` — «Создавать»
3. `edit` — «Редактировать»
4. `export` — «Экспортировать»
5. `delete` — «Удалять»
6. `manage_users` — «Управлять пользователями орг.»

Шаблоны по роли:
| Роль | view | create | edit | export | delete | manage_users |
|---|---|---|---|---|---|---|
| `org_viewer` (Наблюдатель) | on, disabled | off | off | off | off | off |
| `editor` (Редактор) | on, disabled | on | on | on | off | off |
| `org_admin` (Администратор) | on, disabled | on | on | on | on | on |

Правила UI:
- `view` всегда `true` и `disabled` для всех ролей.
- При смене роли через селект флаги пересчитываются по шаблону, но остаются доступными для ручной корректировки (кроме `view`).
- Сохранённые ранее кастомные флаги загружаются из API и не сбрасываются при открытии Drawer; сброс происходит только при явной смене роли пользователем.

---

## Acceptance Criteria

### Таблица
- [ ] В таблице отображаются аватары с инициалами (по `full_name` или `email`).
- [ ] Колонки: Пользователь (имя/email), Должность, Роль платформы, Организации/роли, Статус, Создан, Действия.
- [ ] Организации отображаются вертикальным списком с ролью (не горизонтальными chips).
- [ ] Статус — цветной бейдж: `Активен` (emerald), `Отключён` (amber/rose).
- [ ] Поиск по имени, email и названию организации работает без запроса на сервер (client-side).
- [ ] Фильтры-теги: Все, Админы, Редакторы, Наблюдатели, Активные, Неактивные.
- [ ] Клик по строке открывает Drawer редактирования.

### Drawer
- [ ] Drawer открывается с правой стороны, закрывается по крестику, Escape, клику вне.
- [ ] Заголовок Drawer: «Новый пользователь» или «Редактировать пользователя».
- [ ] Поля формы расположены в 2 колонки на `lg`: Email, Имя, Должность, Пароль/Новый пароль.
- [ ] Тогглы «Активен» и «Платформенный админ» в одной строке.
- [ ] Включение «Платформенный админ» скрывает блок «Доступ по организациям» и показывает пояснение «Доступ ко всем организациям».

### Блок «Доступ по организациям»
- [ ] Для каждой организации: селект организации, селект роли, кнопка удаления.
- [ ] Под организацией/ролью — матрица из 6 чекбоксов.
- [ ] Смена роли автоматически выставляет флаги по шаблону, но чекбоксы остаются доступны.
- [ ] `view` всегда включён и disabled.
- [ ] Можно добавить несколько организаций; повторная организация недопустима.

### Backend/API
- [ ] `GET /api/admin/users` возвращает `memberships[].permissions`.
- [ ] `POST /api/admin/users` и `PATCH /api/admin/users/{id}` принимают `memberships[].permissions`.
- [ ] `permissions` сохраняются в `org_memberships.permissions_json`.
- [ ] Отсутствие `permissions` в запросе трактуется как шаблон по роли (backward-compatible).
- [ ] Миграция существующих строк: `permissions_json = {}` → UI применит шаблон по роли.

### Не-функциональные
- [ ] Не ломаются существующие тесты `test_admin_user_management_api.py`.
- [ ] Не ломаются frontend source tests `AdminUsersPanel.profile-fields.test.mjs` и `AdminOrgsPage.ia.test.mjs`.
- [ ] Без изменений вне bounded контура: не трогаем Git mirror, приглашения, организации, authz-проверки в других роутах.

---

## План работ (high-level)

1. **Backend: схема и хранение permissions**
   - Добавить `permissions_json` в `org_memberships`.
   - Обновить `upsert_org_membership`, `list_user_org_memberships`, `list_org_memberships`.
   - Вернуть `permissions` в `_membership_payload_for_user`.

2. **Backend: API contract**
   - Расширить `AdminUserMembershipIn` полем `permissions`.
   - Нормализовать permissions в `_normalize_admin_memberships`.
   - Передавать permissions в `_replace_user_memberships`.

3. **Frontend: утилиты и хук формы**
   - `userAccessUtils.js`: `getInitials`, `formatRoleLabel`, `rolePermissionTemplate`, `normalizePermissions`, `filterUsers`.
   - `useUserAccessForm.js`: состояние Drawer, валидация, upsert/delete membership, сброс по роли.

4. **Frontend: компоненты таблицы и фильтров**
   - `AvatarInitials`, `UserAccessFilters`, `UserAccessTable`.

5. **Frontend: Drawer и форма**
   - `UserAccessDrawer`, `UserAccessForm`, `PermissionMatrix`.

6. **Frontend: интеграция**
   - Переписать `AdminUsersPanel` на использование новых компонентов.
   - Обновить `adminApi.js` для передачи permissions.

7. **Тесты**
   - Backend: permissions в create/patch/list.
   - Frontend: фильтры, матрица, Drawer.
   - E2E: создание пользователя, редактирование, фильтрация.

8. **Review / PR**
   - Подготовить PR.md, запустить `npm test` и `pytest`, не мержить без approve.

---

## Риски и ограничения

1. **Broad refactor risk:** Если начать заменять `ORG_WRITE_ROLES` на permission-based checks во всём backend, контур разрастётся. Ограничение: оставляем ролевые проверки без изменений; permissions — это UI/DB-contract на будущее.
2. **Drawer — новый UI-паттерн:** В админке нет готового Drawer. Нужно создать его на основе существующего `Modal.jsx` (fixed overlay + panel) или добавить CSS-классы.
3. **Backward compatibility:** Старые клиенты/тесты могут не отправлять `permissions`. API должен держать это поле опциональным.
4. **Storage migration:** SQLite/Postgres совместимость через `_translate_sql_for_postgres`; нужно протестировать на обоих backend'ах, если доступен Postgres.
5. **Performance:** `admin_users` возвращает всех пользователей без пагинации. В рамках этого контура пагинацию не добавляем, но фильтрация client-side.

---

## Связанные артефакты

- `UI.md` — детальная спецификация компонентов и состояний.
- `API.md` — request/response contract, Pydantic модели, SQL-изменения.
- `TESTS.md` — тестовые сценарии и команды запуска.
- `PR.md` — описание PR на русском.
