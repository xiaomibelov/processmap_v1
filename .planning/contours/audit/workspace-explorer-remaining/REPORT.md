# audit/workspace-explorer-remaining — REPORT

Дата аудита: 2026-09-02.
Stage: `https://stage.processmap.ru/app`, сборка в footer: `d8abc4a1c45fa31d3b6c68ebd1a1b21fc761aabc`, `STAGE`, `2026-09-02 14:59:15`.
Ветка аудита: `audit/workspace-explorer-remaining`, HEAD: `d8abc4a1c45fa31d3b6c68ebd1a1b21fc761aabc`.

Product code не менялся. В worktree добавлены только audit-артефакты.

## Использованный skill ui-ux-pro-max

Установка:

- `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max` не выполнен: на хосте нет `npx`.
- fallback выполнен: `git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill .claude/skills/ui-ux-pro-max`.
- В установленном репозитории нет верхнеуровневого `SKILL.md`; прочитаны `skill.json`, `README.md`, `CLAUDE.md`, `references/quick-reference.md`.

Результаты `search.py`:

- `ux / data table tree hierarchy`: 5 результатов. Релевантно: table overflow, multi-select/bulk patterns, breadcrumbs for 3+ levels, heading hierarchy.
- `ux / toast notification`: 1 результат. Релевантно: toast должен быть transient, auto-dismiss 3-5s, не persistent layout block.
- `ux / sidebar navigation layout`: 5 результатов. Релевантно: sticky nav не должен перекрывать content, keyboard navigation, back behavior preserving state, breadcrumbs.
- `ux / assignee picker multi-select`: 2 результата, прямых паттернов assignee picker не найдено; результаты слабой релевантности.
- `ux / state persistence`: 5 результатов. Релевантно: active state, cancellable state transitions, compact controls; прямой критерий screen-state найден через web-domain.
- `web / sidebar navigation layout`: 5 результатов. Релевантно: `Preserve Screen State` и `Back Behavior`: не сбрасывать scroll/list state при возврате или действии.
- `icons / search`: 0 результатов, suggestions: 0. Skill не дал рекомендации по search icon; целевой фикс должен использовать существующий иконочный набор проекта.

Quick-reference checklist применён как критерии: layout shift, state preservation, fixed toast, data-table units, navigation hierarchy, focus/keyboard labels, responsive 1280/1920.

## Stage Evidence

Скриншоты:

- `screenshots/workspace-1280.png` — WorkspaceExplorer 1280px.
- `screenshots/workspace-1920.png` — WorkspaceExplorer 1920px.
- `screenshots/stage-1280-after-login.png`, `screenshots/stage-1920-after-login.png` — org chooser после login.
- `screenshots/assignee-ui-before.png` — headless UI attempt; оставался на login/org step, поэтому для A2 использован API/telemetry repro.

API/telemetry:

- `GET /api/sessions/784f86a864/assignees` на stage: `200`, body `[]`.
- `PUT /api/sessions/784f86a864/assignees` body `{"user_ids":[]}`: `200`, body `{"session_id":"784f86a864","user_ids":[],"assigned_by":"..."}`.
- `PUT /api/sessions/784f86a864/assignees` body `{"user_ids":["3ef8ba9f51364233851cddcf2592495b","9affb35155e24955b8f10e5a17842f37"]}`: `500`, body `{"detail":"internal_server_error","request_id":"audit_workspace_explorer_assignees_e2e"}`.
- `GET` после 500: `200`, body `[]`.
- Восстановительный `PUT []`: `200`, финальный `GET`: `[]`.

Stage telemetry по указанному request id:

```text
request_id: api_mtk8zolv_ef5fe0
event: backend_exception
message: Unhandled backend exception: AttributeError
route: /api/sessions/{session_id}/assignees
path: /api/sessions/784f86a864/assignees
method: PUT
status_code: 500
stack:
  sessions.py:307 put_session_assignees
  session_assignment_service.py:192 replace_assignees
  repository.py:240 _replace_session_assignees
```

