# Фаза 2 — контракт API пользовательских настроек (НА СОГЛАСОВАНИЕ)

Статус: **скелет одобрен пользователем 2026-08-14** (namespaced ключи, base_version+409, whitelist-валидация, per-user+per-org). Реализация — после приёмки Фазы 1.

## Проблема

Состояние дерева «Проекты» (свёрнутые разделы) сейчас живёт только в памяти вкладки
(`treeStateByContext`) и теряется при перезагрузке. В Фазе 2 также появляются
настройки колонок, плотности и сохранённые виды — всё это per-user UI-состояние,
которое должно переживать перезагрузку и синхронизироваться между устройствами.

## Предлагаемый эндпоинт

```
GET   /api/users/me/preferences
PATCH /api/users/me/preferences
```

### GET /api/users/me/preferences

Ответ `200 application/json`:

```json
{
  "user_id": "u_123",
  "version": 7,
  "updated_at": 1755187200,
  "preferences": {
    "explorer.tree.collapsed": { "ws_main": ["f1", "f3"] },
    "explorer.columns": { "dod": true, "assignee": true, "composition": true, "status": true },
    "explorer.density": "comfortable",
    "explorer.saved_views": [
      { "id": "v1", "name": "Мои проекты", "filters": { "assignee": "me", "status": ["active"] }, "sort": { "key": "updatedAt", "direction": "desc" } }
    ]
  }
}
```

- `version` — монотонный счётчик (optimistic concurrency для PATCH).
- Отсутствующие ключи не возвращаются; клиент применяет свои дефолты.
- Если у пользователя ещё нет записи — `200` с пустым `preferences: {}` (не 404).

### PATCH /api/users/me/preferences

Тело — **частичное обновление по ключам** (merge на уровне верхнего namespaced-ключа,
значение ключа заменяется целиком; `null` — удалить ключ):

```json
{
  "base_version": 7,
  "set": {
    "explorer.tree.collapsed": { "ws_main": ["f1"] },
    "explorer.density": "compact"
  },
  "unset": ["explorer.saved_views"]
}
```

Ответы:
- `200` — актуальный снапшот (как GET) с инкрементированным `version`.
- `409 Conflict` — `base_version` не совпал (гонка двух вкладок). Тело: актуальный снапшот; клиент решает по last-write-wins или merge.
- `422` — невалидный ключ/значение (см. валидацию ниже).

## Namespaced ключи (whitelist)

| Ключ | Тип значения | Семантика | Фаза |
| --- | --- | --- | --- |
| `explorer.tree.collapsed` | `Record<workspaceId, string[]>` | ID свёрнутых разделов по workspace | 2 |
| `explorer.columns` | `Record<string, boolean>` | Видимость колонок таблицы (поверх авто-брейкпоинтов) | 2–3 |
| `explorer.density` | `"comfortable" \| "compact"` | Плотность строк | 2–3 |
| `explorer.saved_views` | `Array<SavedView>` | Сохранённые виды (фильтры+сортировка+колонки) | 3 |

Правила:
- Сервер валидирует имя ключа по whitelist и тип значения (jsonschema-lite в коде).
- Неизвестные ключи — `422` (не молча игнорировать: защита от опечаток).
- Лимиты: размер payload ≤ 64 KB; `saved_views` ≤ 20; `collapsed` ≤ 500 ID на workspace.
- Значения — только JSON data, без функций/HTML; строки экранируются при выводе (React по умолчанию).

## Хранение

Таблица `user_preferences` (sqlite, тот же storage):

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, org_id, key)
);
```

- Scope: **per-user + per-org** (настройки не протекают между организациями).
- `version` = счётчик строк пользователя (или отдельное поле; деталь реализации).
- Миграция: idempotent `CREATE TABLE IF NOT EXISTS` при старте, как остальные таблицы.

## Авторизация

- Доступ: любой аутентифицированный пользователь (свои настройки).
- org-scope: берётся из `active_org_id` запроса; чужие org не видны.

## Что НЕ входит (явно out of scope)

- Админские дефолты настроек для всех пользователей (Фаза 4, если понадобится).
- Синхронизация в реальном времени (websocket) — нет, только pull по фокусу вкладки.
- Миграция существующего localStorage — клиент при первом успешном GET может разово залить локальное состояние через PATCH (опционально, отдельным решением в Фазе 2).

## Порядок деплоя

Аддитивно: сначала бэкенд (эндпоинт + таблица), затем фронт (чтение/запись).
Старый фронт с новым бэкендом и наоборот — безопасны (фронт без эндпоинта просто не персистит).

## Решения (подтверждены пользователем 2026-08-14)

1. **Конкуррентность**: `base_version` + `409` + last-write-wins на клиенте — достаточно; полный merge/CRDT не нужен.
2. **Scope**: per-user + per-org (настройки не протекают между организациями).
3. **Whitelist ключей**: `explorer.tree.collapsed`, `explorer.columns`, `explorer.density`, `explorer.saved_views` заводятся в схему сразу (пустыми), заполняются по мере Фаз 2–3.
4. **saved_views**:
   - Лимиты: ≤ 20 видов на user+org; имя ≤ 80 символов; суммарный payload preferences ≤ 64 KB; превышение → `422`.
   - Валидация фильтров вида против whitelist допустимых filter-ключей и значений; неизвестные ключи фильтра → `422`. *(Уточнение 2026-08-16: whitelist фильтров будет зафиксирован в Фазе 3 вместе с фронтом saved_views; в Фазе 2 валидируется только структура: id/name ≤ 80, filters/sort — объекты.)*
   - Шаринг: **только через URL-сериализацию** (параметры в ссылке; при открытии клиент валидирует и может предложить «Сохранить как мой вид»). Shared-сущность с owner/ACL — вне рамок Фазы 2.

## Уточнения при реализации (2026-08-16, ветка uiux/preferences-tree-v1)

5. **Хранилище — PostgreSQL/SQLite через общий storage-слой** (вместо «sqlite» из раздела «Хранение»): primary DB проекта — PostgreSQL (`DATABASE_URL`), dev/tests — SQLite; DDL idempotent при старте в `backend/app/storage.py`, значения — `value_json TEXT` (JSON-строка), как остальные `*_json` колонки. `version` документа (user+org) — в отдельной таблице `user_preferences_docs`, чтобы счётчик переживал удаление всех ключей.
6. **Семантика `explorer.tree.collapsed`**: дефолт дерева в UI — «всё свёрнуто» (`expandedByFolder = {}`), поэтому collapsed-список был бы избыточен. Значение ключа хранит **ID явно раскрытых пользователем узлов** (`Record<workspaceId, string[]>`). Лимит ≤ 500 ID на workspace сохраняется.
