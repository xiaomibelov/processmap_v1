# DECOMP: план декомпозиции WorkspaceExplorer.jsx

- Контур-план: `audit/workspace-explorer-decomposition` (этот документ — артефакт аудита; исполнение — серия будущих контуров).
- Baseline: `origin/main` @ `d7e8b04a`. Файл: `frontend/src/features/explorer/WorkspaceExplorer.jsx` (5204 строки).
- Граница: **только расщепление файла**. НЕ предлагаются: смена state-менеджера, роутинга, CSS-архитектуры; объединение дублирующихся флоу (дубли устраняются только где это verbatim-перенос, см. Ш15′); исправление pre-existing нарушений (`window.confirm` L4082, мёртвый импорт L62, `eagerTree`-ветки) — они фиксируются отдельными fix-контурами и в ходе декомпозиции **переносятся как есть**.
- Железное правило каждого шага: **«перенести X», никогда «переписать X»**. Код переносится построчно, сигнатуры и порядок следования сохраняются. Поведение меняет только расположение файлов.

## Целевая структура

```
frontend/src/features/explorer/
├── WorkspaceExplorer.jsx          # root composition: контроллер + порталы + монтаж панелей (~200 строк)
├── ExplorerPane.jsx               # контейнер дерева воркспейса (рендер header/toolbar/table + модалки)
├── ProjectPane.jsx                # контейнер экрана проекта
├── useWorkspaceExplorerController.js  # уже существует, НЕ трогаем
├── hooks/
│   ├── useTreeExpansion.js        # treeStateByContext + mergedExpanded + toggles + bulk + restore + saver
│   ├── useStatusVisibilityFilter.js # statusFilter + hiddenStatusMenu + optimistic prefs patch
│   ├── useExplorerGlobalSearch.js # searchQuery/debounce/globalSearchState
│   ├── useExplorerSort.js         # обвязка над explorerSortModel.js
│   ├── useBpmnProjectUploads.js   # projectUploads + drop/retry
│   ├── useAssigneesDialog.js      # assigneeDialog + assigneeMembersState + users load
│   ├── useExplorerStatusActions.js # folder/session status change (дерево)
│   ├── useProjectPage.js          # load + page/loading/error (локальный state, как сейчас)
│   ├── useSessionChildrenTree.js  # expanded/cache/loading/errors сессий
│   ├── useSessionBpmnUploads.js   # pendingUploads + drop/retry
│   ├── useProjectSessionAssignees.js # save + users load (проект)
│   ├── useSessionOpen.js          # openingSessionId(+ref) + handleOpenSessionRequest
│   ├── useProjectStatusActions.js # session/project status change (проект)
│   └── explorerUiHooks.js         # useViewportBelow, useDelayedSkeleton (перенос как есть)
├── components/
│   ├── explorerIcons.jsx          # 13 SVG-иконок
│   ├── explorerFormat.js          # ts, activitySourceLabel, normalizeDodPercent, formatSessionPatchError
│   ├── explorerSessionTree.js     # collectIdsWithChildren, collectSessionIdsRecursive, patchSessionInTree
│   ├── explorerTablePrimitives.jsx # TypeTag, EntityTypePill, TreeGuides, SortHeader, StatusBadge, DodBar, MetricCell, LastActivityCell, ContextMenu
│   ├── explorerTableCells.jsx     # AssigneeCell, SessionAssigneeCell, CompositionCell, UpdatedCell, StatusDotBadge, ExplorerMarqueeText
│   ├── explorerOverlays.jsx       # Modal, InputModal, ConfirmModal, WorkspaceExplorerToast
│   ├── explorerSearchUi.jsx       # ExplorerSearchBox, SearchResultRow, ExplorerSearchResults
│   ├── explorerSidebarBits.jsx    # HeaderTabs, WorkspaceSidebarActiveCounters, WorkspaceSidebarContextCounters, ExplorerSidebarHeaderBlock
│   ├── WorkspaceSidebar.jsx       # (из L1644–1743)
│   ├── ExplorerRows.jsx           # FolderRow, ProjectRow, SessionTreeRow, ProjectSessionsRows
│   ├── explorerInlineRows.jsx     # InlineLoading/Empty/Error, PendingUpload*, skeleton rows
│   ├── explorerAssigneeUi.jsx     # StatusPopoverControl, AssigneeDialog
│   ├── explorerMoveDialogs.jsx    # MoveFolderDialog, MoveProjectDialog
│   └── ProjectSessionRows.jsx     # SessionRow, SessionChildrenSkeleton, SessionTreeRows
└── (существующие sibling-модели без изменений)
```