Повторный audit request `audit_workspace_explorer_assignees_e2e` дал тот же fingerprint `9e8957f1422203fe1c6bf4c7e53fd6e2bc9bf268a93ee8532c9c64d337a57e96`.

Прямой SSH/docker-доступ к stage api-контейнеру в этом контуре не использовался; вместо container logs поднят persisted backend telemetry через `/api/admin/error-events`, где сохранён stack по `request_id`.

## A1. Назначение пользователя сворачивает/скрывает explorer

Severity: major, но для session-assignees сейчас blocked by A2.

Repro:

1. Открыть stage WorkspaceExplorer в org `Роботизация производств`.
2. Найти сессию `784f86a864`.
3. Открыть диалог назначения исполнителей, выбрать 2 пользователей, сохранить.
4. Текущий результат: запрос падает 500, успешный after-save state не наступает.

Первопричина:

- Для session-assignees успешный путь уже реализован точечно: `frontend/src/features/explorer/WorkspaceExplorer.jsx:2884-2907` и `:4177-4197` патчат только `projectSessionsQueryKey`, `page.sessions` и `sessionChildrenCache`, без `load()`.
- Поэтому collapse именно после успешного session-assignee сейчас нельзя проверить до исправления A2.
- Есть доказанный reset-path для других назначений: `handleSaveAssignee` вызывает `await load({ resetInlineChildren: true })` после назначения responsible у папки и executor у проекта: `WorkspaceExplorer.jsx:2859-2870`.
- `load({ resetInlineChildren: true })` очищает `childItemsByFolder/loadingByFolder/loadErrorByFolder`: `WorkspaceExplorer.jsx:2491-2505`. Это закрывает подгруженные ветки и визуально выглядит как collapse/потеря контекста.

Предложение фикса:

- После A2 прогнать successful session-assignees UI flow.
- Для folder responsible/project executor заменить full reload на точечное обновление соответствующей строки в react-query/page state.
- Любые неизбежные invalidate/refetch должны сохранять и восстанавливать `expandedByFolder`, `childItemsByFolder`, `scrollTop`, `searchQuery`, `statusFilter`.

Оценка: 1-1.5 дня вместе с тестами.

## A2. `PUT /api/sessions/784f86a864/assignees` → 500

Severity: blocker.

Repro на stage:

```http
PUT /api/sessions/784f86a864/assignees
Content-Type: application/json

{"user_ids":["3ef8ba9f51364233851cddcf2592495b","9affb35155e24955b8f10e5a17842f37"]}
```

Ответ:

```json
{"detail":"internal_server_error","request_id":"audit_workspace_explorer_assignees_e2e"}
```

Первопричина:

- Router вызывает service: `backend/app/routers/sessions.py:304-307`.
- Service нормализует и валидирует массив, затем вызывает repository: `backend/app/services/session_assignment_service.py:188-198`.
- Repository для непустого массива вызывает `con.executemany(...)`: `backend/app/domains/storage/canvas_session/repository.py:217-245`.
- На stage используется Postgres compat connection. `_PgCompatConnection` реализует `execute`, `commit`, `rollback`, но не `executemany`: `backend/app/domains/storage/compat/repository.py:231-280`.
- Поэтому непустой массив падает `AttributeError`; пустой массив проходит, потому что ветка `if final_ids:` не выполняется.

Предложение фикса:

- Либо добавить `executemany` в `_PgCompatConnection`, используя `_translate_sql_for_postgres` и cursor loop/batch.
- Либо в `_replace_session_assignees` заменить `con.executemany(...)` на переносимый loop `con.execute(...)` для каждого uid.
- Добавить backend contract test на `PUT` с двумя валидными `user_ids` в Postgres/compat режиме, плюс тест на `PUT []`.

Оценка: 0.5 дня.

## A3. Workspace actions находятся в глобальной шапке

