# feature/auto-create-subprocess-sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматически создавать child-сессии для всех `bpmn:subProcess` элементов при BPMN save, мягко удалять их при исчезновении элемента из XML, и показывать active children в Workspace eager tree.

**Architecture:** Backend парсит BPMN XML, извлекает top-level subprocess, upsert-ит child-сессии с фрагментом XML и считает activity_count, soft-delete-ит дочерние сессии для удалённых элементов. Frontend использует уже готовый eager tree API, показывает badge children_count и подпись element_id_in_parent.

**Tech Stack:** Python 3.12, FastAPI, SQLite/Postgres, xml.etree.ElementTree, Celery, React + Vite.

---

## File map

- `backend/app/services/bpmn_navigation.py` — add `find_subprocess_elements()`.
- `backend/app/services/session_service.py` — add `auto_create_subprocess_sessions()`, `soft_delete_removed_subprocess_sessions()`, hook in `bpmn_save()`.
- `backend/app/repositories/session_repo.py` — add `soft_delete_children_by_parent()` helper.
- `backend/app/storage.py` — add `soft_delete_children_by_parent()` and update schema/index for `deleted_at`.
- `backend/app/models.py` — add `deleted_at` to `Session`.
- `backend/app/tasks.py` — add Celery task `create_remaining_subprocess_sessions()`.
- `backend/app/routers/explorer.py` — ensure `children_count` filters active children only.
- `frontend/src/features/explorer/WorkspaceExplorer.jsx` — badge + child row labels + empty icon.
- `frontend/src/features/explorer/explorerApi.js` — pass `include_deleted` default.
- `backend/tests/test_auto_create_subprocess_sessions.py` — backend unit tests.
- `frontend/src/features/explorer/WorkspaceExplorer.test.mjs` (or extend existing) — frontend tests.

---

## Task 1: DB schema + model — add `deleted_at`

**Files:**
- Modify: `backend/app/storage.py` (~line 1381 schema, ~line 1526 migration)
- Modify: `backend/app/models.py:104-107`
- Test: `backend/tests/test_auto_create_subprocess_sessions.py` (written later)

- [ ] **Step 1: Add column to schema**

Add in `_ensure_schema()` table definition:
```python
"deleted_at INTEGER DEFAULT 0",
```

- [ ] **Step 2: Add migration block**

After table creation in `_ensure_schema()`:
```python
con.execute("ALTER TABLE sessions ADD COLUMN deleted_at INTEGER DEFAULT 0")
```
wrapped with try/except for "duplicate column".

- [ ] **Step 3: Update Session model**

```python
deleted_at: int = Field(default=0, exclude=True)
```

- [ ] **Step 4: Update `_session_row_to_model` to load `deleted_at`**

```python
deleted_at=int(row.get("deleted_at") or 0),
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage.py backend/app/models.py
git commit -m "feat(auto-create-subprocess): add deleted_at column and model field"
```

---

## Task 2: BPMN parser — `find_subprocess_elements()`

**Files:**
- Modify: `backend/app/services/bpmn_navigation.py`
- Test: `backend/tests/test_auto_create_subprocess_sessions.py`

- [ ] **Step 1: Write failing test**

```python
def test_find_subprocess_elements_returns_top_level_only():
    xml = '''<?xml version="1.0"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">
      <process id="p">
        <subProcess id="sub_1" name="Prepare" />
        <subProcess id="sub_2" />
        <subProcess id="sub_nested" name="Nested">
          <subProcess id="sub_inner" name="Inner" />
        </subProcess>
      </process>
    </definitions>'''
    result = find_subprocess_elements(xml)
    ids = {e["id"] for e in result}
    assert ids == {"sub_1", "sub_2", "sub_nested"}
    by_id = {e["id"]: e for e in result}
    assert by_id["sub_1"]["name"] == "Prepare"
    assert by_id["sub_2"]["name"] is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/processmap_v1/backend && PYTHONPATH=/root/processmap_v1/backend uv run pytest tests/test_auto_create_subprocess_sessions.py::test_find_subprocess_elements_returns_top_level_only -v
```
Expected: `NameError: name 'find_subprocess_elements' is not defined`

- [ ] **Step 3: Implement function**

