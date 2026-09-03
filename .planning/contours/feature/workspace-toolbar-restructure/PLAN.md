# feature/workspace-toolbar-restructure — PLAN

Дата: 2026-09-02.
Ветка: `feature/workspace-toolbar-restructure`.
Baseline: `origin/main` / `f271af8e4d75d5ce489d301dec26f1da4c7b9cd3` (merge PR #895 `fix/workspace-explorer-remaining`).

Статус: approved пользователем, реализовано в этой ветке. Merge только после отдельного explicit approve PR.

## Context

Текущая структура после #895:

1. Global app topbar: `PROCESSMAP`, org switcher, admin/API Docs/user controls.
2. Explorer header: tabs `Проекты / Аналитика` + current workspace label/path.
3. `workspaceToolbar`: `Поиск`, `Создать раздел`, `Создать проект`.
4. `statusFilterChips`: chips `Все / Активен / Готово / Черновик / AS IS` + `N элементов`.
5. Table header.

Целевая структура этого контура:

1. Global app topbar: остается app-level shell.
2. Workspace global header: tabs + full breadcrumbs `Организация / Workspace / ...`.
3. Workspace toolbar/filter row: status chips + counter + search + create actions.
4. Table header.

Правило на будущее: внутри WorkspaceExplorer допускаются максимум три уровня над строками данных: `глобальный хэдер / тулбар воркспейса / шапка таблицы`. Запрещено добавлять отдельный четвертый ряд для локальных actions, filters или breadcrumbs.

## ui-ux-pro-max

Команда:

```bash
python3 .../ui-ux-pro-max/scripts/search.py "app header breadcrumb navigation" --domain ux --max-results 8
```

Результаты: 8 matches.

Применимые критерии:

- Sticky navigation не должен перекрывать content; после удаления среднего toolbar проверить offsets/table sticky.
- Keyboard navigation: tab order должен соответствовать визуальному порядку controls.
- Breadcrumbs уместны для 3+ уровней и должны показывать положение пользователя.
- Back behavior не должен ломать историю/контекст.
- Active state tabs/chips должен быть видимым.

Ограничения discovery:

- `graphify query` в новом worktree недоступен: нет `graphify-out/graph.json`.
- RAG через Docker недоступен: Docker daemon не запущен.

## Component Map

Основной файл:

- `frontend/src/features/explorer/WorkspaceExplorer.jsx`

Смежные тесты/модели:

- `frontend/src/features/explorer/workspaceExplorerRemaining.source.test.mjs`
- `frontend/src/features/explorer/workspaceSidebarJoinGeometry.source.test.mjs`
- `frontend/src/features/explorer/workspaceSmartSearch.source.test.mjs`
- `frontend/src/features/explorer/explorerTreePersistence.js`
- `backend/app/routers/users_preferences.py`
- `backend/tests/test_users_preferences.py`

Текущие точки изменения:

- `ExplorerSearchBox` — сейчас содержит локальный `IcoSearch`.
- `statusFilteredItems` / `effectiveExpandedByFolder` / `visibleRows` — текущая фильтрация chips.
- `statusFilterOptions` / `statusFilterChips` — текущая отдельная filter row.
- `explorerHeader` — tabs + breadcrumbs.
- `workspaceToolbar` — средний toolbar, должен быть удален из DOM.
- `WorkspaceSidebar` — содержит duplicated `Organization / Роботизация производств`.
- `ExplorerSidebarHeaderBlock` + `useSetExplorerSidebarHeader` — место для compact back link над `WORKSPACES`.

## New Layout Spec

### Было: 4 ряда над данными

```text
[App topbar]
[Explorer header: tabs + breadcrumbs]
[Workspace toolbar: search + create]
[Filter chips row: chips + counter]
[Table header]
```

### Стало: 3 ряда над данными

```text
[App topbar]
[Explorer header: tabs + breadcrumbs: Organization / Workspace / path]
[Workspace toolbar: chips ... counter search + create]
[Table header]
```

Средний `workspaceToolbar` удаляется из DOM, не `display:none`.

## Control Relocation

| Control | Сейчас | Должно стать |
|---|---|---|
| `Проекты / Аналитика` | Explorer header, left zone | Остаются там же |
| `DK` / workspace current path | Explorer header breadcrumbs | Становится частью full breadcrumbs `Организация / DK / ...` |
| `Роботизация производств` | Sidebar block `ORGANIZATION` | Удаляется из sidebar, добавляется в breadcrumbs |
| `← Назад` | `ExplorerSidebarHeaderBlock`, отдельный top row sidebar | Остается в верхней части sidebar как compact text link над `WORKSPACES`; без отдельного organization блока |
| `Поиск` | Отдельный `workspaceToolbar` | В правой части единственного workspace toolbar/filter row |
| `Создать раздел` | Отдельный `workspaceToolbar` | Справа после поиска |
| `Создать проект` | Отдельный `workspaceToolbar` | Справа после `Создать раздел`; disabled state на root сохраняется |
| Status chips | Отдельный filter row | Левая часть единственного workspace toolbar/filter row |
| `N элементов` | Справа в filter row | Между chips и search, перед правым action group |

## Header Design

Explorer header:

- Высота: использовать существующий token `--explorer-header-h`, если хватает для breadcrumbs; если нет, увеличить token один раз и синхронно для left/right header, чтобы не сломать sidebar join geometry.
- Left zone: tabs `Проекты / Аналитика`, width `var(--explorer-sidebar-w)`, border-right остается одной осью.
- Right zone: breadcrumbs с первым crumb = organization name, вторым = workspace name, далее текущий folder/project path.
- Breadcrumb click behavior:
  - Organization crumb non-clickable или открывает org switcher только если уже есть локальный паттерн; в первой реализации безопаснее non-clickable.
  - Workspace crumb ведет на root workspace.
  - Folder crumbs сохраняют существующий `onNavigateToBreadcrumb`.
- Typography: `text-[13px]/text-[15px]`, font weights из текущих tokens; не вводить новые raw colors.
- Global app topbar не менять, кроме если уже существующий слот требует больше ширины; не переносить туда workspace actions.

## Sidebar Design

Удалить из `WorkspaceSidebar`:

```text
Organization
Роботизация производств
```

Sidebar после изменения:

```text
[← Назад]   // ExplorerSidebarHeaderBlock, компактная ссылка/disabled text
[WORKSPACES + plus]
[workspace rows]
```

Требования:

- `← Назад` остается внутри sidebar width и не пересекает divider.
- `WORKSPACES` получает верхний отступ, который визуально компенсирует удаление organization блока без создания нового header row.
- Active workspace counters/role/edit icon остаются внутри строки; existing overflow rules не ломать.

## Unified Workspace Toolbar

Новый `workspaceToolbar` заменить на один `workspaceFilterToolbar` или переиспользовать имя `workspaceToolbar`, но содержимое должно включать chips и actions.

Layout:

```text
[Все] [Активен] [Готово] [Черновик] [AS IS] [⋯]  flex spacer  [N элементов] [Поиск] [+ Создать раздел] [+ Проект]
```

Responsive behavior:

- 1920: все controls в одну строку.
- 1280: chips слева, right group справа; toolbar остаётся одной визуальной строкой desktop layout без появления четвёртого semantic header.
- Search width: 240-280px desktop, 180px compact; icon 16px, `label.sr-only` остается.
- `N элементов` должен пересчитываться по реально отображаемым `visibleRows`, включая активный status filter и hidden statuses.
- Для search results branch toolbar остается на месте; table header отсутствует, но четвертый ряд не создается.

## Status Filtering

### Normalize Model

Ввести единую модель status facets:

```js
const STATUS_FILTERS = [
  { key: "active", label: "Активен", statuses: ["active", "in_progress"] },
  { key: "done", label: "Готово", statuses: ["ready", "done", "completed"] },
  { key: "draft", label: "Черновик", statuses: ["draft"] },
  { key: "as_is", label: "AS IS", statuses: ["as_is"] },
];
```

`all` — synthetic filter, не скрывается пользователем.

Status resolver:

- folder/section: `context_status`.
- project: `status`, fallback на агрегированные/derived поля только если уже есть существующий helper.
- session rows: `status`, если они участвуют в branch/search result.

### Show Ancestors And Descendants

При активном status filter:

- показывать совпавшие nodes;
- показывать ancestors совпавших nodes для ориентации;
- для совпавших folder/project показывать загруженных descendants, чтобы пользователь не терял контекст;
- раскрытие в filtered view не должно записываться в persisted expanded prefs.

RED-step после approve: добавить тест, который доказывает текущий дефект “клик по chip ничего не меняет” на fixture с mixed statuses. Только после RED менять filter implementation.

### Hidden Statuses

Новая user preference:

```text
explorer.status_filters.hidden = Record<orgId::workspaceId, string[]>
```

Allowed values: only `active`, `done`, `draft`, `as_is`.

Default:

- hidden list пустой;
- видимы `Все`, `Активен`, `Готово`, `Черновик`, `AS IS`.

Menu mechanics:

- рядом с chips добавить compact `⋯` button (`aria-label="Настроить статусы"`).
- menu содержит checkbox list:
  - `Активен`
  - `Готово`
  - `Черновик`
  - `AS IS`
- `Все` не показывается в списке скрытия и не скрывается.
- Снятие checkbox добавляет key в hidden list; повторное включение удаляет key.
- Если текущий active `statusFilter` был скрыт, немедленно переключить filter на `all`.
- Save через Preferences API с debounce или existing patch helper; 409 — использовать LWW pattern аналогично tree persistence.

Семантика hidden statuses:

- Hidden status не отображается как chip.
- Hidden status нельзя выбрать фильтром.
- Hidden status не используется как status facet в search/filter matching.
- Rows с hidden statuses в режиме `Все` остаются видимыми, чтобы скрытие chip не превращалось в silent data hiding. В search results hidden status не должен становиться причиной match/boost; сам текстовый поиск по названию продолжает находить row.

Approved уточнения:

- Скрытие текущего активного фильтра немедленно сбрасывает фильтр на `Все`, чтобы фильтр не оставался включённым невидимо.
- Меню настройки показывает состояние каждого статуса, включая скрытые, и позволяет вернуть скрытый статус.
- Подтверждённая семантика: hidden status не участвует в фильтрации/поиске как facet, но строки с этим статусом остаются видимыми в режиме `Все`.

Backend preference change:

- Добавить whitelist key `explorer.status_filters.hidden`.
- Validator: object `Record<scopeKey, string[]>`, scope non-empty, ids only allowed status keys, max 8 entries per scope.
- Tests в `backend/tests/test_users_preferences.py`.

## Implementation Steps After Approve

1. RED tests:
   - source test: no separate `workspaceToolbar` row before `statusFilterChips`; toolbar contains chips/search/create together.
   - source test: sidebar no longer renders `Organization` block.
   - pure/filter test or source test for status chip filtering with ancestors/descendants.
   - preference validator test for hidden statuses.
   - source/behavior test for hidden status menu and reset active hidden filter to `all`.

2. Refactor status filter model:
   - Extract status options/resolver near existing filter code or new pure helper if local tests need direct behavior.
   - Replace inline `if (statusFilter === ...)` chain with model-driven lookup.

3. Implement hidden statuses preference:
   - Add backend key + validator.
   - Add frontend helper functions for scoped hidden statuses using existing `treeScopeKey`.
   - Add state/init/save wiring in `ExplorerPane`.

4. Rebuild header breadcrumbs:
   - Prepend organization crumb and workspace crumb to current breadcrumbs.
   - Preserve existing test id `explorer-section-title` on current final crumb.
   - Keep tabs in left zone.

5. Remove middle toolbar:
   - Delete separate row with `data-testid="workspace-explorer-toolbar"` only after replacing tests with new semantic `data-testid="workspace-filter-toolbar"`.
   - Render unified toolbar before table/search results/empty state.
   - Ensure no duplicate search/create controls in empty state.

6. Sidebar cleanup:
   - Remove `organizationName` prop usage from `WorkspaceSidebar`; keep prop only if needed temporarily for no-op compatibility, then remove callsite.
   - Adjust spacing so `WORKSPACES` starts directly under `← Назад`.

7. Sticky/scroll verification:
   - Check table header sticky after toolbar merge.
   - Ensure no overlap at scroll positions top/middle.
   - Keep sidebar/content border axis from existing #895 tests.

8. Screenshots:
   - before 1280/1920 from #895 or current stage.
   - after 1280/1920.
   - after state with at least one hidden status.

## Test Plan

Local commands:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test \
  frontend/src/features/explorer/workspaceToolbarRestructure.source.test.mjs \
  frontend/src/features/explorer/explorerStatusFilters.test.mjs \
  frontend/src/features/explorer/workspaceExplorerRemaining.source.test.mjs \
  frontend/src/features/explorer/workspaceSidebarJoinGeometry.source.test.mjs \
  frontend/src/features/explorer/workspaceSmartSearch.source.test.mjs
```

```bash
.venv311-test/bin/python -m pytest backend/tests/test_users_preferences.py
```

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm run lint
PATH="/Users/mac/.local/node/bin:$PATH" npm run build
```

Manual/Playwright checks:

- 1280px and 1920px: exactly three header levels above table rows.
- Search from new right-side toolbar position works.
- `Создать раздел` opens create folder modal from new position.
- `Создать проект` opens create project modal inside folder and is disabled/explained at root.
- Each chip filters visible rows and updates `N элементов`.
- Active filter with hidden status resets to `Все`.
- Hidden status configuration survives reload for same user/org/workspace.
- Hidden status does not leak to another workspace/org.
- Scroll table body: toolbar and sticky table header do not overlap.

CI expected:

- `frontend`
- `contract`
- `spec-drift`
- compose/build jobs

## Artifacts To Produce After Approve

- `.planning/contours/feature/workspace-toolbar-restructure/PLAN.md` — this file.
- `.planning/contours/feature/workspace-toolbar-restructure/UI.md` — before/after screenshots 1280/1920 and hidden-status state.
- `.planning/contours/feature/workspace-toolbar-restructure/TESTS.md` — exact commands/results and manual checklist.
- `.planning/contours/feature/workspace-toolbar-restructure/PR.md` — Russian PR body.

## Risks / Open Decisions

- Hidden status semantics need explicit approve: this plan keeps rows visible in `Все` and text search, but removes hidden statuses from chip/filter facets. Full data hiding by status is a stronger behavior and should be confirmed before implementation.
- If organization crumb should be clickable and open org switcher, need to reuse existing org control pattern from global topbar; otherwise keep non-clickable to avoid duplicate global control.
- If `--explorer-header-h` must increase for breadcrumbs, update sidebar header height in the same change to preserve geometry.