Severity: major.

Repro на stage:

- На `workspace-1280.png` и `workspace-1920.png` видно, что `Поиск по workspace`, `Создать раздел`, `Проект` находятся в той же верхней полосе, что и глобальные вкладки `Проекты / Аналитика / DK`.
- Search icon отрисован как текстовый glyph `⌕`, не как проектная иконка.

Первопричина:

- Explorer portal-ит `explorerHeader` в `useWorkspaceMainNavSlot`: `frontend/src/features/explorer/WorkspaceExplorer.jsx:3106-3109`, `:3271`.
- Внутри этого header смешаны left-zone tabs и right-zone workspace actions: `WorkspaceExplorer.jsx:3201-3264`.
- Search icon hardcoded glyph: `WorkspaceExplorer.jsx:1314-1318`.
- Skill `icons/search` вернул 0 результатов, поэтому внешняя рекомендация по конкретной иконке отсутствует.

Целевая IA:

- Глобальный header: org-level переключатели, глобальные tabs/entry points, профиль, уведомления.
- Workspace toolbar: search по дереву, `Создать раздел`, `Создать проект`, workspace-local фильтры/сортировки.
- Search icon заменить на существующую проектную icon API/набор. Если icon library не подключена в explorer, сначала найти локальный паттерн иконок; не оставлять glyph.

Оценка: 0.5-1 день.

## A4. Плашка «Ответственный назначен» создаёт layout shift

Severity: major.

Repro:

- Успешный visible repro через session-assignees сейчас blocked by A2.
- Source-proof достаточен: `moveNotice` рендерится in-flow между header и таблицей.

Первопричина:

- `moveNotice` state: `WorkspaceExplorer.jsx:2404`.
- Успешные назначения пишут notice: `WorkspaceExplorer.jsx:2863`, `:2870`, `:2899`.
- Notice DOM: `WorkspaceExplorer.jsx:3276-3278`:
  `div className="px-4 py-2 ... border-b ..."` внутри flex-column перед table/filter chips.
- Это меняет высоту контентной области и сдвигает filter chips/table вниз. Skill checklist запрещает content jumping и рекомендует toast overlay с auto-dismiss.

Предложение фикса:

- Заменить in-flow notice на fixed toast viewport внутри WorkspaceExplorer или переиспользуемый app toast.
- `position: fixed`, `pointer-events-none` viewport, toast `role="status" aria-live="polite"`, auto-dismiss 3-5s, ручное закрытие для error/warning.
- Добавить UI/source test, что WorkspaceExplorer feedback не рендерится перед таблицей и имеет fixed viewport.

Оценка: 0.5 дня.

## A5. Непредсказуемая свёрнутость после reload/действий

Severity: major.

Требуемое поведение:

- `expanded/collapsed` хранится per-user + per-org/workspace.
- Мутации назначения/создания не меняют состояние веток.
- После reload восстанавливается последнее состояние пользователя.
- Поиск/фильтры не должны затирать persisted expanded state.

Первопричина:

- Ключ называется `explorer.tree.collapsed`, но хранит явно раскрытые ids: `frontend/src/features/explorer/explorerTreePersistence.js:1-17`, `:32-49`.
- Комментарий в UI подтверждает инверсию: default tree = collapsed, stored ids = expanded: `WorkspaceExplorer.jsx:2428-2432`.
- Сохранение не scoped по org, только по `workspaceId`: `expandedIdsFromPreferences(preferences, workspaceId)` и `treeCollapsedWithExpandedIds(..., workspaceId, ...)`.
- При `load({ resetInlineChildren: true })` дочерние строки удаляются из `childItemsByFolder`: `WorkspaceExplorer.jsx:2491-2505`; затем prefs effect заново грузит только ids из server snapshot: `WorkspaceExplorer.jsx:3046-3058`.
- Если debounce PATCH не успел сохраниться или GET prefs вернул старый snapshot, UI получает “всё свёрнуто”.

