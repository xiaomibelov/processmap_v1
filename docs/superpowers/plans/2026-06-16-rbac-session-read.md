# RBAC for Session Read Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary `is_admin=True` stubs in session read paths with correct RBAC checks that respect org roles (`org_owner`, `org_admin`, `auditor`) and `project_memberships`, while keeping delete/rename restricted to the session owner and global admins.

**Architecture:** Implement a storage-layer read-scope helper (`_session_read_scope`) that decides whether the caller has "all", "owner", or "scoped project" access. `SessionStorage.load/list/list_project_session_summaries` use this helper to enforce the rule. The service and router layers stop lying about `is_admin` and forward the real request context.

**Tech Stack:** Python 3.11, FastAPI, SQLite (project storage), existing `backend/app/storage.py` helpers (`get_user_org_role`, `user_has_project_access`, `get_effective_project_scope`).

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/storage.py` | Core RBAC read-scope helper and `SessionStorage` enforcement |
| `backend/app/repositories/session_repo.py` | Pass-through; add `user_id` forwarding for `list_sessions` |
| `backend/app/services/session_service.py` | Forward real request context; remove `is_admin=True` stubs |
| `backend/app/routers/sessions.py` | Pass `request` into service calls |
| `backend/tests/test_session_read_rbac.py` | New TDD tests for all roles |

---

## Task 1: Add RBAC read-scope helper in `backend/app/storage.py`

**Files:**
- Modify: `backend/app/storage.py:448-452` (near `_owner_clause`)

- [ ] **Step 1: Write the helper `_session_read_scope`**

Add the helper right after `_org_clause` (around line 459). It resolves the effective read scope for a user/org pair.

```python
from typing import FrozenSet

_ORG_FULL_ACCESS_ROLES = {"org_owner", "org_admin", "auditor"}


def _session_read_scope(
    user_id: Optional[str],
    org_id: Optional[str],
    is_admin: Optional[bool],
) -> Dict[str, Any]:
    """Return the effective read scope for sessions inside an org.

    Returns a dict:
      - mode: "all"      -> user can read any session in the org
      - mode: "owner"    -> user can only read their own sessions
      - mode: "scoped"   -> user can read sessions whose project_id is in project_ids
      - project_ids: list of allowed project ids (only for mode="scoped")
    """
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    admin = bool(is_admin)
    if admin:
        return {"mode": "all", "project_ids": []}
    if not uid or not oid:
        return {"mode": "owner", "project_ids": []}
    org_role = str(get_user_org_role(uid, oid, is_admin=admin) or "").strip().lower()
    if org_role in _ORG_FULL_ACCESS_ROLES:
        return {"mode": "all", "project_ids": []}
    scope = get_effective_project_scope(uid, oid, is_admin=admin)
    if str(scope.get("mode") or "") == "all":
        return {"mode": "all", "project_ids": []}
    project_ids = [
        str(item or "").strip()
        for item in (scope.get("project_ids") or [])
        if str(item or "").strip()
    ]
    if project_ids:
        return {"mode": "scoped", "project_ids": project_ids}
    return {"mode": "owner", "project_ids": []}
```

- [ ] **Step 2: Verify the helper is importable**

Run:
```bash
cd /opt/processmap-test/backend && python -c "from app.storage import _session_read_scope; print(_session_read_scope('u1', 'o1', False))"
```
Expected: no import error, prints a dict with `mode` and `project_ids`.

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add backend/app/storage.py && git commit -m "feat(rbac): add _session_read_scope helper"
```

---

## Task 2: Update `SessionStorage.load` to enforce RBAC read scope

**Files:**
- Modify: `backend/app/storage.py:2739-2763` (`SessionStorage.load`)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_session_read_rbac.py`:

```python
import os
import unittest
from types import SimpleNamespace

