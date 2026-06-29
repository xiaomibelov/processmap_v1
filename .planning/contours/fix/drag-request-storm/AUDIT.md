# AUDIT: лишние запросы при drag BPMN-элемента

## Контур
- repo: `/root/processmap_v1_worktrees/fix-drag-request-storm`
- branch: `fix/drag-request-storm`
- base: `new-origin/main @ 5de2752f`
- target: `clearvestnic.ru:5177`

## Методика
Playwright-скрипт `/root/ui_verify/drag_audit_har.js`:
- логин `admin@local` / `admin`;
- открыта сессия `b1c8a56b6e / 03db107ebb`;
- попытка двух мышиных drag задачи `Activity_1c5b5zb`;
- fallback через `window.__FPC_E2E_RUNTIME__` → `modeling.moveElements([el], {x:40,y:30})`, чтобы гарантировать реальное изменение позиции;
- записан HAR `/tmp/drag_audit.har` и JSON-сводка `/tmp/drag_audit_summary.json`.

## Результаты (current stage build `v1.0.141`)

### Общее
- Всего `/api/*` запросов за сценарий: **42** (включая загрузку приложения).
- Запросов, непосредственно после перемещения задачи: **PUT /bpmn ×1**, **PATCH /sessions/{sid} ×1**, плюс несколько `GET /bpmn/versions` из-за UI-реакции на сохранение.

### Counts по endpoint'ам
| method | endpoint | count | комментарий |
|---|---|---|---|
| POST | `/api/auth/login` | 1 | логин |
| POST | `/api/auth/refresh` | 1 | 401, потом логин |
| GET | `/api/auth/me` | 2 | инициализация |
| GET | `/api/workspaces` | 2 | инициализация |
| GET | `/api/feature-flags` | 4 | инициализация |
| GET | `/api/meta` | 4 | инициализация / org meta |
| GET | `/api/note-mentions` | 2 | инициализация |
| GET | `/api/note-notifications` | 2 | инициализация |
| GET | `/api/projects` | 2 | инициализация |
| GET | `/api/explorer` | 1 | workspace explorer |
| GET | `/api/projects/{pid}/sessions` | 1 | панель сессий |
| GET | `/api/projects/{pid}/explorer` | 1 | дерево |
| POST | `/api/sessions/note-aggregates` | 1 | загрузка агрегатов обсуждений |
| GET | `/api/sessions/{sid}` | 2 | загрузка сессии |
| GET | `/api/sessions/{sid}/bpmn` | 1 | первичная загрузка BPMN |
| GET | `/api/sessions/{sid}/bpmn/versions` | 4 | список версий + реакция на save |
| GET | `/api/sessions/{sid}/auto-pass/precheck` | 1 | precheck |
| GET | `/api/sessions/{sid}/meta` | 1 | meta при открытии |
| GET | `/api/sessions/{sid}/mentionable-users` | 1 | для обсуждений |
| GET | `/api/orgs/{orgId}/property-dictionary/operations` | 1 | sidebar Camunda properties |
| GET | `/api/sessions/{sid}/note-threads` | 1 | панель обсуждений |
| GET | `/api/sessions/{sid}/note-aggregate` | 1 | badge обсуждений |
| POST | `/api/sessions/{sid}/presence` | 1 | heartbeat |
| **PUT** | `/api/sessions/{sid}/bpmn` | **1** | **autosave после перемещения** |
| **PATCH** | `/api/sessions/{sid}` | **1** | **session meta update после перемещения** |
| POST | `/api/telemetry/error-events` | 2 | telemetry |

### Последовательность запросов вокруг перемещения
```
Selecting task Activity_1c5b5zb
Starting drag 1
Drag 1 delta: 0 0          # мышиный drag не сдвинул задачу
Starting drag 2
Drag 2 delta: 0 0
API fallback move result: true
→ GET  /api/sessions/03db107ebb/bpmn/versions?limit=1
→ PUT  /api/sessions/03db107ebb/bpmn (payload 225 016 bytes)
→ PATCH /api/sessions/03db107ebb (payload 60 468 bytes)
→ GET  /api/sessions/03db107ebb/bpmn/versions?limit=1
→ GET  /api/sessions/03db107ebb/bpmn/versions?limit=1
```

## Root cause
1. **PUT /bpmn** — `createBpmnCoordinator` планирует autosave на каждый `commandStack.changed`. В текущем stage-debouce 10 000 мс; для одного быстрого перемещения улетает один PUT. При длительном drag/множественных перемещениях debounce не throttlит, поэтому возможно несколько flush-ей. Требуемое поведение: pure positional → **0** PUT; structural drag → ≤1 PUT с throttle 5 с и final debounce 500 мс.
2. **PATCH /sessions/{sid}** — перемещение триггерит `sessionMeta` autosave (вероятно, hybrid/drawio layer или обновление meta). Для pure x/y это не нужно.
3. **GET /note-threads / property-dictionary/operations** — в данном конкретном прогоне не перезагружались при движении (потому что выделенный элемент не менялся). Однако при реальном мышином drag, когда `selection.changed` уходит в `null` или на другой элемент, sidebar запросит их повторно. Требуется подавлять sidebar-загрузки на время drag.
4. **POST /presence** — heartbeat 45 с. В общем счете попадает 1 раз. Нужно 30 с.

## Наблюдения по мышиному drag
- Мышиный жест через Playwright не сдвинул задачу (`delta 0,0`). Вероятная причина: события уходят на canvas-контейнер/overlay, а не на `djs-shape`. В реальном браузере пользователь кликает задачу и тащит её. Для воспроизведения на уровне API использован `modeling.moveElements`, который генерирует те же `commandStack.changed` и тем самым проверяет autosave-путь.
- Для финальной верификации после фикса важно добиться реального мышиного drag; при необходимости скрипт будет допилен (клик по inner rect с `force`, использование `pointer` API или `dragTo`).

## Файлы аудита
- HAR: `/tmp/drag_audit.har`
- JSON summary: `/tmp/drag_audit_summary.json`
- screenshots: `/root/ui_verify/screenshots/drag_audit_before_*.png`, `drag_audit_after_*.png`
