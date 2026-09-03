# AUDIT: WorkspaceExplorer decomposition — инвентаризация, связанность, метрики

- Контур: `audit/workspace-explorer-decomposition`
- Baseline: `origin/main` @ `d7e8b04a` («Fix workspace toolbar tree controls (#900)»)
- Объект: `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- Дата аудита: 2026-09-03
- Характер: ТОЛЬКО документы. Product code не изменялся.

> **Важная поправка к преамбуле контура.** Файл — не 1700+ строк, а **5204 строки** (4902 non-blank non-comment).
> Данные вводной «1700+» устарели примерно на три контура. Проблема заявлена мягче, чем есть на самом деле:
> в одном JSX-файле живут 77 top-level определений, 70 `useState`, 28 `useEffect`, два контейнера
> (`ExplorerPane` 1375 строк, сложность 83; `ProjectPane` 798 строк, сложность 64) и ~30 презентационных компонентов.

---

## 1. Инвентаризация ответственностей

Легенда «Куда просится»: целевой файл/модуль из плана декомпозиции (см. DECOMP.md).

### 1.1 State (все useState/useReducer/useRef)

#### Корневой `WorkspaceExplorer` (L5071–5204)
Собственного состояния нет: данные из `useWorkspaceExplorerController` (L5098) и `useAuth` (L5079).

#### `ExplorerPane` (L2446–3820) — дерево воркспейса, самый нагруженный компонент

| Строки | State | Назначение | Кластер → куда просится |
|---|---|---|---|
| 2471 | `actionError` | inline-баннер ошибки (сбрасывается эффектом рефетча 2476) | диалоги/действия → `ExplorerPane.jsx` |
| 2482–2486 | `creatingFolder`, `creatingProject`, `movingFolder`, `movingProject`, `moveNotice` | модалки create/move + toast | модалки → `explorerOverlays.jsx`; toast — туда же |
| 2487–2494 | `assigneeDialog`, `assigneeMembersState` | диалог назначения + список юзеров орга | assignees → `useAssigneesDialog` |
| 2495–2502 | `searchQuery`, `debouncedSearchQuery`, `globalSearchState` | поиск: ввод, 300ms debounce, результат `/api/explorer/search` | поиск → `useExplorerGlobalSearch` |
| 2503 | `explorerSort` | `{key, direction}` сортировки дерева | сортировка → `useExplorerSort` (тонкая обвязка над `explorerSortModel.js`) |
| 2504–2505 | `statusFilter`, `hiddenStatusMenuOpen` | чип-фильтр статусов + меню «…» | фильтры → `useStatusVisibilityFilter` |
| 2506 | `bulkTreeMode` | транзиентный expand-all/collapse-all | дерево → `useTreeExpansion` |
| 2507 | `treeStateByContext` | **ядро дерева**: `{expandedByFolder, childItemsByFolder, loadingByFolder, loadErrorByFolder}` по ключу `workspaceId::folderId` | дерево → `useTreeExpansion` |
| 2508 | `activeTab` | вкладка «Проекты»/«Аналитика» | контейнер → `ExplorerPane.jsx` |
| 2509 | `inFlightFolderLoadsRef` | Set: дедуп параллельных загрузок детей | дерево → `useTreeExpansion` |
| 2524–2526 | `persistTick`, `persistedExpandedRef`, `treeSaverRef` | персистентность раскрытия (snapshot из prefs + saver) | персистентность → `useTreeExpansion` (внутри) |
| 2676–2678 | `explorerTableContainerRef`, `explorerTableRORef`, `explorerTableWidth` | ResizeObserver → адаптивная раскладка колонок | layout → `useElementWidth` уже существует; обвязка → контейнер |
| 2717 | `projectUploads` | dnd-upload BPMN на строки проектов `{stage, error, sessionId, file, name}` | uploads → `useBpmnProjectUploads` |
| 3205 | `initialPrefsLoadedRef` | guard: предзагрузка детей один раз на снапшот prefs | дерево → `useTreeExpansion` |

#### `ProjectPane` (L4270–5067) — экран проекта (сессии), дублирует паттерны ExplorerPane

| Строки | State | Назначение | Куда просится |
|---|---|---|---|
| 4271–4274 | `page`, `loading`, `error`, `moveNotice` | payload `GET /api/projects/{id}/explorer` (local state, НЕ react-query) + toast | `useProjectPage` / `ProjectPane.jsx` |
| 4275 | `creating` | SessionCreateModal open | overlays |
| 4278–4281 | `pendingUploads`, `tableDragOver`, `pendingUploadSeq`, `openingSessionId` | dnd-upload сессий + «открывается…» | `useSessionBpmnUploads`, `useSessionOpen` |
| 4282–4284 | `searchQuery`, `sessionSort`, `activeTab` | локальный поиск/сортировка/вкладки | `useProjectSessionsView` |
| 4285–4292 | `assigneeDialog`, `assigneeMembersState` | **дубликат** ExplorerPane 2487–2494 | `useAssigneesDialog` (общий) |
| 4293 | `openingSessionIdRef` | re-entrancy guard открытия сессии | `useSessionOpen` |
| 4297–4300 | `expandedSessionIds`, `sessionChildrenCache`, `loadingSessionChildren`, `sessionChildrenErrors` | дерево субпроцессов сессий | `useSessionChildrenTree` |

#### Мелкие компоненты
- `InputModal` 586: `value/busy/error/ref` (587–590). `ConfirmModal` 629: `busy/error`. `ExplorerMarqueeText` 817: refs + `truncated`.
- `StatusPopoverControl` 855: **единственный `useReducer`** (857, `explorerStatusChangeReducer`: current/pending/saving), `open`, `rootRef`.
- `AssigneeDialog` 977: `selectedUserIds/query/busy/error`. `MoveFolderDialog` 1133 / `MoveProjectDialog` 1245: `selectedTargetId/busy/error`.
- `ContextMenu` 1745: `ref/position`. `FolderRow` 1806, `ProjectRow` 1957, `SessionRow` 3824: `menuOpen/renaming/deleting` (+`fileDragOver` у ProjectRow, `creatingSubprocesses/subprocessLoadError` у SessionRow).
- Хуки: `useViewportBelow` 1488, `useDelayedSkeleton` 1509.

### 1.2 Side-effects (все useEffect: что грузят / что инвалидируют / зависимости)

#### ExplorerPane

| Строки | Эффект | Что делает | Депсы / примечания |
|---|---|---|---|
| 2476 | clear actionError | сброс баннера при успешном рефетче | `[pageQuery.dataUpdatedAt, pageQuery.isSuccess]` |
| 2540 | attach prefs → treeSaver | привязка prefs-документа к saver | `[prefsQuery.data]` |
| 2550 | reset statusFilter | если активный фильтр скрыт настройкой → «all» | `[statusFilter, hiddenStatusKeySet]` |
| 2558 | mergedExpandedByFolder (memo) | **merge: fallback(persistedExpandedRef) → prefs → explicit toggles**; порядок важен | `[…, persistTick, prefs]` |
| 2589 | `load` callback | `invalidateQueries(explorerPageQueryKey)` + reset inline children | 4 deps |
| 2605 | `handleStatusVisibilityChange` | optimistic `setQueryData(USER_PREFERENCES)` + `patchUserPreferences` + **ручной rollback** | 7 deps |
| 2643 | `patchExplorerItemInCaches` | **патчит ДВА хранилища разом**: react-query cache + `childItemsByFolder` | высший риск при расщеплении |
| 2679/2694 | ResizeObserver | создать/отключить RO на контейнере таблицы | `[]` |
| 2718–2772 | upload callbacks | `handleProjectFileDrop` → `createSessionWithBpmnUpload`; retry | читают `projectUploads` |
| 2779–2843 | filter/sort memos | `filterExplorerTreeByStatus`, `sortExplorerItems`, bulk-expandable id-списки (локальный обход дерева — частичный дубль `work3TreeState.js`) | — |
| 2798 | effectiveExpandedByFolder | **при активном фильтре статуса игнорирует collapse** (принудительное раскрытие совпадений) | 4 deps |
| 2809/2820 | visibleRows (memo) | `buildVisibleRows` | 6 deps |
| 2867 | debounce search | 300ms `searchQuery → debouncedSearchQuery` | `[searchQuery]` |
| 2874 | **global search** | `apiSearchExplorer(ws, q, limit 50)`, disposed-flag, пишет `globalSearchState` | `[debouncedSearchQuery, workspaceId]` |
| 2918 | load assignable users | `apiListOrgAssignableUsers` + `Promise.race` timeout | `[activeOrgId, assigneeDialog]` — **дубликат ProjectPane 4358** |
| 2976 | `handleSaveAssignee` | 3 ветки (responsible→`apiUpdateFolder`, executor→`apiPatchProject`, session_assignees→`apiReplaceSessionAssignees`), optimistic + **ручной rollback обоих хранилищ**, снапшот treeState | 9 deps, сложность 37 |
| 3064/3086 | status change folder/session | folder: `apiUpdateFolder({context_status})`; session: `apiGetSession` → `apiPatchSession({status, base_diagram_state_version})` + invalidate | версионный патч |
| 3123 | `ensureFolderChildrenLoaded` | дедуп через inFlight Set → `apiGetExplorerPage(ws, fid)` → запись в tree state; `actionError` при падении | 4 deps, гонки дедупятся |
| 3162/3186 | toggle expand folder/project | toggle + `treeSaverRef.schedule(...)` + ленивая загрузка детей | читают `mergedExpandedByFolder` (порядок merge!) |
| 3206 | **pref restore** | один раз на снапшот prefs: `ensureFolderChildrenLoaded` для каждого сохранённого id | ordering-sensitive, идёт параллельно с 3220 |
| 3216/3220 | bulk mode apply | reset на смену контекста; `buildTreeBulkExpandedMap` + ensure loads | 5 deps |
| 3236/3251 | toggle-all / open search result | bulk toggle; навигация по результатам поиска | — |

#### ProjectPane

| Строки | Эффект | Что делает | Примечания |
|---|---|---|---|
| 4310/4336 | `load` + mount effect | `apiGetProjectPage` в **локальный state** (3 режима: tree/rootOnly+meta/plain) | `[workspaceId, projectId, treeEnabled, eagerTree]`; **параллельно живёт react-query `projectSessionsQuery` (4302)** — два хранилища одних сессий |
| 4337 | reset openingSessionId | на смену проекта | `[projectId]` |
| 4342 | drop children cache | при обновлении `projectSessionsQuery.data` | двойное владение данными |
| 4350/4358 | `patchSessionAssigneesInList` + load users | дубль эффекта 2918 | — |
| 4394–4437 | pending-upload helpers | `handleSessionFileDrop`/`handlePendingUploadRetry` | дубль паттерна 2718–2772 |
| 4439 | `handleSaveProjectSessionAssignees` | optimistic-патч **ТРЁХ** хранилищ (react-query sessions, local `page`, `sessionChildrenCache`) + rollback | дубль ветки `session_assignees` из 2976 |
| 4494 | `handleSessionPatched` | `JSON.parse(JSON.stringify(page))` deep clone в updater | — |
| 4506 | `handleSessionStatusChange` | тот же versioned-flow, что 3086, но патчит local page + `load()` вместо invalidate | **дублирование версионного флоу** |
| 4543 | `handleProjectStatusChange` | `mapCatalogStatusToProjectApi` + `apiPatchProject({status})` | — |
| 4555/4579 | load children / toggle expand | `apiGetSessionChildren` в кэш; Set copy | — |
| 4593 | **eager children for expanded ids** | итерация Set, 3 guard-кэша; O(n) на каждое раскрытие | — |
| 4605–4612 | sortedSessions / sort handler | `sortProjectSessions` + `toggleExplorerSort` | модель общая, обвязка дублирует ExplorerPane |
| 4612–4634 | aggregate ids | сбор id для notes aggregate → `useSessionNoteAggregates` | — |
| 4646 | `handleOpenSessionRequest` | re-entrancy ref, `projectContext`, `onOpenSession` | 4 deps |
| 4699–4711 | searchIndex/searchModel (local) | **локальный поиск без debounce и без global call** (в ExplorerPane — с обоими) | дубль паттерна поиска |

#### Контроллер `useWorkspaceExplorerController.js` (sibling, 339 строк)
Состояния: workspaces/loading/error, `activeWorkspaceId`, `currentFolderId`, `currentProjectId`, `breadcrumbBase`, `resolvedRequestWorkspaceId`, `projectRestoreStatus`, `ignoredRequestProjectId`, кэши-refs.
Эффекты: загрузка ws по оргу (74); resolve workspace (105); **reset на смену орга (119 — ordering-sensitive, после load)**; restore проекта из URL с BFS `apiFindProjectWorkspace` (129, самая длинная цепочка депсов — 8); cleanup ignored-id (194); apply restore (212).
Колбэки: select/create workspace, navigate folder/project/breadcrumb, back, renamed.

### 1.3 Сетевые вызовы

Все через `explorerApi.js` + `../../lib/api`. Полный список endpoint'ов и мест:

| Endpoint | Вызывающий код (строка) | Триггер |
|---|---|---|
| `GET /api/workspaces` | контроллер 78, 310; `WorkspaceSidebarActiveCounters` 1543; `ensureFolderChildrenLoaded` 3137 | org change / rename / счётчики / expand |
| `POST /api/workspaces` | контроллер 260 | sidebar «+» |
| `PATCH /api/workspaces/{id}` | `WorkspaceSidebar` 1733 | rename |
| `GET /api/explorer` | react-query `explorerPageQueryOptions` 2464 | загрузка страницы |
| `GET /api/explorer/search` | эффект 2887 | debounced поиск ≥2 символов |
| `PATCH /api/user/preferences` | 2626 (status visibility); tree saver | видимость чипов; раскрытие |
| `POST /api/workspaces/{id}/folders` | 3747 | тулбар |
| `PATCH /api/folders/{id}` | 1924 (rename), 2992 (responsible), 3071 (context_status) | меню/диалоги/popover |
| `POST /api/folders/{id}/move` | 1178 | move-диалог |
| `DELETE /api/folders/{id}` | 1937 + 1942 (409 → cascade retry) | удаление |
| `POST /api/folders/{id}/projects` | 3762 | тулбар |
| `POST /api/projects/{id}/move` | 1288 | move-диалог |
| `GET /api/projects/{id}/explorer` | `ProjectPane.load` 4317–4321 | mount/reload |
| `GET /api/sessions/{id}/children` | `loadSessionChildren` 4565 | expand сессии |
| `POST /api/sessions/{id}/create-subprocesses` | `SessionRow.loadAllSubprocesses` 3894 | «Загрузить остальные N» |
| `POST /api/projects/{id}/explorer/sessions` | `SessionCreateModal` 5036 | создание сессии |
| `POST /api/sessions/{id}/bpmn-upload` | `bpmnUploadFlow.js` (drops 2742, retries 2761/4427, modal 5047) | dnd/upload |
| assignable-users (`apiListOrgAssignableUsers`) | 2928, 4368 | открытие assignee-диалога |
| `GET /api/sessions/{id}` | 3093, 4511 | версионный статус-флоу |
| `PATCH /api/sessions/{id}` | 3100 (status), 4118 (rename) | popover/rename |
| `DELETE /api/sessions/{id}` | 4083 (**`window.confirm` — нарушение AGENTS.md §6**) | kebab |
| `PATCH /api/projects/{id}` | 2101 (rename), 3015 (executor), 4546 (status) | диалоги/popover |
| `DELETE /api/projects/{id}` | 2114 | удаление |
| session assignees replace | 3049, 4462 | assignee-диалог |
| `apiFindProjectWorkspace` (BFS по ws) | контроллер 171 | restore проекта из URL |

### 1.4 Обработчики по фиче-зонам

- **Дерево expand/collapse:** 3162, 3186, 3236, 3123, bulk-эффект 3220, restore-эффект 3206; кнопки-шевроны в строках (1856, 2025, 3926).
- **Поиск:** ExplorerPane 3489 (input), 2867 (debounce), 2874 (global), 3251 (open result); ProjectPane 4707/4711 (локальный, без global).
- **Сортировка:** 2774 (дерево), 4609 (сессии), `SortHeader` 454/463; шапки 3572/3591 и 4906–4938.
- **Фильтры:** чипы 3423, меню «…» 3453, `handleStatusVisibilityChange` 2605, reset-эффект 2550; **второй инлайн-фильтр статусов в `ProjectSessionsRows` 2220–2229** (другая реализация).
- **Назначение исполнителей:** открытие 3637 (responsible), 3698 (executor), 3672/4980/5011 (session_assignees); сохранение 2976 и 4439 — **два параллельных флоу**.
- **Kebab/context menu:** `ContextMenu` 1745; сбор items: FolderRow 1836–1845, ProjectRow 1987–1993, SessionRow 4071–4093; fixed-позиционирование + viewport clamp (#900).
- **Статусные переходы:** folder 3064; session 3086 (дерево) и 4506 (проект) — дубль; project 4543; `StatusPopoverControl.handleSelect` 894.
- **Навигация/breadcrumbs:** колбэки контроллера 251–309; crumbs ExplorerPane 3295–3307, back 3329–3348; ProjectPane 4682–4688, back 4730–4742; `AppRouteLink` 2042–2049; open-search-result 3251/4711.
- **Персистентность:** `treeSaverRef.schedule()` в 3173/3195; attach 2540; snapshot→ref 2529–2537; prefs статусов 2605–2637.
- **Drag&drop upload:** project-row 2000–2017 + `handleProjectFileDrop` 2732/retry 2756; sessions-table drop-zone 4472–4492 + `handleSessionFileDrop` 4400/retry 4423.

### 1.5 Рендер-секции

**ExplorerPane:** header-портал 3367–3404 (портирование 3522); toolbar 3411–3518 (чипы 3417–3437, bulk 3438–3449, меню «…» 3450–3481, счётчик 3483–3485, поиск 3486–3491, create 3492–3516); основной return 3520–3819 (баннер 3524, toast 3527, analytics 3531–3534, search results 3535–3539, таблица 3540–3722, empty 3723–3737); модалки 3740–3817.
**ProjectPane:** header-портал 4761–4806 (портирование 4833); toolbar 4807–4829; return 4831–5066 (analytics 4842, search 4846, empty+upload 4851–4879, таблица 4880–5028, SessionCreateModal 5031–5052, assignee 5053–5064); **early return по ошибке 4755–4757 после регистрации sidebar-хуков (4743–4748 — комментарий требует хуки до early return)**.
**Root:** 5124–5202 (org banner, sidebar, состояния restore, ExplorerPane-обёртка 5167–5181 с `invisible` при открытом проекте, ProjectPane 5184–5196).

### 1.6 Полная карта «ответственность → строки → связи → куда просится»

| Ответственность | Строки | С чем связана | Куда просится (DECOMP) |
|---|---|---|---|
| SVG-иконки (13 шт) | 178–292 | ничем | `explorerIcons.jsx` (Ш1) |
| Форматтеры (ts, activitySourceLabel, normalizeDodPercent, formatSessionPatchError) | 293–353 | api error responses | `explorerFormat.js` (Ш2) |
| Tree helpers (collectIdsWithChildren, collectSessionIdsRecursive, patchSessionInTree) | 355–407 | session tree, notes aggregate | `explorerSessionTree.js` (Ш2) |
| Примитивы таблицы (TypeTag, EntityTypePill, TreeGuides, SortHeader, StatusBadge, DodBar, MetricCell, LastActivityCell) | 408–565 | чистый UI | `explorerTablePrimitives.jsx` (Ш3) |
| Ячейки (AssigneeCell, SessionAssigneeCell, CompositionCell, UpdatedCell, StatusDotBadge, ExplorerMarqueeText) | 662–843 | модели assignee/состав | `explorerTableCells.jsx` (Ш4) |
| Модалки общие (Modal, InputModal, ConfirmModal) | 565–660 | overlays | `explorerOverlays.jsx` (Ш5) |
| Toast + search UI (WorkspaceExplorerToast, ExplorerSearchBox, SearchResultRow, ExplorerSearchResults) | 1355–1486 | поисковая модель | `explorerSearchUi.jsx` (Ш6) |
| Хуки-утилиты (useViewportBelow, useDelayedSkeleton) | 1488–1531 | layout | `explorerUiHooks.js` (Ш7) |
| HeaderTabs | 1575–1600 | вкладки проекты/аналитика | `explorerSidebarBits.jsx` (Ш7) |
| Sidebar counters/header block | 1533–1573, 1602–1642 | react-query counters, sidebar context | `explorerSidebarBits.jsx` (Ш7) |
| WorkspaceSidebar | 1644–1743 | api workspaces, prefetch | `WorkspaceSidebar.jsx` (Ш8) |
| ContextMenu (fixed, viewport clamp) | 1745–1804 | kebab-меню всех строк | `explorerTablePrimitives.jsx` → позже `ContextMenu.jsx` (Ш9) |
| Строки дерева (FolderRow, ProjectRow) | 1806–2122 | tree state callbacks | `ExplorerRows.jsx` (Ш10) |
| Строки сессий дерева (SessionTreeRow, ProjectSessionsRows) | 2126–2281 | permissions, notes aggregate | `ExplorerRows.jsx` (Ш10) |
| Inline/pending/skeleton/error строки | 2283–2444 | чистый UI | `explorerInlineRows.jsx` (Ш9) |
| ExplorerPane — данные дерева (treeStateByContext, mergedExpanded, toggles, bulk, restore, saver) | 2506–2539, 2558, 3123–3236 | prefs API, explorer API | `useTreeExpansion.js` (Ш12) |
| ExplorerPane — фильтры чипов | 2540–2563, 2605–2637, 2550 | prefs API | `useStatusVisibilityFilter.js` (Ш13) |
| ExplorerPane — global search | 2495–2502, 2867–2916 | search API | `useExplorerGlobalSearch.js` (Ш13) |
| ExplorerPane — сортировка дерева | 2503, 2774–2796 | explorerSortModel.js | `useExplorerSort` (Ш13) |
| ExplorerPane — dnd upload проектов | 2717–2772 | bpmnUploadFlow.js | `useBpmnProjectUploads.js` (Ш14) |
| ExplorerPane — assignees (save 3 видов + users load) | 2487–2494, 2918–2951, 2976–3062 | folders/projects/sessions API | `useAssigneesDialog.js` (Ш15) |
| ExplorerPane — status change (folder/session) | 3064–3121 | versioned session patch | `useExplorerStatusActions.js` (Ш15) |
| ExplorerPane — optimistic dual-store patch | 2643–2674 | react-query + tree state | **переносится ТОЛЬКО вместе с владельцами** (Ш12/Ш15, см. RISKS R1) |
| ExplorerPane — рендер (header/toolbar/table/modals) | 3295–3819 | все вышеперечисленные | `ExplorerPane.jsx` (Ш17) |
| StatusPopoverControl | 855–965 | reducer, popover | `explorerStatusUi.jsx` (Ш11) |
| AssigneeDialog | 977–1115 | assignee model | `explorerAssigneeUi.jsx` (Ш11) |
| Move dialogs (Folder/Project) | 1133–1353 | move targets model | `explorerMoveDialogs.jsx` (Ш11) |
| SessionRow (ProjectPane flat row) | 3824–4127 | session API, kebab | `ProjectSessionRows.jsx` (Ш16) |
| SessionTreeRows + skeleton | 4131–4266 | recursion, children cache | `ProjectSessionRows.jsx` (Ш16) |
| ProjectPane — page load/local state | 4271–4349 | project page API | `useProjectPage.js` (Ш14) |
| ProjectPane — children tree | 4297–4300, 4555–4603 | session children API | `useSessionChildrenTree.js` (Ш14) |
| ProjectPane — dnd upload сессий | 4278–4281, 4394–4437 | bpmnUploadFlow.js | `useSessionBpmnUploads.js` (Ш14) |
| ProjectPane — assignees (save + users load) | 4285–4292, 4358–4392, 4439–4492 | sessions API | `useProjectSessionAssignees.js` (Ш15) |
| ProjectPane — open session orchestration | 4281/4293, 4337, 4646–4697 | routing, ProcessStage | `useSessionOpen.js` (Ш14) |
| ProjectPane — status change session/project | 4494–4553 | versioned patch (дубль) | `useProjectStatusActions.js` (Ш15) |
| ProjectPane — рендер | 4682–5066 | все вышеперечисленные | `ProjectPane.jsx` (Ш17) |
| Root composition + portals + sidebar context | 5071–5204, 1630–1642, portals 3522/4833, regs 3351/3362/4744/4748 | AppShell slot, ExplorerSidebarContext | `WorkspaceExplorer.jsx` (остаётся, Ш18) |
| Навигационный контроллер | `useWorkspaceExplorerController.js` | routes, workspaces API | уже вынесен; не трогаем |

Проверка полноты по списку владельца контура: дерево ✔ (1.1 ExplorerPane cluster, 1.6 строки дерева), чипы ✔ (фильтры чипов), поиск ✔, сортировка ✔, assignees ✔, kebab-меню ✔ (ContextMenu + items в строках), персистентность ✔ (tree saver + prefs), breadcrumbs-связка ✔ (контроллер + portal/sidebar registries).

---

## 2. Карта связанности

### 2.1 Что импортирует WorkspaceExplorer.jsx (L16–175)

- react/react-dom (16–17), `@tanstack/react-query` (18).
- **Sibling-модули explorer** (уже вынесенная чистая логика — ~15 файлов): `explorerPageQuery.js`, `explorerTreePersistence.js` (20–31), `explorerStatusFilters.js` (32–39), `SessionCreateModal.jsx`, `bpmnUploadFlow.js`, `explorerApi.js` (48–64), `work3TreeState.js`, `projectSessionsQuery.js`, `useWorkspaceExplorerController.js`, `ExplorerSidebarContext.jsx`, `explorerMoveTargets.js`, `explorerSearchModel.js`, `explorerSortModel.js`, `workspaceBreadcrumbs.js`, `workspaceDisplayLabels.js`, `explorerAssigneeModel.js`, `explorerStatusCatalog.js`, `explorerContextStatusModel.js`, `explorerColumnVisibility.js`, `explorerTableFormat.js`, `explorerAdaptive.css`.
- **Кросс-фичи:** `workspacePermissions`, `AuthProvider`, `featureFlagsContext`, `AnalyticsPage`, `appLinkBehavior`.
- **Shared infra:** `lib/api`, `lib/sessionNoteAggregates`; компоненты `AppRouteLink`, `TextBreadcrumbs`, `useElementWidth`, `navSingleLineLayout`, `workspaceMainNavSlot`, `NotesAggregateBadge`.

Вывод: файл — «всё, что не влезло в sibling-модели». Чистые модели уже вынесены; в JSX остались контейнеры, компоненты и обвязка.

### 2.2 Кто импортирует WorkspaceExplorer

- **Единственный runtime-импортёр:** `frontend/src/components/ProcessStage.jsx:11`, рендер L7837–7844. Пропсы: `activeOrgId`, `requestProjectId`, `requestProjectWorkspaceId`, `requestProjectContext`, `onOpenSession`, `onClearRequestedProject`. Т.е. ProcessStage гоняет explorer URL-derived route-стейтом и делегирует открытие сессии наверх.
- **Тесты (source-text):** ~20 файлов `*.source.test.mjs` в `features/explorer/` делают `readFileSync` JSX и regex-матчат подстроки (`workspaceSessionAssignees`, `workspaceSmartSearch`, `workspaceSortableColumns`, `workspaceFolderMove`, `workspaceProjectBreadcrumb` и др.). **Любой перенос кода из файла ломает эти тесты** — см. RISKS R4 и Шаг 0 в DECOMP.
- `WorkspaceExplorer.smoke.test.jsx:175` — динамический импорт с моком контроллера.

### 2.3 Связь с экраном проекта / дублирование

Отдельного экрана проекта нет (`features/projects/` — только wizard-формы создания): **«экран проекта» — это `ProjectPane` внутри того же файла**. Дублирование внутрифайловое:

| Что | ExplorerPane | ProjectPane | Должно стать |
|---|---|---|---|
| Версионный статус-флоу сессии | 3086 (invalidate) | 4506 (local patch + load) | общий `useSessionStatusChange` — но объединение ДУБЛЕЙ допустимо только после characterization-тестов (Ш15′, опциональный) |
| Assignee users load | 2918 | 4358 (verbatim) | `useAssigneesDialog` |
| Assignee save (session_assignees) | 2976 ветка | 4439 | `useProjectSessionAssignees` / общий слой |
| Сортировка | 2503/2774 | 4283/4609 (модель `explorerSortModel.js` общая) | обвязка — в хуки обоих контейнеров |
| Фильтр статусов сессий | `filterExplorerTreeByStatus` (модель) | инлайн 2220–2229 (**другая реализация**) | вынести обе как есть; объединение — отдельный контур |
| dnd BPMN upload | 2717–2772 | 4278–4437 (оба через `bpmnUploadFlow.js`) | два хука (разные домены) |
| Поиск | local index + global API | local only, без debounce | два хука; объединение НЕ входит в границу |
| Toast moveNotice | 3528 | 4839 (`WorkspaceExplorerToast` общий) | shared component уже есть |

Header/breadcrumbs-связка (после #899): внешнего header-компонента нет — механизм = **два реестра + портал**: `useWorkspaceMainNavSlot` (DOM-slot от `AppShell.jsx:376`; порталы 3522/4833; ExplorerPane подавляет портал при открытом проекте 5179/3312) и `ExplorerSidebarContext` (LIFO-стеки; регистрация «назад»-блока 3351/4744 и счётчиков 3362/4748; **хуки регистрации обязаны идти до early return 4755**). Route-параметры входят только пропсами из ProcessStage.

### 2.4 Prop drilling глубже 2 уровней

- `onOpenSession`: root → ExplorerPane (5177) → `ProjectSessionsRows` (3667) → `SessionTreeRow.onOpen` → row click (3–4 уровня; в ProjectPane — через `handleOpenSessionRequest` 4646).
- `setMoveNotice`/`onActionError`: pane → `SessionTreeRows` (4987–4988) → `SessionRow` (4206–4207) → delete/subprocess handlers; в ExplorerPane передаются в `ProjectSessionsRows` (3680–3681), но **не объявлены в его сигнатуре — мёртвые пропсы**.
- `permissions`: root → panes → rows (`canRename/canDelete/canAssign`…, 3 уровня).
- `columnLayout` + `showSignalColumns`: pane → rows → cells (3 уровня).
- `onSessionStatusChange`: pane → rows → `StatusPopoverControl.onChange` → `handleSelect` (3 уровня, async-результат питает reducer 901–906).
- Move-диалоги: 5–7 пропсов (`rootItems`, `childItemsByFolder`, ids) только для пересборки списка таргетов.
- `noteAggregatesBySessionId` (Map): pane → `SessionTreeRows` → `SessionRow` (3 уровня).

---

## 3. Метрики

### 3.1 LOC

| Метрика | Значение |
|---|---|
| Всего строк | 5204 |
| Пустых | 184 |
| Комментарии | 119 |
| **Non-blank non-comment** | **4902** |

### 3.2 Cyclomatic complexity (top-10)

Инструмент: `cyclo.py` (Python-лексер; host node/npx отсутствуют, Docker daemon не запущен — метод: 1 + decision tokens (`if/else if/for/while/case/catch/&&/||/??`/ternary), атрибуция к innermost-функции; числа включают JSX-условия и потому завышены для «логической» сложности — стандартно для component complexity). Полный вывод на 457 функций сохранён локально в `evidence/` (каталог в `.gitignore` по конвенции проекта — в коммит не входит, top-20 воспроизведён ниже целиком). В проекте **нет** eslint complexity rule (`frontend/eslint.config.js` — только `no-undef` + react-hooks), штатного tooling для метрики нет.

| # | Complexity | Строки | Функция |
|---|---|---|---|
| 1 | 83 | 2446–3820 | `ExplorerPane` |
| 2 | 64 | 4270–5067 | `ProjectPane` |
| 3 | 58 | 3824–4127 | `SessionRow` |
| 4 | 37 | 2976–3062 | `handleSaveAssignee` |
| 5 | 33 | 1957–2122 | `ProjectRow` |
| 6 | 31 | 1806–1953 | `FolderRow` |
| 7 | 22 | 2126–2194 | `SessionTreeRow` |
| 8 | 19 | 977–1115 | `AssigneeDialog` |
| 9 | 18 | 316–353 | `formatSessionPatchError` |
| 10 | 18 | 3251–3280 | `handleOpenSearchResult` |

Далее: `handleTreeSessionStatusChange` 16 (3086), `handleStatusVisibilityChange` 15 (2605), `handleSessionStatusChange` 15 (4506), `CompositionCell` 14 (755), anonymous map-callback в `SessionTreeRows` 14 (4177), `WorkspaceSidebarContextCounters` 13, `ensureFolderChildrenLoaded` 13 (3123), `ProjectPane.load` 12, `handleOpenSessionRequest` 12.

### 3.3 Объём в одном компоненте

| Хук/показатель | Кол-во |
|---|---|
| `useState` | 70 |
| `useEffect` | 28 |
| `useMemo` | 29 |
| `useCallback` | 34 |
| `useRef` | 14 |
| `useReducer` | 1 |
| JSX return-блоков | 89 |
| Top-level определений | 77 |
| Всего function-like конструкций | 457 |

Сложность концентрируется: `ExplorerPane`+`ProjectPane`+`SessionRow` = 205 из суммарной сложности топ-уровня; все три — контейнеры с обвязкой, а не бизнес-логикой (логика уже в sibling-моделях).

---

## 4. История правок: где файл «трещал» (по артефактам контуров)

Источник: `.planning/contours/` (зеркало в `processmap_v1_main_clone-worktrees/fix-workspace-toolbar-controls`), git log `WorkspaceExplorer.jsx`.

| Дата | Контур | PR | Что менял в файле | Где треснул |
|---|---|---|---|---|
| 2026-08-14 | feat/projects-table-v2 | — (server worktree) | ячейки таблицы, тултипы | squeeze колонок <1044px прошёл мимо DOM-тестов, пойман только live-приёмкой |
| 2026-08-31 | feature/session-assignees | #884 | `SessionAssigneesDialog`/`Cell` **локально внутри файла** | reuse- debt: диалог пришлось планировать на извлечение (так и не выполнено) |
| 2026-09-01 | fix/projects-table-ux | #890 | tree guides, TypeTag, чипы, sticky header | файл назван «4429-строчным монолитом» (PLAN.md:86); тесты обновлены, но не запущены (не было node) |
| 2026-09-02 | fix/projects-table-ux-polish | #891 | SessionAssigneeCell, kind=session_assignees, optimistic+rollback | **infinite re-render** в init-эффекте раскрытия + гонка `ensureFolderChildrenLoaded`; фикс — version-tracking prefs + синхронные проверки |
| 2026-09-02 | fix/session-assignees-hotfix r1+r2 | #892/#893 | multi-select диалог, patch только затронутых строк | **white screen на stage** (не импортирован `getSessionAssigneesTooltip`); 500 на PUT (backend drift); **полный reload дерева на каждое назначение** (сбрасывал раскрытие); recursive rows теряли props на 3-м уровне вложенности. Процесс-фикс: CI eslint no-undef |
| 2026-09-02 | fix/workspace-explorer-remaining | #895 | targeted cache patch + rollback; персистентность `explorer.tree.expanded` scoped `orgId::workspaceId`; toast | миграция с неверно названного legacy-ключа `explorer.tree.collapsed`; baseline `npm test` красный (83 упавших) — верификация только targeted-наборами |
| 2026-09-03 | feature/workspace-toolbar-restructure | #896 | удаление 4-й строки тулбара, чипы → `explorerStatusFilters.js`, breadcrumbs с org | дефект «чип не кликается» на смешанных фикстурах — потребовался RED-тест до переписывания фильтра; правило «максимум 3 строки над данными» |
| 2026-09-03 | fix/header-and-breadcrumbs | #899 | project header 37→57px, crumbs из backend, toolbar проекта | 37px мало для breadcrumbs; PLAN.md отсутствовал; полный набор заблокирован пре-existing падением SessionCreateModal |
| 2026-09-03 | fix/workspace-toolbar-controls | #900 (HEAD) | bulk expand/collapse (транзиентный, не пишет prefs), ContextMenu fixed+viewport clamp | чистый контур (RED-тесты первыми), residual: bulk-зависимость от корректности backend-агрегатов |

**Паттерны:** (1) assignees — магнит хотфиксов (4 контура, 2 раунда мержа); (2) состояние раскрытия дерева в эффектах — самая пере-чинимая зона (infinite re-render, гонки, полные reload'ы, миграция prefs); (3) строки над таблицей перекраивались 3 раза за 3 дня; (4) каждый контур боролся с верификационным шумом (baseline-краснота, отсутствие node локально); (5) монолит + локальные компоненты = reuse- debt, фиксируемый планами, которые не выполняются.

---

## 5. Дополнительные находки (не входят в границу контура)

- `apiGetSubprocessesCount` (import L62) — мёртвый импорт, call site в файле отсутствует.
- `window.confirm` при удалении сессии (L4082) — нарушение AGENTS.md §6 (запрет нативных диалогов). Правится отдельным fix-контуром, не декомпозицией.
- Мёртвые ветки `eagerTree` (4308, 4326–4328, 4615–4617, 4179–4182) — `eagerTree` захардкожен `false`.
- Мёртвые пропсы `setMoveNotice`/`onActionError` в `ProjectSessionsRows` (3680–3681 vs сигнатура).
- `treeSaverRef` инициализируется в render body с side-effect (2527–2539) — небезопасно для StrictMode/concurrent; при переносе — lazy-init.
- `StatusPopoverControl` эффект 866 с eslint-disable exhaustive-deps (намеренно) — хрупко, при переносе сохранить комментарий.
