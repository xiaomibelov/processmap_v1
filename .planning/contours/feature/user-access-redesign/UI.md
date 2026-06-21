# UI Specification — «Пользователи и доступ» redesign

> Контур: `feature/user-access-redesign`

---

## 1. Общая композиция страницы

Страница `/admin/orgs` остаётся единой точкой входа. Внутри неё секция пользователей (`#admin-access-users`) заменяется на новый интерфейс.

```
┌─────────────────────────────────────────────────────────────┐
│  Пользователи и доступ                              [+ Добавить] │
├─────────────────────────────────────────────────────────────┤
│  [Поиск...]  [Все] [Админы] [Редакторы] [Наблюдатели] [Активные] [Неактивные] │
├─────────────────────────────────────────────────────────────┤
│  ┌──────┬──────────────┬─────────┬──────────────────┬──────────┬─────────┬────────┐ │
│  │Аватар│ Пользователь │Должность│Роль платформы    │Организации/роли  │ Статус  │Создан  │...│ │
│  └──────┴──────────────┴─────────┴──────────────────┴──────────────────┴─────────┴────────┘ │
└─────────────────────────────────────────────────────────────┘
```

Drawer открывается справа поверх страницы.

---

## 2. Цвета и типографика (существующие токены)

- Фон страницы: `bg-slate-50`
- Карточка: `bg-white`, border `slate-200`, rounded-[24px], shadow-[0_18px_45px_-30px_rgba(15,23,42,0.28)]
- Заголовок секции: `text-lg font-semibold tracking-tight text-slate-950`
- Eyebrow: `text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400`
- Таблица: `text-[13px]`, заголовки `text-[10px] uppercase tracking-[0.12em] text-slate-400`
- Бейджи:
  - `Активен` — `bg-emerald-50 border-emerald-200 text-emerald-700`
  - `Отключён` — `bg-amber-50 border-amber-200 text-amber-700`
  - `Платформенный админ` — `bg-indigo-50 border-indigo-200 text-indigo-700`
- Кнопки: `.primaryBtn`, `.secondaryBtn` (уже глобальны).

---

## 3. Компоненты

### 3.1 `AvatarInitials`

**Props:**
```ts
{
  name?: string;      // full_name
  email?: string;     // fallback для инициалов
  size?: "sm" | "md"; // sm=28px, md=36px
}
```

**Поведение:**
- Берёт первые буквы первых двух слов из `name` (кириллица/латиница).
- Если `name` пустое — использует первую букву `email`.
- Цвет фона — deterministic по `email`/`name` из палитры `slate/indigo/emerald/amber/rose/violet`.
- Примеры:
  - `Иван Петров` → `ИП`
  - `ivan.petrov@example.com` → `I`
  - `Анна` → `А`

---

### 3.2 `UserAccessFilters`

**Props:**
```ts
{
  query: string;
  onQueryChange: (q: string) => void;
  activeFilter: "all" | "admins" | "editors" | "viewers" | "active" | "inactive";
  onFilterChange: (f) => void;
}
```

**Элементы:**
- Input type="search" placeholder="Поиск по имени, email или организации…".
- Горизонтальный ряд тегов-кнопок. Активный тег имеет `primaryBtn`-стиль; неактивный — `secondaryBtn`.

**Правила фильтрации (client-side):**
- `all` — без фильтра.
- `admins` — `is_admin === true`.
- `editors` — не admin и есть membership с ролью `editor`.
- `viewers` — не admin и есть membership с ролью `org_viewer` (или нет memberships).
- `active` / `inactive` — по `is_active`.
- Поисковая строка ищет по `full_name`, `email`, `job_title`, `memberships[].org_name` (case-insensitive, по подстроке).

---

### 3.3 `UserAccessTable`

**Props:**
```ts
{
  users: User[];
  selectedUserId?: string;
  onSelect: (user: User) => void;
  onNew: () => void;
}
```

**Колонки и ширины:**
| Колонка | Ширина | Содержимое |
|---|---|---|
| Аватар | 48px | `AvatarInitials` |
| Пользователь | 25% | `full_name` (bold), `email` под ним |
| Должность | 15% | `job_title` или `—` |
| Роль платформы | 12% | бейдж «Администратор» / «Участник» |
| Организации / роли | 28% | вертикальный список: `OrgName · Роль` |
| Статус | 10% | `StatusPill` + мини-иконка организации (count) |
| Создан | 10% | `DD.MM.YYYY HH:mm` |

**Организации:**
- Если `is_admin` — одна строка «Доступ ко всем организациям» с indigo-бейджем.
- Иначе вертикальный список `div` с `org_name · role_label`.
- Если memberships пусты — `—`.

**Hover/selected:**
- `hover:bg-slate-50/70`
- `selected: bg-amber-50/80`

**Пустое состояние:**
- Строка с `colSpan` — «Пользователи не найдены.»

---

### 3.4 `UserAccessDrawer`

