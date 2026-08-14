# Фаза 2 — контракт API пользовательских настроек (НА СОГЛАСОВАНИЕ)

Статус: **draft, до реализации**. Требуется явное одобрение пользователя.

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

## Открытые вопросы к согласованию

1. `base_version` optimistic concurrency — достаточно, или нужен полный CRDT/merge? (Предлагаю: достаточно 409 + last-write-wins на клиенте.)
2. Scope per-org — правильно, или настройки глобальны per-user? (Предлагаю per-org: explorer-контекст привязан к org.)
3. Ключи `explorer.columns`/`density`/`saved_views` заводить сразу в схему (пустыми) или добавлять по мере фаз? (Предлагаю: сразу в whitelist, заполняются в Фазах 2–3.)
