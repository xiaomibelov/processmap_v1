# PLAN — Workspace Tree View for Subprocess Sessions

**Status:** ожидает approve (выбор варианта)  
**Рекомендуемый вариант:** **A — Tree view в Workspace**  
**Контур:** `.planning/contours/features/workspace-subprocess-tree-view/`  
**Ветка:** `feature/workspace-subprocess-tree-view`  
**Mirror:** `/srv/obsidian/project-atlas/ProcessMap/Features/workspace-subprocess-tree-view/`

---

## Проблема

Drill-down в subprocess на canvas автоматически создаёт child session. Эта сессия сразу видна в плоском списке Workspace/SAC рядом с родительской, что засоряет список «техническими» сущностями. Пользователь хочет видеть иерархию процессов внутри сессии, не создавая визуального шума.

---

## Решение (Вариант A)

Скрыть child-сессии из плоского списка Workspace по умолчанию и показывать их как разворачиваемое дерево под родительской сессией.

- Child-сессии продолжают создаваться в БД при drill-down на canvas (текущий data model не меняется).
- В Workspace по умолчанию показываются только root-сессии (`parent_session_id IS NULL OR ''`).
- Рядом с родительской сессией с детьми появляется chevron (▶ / ▼).
- Click chevron → lazy-load детей → показать их с indent под родителем.
- Click сессии (не chevron) → открыть сессию в canvas как сейчас.
- Breadcrumb в canvas остаётся без изменений.

**Почему не Вариант B:** inline subprocess view инвазивно меняет subprocess navigation, undo/redo, save flow и требует пересмотра уже влитых фиксов (browser back, breadcrumb, XML upstream sync). Вариант A — минимальные изменения архитектуры.

---

## Функциональные требования

1. **Backend**
   - `GET /api/projects/{project_id}/explorer` поддерживает `root_only=true`.
   - `GET /api/sessions/{session_id}/children` возвращает детей сессии в том же формате `SessionItem`.
   - `SessionItem` содержит `parent_session_id` и `has_children` (или `children_count`).
   - Применяются те же read-scope filters (owner/project/admin) к children.
   - Добавить feature flag `workspace_session_tree_view`.

2. **Frontend Workspace**
   - В `ProjectPane` добавить состояние `expandedSessionIds`, `sessionChildrenCache`, `loadingSessionChildren`.
   - `SessionRow` принимает `depth`, `expanded`, `expandable`, `onToggleExpand`.
   - Chevron только у сессий с `has_children === true`.
   - Indent детей: `padding-left: 8 + depth * 18` px (как у `FolderRow`).
   - Ленивая загрузка детей при первом expand.
   - Feature flag `workspace_session_tree_view` отключает/включает дерево.

3. **Canvas integration**
   - Без изменений. `navigate_to_subprocess` создаёт child session как сейчас.

4. **Search / sort**
   - Поиск по проекту: включает root и children (если children уже загружены) или показывает результаты плоским списком.
   - Сортировка: применяется отдельно к каждому уровню дерева.

---

## Архитектурные решения

| Решение | Обоснование |
|---------|-------------|
| `parent_session_id` и `has_children` в `SessionItem` | Нужно для построения дерева без дополнительных запросов. |
| Отдельный endpoint `GET /api/sessions/{sid}/children` | Чёткая семантика lazy-load; проще кешировать на фронтенде. |
| `root_only=true` в project explorer | Минимальное изменение существующего endpoint; backward compatible. |
| Feature flag | Позволяет включить дерево постепенно и откатить при проблемах. |
| Indent формула из `FolderRow` | Единообразие с существующим tree UI. |

---

## Этапы работы

### Phase 1 — Backend API
- Добавить `parent_session_id`, `has_children` в `SessionItem`.
- Обновить `storage.list_project_sessions_for_explorer`: фильтры `root_only` и `parent_session_id`.
- Добавить `storage.list_session_children` и endpoint `GET /api/sessions/{sid}/children`.
- Добавить индекс `idx_sessions_project_parent`.
- Добавить feature flag `workspace_session_tree_view`.
- Юнит-тесты backend.

### Phase 2 — Frontend Workspace UI
- Добавить `apiGetProjectPage(workspaceId, projectId, { rootOnly })` и `apiGetSessionChildren(sessionId)`.
- Обновить `ProjectPane`: state для expand/cache, загрузка root_only при включённом флаге.
- Обновить `SessionRow`: chevron, indent, toggle.
- Построение visible rows с учётом expanded/cache.

### Phase 3 — Canvas / Integration
- Убедиться, что drill-down по-прежнему создаёт child session и инвалидирует/обновляет кеш children (опционально: invalidate `sessionChildrenCache` для parent после navigate/return).

### Phase 4 — Tests
- Backend: root_only, children endpoint, authz.
- Frontend: отображение root, expand/collapse, lazy load, открытие child.

### Phase 5 — Review & Deploy
- Code review, stage deploy, smoke tests.

---

## Риски и ограничения

| Риск | Митигация |
|------|-----------|
| Child-сессии всё ещё создаются в БД | Вариант A сознательно не решает это; если станет критичным — рассмотреть Вариант B отдельно. |
| Производительность при большом числе children | Lazy load + индекс по `(project_id, parent_session_id)`. |
| Cache invalidation explorer | Для tree-запросов можно обходить кеш или добавлять суффикс ключа; детали в API.md. |
| Сортировка и поиск усложняются | Реализовать построчный builder visible rows, сортировку per level. |

---

## Out of Scope

- Изменение subprocess navigation на canvas.
- Inline subprocess rendering.
- Удаление или архивация child-сессий из Workspace.
- Drag-and-drop сессий в дереве.
