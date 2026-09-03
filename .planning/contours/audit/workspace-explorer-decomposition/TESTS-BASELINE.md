# TESTS-BASELINE: покрытие WorkspaceExplorer сейчас + план characterization-тестов

- Baseline: `origin/main` @ `d7e8b04a`, 2026-09-03.

## 1. Тестовая инфраструктура проекта

`frontend/package.json`:
- `npm test` → `node --test "src/**/*.test.mjs"` — node:test runner (все `*.source.test.mjs` + `SessionCreateModal.test.mjs`).
- `npm run test:smoke` → `vitest run` (`vitest.config.js`: jsdom, include только `*.smoke.test.jsx` — фактически один файл).
- `npm run test:e2e` → `playwright test` (`testDir: ./e2e`, ~80+ спеков).

**CI (.github/workflows):** единственный frontend-job на PR — `frontend-quality.yml` (`npm ci` + `npm run lint`, линт = `eslint src/features/explorer src/lib/api.js --max-warnings=0` с единственным rule `no-undef`). **Ни unit, ни smoke, ни e2e в CI на PR не запускаются вообще.** Весь тестовый массив explorer исполняется только локально вручную.

## 2. Что существует сейчас

| Файл | Тип | Покрывает |
|---|---|---|
| `features/explorer/workspaceSmartSearch.source.test.mjs` | source-regex | search-модель, группировка результатов, empty-state, `apiSearchExplorer` |
| `workspaceSortableColumns.source.test.mjs` | source-regex | сортируемые шапки обоих pane, индикаторы стрелок, action column не сортируется |
| `workspaceToolbarControls.source.test.mjs` | source-regex | expand/collapse-all, транзиентность bulk (не пишет prefs), anchor kebab, viewport-safe меню |
| `workspaceToolbarRestructure.source.test.mjs` | source-regex | один toolbar row, breadcrumbs с org, reset фильтра при скрытии |
| `workspaceContextStatusControls.source.test.mjs` | source-regex | status popover (folder/tree-session), context_status, versioned tree status change |
| `workspaceAssigneePicker.source.test.mjs` | source-regex | assignee-колонка, picker, payload-совместимость |
| `workspaceSessionAssignees.source.test.mjs` | source-regex | session assignees: ячейка, kind, replace endpoint, optimistic + rollback |
| `workspaceFolderMove.source.test.mjs` / `workspaceProjectMove.source.test.mjs` | source-regex | move-диалоги, disabled-таргеты, API wrappers |
| `workspaceProjectBreadcrumb.source.test.mjs` | source-regex | breadcrumbs, controller restore, очистка stale path |
| `workspaceAutoExpandSteps.source.test.mjs` | source-regex | lazy tree, rootOnly meta, badges, inline retry |
| `workspaceSubprocessTreeView.source.test.mjs` | source-regex | feature flag дерева сессий, recursion |
| `workspaceExplorerRemaining.source.test.mjs` | source-regex | patch только affected row, toast, персистентность scoped org+workspace |
| `workspaceProjectToolbar` / `workspaceSectionHeaderCleanup` / `workspaceOpenAffordance` | source-regex | header/toolbar раскладка, CTA, «← Назад» |
| `workspaceSidebarJoinGeometry` / `explorerAdaptive` | source-regex | геометрия sidebar, ResizeObserver layout, marquee |
| `components/navZonePartA.source.test.mjs` | source-regex | nav-зона: строки обоих pane, SessionNavStrip |
| `features/explorer/SessionCreateModal.test.mjs` | **поведенческий** (node:test) | модал создания: autofocus, disabled submit, payload, double-submit guard, ошибка, Escape, focus trap — 7 тестов |
| `features/explorer/WorkspaceExplorer.smoke.test.jsx` | **поведенческий** (vitest, renderToString) | ровно 1 тест: «рендерится assignee-колонка проекта без throw» (контроллер замокан) |
| `features/process/hooks/useProcessTabs.session-entry-tab.test.mjs` | unit | tab-intent при открытии сессии из explorer — 5 тестов |
| `e2e/project-refresh-restore.spec.mjs` | playwright | deep-link restore: survive reload, нет auto-select/auto-reopen loop, stale id → not-found — 7 тестов |
| `e2e/explorer-project-kebab-menu.spec.mjs` | playwright | клик «···» у строки проекта открывает меню — 1 тест |

Итого поведенческих тестов самого компонента: **1 smoke**. Остальное — source-regex (пинят текст файла) и инфраструктурные unit.

## 3. Пробелы (что НЕ покрыто)

1. **Поведение ExplorerPane/ProjectPane как компонентов** (сложность 83/64): рендер дерева, expand/collapse как действие, фильтрация/сортировка как результат, — ничего не исполняется.
2. **Персистентность дерева round-trip** (treeStateByContext, persistedExpandedRef, scoping org+workspace, legacy fallback) — только source-assert.
3. **Ошибки и конфликты assignees**: rollback в `handleSaveAssignee` (сложность 37) и `handleSaveProjectSessionAssignees` (три хранилища), 409-ветки, partial failure, `formatSessionPatchError` — не покрыты.
4. **Drag&drop upload** (drop/retry обоих pane) — не покрыт ни на одном уровне.
5. **Версионные статус-переходы** (`apiGetSession` → `apiPatchSession` с `base_diagram_state_version`) — только source-regex на наличие строк.
6. **Bulk expand/collapse** как поведение (ленивые загрузки, транзиентность) — source-regex.
7. **`useWorkspaceExplorerController.js`** (339 строк: BFS-restore, ordering reset на смену орга) — нет ни одного unit-теста.
8. Hotkeys/focus, ResizeObserver-layout — source-regex.
9. E2E: 2 спека / 8 тестов; нет e2e на move, search, sort, assignees.