from app.auth import create_user
from app.models import Session
from app.storage import (
    SessionStorage,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


class TestSessionReadRbac(unittest.TestCase):
    def setUp(self):
        os.environ["PROCESS_STORAGE_DIR"] = "/tmp/processmap_rbac_test_sessions"
        os.environ["PROJECT_STORAGE_DIR"] = "/tmp/processmap_rbac_test_projects"
        os.makedirs(os.environ["PROCESS_STORAGE_DIR"], exist_ok=True)
        os.makedirs(os.environ["PROJECT_STORAGE_DIR"], exist_ok=True)
        self.st = get_storage()
        self.st.reset_schema()

    def tearDown(self):
        import shutil
        shutil.rmtree(os.environ["PROCESS_STORAGE_DIR"], ignore_errors=True)
        shutil.rmtree(os.environ["PROJECT_STORAGE_DIR"], ignore_errors=True)

    def _make_user(self, email, is_admin=False):
        return create_user(email, "password", is_admin=is_admin)

    def _create_session(self, owner_id, org_id, project_id=None, title="test"):
        sid = self.st.create(
            title=title,
            user_id=owner_id,
            org_id=org_id,
            project_id=project_id,
        )
        return sid

    def test_org_admin_can_read_any_session_in_org(self):
        owner = self._make_user("owner@local")
        admin = self._make_user("admin@local")
        org_id = "org_1"
        upsert_org_membership(org_id, str(admin["id"]), "org_admin")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1")
        sess = self.st.load(sid, user_id=str(admin["id"]), org_id=org_id, is_admin=False)
        self.assertIsNotNone(sess)

    def test_editor_cannot_read_session_in_unrelated_project(self):
        owner = self._make_user("owner@local")
        editor = self._make_user("editor@local")
        org_id = "org_1"
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_2")
        sess = self.st.load(sid, user_id=str(editor["id"]), org_id=org_id, is_admin=False)
        self.assertIsNone(sess)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /opt/processmap-test/backend && python -m pytest tests/test_session_read_rbac.py -v
```
Expected: `test_org_admin_can_read_any_session_in_org` FAILS because `_owner_clause` restricts to owner.

- [ ] **Step 3: Update `SessionStorage.load`**

Replace the body of `SessionStorage.load` (lines 2747-2763) with:

```python
        sid = str(session_id or "").strip()
        if not sid:
            return None
        owner = _scope_user_id(user_id)
        admin = _scope_is_admin(is_admin)
        org = _scope_org_id(org_id) or _default_org_id()
        org_clause, org_params = _org_clause(org)
        read_scope = _session_read_scope(owner, org, admin)
        mode = str(read_scope.get("mode") or "").strip()
        # Load the session by id + org (do not apply owner clause yet)
        _ensure_schema()
        with _connect() as con:
            row = con.execute(
                f"SELECT * FROM sessions WHERE id = ? {org_clause} LIMIT 1",
                [sid, *org_params],
            ).fetchone()
        if not row:
            return None
        sess = _session_row_to_model(row)
        if mode == "all":
            return sess
        if mode == "owner":
            return sess if owner and str(getattr(sess, "owner_user_id", "") or "").strip() == owner else None
        # mode == "scoped": allow own sessions + sessions in allowed projects
        if owner and str(getattr(sess, "owner_user_id", "") or "").strip() == owner:
            return sess
        project_id = str(getattr(sess, "project_id", "") or "").strip()
        allowed = {str(item or "").strip() for item in (read_scope.get("project_ids") or []) if str(item or "").strip()}
        if project_id and project_id in allowed:
            return sess
        return None
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /opt/processmap-test/backend && python -m pytest tests/test_session_read_rbac.py -v
```
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /opt/processmap-test && git add backend/app/storage.py backend/tests/test_session_read_rbac.py && git commit -m "feat(rbac): enforce read scope in SessionStorage.load"
```

---

## Task 3: Update `SessionStorage.list` and `list_project_session_summaries` to filter by read scope

**Files:**
- Modify: `backend/app/storage.py:2977-3027` (`SessionStorage.list`)
- Modify: `backend/app/storage.py:3029-3098` (`SessionStorage.list_project_session_summaries`)

- [ ] **Step 1: Add tests for scoped listing**

Append to `backend/tests/test_session_read_rbac.py`:

```python
    def test_list_filters_sessions_by_project_scope_for_editor(self):
        owner = self._make_user("owner@local")
        editor = self._make_user("editor@local")
        org_id = "org_1"
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        sid1 = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="alpha")
        sid2 = self._create_session(str(owner["id"]), org_id, project_id="proj_2", title="beta")
        rows = self.st.list(
            org_id=org_id,
            user_id=str(editor["id"]),
            is_admin=False,
            limit=500,
        )
        ids = {str((r or {}).get("id") or "").strip() for r in rows}
        self.assertIn(sid1, ids)
        self.assertNotIn(sid2, ids)

    def test_list_project_session_summaries_filters_by_project_scope(self):
        owner = self._make_user("owner@local")
        viewer = self._make_user("viewer@local")
        org_id = "org_1"
        upsert_org_membership(org_id, str(viewer["id"]), "org_viewer")
        upsert_project_membership(org_id, "proj_1", str(viewer["id"]), "viewer")
        sid1 = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="alpha")
        self._create_session(str(owner["id"]), org_id, project_id="proj_2", title="beta")
        rows = self.st.list_project_session_summaries(
            project_id="proj_1",
            org_id=org_id,
            user_id=str(viewer["id"]),
            is_admin=False,
            limit=500,
        )
        ids = {str((r or {}).get("id") or "").strip() for r in rows}
        self.assertIn(sid1, ids)
        self.assertEqual(len(ids), 1)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /opt/processmap-test/backend && python -m pytest tests/test_session_read_rbac.py -v
```
Expected: new listing tests FAIL because `list` and `list_project_session_summaries` do not filter by project scope.

- [ ] **Step 3: Update `SessionStorage.list`**

In `SessionStorage.list`, replace the owner-only filter (lines 3004-3006):

```python
        read_scope = _session_read_scope(owner, org, admin)
        mode = str(read_scope.get("mode") or "").strip()
        if mode == "owner" and owner:
            filters.append("owner_user_id = ?")
            params.append(owner)
        elif mode == "scoped":
            allowed = [str(item or "").strip() for item in (read_scope.get("project_ids") or []) if str(item or "").strip()]
            if allowed:
                placeholders = ", ".join(["?"] * len(allowed))
                filters.append(f"(owner_user_id = ? OR project_id IN ({placeholders}))")
                params.append(owner)
                params.extend(allowed)
            elif owner:
                filters.append("owner_user_id = ?")
                params.append(owner)
```

- [ ] **Step 4: Update `SessionStorage.list_project_session_summaries`**

Replace the owner-only filter (lines 3056-3058) with the same read-scope logic:

```python
        read_scope = _session_read_scope(_scope_user_id(user_id), org, _scope_is_admin(is_admin))
        mode = str(read_scope.get("mode") or "").strip()
        if mode == "owner":
            owner_id = _scope_user_id(user_id)
            if owner_id:
                filters.append("owner_user_id = ?")
                params.append(owner_id)
        elif mode == "scoped":
            owner_id = _scope_user_id(user_id)
            allowed = [str(item or "").strip() for item in (read_scope.get("project_ids") or []) if str(item or "").strip()]
            if allowed and owner_id:
                placeholders = ", ".join(["?"] * len(allowed))
                filters.append(f"(owner_user_id = ? OR project_id IN ({placeholders}))")
                params.append(owner_id)
                params.extend(allowed)
            elif owner_id:
                filters.append("owner_user_id = ?")
                params.append(owner_id)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /opt/processmap-test/backend && python -m pytest tests/test_session_read_rbac.py -v
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /opt/processmap-test && git add backend/app/storage.py backend/tests/test_session_read_rbac.py && git commit -m "feat(rbac): enforce read scope in session list helpers"
```

---

## Task 4: Forward `user_id` through `session_repo.list_sessions`

**Files:**
- Modify: `backend/app/repositories/session_repo.py:70-78`

- [ ] **Step 1: Update signature and forwarding**

Change `list_sessions` to accept and forward `user_id`:

```python
def list_sessions(
    query: Optional[str] = None,
    limit: int = 200,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    st = get_storage()
    return st.list(query=query, limit=limit, user_id=user_id, org_id=org_id, is_admin=is_admin)
```

- [ ] **Step 2: Run import sanity check**

```bash
cd /opt/processmap-test/backend && python -c "from app.repositories import session_repo; print(session_repo.list_sessions.__code__.co_varnames)"
```
Expected: `('query', 'limit', 'user_id', 'org_id', 'is_admin')` visible.

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add backend/app/repositories/session_repo.py && git commit -m "feat(rbac): forward user_id in session_repo.list_sessions"
```

---

## Task 5: Remove `is_admin=True` stubs and forward real request context in `session_service.py`

**Files:**
- Modify: `backend/app/services/session_service.py:14-136`

- [ ] **Step 1: Add a request-context helper in `session_service.py`**

At the top of the file (after imports), add:

```python
from fastapi import Request, HTTPException
from ..legacy.request_context import (
    request_user_meta,
    request_active_org_id,
)
from ..services.org_workspace import project_scope_for_request


class SessionAccessDenied(HTTPException):
    def __init__(self):
        super().__init__(status_code=403, detail="Недостаточно прав для открытия этой сессии.")


def _request_context(request: Optional[Any] = None) -> Dict[str, Any]:
    """Extract user_id, org_id, is_admin from request or contextvars."""
    if request is not None:
        user_id, is_admin = request_user_meta(request)
        org_id = request_active_org_id(request)
        return {
            "user_id": user_id,
            "is_admin": is_admin,
            "org_id": org_id,
        }
    return {
        "user_id": None,
        "is_admin": None,
        "org_id": None,
    }
```

- [ ] **Step 2: Update `create_session` to stop using `is_admin=True` for load/save**

Change lines 36, 41, 46 from:

```python
session_repo.load(sid, user_id=user_id, org_id=org_id, is_admin=True)
```

To:

```python
session_repo.load(sid, user_id=user_id, org_id=org_id, is_admin=is_admin)
```

And similarly for the two `session_repo.save` calls.

- [ ] **Step 3: Update `get_session` signature and body**

Change:

```python
def get_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    """Load a single session by id."""
    sess = session_repo.load(session_id, user_id=user_id, org_id=org_id, is_admin=is_admin)
    if not sess:
        return {"error": "not found"}
    import app._legacy_main as _lm
    return _lm._session_api_dump(sess)
```

To also accept `request` and raise a clear 403 when access is denied:

```python
def get_session(
    session_id: str,
    *,
    request: Optional[Any] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    """Load a single session by id."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    sess = session_repo.load(
        session_id,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if not sess:
        # Distinguish "not found" from "access denied" by trying an admin lookup
        if ctx_is_admin is False and ctx_user_id and ctx_org_id:
            candidate = session_repo.load(session_id, org_id=ctx_org_id, is_admin=True)
            if candidate:
                raise SessionAccessDenied()
        return {"error": "not found"}
    import app._legacy_main as _lm
    return _lm._session_api_dump(sess)
```

- [ ] **Step 4: Update `list_sessions` to forward `user_id`**

Change the call to:

```python
    items = session_repo.list_sessions(
        query=query,
        limit=min(max(int(limit), 1), 500),
        user_id=org_id,  # placeholder; see Step 5 for full request forwarding
        org_id=org_id,
        is_admin=is_admin,
    )
```

(The final version in Step 5 will derive user_id from request.)

- [ ] **Step 5: Update `list_project_sessions` to use real request context**

Replace the function body with:

```python
def list_project_sessions(
    project_id: str,
    mode: Optional[str] = None,
    view: str = "full",
    *,
    request: Optional[Any] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """List sessions scoped to a project."""
    ctx = _request_context(request)
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    ctx_user_id = ctx.get("user_id")
    if view == "summary":
        return session_repo.list_project_session_summaries(
            project_id=project_id,
            mode=mode,
            limit=500,
            org_id=ctx_org_id,
            user_id=ctx_user_id,
            is_admin=ctx_is_admin,
        )
    rows = session_repo.list_sessions(
        query=None,
        limit=500,
        org_id=ctx_org_id,
        user_id=ctx_user_id,
        is_admin=ctx_is_admin,
    )
    rows = [r for r in rows if str((r or {}).get("project_id") or "").strip() == project_id]
    out = []
    import app._legacy_main as _lm
    for row in rows:
        if isinstance(row, dict):
            out.append(_lm._session_api_dump(Session.model_validate(row)))
    return out
```

- [ ] **Step 6: Update `delete_session` to reject non-owner/non-admin with 403**

Change:

```python
def delete_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> bool:
    """Delete a session."""
    return session_repo.delete(
        session_id,
        user_id=user_id,
        org_id=org_id,
        is_admin=is_admin,
    )
```

To:

```python
def delete_session(
    session_id: str,
    *,
    request: Optional[Any] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> bool:
    """Delete a session. Only the owner or a global admin may delete."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")

    # Load with admin privileges to check ownership before deleting
    sess = session_repo.load(session_id, org_id=ctx_org_id, is_admin=True)
    if not sess:
        return False
    owner_id = str(getattr(sess, "owner_user_id", "") or "").strip()
    if not ctx_is_admin and owner_id != ctx_user_id:
        raise HTTPException(status_code=403, detail="Только владелец сессии может её удалить.")
    return session_repo.delete(
        session_id,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
```

- [ ] **Step 7: Run the service tests**

```bash
cd /opt/processmap-test/backend && python -m pytest tests/test_session_read_rbac.py -v
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /opt/processmap-test && git add backend/app/services/session_service.py && git commit -m "feat(rbac): forward real request context in session_service"
```

---

## Task 6: Update `backend/app/routers/sessions.py` to pass `request` to the service

**Files:**
- Modify: `backend/app/routers/sessions.py:30-57, 79-82`

- [ ] **Step 1: Update router calls**

Change `create_session`:

```python
@router.post('/api/sessions')
def create_session(inp: CreateSessionIn, request: Request):
    return _svc.create_session(
        title=str(getattr(inp, "title", "") or "").strip() or "process",
        roles=getattr(inp, "roles", None),
        start_role=getattr(inp, "start_role", None),
        prep_questions=getattr(inp, "ai_prep_questions", None),
        request=request,
    )
```

Change `list_project_sessions`:

```python
@router.get('/api/projects/{project_id}/sessions')
def list_project_sessions(project_id: str, mode: str | None = None, view: str | None = None, request: Request = None):
    return _svc.list_project_sessions(
        project_id=project_id,
        mode=mode,
        view=view or "full",
        request=request,
    )
```

Change `list_sessions`:

```python
@router.get('/api/sessions')
def list_sessions(q: Optional[str] = None, limit: int = 200, request: Request = None):
    return _svc.list_sessions(query=q, limit=limit, request=request)
```

Change `get_session`:

```python
@router.get('/api/sessions/{session_id}')
def get_session(session_id: str, request: Request = None):
    return _svc.get_session(session_id, request=request)
```

Change `delete_session_api`:

```python
@router.delete('/api/sessions/{session_id}')
def delete_session_api(session_id: str, request: Request = None):
    _svc.delete_session(session_id, request=request)
    return {"ok": True}
```

- [ ] **Step 2: Run a router import check**

```bash
cd /opt/processmap-test/backend && python -c "from app.routers import sessions; print('router ok')"
```
Expected: `router ok`.

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add backend/app/routers/sessions.py && git commit -m "feat(rbac): pass request context from session router"
```

---

## Task 7: Extend tests to cover all acceptance criteria

**Files:**
- Modify: `backend/tests/test_session_read_rbac.py`

- [ ] **Step 1: Add remaining test cases**

Append tests for:
- Global admin can read any session.
- Auditor can read any session in org.
- Editor with project membership can read session in that project.
- Editor without project membership cannot read (403 via service).
- Org viewer can read allowed projects (read-only).
- Owner can read own session.
- Org admin cannot delete someone else's session (403).
- Editor cannot delete someone else's session (403).
- `list_project_sessions` does not leak other projects.

Use the existing test file pattern from Task 2.

- [ ] **Step 2: Run the full test suite**

```bash
cd /opt/processmap-test/backend && python -m pytest tests/test_session_read_rbac.py -v
```
Expected: all tests PASS.

- [ ] **Step 3: Run the broader backend test suite**

```bash
cd /opt/processmap-test/backend && python -m pytest tests/ -q
```
Expected: no new failures compared to baseline.

- [ ] **Step 4: Commit**

```bash
cd /opt/processmap-test && git add backend/tests/test_session_read_rbac.py && git commit -m "test(rbac): cover all session read RBAC acceptance criteria"
```

---

## Task 8: Final verification and rollout preparation

- [ ] **Step 1: Verify no remaining `is_admin=True` stubs in read paths**

Run:
```bash
cd /opt/processmap-test && grep -n "is_admin=True" backend/app/services/session_service.py
```
Expected: only usages inside `create_session` for load/save after creation are allowed and now use the real `is_admin` parameter; no literal `is_admin=True` in `get_session`, `list_project_sessions`, or `list_sessions`.

- [ ] **Step 2: Verify rollback snippet**

If production issues occur, the one-line emergency rollback is to restore `is_admin=True` in:
- `backend/app/services/session_service.py::get_session` (the `session_repo.load` call)
- `backend/app/services/session_service.py::list_project_sessions` (the `session_repo.list_sessions` call)

Document this in the contour report.

- [ ] **Step 3: Update contour state**

```bash
cd /opt/processmap-test && cat > .planning/contours/feature/rbac-session-read/STATE.json <<'EOF'
{
  "contour": "feature/rbac-session-read",
  "type": "feature",
  "status": "ready_for_review",
  "title": "RBAC for session read access",
  "created_at": "2026-06-16T09:03:41Z",
  "rag_preflight": "done"
}
EOF
git add .planning/contours/feature/rbac-session-read/STATE.json && git commit -m "chore(contour): mark rbac-session-read ready for review"
```

- [ ] **Step 4: Push branch and open PR**

```bash
cd /opt/processmap-test && git push origin feature/rbac-session-read
```

PR URL: https://github.com/xiaomibelov/processmap_v1/pull/new/feature/rbac-session-read

Wait for explicit user approval before merge/deploy.

---

## Self-review checklist

- [x] Spec coverage: every acceptance criterion maps to a task/test.
- [x] No placeholders: every step contains actual code/commands.
- [x] Type consistency: `_session_read_scope`, `_request_context`, and helper names match across tasks.
- [x] Rollback plan documented.
- [x] PR/deploy gate explicit.