Принципы: контейнеры владеют данными и прокидывают пропсы (как сейчас — без контекстов); презентационные компоненты получают те же пропсы, что сейчас получают от внутренних определений; хуки возвращают те же кортежи/объекты, которые контейнер читает из своих состояний; чистые функции — построчный перенос.

## Порядок: от листьев к корню

Каждый шаг = отдельная ветка + отдельный PR. Оценка diff = примерно 2× переносимых строк (удаление + добавление) + импорты/реэкспорты. Лимит ревьюибельности — ~400 строк diff; шаги, где оценка выше, разбиты или помечены на дробление при исполнении.

### Шаг 0 — страховочная сеть (предусловие всех остальных шагов)

- Ветка `test/workspace-explorer-characterization` от main.
- Содержимое — план из TESTS-BASELINE.md: characterization-тесты на фильтры, сортировку, expand/collapse, персистентность, назначение исполнителей + **ретаргет ~20 `*.source.test.mjs`**: regex-матчеры расширяются с «только WorkspaceExplorer.jsx» на «jsx + целевые новые файлы» (добавление путей, не изменение ожиданий).
- Пока этот PR не вмержен, шаги 1–18 не начинаются. Исключение: шаги 1–3 можно вести параллельно, если их целевые файлы ещё никем не заняты, — но мержиться строго после Ш0.
- Оценка: 300–500 строк (тесты ретаргета мелкие; characterization — 5–8 тестов).

### Листья: чистые функции и тупые компоненты (Ш1–Ш8)

| Шаг | Что переносим | Куда | Почему безопасно | Оценка diff |
|---|---|---|---|---|
| 1 | 13 SVG-иконок (178–292) | `components/explorerIcons.jsx` | нет состояния, нет логики; единственный потребитель — JSX внутри файла | ~250 |
| 2 | Форматтеры (293–353) + tree helpers (355–407) | `components/explorerFormat.js`, `components/explorerSessionTree.js` | чистые функции; зависимостей нет (кроме импортов типов/моделей) | ~250 |
| 3 | TypeTag, EntityTypePill, TreeGuides, SortHeader, StatusBadge, DodBar, MetricCell, LastActivityCell (408–565) | `components/explorerTablePrimitives.jsx` | презентационные, пропсы-скаляры; `SortHeader` — onSort колбэк без замыканий | ~350 |
| 4 | AssigneeCell, SessionAssigneeCell, CompositionCell, UpdatedCell, StatusDotBadge, ExplorerMarqueeText (662–843) | `components/explorerTableCells.jsx` | ячейки получают данные пропсами; единственный эффект (marquee measure) переносится со своими refs | ~400 |
| 5 | Modal, InputModal, ConfirmModal (565–660) + WorkspaceExplorerToast (1355–1374) | `components/explorerOverlays.jsx` | локальное состояние каждого модала — переносится вместе с телом | ~250 |
| 6 | ExplorerSearchBox, SearchResultRow, ExplorerSearchResults (1376–1486) | `components/explorerSearchUi.jsx` | чистый UI над search-моделью; поисковые эффекты остаются в контейнере | ~250 |
| 7 | useViewportBelow, useDelayedSkeleton (1488–1531) + HeaderTabs, WorkspaceSidebarActiveCounters, WorkspaceSidebarContextCounters, ExplorerSidebarHeaderBlock (1533–1642) | `hooks/explorerUiHooks.js`, `components/explorerSidebarBits.jsx` | хуки самодостаточны; counters — React.memo + react-query options, пропсы явные | ~350 |
| 8 | WorkspaceSidebar (1644–1743) | `components/WorkspaceSidebar.jsx` | один компонент целиком, свои модалки и prefetch внутри; пропсы уже явные | ~250 |

**Точка остановки А (после Ш8):** все примитивы вынесены, `WorkspaceExplorer.jsx` уменьшился на ~1100 строк (~4100), файл остаётся полностью рабочим и консистентным. Можно остановиться на неопределённый срок без какого-либо риска.

### Середина: строки и диалоги (Ш9–Ш11)