```python
BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"


def find_subprocess_elements(xml_text: str) -> List[Dict[str, Optional[str]]]:
    if not xml_text:
        return []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []
    out = []
    for el in root.iter(f"{{{BPMN_NS}}}subProcess"):
        parent = el.find("..")
        if parent is not None and _local_tag(parent.tag) == "subprocess":
            continue
        element_id = _element_id(el)
        if not element_id:
            continue
        name = str(el.attrib.get("name") or "").strip() or None
        out.append({"id": element_id, "name": name})
    return out
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /root/processmap_v1/backend && PYTHONPATH=/root/processmap_v1/backend uv run pytest tests/test_auto_create_subprocess_sessions.py::test_find_subprocess_elements_returns_top_level_only -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bpmn_navigation.py backend/tests/test_auto_create_subprocess_sessions.py
git commit -m "feat(auto-create-subprocess): add find_subprocess_elements parser"
```

---

## Task 3: Storage helper — `soft_delete_children_by_parent()`

**Files:**
- Modify: `backend/app/storage.py`
- Modify: `backend/app/repositories/session_repo.py`

- [ ] **Step 1: Add method to storage**

```python
def soft_delete_children_by_parent(
    self,
    parent_session_id: str,
    keep_element_ids: List[str],
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> List[str]:
    """Soft-delete active child sessions whose element_id_in_parent is not in keep_element_ids."""
    pid = str(parent_session_id or "").strip()
    if not pid:
        return []
    owner = _scope_user_id(user_id)
    admin = _scope_is_admin(is_admin)
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    keep = [str(e).strip() for e in (keep_element_ids or []) if str(e).strip()]
    _ensure_schema()
    now = _now_ts()
    with _connect() as con:
        if keep:
            placeholders = ",".join("?" * len(keep))
            rows = con.execute(
                f"""
                SELECT id, element_id_in_parent FROM sessions
                WHERE parent_session_id = ?
                  AND (deleted_at = 0 OR deleted_at IS NULL)
                  AND element_id_in_parent NOT IN ({placeholders})
                  {org_clause}
                """,
                [pid, *keep, *org_params],
            ).fetchall()
        else:
            rows = con.execute(
                f"""
                SELECT id, element_id_in_parent FROM sessions
                WHERE parent_session_id = ?
                  AND (deleted_at = 0 OR deleted_at IS NULL)
                  {org_clause}
                """,
                [pid, *org_params],
            ).fetchall()
        ids = [str(r["id"]) for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            con.execute(
                f"""
                UPDATE sessions
                   SET deleted_at = ?, updated_at = ?
                 WHERE id IN ({ph})
                   {org_clause}
                """,
                [now, now, *ids, *org_params],
            )
            con.commit()
    return ids
```

- [ ] **Step 2: Add repository wrapper**

```python
def soft_delete_children_by_parent(parent_id, keep_element_ids, *, user_id=None, org_id=None, is_admin=None):
    return get_storage().soft_delete_children_by_parent(parent_id, keep_element_ids, user_id=user_id, org_id=org_id, is_admin=is_admin)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/storage.py backend/app/repositories/session_repo.py
git commit -m "feat(auto-create-subprocess): add soft_delete_children_by_parent storage helper"
```

---

## Task 4: Service functions — auto-create + soft-delete

**Files:**
- Modify: `backend/app/services/session_service.py`

- [ ] **Step 1: Add `_build_child_navigation_stack()` helper**

```python
def _build_child_navigation_stack(parent_session: Session, element_id: str) -> List[Dict[str, Any]]:
    parent_id = str(getattr(parent_session, "id", "") or "").strip()
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    parent_stack = [dict(f) for f in (getattr(parent_session, "navigation_stack", []) or [])]
    if parent_stack:
        parent_stack[-1]["element_id_in_parent"] = element_id
    else:
        parent_stack = [
            {
                "session_id": parent_id,
                "parent_session_id": "",
                "element_id_in_parent": element_id,
                "entered_at": now_iso,
            }
        ]
    return parent_stack + [
        {
            "session_id": "",
            "parent_session_id": parent_id,
            "element_id_in_parent": "",
            "entered_at": now_iso,
        }
    ]
```

- [ ] **Step 2: Add `auto_create_subprocess_sessions()`**

