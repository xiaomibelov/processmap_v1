# Test Plan — Workspace Subprocess Tree View

## Backend Tests

### Test file

`backend/tests/test_workspace_subprocess_tree_view.py`

### 1. Project explorer `root_only=true`

```python
def test_project_explorer_root_only_hides_children():
    # Create project, root session, child session.
    # Call GET /api/projects/{pid}/explorer?root_only=1&include_children_meta=1
    # Assert child not in sessions list.
    # Assert root session has has_children=True.
```

### 2. Project explorer default behavior unchanged

```python
def test_project_explorer_default_includes_all_sessions():
    # Call GET /api/projects/{pid}/explorer
    # Assert both root and child present (flat list).
```

### 3. Children endpoint

```python
def test_list_session_children_returns_immediate_children():
    # Create root + 2 children.
    # GET /api/sessions/{root_id}/children
    # Assert 2 items, each parent_session_id == root_id.
```

### 4. Children endpoint authz

```python
def test_list_session_children_forbidden_for_intruder():
    # Child belongs to project in org A.
    # User from org B requests children.
    # Assert 403 or 404.
```

### 5. SessionItem includes hierarchy meta

```python
def test_session_item_includes_parent_and_has_children():
    # GET /api/projects/{pid}/explorer?include_children_meta=1
    # Assert each item has parent_session_id and has_children fields.
```

### 6. DB index performance (smoke)

```python
def test_project_parent_index_exists():
    # Query sqlite_master for idx_sessions_project_parent.
```

---

## Frontend Tests

### Unit / component tests

`frontend/src/features/explorer/WorkspaceExplorer.tree.test.jsx` (or `.test.js`)

#### 1. Root-only list renders

```js
test("renders root sessions and hides children by default", () => {
  // Mock apiGetProjectPage returning root sessions with has_children.
  // Render ProjectPane with feature flag ON.
  // Assert root sessions visible.
  // Assert child sessions not visible initially.
});
```

#### 2. Expand loads and shows children

```js
test("expand root fetches children and renders them indented", async () => {
  // Mock apiGetSessionChildren.
  // Click chevron on root row.
  // Assert apiGetSessionChildren called.
  // Assert child rows appear with greater indent.
});
```

#### 3. Collapse hides children

```js
test("clicking expanded chevron hides children", async () => {
  // Expand root, then click chevron again.
  // Assert child rows removed from DOM.
});
```

#### 4. Child session opens canvas

```js
test("clicking child session row opens session", async () => {
  // Expand root, click child row.
  // Assert onOpenSession called with child id.
});
```

#### 5. Feature flag off = flat list

```js
test("feature flag disabled shows flat list without chevrons", () => {
  // Mock feature flag false.
  // Render ProjectPane.
  // Assert no chevron buttons.
  // Assert children visible alongside roots.
});
```

### E2E / integration tests

`tests/e2e/workspace-subprocess-tree.spec.js` (if e2e suite exists)

#### 1. End-to-end drill-down

```js
test("drill-down in canvas creates child; Workspace shows it only after expand", async () => {
  // Open root session in canvas.
  // Drill-down into subprocess.
  // Navigate back to Workspace.
  // Assert root session has chevron.
  // Expand and assert child visible.
});
```

---

## Manual QA Checklist

- [ ] Workspace загружается без ошибок при включённом флаге.
- [ ] Root-сессии отображаются.
- [ ] Child-сессии скрыты до expand.
- [ ] Chevron виден только у сессий с детьми.
- [ ] Expand загружает детей lazy.
- [ ] Collapse скрывает детей.
- [ ] Открытие child-сессии работает и breadcrumb canvas корректен.
- [ ] Поиск по проекту находит root и уже загруженные children.
- [ ] Сортировка не ломает дерево.
- [ ] Feature flag off возвращает плоский список.
- [ ] Stage smoke test: URL `https://stage.processmap.ru/app?project=...`.
