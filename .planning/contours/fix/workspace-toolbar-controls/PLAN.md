# fix/workspace-toolbar-controls — PLAN

## Цель

Один PR в ветке `fix/workspace-toolbar-controls` от `origin/main` после merge `fix/header-and-breadcrumbs`.

## Контекст

- `origin/main`: `a94b0d8e` (`Fix explorer header and project breadcrumbs (#899)`).
- Workspace tree живёт в `frontend/src/features/explorer/WorkspaceExplorer.jsx`.
- Pure row model живёт в `frontend/src/features/explorer/work3TreeState.js`.
- Существующий persisted manual state: `explorer.tree.expanded = Record<orgId::workspaceId, string[]>`.

## ui-ux-pro-max

Обязательные запросы выполнены:

- `tree expand collapse all`
- `dropdown menu positioning`

Применимые выводы:

- Controls остаются в одной toolbar-строке рядом с существующим `...`.
- Icon-only кнопка получает `aria-label`, `title`, `aria-pressed`.
- Dropdown должен иметь positioning anchor и не клипаться за правый край.
- Массовое действие не должно вызывать layout shift или блокировать UI на больших деревьях.

## Семантика expand/collapse all

Кнопка работает как transient session action:

- `Expand all` раскрывает все уже известные expandable folders/projects и запускает lazy-load для expandable folders.
- Пока режим bulk-expand активен, новые загруженные child folders/projects автоматически раскрываются, чтобы дерево дошло до полного раскрытия без серии ручных кликов.
- `Collapse all` сворачивает все известные expandable folders/projects.
- Массовое действие не вызывает `treeSaverRef.schedule` и не перезаписывает `explorer.tree.expanded`.
- После reload восстанавливается persisted manual state, который был до массового действия.
- Если после массового действия пользователь вручную раскрывает/сворачивает отдельный узел, это считается явным продолжением работы: обычный manual toggle снова пишет persisted state текущей ручной операции.

Состояние кнопки:

- `expanded`: все известные expandable ids раскрыты.
- `collapsed`: все известные expandable ids свёрнуты.
- `mixed`: часть раскрыта, часть свёрнута; иконка/действие по умолчанию — expand.

## План работ

1. Добавить pure helper’ы в `work3TreeState.js`:
   - сбор expandable ids по `rootItems` и `childItemsByFolder`;
   - вычисление bulk-state `expanded/collapsed/mixed`;
   - построение next expanded map без мутации входных данных.
2. Добавить RED-тесты в `work3TreeState.test.mjs`.
3. Добавить source-тест `workspaceToolbarControls.source.test.mjs`:
   - кнопка находится рядом с status `...`;
   - bulk action не вызывает `treeSaverRef.current?.schedule`;
   - project kebab имеет `relative` anchor;
   - menu имеет viewport-safe positioning hook.
4. Реализовать кнопку в `workspace-filter-toolbar`.
5. Починить project row kebab anchor.
6. Прогнать focused tests, build, `rg alert(`, CI.

## Риски

- Полное раскрытие глубокой lazy-структуры зависит от уже доступных `child_folder_count`/`child_project_count`; если backend отдаёт неверные aggregates, UI не сможет узнать о неизвестных descendants.
- У текущего tree persistence есть legacy fallback; массовое действие намеренно его не меняет.