```python
def auto_create_subprocess_sessions(
    parent_session: Session,
    request: Optional[Request] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """Create or restore child sessions for top-level subprocess elements."""
    xml = str(getattr(parent_session, "bpmn_xml", "") or "")
    elements = find_subprocess_elements(xml)
    if not elements:
        return {"created": [], "restored": [], "skipped_existing": [], "total": 0}

    uid, oid, admin = _subprocess_request_context(request)
    created = []
    restored = []
    skipped = []

    for element in elements[:limit]:
        element_id = element["id"]
        title = element["name"] or f"Подпроцесс: {element_id}"
        child_xml = extract_subprocess_xml(xml, element_id) or ""
        navigation_stack = _build_child_navigation_stack(parent_session, element_id)

        existing = session_repo.find_by_parent_element(
            parent_session.id, element_id, user_id=uid, org_id=oid, is_admin=admin
        )
        if existing:
            if getattr(existing, "deleted_at", 0):
                # restore
                existing.deleted_at = 0
                existing.updated_at = int(datetime.datetime.utcnow().timestamp())
                session_repo.save(existing, user_id=uid, org_id=oid, is_admin=admin)
                restored.append(str(existing.id))
            else:
                skipped.append(str(existing.id))
            continue

        child = session_repo.find_or_create_child_session(
            parent_session,
            element_id,
            child_xml,
            navigation_stack,
            title,
            user_id=uid,
            org_id=oid,
            is_admin=admin,
        )
        created.append(str(child.id))

    return {
        "created": created,
        "restored": restored,
        "skipped_existing": skipped,
        "total": len(elements),
    }
```

- [ ] **Step 3: Add `soft_delete_removed_subprocess_sessions()`**

```python
def soft_delete_removed_subprocess_sessions(
    parent_session: Session,
    current_element_ids: List[str],
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    uid, oid, admin = _subprocess_request_context(request)
    soft_deleted = session_repo.soft_delete_children_by_parent(
        parent_session.id,
        current_element_ids,
        user_id=uid,
        org_id=oid,
        is_admin=admin,
    )
    return {"soft_deleted": soft_deleted, "count": len(soft_deleted)}
```

- [ ] **Step 4: Hook into `bpmn_save()`**

Modify `backend/app/services/session_service.py:bpmn_save()`:

```python
def bpmn_save(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Save BPMN XML to session."""
    import app._legacy_main as _lm
    result = _lm.session_bpmn_save(session_id, inp, request)
    if not result.get("ok"):
        return result

    st = get_storage()
    session = st.load(session_id, user_id=..., org_id=..., is_admin=...)
    if session is None:
        return result

    elements = find_subprocess_elements(str(getattr(session, "bpmn_xml", "") or ""))
    element_ids = [e["id"] for e in elements]

    create_summary = auto_create_subprocess_sessions(session, request, limit=10)
    delete_summary = soft_delete_removed_subprocess_sessions(session, element_ids, request)

    async_pending = create_summary["total"] > 10
    if async_pending:
        from ..tasks import create_remaining_subprocess_sessions
        create_remaining_subprocess_sessions.delay(session_id, elements[10:], element_ids)

    result["subprocess_creation"] = {
        "created_count": len(create_summary["created"]),
        "restored_count": len(create_summary["restored"]),
        "soft_deleted_count": delete_summary["count"],
        "total_count": create_summary["total"],
        "async_pending": async_pending,
    }
    return result
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/session_service.py
git commit -m "feat(auto-create-subprocess): auto-create and soft-delete child sessions on BPMN save"
```

---

## Task 5: Celery async fallback

**Files:**
- Modify: `backend/app/tasks.py`

- [ ] **Step 1: Add Celery task**

```python
@app.task(bind=True, max_retries=0)
def create_remaining_subprocess_sessions(
    self,
    parent_session_id: str,
    remaining_elements: List[Dict[str, Optional[str]]],
    current_element_ids: List[str],
) -> None:
    """Create remaining subprocess child sessions and soft-delete removed ones asynchronously."""
    from app.services.session_service import auto_create_subprocess_sessions, soft_delete_removed_subprocess_sessions
    from app.storage import get_storage

    st = get_storage()
    parent = st.load(parent_session_id)
    if parent is None:
        logger.warning("create_remaining_subprocess_sessions: parent not found %s", parent_session_id)
        return

    try:
        # Process all remaining elements without limit.
        auto_create_subprocess_sessions(parent, request=None, limit=len(remaining_elements))
        soft_delete_removed_subprocess_sessions(parent, current_element_ids, request=None)
        project_id = str(getattr(parent, "project_id", "") or "").strip()
        if project_id:
            from app.redis_cache import explorer_invalidate_sessions
            explorer_invalidate_sessions(project_id)
    except Exception:
        logger.exception("create_remaining_subprocess_sessions failed for %s", parent_session_id)
        raise
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/tasks.py
git commit -m "feat(auto-create-subprocess): Celery task for remaining subprocess sessions"
```

