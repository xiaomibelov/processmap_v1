# TESTS: карта покрытия WorkspaceExplorer после Шага 0

- Baseline контура: `origin/main` @ `60bcd99b` (после #901). Дата: 2026-09-04.

## 1. Какие наборы существуют и где исполняются

| Набор | Команда | Исполнитель | В CI на PR? | Состояние |
|---|---|---|---|---|
| Characterization C1–C4 (17 тестов) | `npm run test:char` | vitest + jsdom + Testing Library | ✅ добавлен этим контуром | зелёный |
| Smoke (10 файлов / 30 тестов) | `npm run test:smoke` | vitest + jsdom (renderToString) | ✅ добавлен этим контуром | зелёный |
| Explorer unit + source (`features/explorer/**/*.test.mjs`, 35 файлов) | `node --test` (scoped) | node:test | ✅ добавлен этим контуром | зелёный (102/102) |
| Полный `node --test` suite (все `src/**/*.test.mjs`) | `npm test` | node:test | ❌ пока не гейтится | **86 pre-existing failures** (не explorer) |
| E2E (playwright, ~80 спеков) | `npm run test:e2e` | playwright | ❌ как и раньше | не менялся |

## 2. Characterization-тесты: что фиксируют

`frontend/src/features/explorer/char/` (мок-инфраструктура: `src/test-utils/explorerChar.jsx`, jsdom-стабы: `src/test-utils/charSetup.js`):

- **c1FiltersSort (4):** порядок строк дерева при кликах по шапке «Название»; чип-фильтр статусов (скрытие веток + принудительное раскрытие совпадений при активном фильтре, мемо effectiveExpandedByFolder); сброс фильтра на «Все» при скрытии активного статуса через «Настроить статусы»; сортировка сессий проекта + инлайн-фильтр статусов `ProjectSessionsRows` (зафиксирована именно инлайн-реализация, а не общая модель).
- **c2TreeExpansion (5):** прецеденс explicit-over-prefs; lazy-load детей один раз (inFlight-дедуп); транзиентность bulk expand (нет записи в prefs); one-shot pref-restore на снапшот; изоляция состояния дерева по `workspaceId::folderId`.
- **c3Assignees (4):** сохранение responsible раздела без полного reload (#895); optimistic-патч трёх сторов + rollback при ошибке (ProjectPane); патч только кэшей без рефетча (дерево); загрузка assignable-users при каждом открытии диалога.
- **c4StatusUploadOpen (4):** версионный статус-флоу (`apiGetSession` → `apiPatchSession` с `base_diagram_state_version`, порядок вызовов); dnd-upload на проект (валидация→upload→инвалидация + reject-кейс); re-entrancy guard открытия сессии с `projectContext`.

Замоканы границы (api-модули, query-модели, контроллер, AuthProvider, feature flags, sidebar-контекст — последний из-за char-bug-1, см. FOUND-BUGS.md); исполняются реальные состояния/эффекты/обработчики `WorkspaceExplorer.jsx`.

## 3. Ретаргет source-тестов (19 файлов)

Механизм: shared helper `src/test-utils/explorerSourceText.mjs` (`readExplorerSources()` — конкатенация всех `features/explorer/*.{js,jsx,css}` без `*.test.*`; `from()`/`around()` — окна по стабильным якорям; `betweenStable()` — срезы между data-testid). Все срезы `between()` по якорям внутри `WorkspaceExplorer.jsx` (типа `"function ExplorerPane("`) удалены — они умерли бы при первом переносе.

| Категория | Файлы | Механизм |
|---|---|---|
| Чистая мультифайловая структура | explorerAdaptive, workspaceAssigneePicker, workspaceContextStatusControls, workspaceExplorerRemaining, workspaceFolderMove, workspaceProjectMove, workspaceProjectToolbar, workspaceSidebarJoinGeometry, workspaceToolbarControls, workspaceToolbarRestructure, workspaceOpenAffordance, workspaceSectionHeaderCleanup + navZonePartA (тесты 1–3) | конкатенация + окна по стабильным якорям (data-testid, `placeholder="Найти пользователя"`, `Действия сессии` и т.п.), негативы — глобально |
| Мультифайл + API-пины на неподвижных файлах | workspaceAutoExpandSteps, workspaceProjectBreadcrumb, workspaceSessionAssignees, workspaceSmartSearch, workspaceSortableColumns, workspaceSubprocessTreeView, navZonePartA (тесты 4–7) | прямые чтения `explorerApi.js`/`lib/api.js`/controller сохранены (файлы не двигаются при декомпозиции) |
| Behavioral-добавки | explorerApi.test.mjs (новый): `apiGetProjectPage` → `tree=true`/`root_only=true`/`include_children_meta=true` в URL; `navSingleLineLayout` уже покрыт существующим `components/navSingleLineLayout.test.mjs` | node:test + fetch-mock |

Избыточные пины на чистые функции, уже покрытые sibling-unit-тестами (`explorerSortModel`, `explorerSearchModel`, `explorerStatusFilters`, `explorerTreePersistence`, `explorerAssigneeModel` и др.), удалены из source-тестов с комментариями — покрытие не потеряно.

## 4. Ослабленные пины (механизм, не intent)

1. `workspaceSidebarJoinGeometry`: «три заголовка используют общий токен высоты» → assert ≥3 вхождений токена в конкатенации (после декомпозиции заголовки в разных файлах; пофайловые окна давали бы ложные срабатывания).
2. `workspaceContextStatusControls`: пин `StatusPopoverControl domain="session"` перенесён из среза ProjectRow в глобальный — исходный срез ошибочно захватывал SessionTreeRow, где компонент реально живёт.
3. Часть positive-пинов ExplorerPane/ProjectPane стала глобальной вместо компонент-скоуп (все паттерны проверены на глобальную уникальность); где негативу нужен был скоуп — окна по якорям, комментарии `// retarget(s0):`.

Заодно починен pre-existing failure в `navZonePartA` (пин на умерший идентификатор `projectBreadcrumbTrail` → актуальный `projectHeaderDisplayCrumbs`, с комментарием).

## 5. Пробелы (что characterization НЕ покрывает — фиксируется честно)

- Рендер-геометрия, порталы в nav-slot, sticky-заголовки — source/структурные пины только.
- Notes-агрегаты, обсуждения, analytics-вкладки — вне C1–C4.
- Move-диалоги, rename/delete флоу, create folder/project — вне C1–C4 (покрыты частично source-пинами).
- `useWorkspaceExplorerController` (BFS-restore) — без unit-теста (e2e `project-refresh-restore.spec.mjs` покрывает интегрально; в CI e2e не гейтится).
- Полный node --test suite: 86 pre-existing failures (technologist/process/analysis, appVersion v1.0.141) — gating = follow-up contour.