| Шаг | Что переносим | Куда | Почему безопасно | Оценка diff |
|---|---|---|---|---|
| 9 | ContextMenu (1745–1804) + inline/pending/skeleton/error строки (2283–2444) | `components/explorerTablePrimitives.jsx` (ContextMenu) и `components/explorerInlineRows.jsx` | ContextMenu — только refs/position; inline-строки — чистый UI | ~400 |
| 10 | FolderRow, ProjectRow (1806–2122) + SessionTreeRow, ProjectSessionsRows (2126–2281) | `components/ExplorerRows.jsx` | строки уже получают все данные пропсами; колбэки переносятся поднятием объявлений в импорты (без изменения тел) | ~950 → **дробится на 10a (FolderRow+ProjectRow, ~650) и 10b (SessionTreeRow+ProjectSessionsRows, ~350)** |
| 11 | StatusPopoverControl (855–965) + AssigneeDialog (977–1115) + MoveFolder/MoveProjectDialog (1133–1353) | `components/explorerAssigneeUi.jsx`, `components/explorerMoveDialogs.jsx` | локальное состояние внутри диалогов; reducer `explorerStatusChangeReducer` переносится с `StatusPopoverControl`; eslint-disable комментарий (866) переносится verbatim | ~950 → **дробится на 11a (StatusPopoverControl+AssigneeDialog, ~550) и 11b (move-диалоги, ~450; при исполнии можно отделить два диалога в 11b/11c)** |

**Точка остановки Б (после Ш11):** презентационный слой полностью вынесен; в файле остаются два контейнера + root. ~2200 строк.

### Хуки данных (Ш12–Ш16)

Каждый хук переносится со своими состояниями, эффектами и колбэками **как единое тело**. Контейнер заменяет блок состояний на вызов хука — вызов идёт на том же месте в теле компонента, где стояли `useState`/`useEffect` (порядок хуков критичен — сохраняется).

| Шаг | Что переносим | Куда | Почему безопасно | Оценка diff |
|---|---|---|---|---|
| 12 | Дерево ExplorerPane: treeStateByContext, mergedExpanded, inFlight Set, persistedExpandedRef, treeSaverRef, initialPrefsLoadedRef, bulkTreeMode + эффекты/callbacks 2540, 2558, 3123–3236, merge-мемо | `hooks/useTreeExpansion.js` | самый рискованный узел: переносится одним блоком **без изменения порядка эффектов и merge-прецеденций** (fallback → prefs → explicit); `treeSaverRef` при переносе инициализируется lazy-init (`useState(() => …)`) — семантически эквивалентно, т.к. сейчас guard `if (!ref.current)` делает это идемпотентным | ~600 → **дробится: 12a (state+saver+merge, ~350) и 12b (toggles/ensureFolderChildrenLoaded/bulk/restore эффекты, ~350)** |
| 13 | Фильтры чипов (2543–2563, 2550, 2605–2637) + global search (2495–2502, 2867–2916) + сортировка (2503, 2774–2796) | `hooks/useStatusVisibilityFilter.js`, `hooks/useExplorerGlobalSearch.js`, `hooks/useExplorerSort.js` | три независимых кластера состояния; optimistic prefs patch переносится с rollback целиком | ~700 → **три отдельных PR (13a/13b/13c), по ~250 каждый** |
| 14 | ProjectPane инфраструктура: page load (4271–4349), children tree (4297–4300, 4555–4603), session upload (4278–4281, 4394–4437), session open (4281/4293, 4337, 4646–4697) | `hooks/useProjectPage.js`, `useSessionChildrenTree.js`, `useSessionBpmnUploads.js`, `useSessionOpen.js` | четыре независимых кластера; дублирование с ExplorerPane **не объединяется** — переносится как есть | ~800 → **четыре отдельных PR (14a–14d), по ~250 каждый** |
| 15 | Assignees+status ExplorerPane (2487–2494, 2918–2951, 2976–3062, 3064–3121) и ProjectPane (4285–4292, 4350–4392, 4439–4492, 4494–4553) + `patchExplorerItemInCaches` (2643–2674) | `hooks/useAssigneesDialog.js`, `useExplorerStatusActions.js`, `useProjectSessionAssignees.js`, `useProjectStatusActions.js` | `patchExplorerItemInCaches` патчит react-query cache И tree state — **вместе с переносом владелец tree state уже вынесен (Ш12)**, поэтому хук принимает set-функции пропсами; rollback-логика построчная | ~900 → **дробится: 15a (useAssigneesDialog общий — оба users-load эффекта 2918/4358 переносятся в один файл, но вызываются из двух контейнеров; дубль остаётся дублем внутри общего файла), 15b (ExplorerPane save+status), 15c (ProjectPane save+status)** |
| 16 | SessionRow (3824–4127) + SessionTreeRows (4131–4266) | `components/ProjectSessionRows.jsx` | строки ProjectPane; зависят от пропсов контейнера, перенос после хуков, чтобы пропсы-интерфейс стабилизировался | ~950 → **дробится: 16a (SessionRow, ~650), 16b (SessionTreeRows, ~350)** |