---

## Task 6: Backend API filters active children only

**Files:**
- Modify: `backend/app/storage.py` — `list_session_children`, `get_project_session_tree`, `list_project_sessions_for_explorer`
- Modify: `backend/app/routers/explorer.py` — ensure `children_count` uses active filter

- [ ] **Step 1: Update SQL helpers to filter `deleted_at = 0`**

Add `AND (deleted_at = 0 OR deleted_at IS NULL)` to WHERE clauses in children-related queries.

- [ ] **Step 2: Commit**

```bash
git add backend/app/storage.py backend/app/routers/explorer.py
git commit -m "feat(auto-create-subprocess): explorer APIs return only active children"
```

---

## Task 7: Frontend badge + child row labels + empty icon

**Files:**
- Modify: `frontend/src/features/explorer/WorkspaceExplorer.jsx`

- [ ] **Step 1: Show children_count badge on root row**

Use existing `session.children_count` from eager tree API and render badge near title.

- [ ] **Step 2: Show element_id_in_parent as small label under child title**

In `SessionRow` child variant render:
```jsx
<span className="text-xs text-gray-500">{session.element_id_in_parent}</span>
```

- [ ] **Step 3: Empty template icon**

If `!session.bpmn_xml || session.bpmn_xml.length < 500`, show document-outline icon with tooltip "Пустой шаблон".

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/explorer/WorkspaceExplorer.jsx
git commit -m "feat(auto-create-subprocess): frontend badge, child labels and empty state icon"
```

---

## Task 8: Backend tests

**Files:**
- Create: `backend/tests/test_auto_create_subprocess_sessions.py`

- [ ] **Step 1: Write tests**

Tests listed in prompt:
- `test_find_subprocess_elements`
- `test_auto_create_two_children`
- `test_auto_create_no_duplicate`
- `test_auto_create_restore_deleted`
- `test_soft_delete_removed_subprocess`
- `test_soft_delete_not_hard_delete`
- `test_auto_create_limit_10`
- `test_nested_not_created`
- `test_child_session_has_correct_xml`
- `test_children_count_excludes_deleted`

- [ ] **Step 2: Run all backend tests**

```bash
cd /root/processmap_v1/backend && PYTHONPATH=/root/processmap_v1/backend uv run pytest tests/test_auto_create_subprocess_sessions.py -q
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_auto_create_subprocess_sessions.py
git commit -m "feat(auto-create-subprocess): backend tests"
```

---

## Task 9: Frontend tests

**Files:**
- Modify or create: `frontend/src/features/explorer/WorkspaceExplorer.test.mjs`

- [ ] **Step 1: Add tests**

- Root with `children_count=2` shows badge "2 подпроцесса".
- Child row shows `element_id_in_parent`.
- Empty child shows document icon.

- [ ] **Step 2: Run frontend tests**

```bash
cd /root/processmap_v1/frontend && node --test src/features/explorer/WorkspaceExplorer.test.mjs
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/explorer/WorkspaceExplorer.test.mjs
git commit -m "feat(auto-create-subprocess): frontend tests"
```

---

## Task 10: Regression + integration verification

- [ ] **Run backend focused suite**

```bash
cd /root/processmap_v1/backend && PYTHONPATH=/root/processmap_v1/backend uv run pytest tests/test_sessions_rbac.py tests/test_auto_create_subprocess_sessions.py tests/test_session_status_transitions.py -q
```

- [ ] **Run full frontend test suite**

```bash
cd /root/processmap_v1/frontend && node --test src/**/*.test.mjs
```

- [ ] **Push branch**

```bash
git push new-origin feature/auto-create-subprocess-sessions
```

---

## Spec coverage check

- [x] Auto-create on BPMN save — Task 4
- [x] Soft delete removed subprocess — Task 4
- [x] Restore soft-deleted on re-add — Task 4
- [x] Max 10 sync + Celery fallback — Task 4 + 5
- [x] Top-level only (no nested) — Task 2
- [x] Child XML fragment — Task 4 uses `extract_subprocess_xml`
- [x] Active children only in explorer — Task 6
- [x] Frontend badge/labels — Task 7
- [x] Tests — Tasks 8 + 9