## 4. План characterization-тестов (Шаг 0 декомпозиции)

Назначение: зафиксировать **текущее** поведение до первого переноса. Это не «правильное» поведение, а эталон «до». Пишутся против кода как есть; красными быть не должны (если тест красный — это баг-находка, выносится в fix-контур, а не правится ожидание).

Инфраструктура: vitest + jsdom (уже есть, `npm run test:smoke`), расширить include на `src/**/*.char.test.jsx` в отдельном конфиге `vitest.config.char.js`, чтобы не смешивать со smoke. Моки: `explorerApi.js` (vi.mock), `bpmnUploadFlow.js`, react-query — реальный QueryClientProvider на тестовый клиент. Нативные диалоги: `window.confirm` стаб (L4082 остаётся до отдельного fix-контура).

### 4.1 Набор C1 — сортировка и фильтрация (≈4 теста)

- `ExplorerPane`: при `explorerSort={key:'name',direction:'asc'}` порядок строк соответствует `sortExplorerItems` (данные через замоканный `explorerPageQueryOptions`).
- `ExplorerPane`: активный `statusFilter` скрывает несовпадающие ветки; при активном фильтре collapse игнорируется (эффект 2798 — принудительное раскрытие совпадений).
- `ProjectPane`: `sessionSort` меняет порядок `sortedSessions`; инлайн-фильтр статусов в `ProjectSessionsRows` (2220–2229) даёт тот же результат, что показывает текущий код (эталон фиксирует ДВЕ реализации как есть — это важно: они не идентичны по структуре).
- Сброс `statusFilter` в «all», если выбранный фильтр скрыт настройкой (эффект 2550).

### 4.2 Набор C2 — expand/collapse и персистентность (≈5 тестов)

- Toggle папки: `mergedExpandedByFolder` меняется; merge-прецеденс fallback → prefs → explicit (явный toggle перекрывает prefs).
- Ленивая загрузка: первый toggle вызывает `apiGetExplorerPage` ровно один раз при двух быстрых кликах (дедуп inFlight Set).
- Bulk expand: `bulkTreeMode='expanded'` раскрывает все `treeBulkExpandableIds`, **не** пишет в prefs (транзиентность).
- Персистентность: после restore из prefs (`persistedExpandedRef`) эффект 3206 вызывает ensure-load для сохранённых id ровно один раз на снапшот (`initialPrefsLoadedRef`).
- Смена контекста (`workspaceId::folderId`) изолирует состояния (`treeStateByContext`).

### 4.3 Набор C3 — назначение исполнителей (≈4 теста)

- `handleSaveAssignee`, ветка `session_assignees`: оптимистичный патч обоих хранилищ (react-query cache + `childItemsByFolder`), затем `apiReplaceSessionAssignees`; при ошибке — rollback обоих (снапшот treeState).
- Тот же сценарий в `ProjectPane`: патч трёх хранилищ (react-query sessions, local `page`, `sessionChildrenCache`) + rollback.
- Загрузка списка юзеров при открытии диалога (оба pane — оба пути).
- `formatSessionPatchError`: маппинг типовых ответов на текущие сообщения (эталон).

### 4.4 Набор C4 — статусные переходы и dnd (≈3 теста)

- Версионный флоу: `handleTreeSessionStatusChange`/`handleSessionStatusChange` делают `apiGetSession` перед `apiPatchSession` и передают `base_diagram_state_version` из ответа.
- `handleProjectFileDrop`: валидация файла → `createSessionWithBpmnUpload` → инвалидация ключа; retry через `uploadSessionBpmnOnly`.
- Открытие сессии: re-entrancy guard (`openingSessionIdRef`), формирование `projectContext`.

### 4.5 Ретаргет source-тестов (≈20 файлов, мелкий diff)

Каждый `*.source.test.mjs`, читающий `WorkspaceExplorer.jsx`, расширяется списком целевых файлов: матчер применяется к объединённому тексту (jsx + файлы из DECOMP по мере их появления). Ожидания не меняются — меняется только набор путей. Это позволяет шагам декомпозиции проходить CI без поломки source-gate. Порядок: ретаргет делается **до** Ш1 и покрывает сразу все целевые пути из DECOMP.md (файлы ещё не существуют — матчер игнорирует отсутствующие пути; при появлении файла ассерт начинает их видеть).

### 4.6 Критерии приёмки Шага 0

- `npm run test:char` зелёный локально; конфиг добавлен, но в CI на PR не добавляется в этом контуре (отдельное решение владельца — расширение frontend-quality.yml).
- Все существующие source-тесты зелёные после ретаргета.
- Список зафиксированных эталонов = перечень в 4.1–4.4; любое расхождение теста с кодом на этом шаге — баг-кандидат в fix-контур, не правка теста.

## 5. Риск тестовой базы, который надо признать честно

- Baseline `npm test` на момент аудита исторически красный (фиксировалось 62–83 pre-existing failures в контурах #890–#895). Перед Ш0 нужен один прогон `node --test` для фиксации актуального failure-set; characterization-набор должен добавляться к нему, а не к «идеально зелёному» (которого может не быть). Failure-set diff — обязательный артефакт Ш0.
- Host node/npx в среде аудита отсутствуют, Docker daemon не запущен — исполнение Ш0 потребует рабочего JS-runtime (локально или поднятого compose-стека). Это операционное препятствие, не блокер плана.