**Props:**
```ts
{
  open: boolean;
  onClose: () => void;
  user?: User | null;        // null → создание
  orgOptions: { org_id, name }[];
  onSubmit: (payload) => Promise<void>;
  onDelete?: (userId) => void; // опционально, out of scope
}
```

**Поведение:**
- Ширина: `max-w-2xl` (672px), на мобильных — 100%.
- Backdrop: `bg-slate-950/40`.
- Анимация: transform translate-x (опционально; если сложно — без анимации).
- Escape / клик по backdrop / кнопка ✕ — закрывают.
- Body scroll блокируется, как в `Modal.jsx`.

---

### 3.5 `UserAccessForm`

**Props:**
```ts
{
  user?: User | null;
  orgOptions: { org_id, name }[];
  onSubmit: (payload) => Promise<void>;
  busy: boolean;
}
```

**Состояние (управляется через `useUserAccessForm`):**
- `email`, `fullName`, `jobTitle`, `password`, `isActive`, `isPlatformAdmin`
- `memberships: Array<{ org_id, role, permissions }>`

**Layout (2 колонки на `lg`):**
```
┌─────────────────┬─────────────────┐
│ Email *         │ Имя             │
├─────────────────┼─────────────────┤
│ Должность       │ Пароль          │
├─────────────────┴─────────────────┤
│ [x] Активен  [x] Платформенный админ │
└─────────────────────────────────────┘
```

**Блок «Доступ по организациям»:**
- Скрывается, если `isPlatformAdmin === true`.
- Заголовок + кнопка «Добавить организацию».
- Для каждой membership:
  - Row 1: селект организации (disabled при редактировании? нет, можно менять), селект роли, кнопка удаления.
  - Row 2: `PermissionMatrix`.

**Валидация:**
- Email обязателен и валиден.
- Для нового пользователя пароль ≥ 8 символов.
- Если не platform admin — нужна минимум одна организация.
- Организации не должны повторяться.

**Submit:**
- `POST /api/admin/users` или `PATCH /api/admin/users/{id}`.
- После успеха закрыть Drawer и обновить список.

---

### 3.6 `PermissionMatrix`

**Props:**
```ts
{
  role: "org_admin" | "editor" | "org_viewer";
  permissions: Record<"view"|"create"|"edit"|"export"|"delete"|"manage_users", boolean>;
  onChange: (key, value) => void;
  onRoleChange: (role) => void;
  disabled?: boolean;
}
```

**Шаблоны по умолчанию:**
```js
const ROLE_TEMPLATE = {
  org_viewer: { view: true, create: false, edit: false, export: false, delete: false, manage_users: false },
  editor:     { view: true, create: true,  edit: true,  export: true,  delete: false, manage_users: false },
  org_admin:  { view: true, create: true,  edit: true,  export: true,  delete: true,  manage_users: true },
};
```

**Поведение:**
- Селект роли при изменении вызывает `onRoleChange(role)`, который устанавливает `permissions = { ...ROLE_TEMPLATE[role], ...existingCustom? }`? Нет — по требованию «перестраиваются автоматически, но остаются доступными для ручной корректировки»: при смене роли применяется шаблон, после чего пользователь может снова отклониться.
- `view` всегда `checked` и `disabled`.
- Чекбоксы расположены в 2 строки по 3 или в 1 строку на широком экране.
- Подписи: «Просматривать», «Создавать», «Редактировать», «Экспортировать», «Удалять», «Управлять пользователями орг.»

---

## 4. Состояния и ошибки

### Загрузка
- Таблица показывает skeleton/спиннер или строку «Загрузка…».
- Кнопка «Сохранить» в Drawer disabled при `busy === true`.

### Ошибки API
- В Drawer: красный баннер под формой с текстом ошибки.
- В таблице: красный баннер над таблицей.

### Успех
- Зелёный баннер «Пользователь создан/обновлён» на 3 секунды.

---

## 5. Accessibility

- Drawer: `role="dialog" aria-modal="true"`, focus trap внутри Drawer.
- Таблица: семантическая `<table>`, `<th scope="col">`.
- Чекбоксы: связанные `<label>`.
- Кнопки: `type="button"` для действий, `type="submit"` для сохранения.

---

## 6. Адаптив

- `< lg`: таблица горизонтально скроллится (`overflow-x-auto`), Drawer 100% ширины.
- `≥ lg`: Drawer 672px, форма в 2 колонки.

---

## 7. data-testid

- Поиск: `data-testid="user-access-search"`
- Фильтры: `data-testid="user-access-filter-{all|admins|editors|viewers|active|inactive}"`
- Таблица: `data-testid="user-access-table"`
- Строка: `data-testid="user-access-row-{userId}"`
- Drawer: `data-testid="user-access-drawer"`
- Кнопка добавления: `data-testid="user-access-add-button"`
- Сохранить: `data-testid="user-access-submit"`
- Тогглы: `data-testid="user-active-toggle"`, `data-testid="user-platform-admin-toggle"`
- Матрица: `data-testid="permission-matrix-{orgId}"`