**Ш15′ (опциональный, отдельный PR, только после зелёной Ш0-страховки): устранение verbatim-дублей.** Эффекты 2918/4358 — построчные копии; после Ш15а оба вызывают один и тот же перенесённый код — отдельный мини-PR удаляет вторую копию **без редактирования логики** (diff = удаление блока). То же для toast-рендера. Критерий приёмки контура: это всё ещё «перенести/удалить дубль перенесённого кода», не «переписать».

**Точка остановки В (после Ш16):** все хуки и строки вынесены. Контейнеры — тонкие (~400–500 строк каждый). Даже если Ш17–Ш18 никогда не случатся, файл уже декомпозирован.

### Корень: контейнеры (Ш17–Ш18)

| Шаг | Что переносим | Куда | Почему безопасно | Оценка diff |
|---|---|---|---|---|
| 17 | Тела ExplorerPane (рендер 3295–3819) и ProjectPane (рендер 4682–5066) | `ExplorerPane.jsx`, `ProjectPane.jsx` | контейнеры импортируют хуки и компоненты; вся логика уже снаружи; рендер — построчный перенос JSX с подстановкой импортов вместо внутренних ссылок | ~800 → **два отдельных PR (17a ExplorerPane, 17b ProjectPane), по ~450; JSX переносится секциями внутри одного PR — ревью по секциям** |
| 18 | Root (5071–5204) остаётся последним: импорты панелей, portal/sidebar регистрации, монтаж | `WorkspaceExplorer.jsx` (~200 строк) | финальный штрих: файл становится composition-root | ~250 |

## Сводка

- **18 обязательных шагов + Ш0 + опциональный Ш15′**; исполняемых PR: ~24 (с учётом дробления), каждый ≤ ~400–450 строк diff.
- Все шаги механические: перенос + импорты. Единственная «не-перенос» операция в плане — lazy-init `treeSaverRef` (Ш12a), обоснован в таблице.
- **Точки остановки без потери консистентности:** после Ш0 (есть страховка), после Ш8 (листья вынесены), после Ш11 (презентационный слой полностью снаружи), после Ш16 (декомпозиция фактически завершена; Ш17–Ш18 — косметика корня). После каждого отдельного шага код компилируется и тесты зелёные — это критерий приёмки каждого PR.
- Последовательность обязательна: листья → строки/диалоги → хуки → контейнеры. Обратный порядок создаёт временные файлы с циклическими импортами.
- Параллельность: Ш1–Ш8 независимы между собой (разные строки файла, разные целевые файлы) — могут вестись параллельными ветками с ребейзом; Ш12 зависит от Ш3/Ш9 (мерж-порядок), Ш17 зависит от всех.
- Верхнеуровневый ориентир эффекта: `WorkspaceExplorer.jsx` 5204 → ~200 строк; самые сложные единицы после декомпозиции: `ExplorerPane.jsx` (~450 строк, сложность падает до ~25–30 за счёт выноса хуков), `useTreeExpansion.js` (~300), `SessionRow` (~300, без изменений тела).

## Что явно НЕ входит (out of scope, заводятся отдельными контурами при необходимости)

1. Объединение двух версионных статус-флоу (3086/4506) и двух фильтров статусов — требует characterization-тестов сначала, отдельный `fix`/`refactor`-контур.
2. Устранение двух параллельных хранилищ сессий в ProjectPane (react-query + local `page`) — архитектурное решение, вне границы.
3. Замена `window.confirm` (L4082) на контролируемый modal — fix-контур (нарушение AGENTS.md §6).
4. Удаление мёртвого кода (`eagerTree`-ветки, мёртвые пропсы 3680–3681, мёртвый импорт L62) — fix-контур; в декомпозиции переносится как есть.
5. Lazy-init `treeSaverRef` — единственное исключение, включено в Ш12a с обоснованием эквивалентности.
