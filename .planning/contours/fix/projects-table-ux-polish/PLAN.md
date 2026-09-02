# fix/projects-table-ux-polish — план

## Цель
Довести смерженный экран «Проекты» (workspace-таблица) до критериев приёмки:
1. Геометрия дерева — гайды и границы строк пиксель-в-пиксель.
2. Назначение ответственного работает на строках-сессиях.

## Baseline
- Ветка: `fix/projects-table-ux-polish` от `origin/main` (HEAD `06b209b2`).
- Worktree: `/Users/mac/agents_place/kimi_PM/p0-work-projects-table-ux-polish`.

## Затронутые файлы
- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/features/explorer/explorerAdaptive.css`
- `frontend/src/features/explorer/explorerAssigneeModel.js` (минимально: helper для single assignee, если потребуется)
- `frontend/src/lib/api.js` (минимально: re-export в explorerApi или прямой импорт)

## Задача 1. Геометрия дерева

### Диагноз
- `TreeGuides` рисует все уровни одинаковой ширины (`22px`), но для листовой строки колено не доходит до иконки сессии (между гайдом и иконкой вставлен `h-5 w-5` placeholder + `gap-2`).
- Вертикальные гайды могут рваться, т.к. зависят от `align-self: stretch` внутри flex-контейнера без явной высоты.
- `SessionTreeRow` передаёт `depth` в `TreeGuides`, хотя визуально должен быть на уровне `depth + 1`.

### Решение
1. **CSS** (`explorerAdaptive.css`):
   - `.explorer-guide` — `width: 22px`, `position: relative`, `align-self: stretch`, `height: 100%`.
   - `.explorer-guide::before` — `position: absolute; left: 10px; top: 0; bottom: 0; border-left: 1px solid var(--c-border-strong); opacity: 0.45;`.
   - `.explorer-guide-last` — `width: 50px` (`22px` уровень + `20px` шеврон + `8px` gap), последний гайд заменяется коленом.
   - `.explorer-guide-last::before` — `top: 0; bottom: 50%; left: 10px; border-left + border-bottom; border-radius: 0 0 0 3px; opacity: 0.55;`.
   - Добавить временный класс `.explorer-debug-grid` для скриншота: подсветка гайдов/границ яркими цветами.

2. **JSX** (`WorkspaceExplorer.jsx`):
   - `TreeGuides` — оставить текущую сигнатуру (`depth`, `isLast`).
   - `SessionTreeRow`:
     - передать `depth + 1` в `TreeGuides`;
     - убрать placeholder `<span className="inline-flex h-5 w-5 shrink-0" />`;
     - иконка сессии идёт сразу после `TreeGuides`.
   - `FolderRow` / `ProjectRow` — оставить placeholder/шеврон, т.к. для контейнерных строк isLast=false и ширина гайдов `22px`.
   - Убедиться, что `explorer-row-leaf td` имеет `height: 34px` и гайды растягиваются на всю высоту.

## Задача 2. Ответственный на сессиях

### Диагноз
- `SessionTreeRow` рисует пустую `<td className="px-2" />` вместо ячейки ответственного.
- `SessionItem` в API уже содержит `assignees: List[Dict]`; контракт готов.
- Нет UI для назначения/снятия assignee в дереве workspace.

### Решение
1. **UI-компонент сессии**:
   - Добавить `SessionAssigneeCell` в `WorkspaceExplorer.jsx`:
     - Использует `getSessionAssignees(session)` и `formatExplorerUserDisplay`.
     - Пустое состояние: кнопка `+ Назначить` по ховеру строки (`explorer-assign-trigger`).
     - Назначен: аватар + имя (как `AssigneeCell`).
     - Поддерживает many-to-many, но в дереве workspace показываем первого assignee + overflow count.
   - `SessionTreeRow`:
     - Добавить пропсы `canAssign`, `onAssign`.
     - Вместо пустой `<td />` в колонке «Ответственный» рисовать `<SessionAssigneeCell session={session} onAssign={onAssign} canAssign={canAssign} />`.
   - `ProjectSessionsRows`:
     - Принимает `canAssign` и `onAssign(session)`.
     - `onAssign` открывает тот же `AssigneeDialog` с `kind: "session_assignees"`.
   - `WorkspaceExplorer`:
     - Передаёт `permissions?.canAssignSessionAssignees` в `ProjectSessionsRows`.
     - Обработчик `onAssignSession` устанавливает `assigneeDialog` с `kind: "session_assignees"`.

2. **Диалог назначения**:
   - В `AssigneeDialog` поддержать `kind === "session_assignees"`:
     - title: `getSessionAssigneesDialogTitle()` → "Исполнители схемы".
     - selected: первый id из `getSessionAssigneeIds(item)`.
     - radio позволяет выбрать одного или «Очистить».
   - В `handleSaveAssignee` добавить ветку `session_assignees`:
     - Оптимистично обновить кэш `projectSessionsQueryKey(projectId)` через `queryClient.setQueryData`.
     - Вызвать `apiReplaceSessionAssignees(sessionId, userId ? [userId] : [])`.
     - При ошибке — откатить кэш и пробросить исключение.
     - Показать notice.

3. **API**:
   - Импортировать `apiReplaceSessionAssignees` из `../../lib/api.js`.
   - API-контракт не меняется; `SessionItem.assignees` уже возвращается.

## Тесты
- `npm run build` — чисто.
- `node --test src/features/explorer/*.test.mjs` — существующие тесты не ломаются.
- Ручной визуальный чек: 1280px, 1920px, debug-оверлей.

## Артефакты
- `PLAN.md` — этот файл.
- `UI.md` — скриншоты до/после (debug overlay, 1280/1920).
- `API.md` — контракт assignee для сессий (фиксация, что изменений не требуется).
- `TESTS.md` — чеклист тестовых сценариев.
- `PR.md` — описание PR на русском.