Предложение фикса:

- Переименовать/мигрировать preference contract в явный `explorer.tree.expanded` либо документировать legacy key как expanded-list.
- Scope: `{orgId, workspaceId}` или отдельный ключ per org/workspace, чтобы не протекало между контекстами.
- Мутации не должны вызывать `resetInlineChildren`; если invalidate обязателен, snapshot локального expanded/children/scroll/search/filter должен восстанавливаться синхронно.
- Добавить тесты на debounce race: expand → mutate before PATCH flush → UI остаётся раскрытым; reload восстанавливает server-persisted state.

Оценка: 1 день.

## B1. Дерево и стык sidebar/content

Severity: minor/regression-watch.

Stage check:

- На `workspace-1280.png` и `workspace-1920.png` вертикальная ось между sidebar и content выглядит непрерывной; явного пересечения hover/active подсветки через разделитель не видно.
- Горизонтальные линии header/filter/table визуально сходятся лучше, чем в предыдущем дефекте.
- Не проверены hover states видео/динамикой из-за блокировки UI assignment flow; оставить визуальный regression checklist в fix-контуре.

Предложение: добавить Playwright screenshot assertions/debug-grid только в fix-контуре, overlay не коммитить.

## B2. Колонка «Состав»

Severity: minor.

Stage check:

- На stage больше нет голых `3/148`: видны подписи вида `7 проектов`, `1/52 сессии`, `0/24 сессии`.

Контракт/семантика:

- Backend реально считает сессии, а не subprocesses: `trackable_sessions_by_project`, `done_sessions_by_project` в `backend/app/domains/storage/explorer/repository.py:454-486`; поля payload `sessions_count`, `done_sessions_count`, `trackable_sessions_count`: `:512-527`; folder rollup: `:591-613`.
- Frontend форматирует progress как сессии: `frontend/src/features/explorer/explorerTableFormat.js:41-64`.

Вывод:

- Критерий “без голых чисел” выполнен.
- Если продуктово ожидается “подпроцессы”, API сейчас отдаёт другую семантику; это отдельное изменение контракта, не косметика.

## B3. Мультиназначение исполнителей

Severity: blocker (из-за A2).

UI:

- Диалог использует checkbox для `session_assignees`: `WorkspaceExplorer.jsx:946-966`, `:1021-1036`.
- Save disabled только при пустом выборе: `WorkspaceExplorer.jsx:1063-1068`.

API:

- `PUT` с двумя валидными пользователями падает 500 на stage; список не переживает reload, потому что запись не создаётся.

## B4. Console/network

Severity: minor/major depending gate strictness.

Stage check:

- При входе в `/app` headless console фиксирует `Failed to load resource: the server responded with a status of 401 ()`.
- Network source: `POST /api/auth/refresh` → `401 {"detail":"missing_refresh_token"}`.
- ReferenceError на текущей сборке не обнаружен.
- Unhandled 500 по assignees воспроизводится на API и фиксируется в telemetry.

Предложение:

- Refresh 401 без refresh token не должен попадать в visible console error на нормальном auth bootstrap path.
- Assignees 500 чинить как A2; frontend уже откатывает optimistic state и показывает ошибку в dialog, но backend должен вернуть 200/422/403 по контракту, не 500.

## Quick-Reference Violations

- Layout shift: `moveNotice` in-flow перед таблицей нарушает no-content-jumping.
- Toast: success feedback не overlay, нет auto-dismiss 3-5s и `aria-live` в WorkspaceExplorer.
- Navigation hierarchy: workspace actions смешаны с global header.
- State preservation: `load({ resetInlineChildren: true })` после части назначений сбрасывает loaded tree context.
- Data table units: bare numbers устранены; semantic ambiguity “sessions vs subprocesses” остаётся контрактным риском.
- Multi-select: UI есть, backend contract ломается на непустом массиве.
- Console cleanliness: bootstrap `auth/refresh` 401 пишет console error.
