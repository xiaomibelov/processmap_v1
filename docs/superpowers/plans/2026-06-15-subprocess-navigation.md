# Subprocess Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional navigation from a parent BPMN process into a call-activity subprocess, with target-task focus, breadcrumbs, and a back button.

**Architecture:** Backend stores a navigation stack in `sessions.navigation_stack` plus `parent_session_id`/`element_id_in_parent` for quick lookup. A new `POST /api/sessions/{id}/subprocess/{element_id}/navigate` endpoint resolves the subprocess BPMN (project session → embedded process → current XML), lazy-creates a child session, and returns the child session id + focus target. Frontend intercepts clicks on `callActivity`, calls the endpoint, switches the active session, and highlights the target element. A new breadcrumb bar reads the stack and allows navigation back up.

**Tech Stack:** Python FastAPI + SQLite/Postgres, React 18 + Vite + bpmn-js.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `backend/app/storage.py` | Schema migration (`navigation_stack`, `parent_session_id`, `element_id_in_parent`), row mapping, save/create persistence. |
| `backend/app/models.py` | Add fields to `Session` Pydantic model. |
| `backend/app/services/bpmn_navigation.py` | Pure BPMN parsing helpers: find element, read `calledElement`, extract embedded process XML, auto-resolve target element. |
| `backend/app/services/session_service.py` | `navigate_to_subprocess`, `return_to_parent` service functions. |
| `backend/app/routers/sessions.py` | Two new endpoints. |
| `backend/app/schemas/legacy_api.py` | Request/response Pydantic schemas. |
| `backend/tests/test_subprocess_navigation.py` | Backend acceptance tests. |
| `frontend/src/lib/apiRoutes.js` | Route definitions for navigate/return. |
| `frontend/src/lib/api/sessionApi.js` | `apiNavigateToSubprocess`, `apiReturnToParent`. |
| `frontend/src/app/processMapRouteModel.js` | Parse/emit `parent` and `focus` query params. |
| `frontend/src/app/useSessionRouteOrchestration.js` | Read/write `parent`/`focus` alongside project/session. |
| `frontend/src/App.jsx` | Wire navigation state, direct URL restore, breadcrumbs. |
| `frontend/src/components/process/BpmnStage.jsx` | Double-click handler + focus/highlight logic. |
| `frontend/src/features/process/SubprocessBreadcrumbs.jsx` | New breadcrumb bar component. |
| `frontend/src/components/AppShell.jsx` | Render breadcrumbs bar. |

---

### Task 1: Backend schema migration

**Files:**
- Modify: `backend/app/storage.py:860-872` (sessions table creation)
- Modify: `backend/app/storage.py:2707-2649` (`_session_row_to_model`)
- Modify: `backend/app/storage.py:2808-2844` (`save` values dict)
- Modify: `backend/app/storage.py:977-979` (column migration block)

- [ ] **Step 1: Add columns to `CREATE TABLE IF NOT EXISTS sessions`**

After `updated_at INTEGER NOT NULL DEFAULT 0` add:

```sql
navigation_stack TEXT DEFAULT '[]',
parent_session_id TEXT,
element_id_in_parent TEXT
```

- [ ] **Step 2: Add conditional `ALTER TABLE` migration block**

In `storage.py` near existing `_column_exists` migrations (around line 977), add:

```python
if not _column_exists(con, "sessions", "navigation_stack"):
    con.execute("ALTER TABLE sessions ADD COLUMN navigation_stack TEXT DEFAULT '[]'")
if not _column_exists(con, "sessions", "parent_session_id"):
    con.execute("ALTER TABLE sessions ADD COLUMN parent_session_id TEXT")
if not _column_exists(con, "sessions", "element_id_in_parent"):
    con.execute("ALTER TABLE sessions ADD COLUMN element_id_in_parent TEXT")
con.execute("CREATE INDEX IF NOT EXISTS idx_sessions_parent_element ON sessions(parent_session_id, element_id_in_parent)")
```

- [ ] **Step 3: Map new columns in `_session_row_to_model`**

Add to `payload` dict before `return Session.model_validate(payload)`:

```python
"navigation_stack": _json_loads(
    (row["navigation_stack"] if "navigation_stack" in keys else "[]") or "[]",
    [],
),
"parent_session_id": str((row["parent_session_id"] if "parent_session_id" in keys else "") or ""),
"element_id_in_parent": str((row["element_id_in_parent"] if "element_id_in_parent" in keys else "") or ""),
```

- [ ] **Step 4: Persist new columns in `Storage.save`**

Add to `values` dict before the `INSERT/UPDATE`:

```python
"navigation_stack": _json_dumps(getattr(s, "navigation_stack", []) or [], []),
"parent_session_id": str(getattr(s, "parent_session_id", "") or ""),
"element_id_in_parent": str(getattr(s, "element_id_in_parent", "") or ""),
```

- [ ] **Step 5: Update `INSERT` statement in `Storage.save` to include new columns**

Locate the `INSERT INTO sessions (...)` columns list and add:

```sql
navigation_stack, parent_session_id, element_id_in_parent
```

Add matching placeholders and `ON CONFLICT` `UPDATE SET` clauses.

- [ ] **Step 6: Run a quick import/smoke test**

```bash
cd /opt/processmap-test/backend && .venv/bin/python -c "from app.storage import get_storage, _ensure_schema; _ensure_schema(); print('ok')"
```

Expected: `ok`

- [ ] **Step 7: Commit**

```bash
cd /opt/processmap-test && git add backend/app/storage.py && git commit -m "feat(subprocess-navigation): add navigation_stack schema and persistence"
```

---

### Task 2: Backend Session model update

**Files:**
- Modify: `backend/app/models.py:98-103`

- [ ] **Step 1: Add fields to `Session` model**

After `updated_at: int = 0` add:

```python
navigation_stack: List[Dict[str, Any]] = Field(default_factory=list)
parent_session_id: str = ""
element_id_in_parent: str = ""
```

- [ ] **Step 2: Verify backend imports still work**

```bash
cd /opt/processmap-test/backend && .venv/bin/python -c "from app.models import Session; s = Session(id='x', title='t'); print(s.navigation_stack)"
```

Expected: `[]`

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add backend/app/models.py && git commit -m "feat(subprocess-navigation): add navigation fields to Session model"
```

---

### Task 3: Backend BPMN navigation parsing helpers

**Files:**
- Create: `backend/app/services/bpmn_navigation.py`
- Test: `backend/tests/test_bpmn_navigation_helpers.py`

- [ ] **Step 1: Create helper module**

```python
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple


def _local_tag(tag: str) -> str:
    return str(tag).rsplit("}", 1)[-1].lower() if "}" in str(tag) else str(tag).lower()


def find_bpmn_element(xml_text: str, element_id: str) -> Optional[ET.Element]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if str(el.attrib.get("id") or "").strip() == element_id:
            return el
    return None


def element_type(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    return _local_tag(el.tag) if el is not None else None


def called_element_id(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    if el is None:
        return None
    called = str(el.attrib.get("calledElement") or "").strip()
    return called or None


def extract_embedded_process_xml(xml_text: str, process_id: str) -> Optional[str]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if _local_tag(el.tag) == "process" and str(el.attrib.get("id") or "").strip() == process_id:
            return ET.tostring(el, encoding="utf-8", xml_declaration=False).decode("utf-8")
    return None


def extract_subprocess_xml(xml_text: str, element_id: str) -> Optional[str]:
    el = find_bpmn_element(xml_text, element_id)
    if el is None:
        return None
    tag = _local_tag(el.tag)
    if tag == "subprocess":
        return ET.tostring(el, encoding="utf-8", xml_declaration=False).decode("utf-8")
    if tag == "callactivity":
        called = called_element_id(xml_text, element_id)
        if called:
            return extract_embedded_process_xml(xml_text, called)
    return None


def _first_element_by_tag(xml_text: str, tags: List[str]) -> Optional[str]:
    root = ET.fromstring(xml_text)
    for el in root.iter():
        if _local_tag(el.tag) in tags:
            return str(el.attrib.get("id") or "").strip() or None
    return None


def auto_target_element_id(xml_text: str) -> Optional[str]:
    target = _first_element_by_tag(xml_text, ["usertask"])
    if target:
        return target
    return _first_element_by_tag(xml_text, ["task"])


def resolve_target_element_id(xml_text: str, explicit_target_id: Optional[str] = None) -> Optional[str]:
    if explicit_target_id:
        el = find_bpmn_element(xml_text, explicit_target_id)
        if el is not None:
            return explicit_target_id
    return auto_target_element_id(xml_text)
```

- [ ] **Step 2: Write unit tests for helpers**

```python
import pytest
from app.services.bpmn_navigation import (
    called_element_id,
    extract_embedded_process_xml,
    extract_subprocess_xml,
    auto_target_element_id,
    resolve_target_element_id,
)

BPMN = """<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs">
  <process id="Process_root">
    <callActivity id="ca_1" calledElement="Process_sub" />
    <subProcess id="sp_1">
      <userTask id="ut_1" />
      <task id="t_1" />
    </subProcess>
  </process>
  <process id="Process_sub">
    <task id="sub_t_1" />
    <userTask id="sub_ut_1" />
  </process>
</definitions>"""


def test_called_element_id():
    assert called_element_id(BPMN, "ca_1") == "Process_sub"


def test_extract_embedded_process_xml():
    xml = extract_embedded_process_xml(BPMN, "Process_sub")
    assert xml is not None
    assert 'id="Process_sub"' in xml


def test_extract_subprocess_xml_for_call_activity():
    xml = extract_subprocess_xml(BPMN, "ca_1")
    assert xml is not None
    assert 'id="Process_sub"' in xml


def test_extract_subprocess_xml_for_embedded_subprocess():
    xml = extract_subprocess_xml(BPMN, "sp_1")
    assert xml is not None
    assert 'id="sp_1"' in xml


def test_auto_target_element_id_prefers_user_task():
    assert auto_target_element_id(extract_subprocess_xml(BPMN, "ca_1")) == "sub_ut_1"


def test_resolve_target_element_id_explicit():
    assert resolve_target_element_id(extract_subprocess_xml(BPMN, "ca_1"), "sub_t_1") == "sub_t_1"
```

- [ ] **Step 3: Run tests**

```bash
cd /opt/processmap-test/backend && .venv/bin/python -m pytest tests/test_bpmn_navigation_helpers.py -v
```

Expected: 6 passed

- [ ] **Step 4: Commit**

```bash
cd /opt/processmap-test && git add backend/app/services/bpmn_navigation.py backend/tests/test_bpmn_navigation_helpers.py && git commit -m "feat(subprocess-navigation): add BPMN navigation parsing helpers"
```

---

### Task 4: Backend navigate service

**Files:**
- Modify: `backend/app/services/session_service.py`
- Modify: `backend/app/repositories/session_repo.py`

- [ ] **Step 1: Add repository helper to find existing child session**

In `backend/app/repositories/session_repo.py` add:

```python
def find_by_parent_element(parent_session_id: str, element_id_in_parent: str, *, org_id: Optional[str] = None) -> Optional[Session]:
    st = get_storage()
    return st.find_by_parent_element(parent_session_id, element_id_in_parent, org_id=org_id)
```

- [ ] **Step 2: Add storage method `find_by_parent_element`**

In `backend/app/storage.py` in the `Storage` class add:

```python
def find_by_parent_element(
    self,
    parent_session_id: str,
    element_id_in_parent: str,
    *,
    org_id: Optional[str] = None,
) -> Optional[Session]:
    pid = str(parent_session_id or "").strip()
    eid = str(element_id_in_parent or "").strip()
    if not pid or not eid:
        return None
    org = _scope_org_id(org_id) or _default_org_id()
    org_clause, org_params = _org_clause(org)
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            f"SELECT * FROM sessions WHERE parent_session_id = ? AND element_id_in_parent = ? {org_clause} LIMIT 1",
            [pid, eid, *org_params],
        ).fetchone()
    return _session_row_to_model(row) if row else None
```

- [ ] **Step 3: Add `navigate_to_subprocess` service function**

At the end of `backend/app/services/session_service.py` add:

```python
from fastapi import HTTPException, Request
from ..utils.authz import session_access_from_request
from ..services.bpmn_navigation import (
    called_element_id,
    extract_subprocess_xml,
    resolve_target_element_id,
    element_type,
)


def _request_context(request: Optional[Request]):
    if request is None:
        return "", "", False
    uid = str(getattr(request.state, "auth_user", "") or "").strip()
    oid = str(getattr(request.state, "active_org_id", "") or "").strip()
    admin = bool(getattr(request.state, "is_admin", False))
    return uid, oid, admin


def navigate_to_subprocess(
    session_id: str,
    element_id: str,
    target_element_id: Optional[str] = None,
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    sess, scope, err = session_access_from_request(request, session_id)
    if err:
        raise HTTPException(status_code=err.status_code, detail=err.body)

    xml = str(getattr(sess, "bpmn_xml", "") or "").strip()
    if not xml:
        raise HTTPException(status_code=404, detail="Session has no BPMN diagram")

    el_type = element_type(xml, element_id)
    if el_type not in {"callactivity", "subprocess"}:
        raise HTTPException(status_code=400, detail="Element is not a subprocess or call activity")

    called = called_element_id(xml, element_id) if el_type == "callactivity" else None

    # 1. Try existing child session
    existing = session_repo.find_by_parent_element(session_id, element_id, org_id=getattr(sess, "org_id", None))
    if existing:
        child = existing
        child_xml = str(getattr(child, "bpmn_xml", "") or "").strip()
    else:
        # 2. Resolve subprocess BPMN
        child_xml = None
        project_id = str(getattr(sess, "project_id", "") or "").strip()

        if called and project_id:
            # 2a. session in same project with matching bpmn_meta.process_id
            candidates = session_repo.list_project_session_summaries(project_id, org_id=getattr(sess, "org_id", None))
            for c in candidates:
                meta = (c or {}).get("bpmn_meta") or {}
                if str(meta.get("process_id") or "").strip() == called:
                    cand = session_repo.load(str((c or {}).get("id") or ""), org_id=getattr(sess, "org_id", None), is_admin=True)
                    if cand:
                        child_xml = str(getattr(cand, "bpmn_xml", "") or "").strip()
                        break

            # 2b. session in same project whose bpmn_xml contains the process
            if not child_xml:
                for c in candidates:
                    cand = session_repo.load(str((c or {}).get("id") or ""), org_id=getattr(sess, "org_id", None), is_admin=True)
                    if cand and called in str(getattr(cand, "bpmn_xml", "") or ""):
                        child_xml = str(getattr(cand, "bpmn_xml", "") or "").strip()
                        break

        # 2c. embedded process in current XML
        if not child_xml and called:
            child_xml = extract_subprocess_xml(xml, element_id)

        if not child_xml:
            raise HTTPException(status_code=404, detail="Subprocess BPMN not found")

        # 3. Create child session
        target_id = resolve_target_element_id(child_xml, target_element_id)
        title = f"Подпроцесс: {called or element_id}"
        uid, oid, admin = _request_context(request)
        parent_stack = list(getattr(sess, "navigation_stack", []) or [])
        now_iso = "2026-06-15T00:00:00Z"  # use datetime.utcnow().isoformat() in real code
        import datetime
        now_iso = datetime.datetime.utcnow().isoformat() + "Z"
        new_frame = {
            "session_id": "",
            "parent_session_id": session_id,
            "element_id_in_parent": element_id,
            "entered_at": now_iso,
        }
        child_id = session_repo.create(
            title=title,
            project_id=project_id,
            user_id=uid,
            org_id=oid,
        )
        new_frame["session_id"] = child_id
        child = session_repo.load(child_id, user_id=uid, org_id=oid, is_admin=admin)
        if not child:
            raise HTTPException(status_code=500, detail="Failed to create subprocess session")
        child.bpmn_xml = child_xml
        child.parent_session_id = session_id
        child.element_id_in_parent = element_id
        child.navigation_stack = parent_stack + [new_frame]
        session_repo.save(child, user_id=uid, org_id=oid, is_admin=admin)

    child_xml = str(getattr(child, "bpmn_xml", "") or "").strip()
    target_id = resolve_target_element_id(child_xml, target_element_id)

    breadcrumbs = [
        {"session_id": f["session_id"], "name": "", "element_id": f.get("element_id_in_parent")}
        for f in (getattr(child, "navigation_stack", []) or [])
    ]
    # Fill names by loading each session title
    for crumb in breadcrumbs:
        crumb_sess = session_repo.load(crumb["session_id"], user_id=getattr(request.state, "auth_user", "") if request else "", org_id=getattr(sess, "org_id", None), is_admin=True)
        crumb["name"] = str(getattr(crumb_sess, "title", "") or "") if crumb_sess else ""

    return {
        "subprocess_session_id": getattr(child, "id", ""),
        "target_element_id": target_id,
        "breadcrumbs": breadcrumbs,
    }
```

- [ ] **Step 4: Add `return_to_parent` service function**

```python
def return_to_parent(subprocess_session_id: str, request: Optional[Request] = None) -> Dict[str, Any]:
    sess, scope, err = session_access_from_request(request, subprocess_session_id)
    if err:
        raise HTTPException(status_code=err.status_code, detail=err.body)

    stack = list(getattr(sess, "navigation_stack", []) or [])
    if len(stack) < 2:
        raise HTTPException(status_code=404, detail="No parent session in navigation stack")

    parent_frame = stack[-2]
    parent_session_id = str(parent_frame.get("session_id") or "").strip()
    element_id_in_parent = str(parent_frame.get("element_id_in_parent") or "").strip()
    if not parent_session_id:
        raise HTTPException(status_code=404, detail="Parent session not found")

    return {
        "parent_session_id": parent_session_id,
        "element_id_in_parent": element_id_in_parent,
    }
```

- [ ] **Step 5: Run a syntax/import check**

```bash
cd /opt/processmap-test/backend && .venv/bin/python -c "from app.services import session_service; print(session_service.navigate_to_subprocess, session_service.return_to_parent)"
```

Expected: prints function objects

- [ ] **Step 6: Commit**

```bash
cd /opt/processmap-test && git add backend/app/services/session_service.py backend/app/repositories/session_repo.py backend/app/storage.py && git commit -m "feat(subprocess-navigation): add navigate and return service functions"
```

---

### Task 5: Backend router and schemas

**Files:**
- Modify: `backend/app/routers/sessions.py`
- Modify: `backend/app/schemas/legacy_api.py`

- [ ] **Step 1: Add Pydantic schemas**

In `backend/app/schemas/legacy_api.py` add:

```python
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class SubprocessNavigateOut(BaseModel):
    subprocess_session_id: str
    target_element_id: Optional[str] = None
    breadcrumbs: List[Dict[str, Any]] = []

class SubprocessReturnOut(BaseModel):
    parent_session_id: str
    element_id_in_parent: str
```

- [ ] **Step 2: Add router endpoints**

In `backend/app/routers/sessions.py` add:

```python
from ..schemas.legacy_api import (
    ...,
    SubprocessNavigateOut,
    SubprocessReturnOut,
)

@router.post('/api/sessions/{session_id}/subprocess/{element_id}/navigate')
def navigate_to_subprocess(
    session_id: str,
    element_id: str,
    target_element_id: Optional[str] = Query(default=None),
    request: Request = None,
):
    return _svc.navigate_to_subprocess(session_id, element_id, target_element_id, request)

@router.post('/api/sessions/{subprocess_session_id}/return')
def return_to_parent(subprocess_session_id: str, request: Request = None):
    return _svc.return_to_parent(subprocess_session_id, request)
```

- [ ] **Step 3: Verify server starts**

```bash
cd /opt/processmap-test/backend && .venv/bin/python -c "from app.main import app; print('routes:', len(app.routes))"
```

Expected: routes count increased by 2

- [ ] **Step 4: Commit**

```bash
cd /opt/processmap-test && git add backend/app/routers/sessions.py backend/app/schemas/legacy_api.py && git commit -m "feat(subprocess-navigation): add navigate and return endpoints"
```

---

### Task 6: Backend tests

**Files:**
- Create: `backend/tests/test_subprocess_navigation.py`

- [ ] **Step 1: Write acceptance tests**

```python
import pytest
from fastapi import HTTPException
from app.services.session_service import navigate_to_subprocess, return_to_parent
from app.storage import get_storage
from app.repositories import session_repo

BPMN_ROOT = """<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs">
  <process id="Process_root">
    <startEvent id="start" />
    <callActivity id="ca_1" calledElement="Process_sub" />
    <endEvent id="end" />
  </process>
  <process id="Process_sub">
    <startEvent id="sub_start" />
    <task id="sub_task" />
    <userTask id="sub_user_task" />
    <endEvent id="sub_end" />
  </process>
</definitions>"""


def test_navigate_to_embedded_subprocess():
    st = get_storage()
    owner = "owner_nav_1"
    org = "org_nav_1"
    pid = st.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    class DummyRequest:
        state = type("S", (), {"auth_user": owner, "active_org_id": org, "is_admin": False})()

    result = navigate_to_subprocess(sid, "ca_1", request=DummyRequest())
    assert result["subprocess_session_id"]
    assert result["target_element_id"] == "sub_user_task"
    assert len(result["breadcrumbs"]) == 2

    child = session_repo.load(result["subprocess_session_id"], user_id=owner, org_id=org, is_admin=True)
    assert child.parent_session_id == sid
    assert child.element_id_in_parent == "ca_1"


def test_return_to_parent():
    st = get_storage()
    owner = "owner_nav_2"
    org = "org_nav_2"
    pid = st.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    class DummyRequest:
        state = type("S", (), {"auth_user": owner, "active_org_id": org, "is_admin": False})()

    nav = navigate_to_subprocess(sid, "ca_1", request=DummyRequest())
    ret = return_to_parent(nav["subprocess_session_id"], request=DummyRequest())
    assert ret["parent_session_id"] == sid
    assert ret["element_id_in_parent"] == "ca_1"


def test_unauthorized_user_gets_403():
    owner = "owner_nav_3"
    intruder = "intruder_nav_3"
    org = "org_nav_3"
    pid = st.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    class DummyRequest:
        state = type("S", (), {"auth_user": intruder, "active_org_id": org, "is_admin": False})()

    with pytest.raises(HTTPException) as exc_info:
        navigate_to_subprocess(sid, "ca_1", request=DummyRequest())
    assert exc_info.value.status_code in (403, 404)
```

- [ ] **Step 2: Run tests**

```bash
cd /opt/processmap-test/backend && .venv/bin/python -m pytest tests/test_subprocess_navigation.py -v
```

Expected: 3 passed

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add backend/tests/test_subprocess_navigation.py && git commit -m "test(subprocess-navigation): add backend acceptance tests"
```

---

### Task 7: Frontend API wrappers

**Files:**
- Modify: `frontend/src/lib/apiRoutes.js`
- Modify: `frontend/src/lib/api.js`

- [ ] **Step 1: Add routes**

In `frontend/src/lib/apiRoutes.js` under `sessions:` add:

```js
subprocessNavigate: (sessionId, elementId, targetElementId = "") => withQuery(
  `/api/sessions/${encode(sessionId)}/subprocess/${encode(elementId)}/navigate`,
  { target_element_id: String(targetElementId || "").trim() }
),
subprocessReturn: (sessionId) => `/api/sessions/${encode(sessionId)}/return`,
```

- [ ] **Step 2: Add API wrappers**

In `frontend/src/lib/api.js` add:

```js
export async function apiNavigateToSubprocess(sessionId, elementId, targetElementId = "") {
  const id = String(sessionId || "").trim();
  const el = String(elementId || "").trim();
  if (!id || !el) return { ok: false, status: 0, error: "missing session_id or element_id" };
  const r = okOrError(await request(apiRoutes.sessions.subprocessNavigate(id, el, targetElementId), { method: "POST" }));
  return r.ok
    ? { ok: true, status: r.status, subprocessSessionId: r.data?.subprocess_session_id, targetElementId: r.data?.target_element_id, breadcrumbs: r.data?.breadcrumbs }
    : r;
}

export async function apiReturnToParent(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(await request(apiRoutes.sessions.subprocessReturn(id), { method: "POST" }));
  return r.ok
    ? { ok: true, status: r.status, parentSessionId: r.data?.parent_session_id, elementIdInParent: r.data?.element_id_in_parent }
    : r;
}
```

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/lib/apiRoutes.js frontend/src/lib/api.js && git commit -m "feat(subprocess-navigation): add frontend API wrappers"
```

---

### Task 8: Frontend route model updates

**Files:**
- Modify: `frontend/src/app/processMapRouteModel.js`
- Modify: `frontend/src/app/useSessionRouteOrchestration.js`

- [ ] **Step 1: Parse `parent` and `focus` query params**

In `frontend/src/app/processMapRouteModel.js` update `normalizeProcessMapRoute`:

```js
export function normalizeProcessMapRoute(routeRaw = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const folderId = text(route.folderId ?? route.folder_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";
  const parentSessionId = projectId ? text(route.parentSessionId ?? route.parent_session_id ?? route.parent) : "";
  const focusElementId = sessionId ? text(route.focusElementId ?? route.focus_element_id ?? route.focus) : "";
  const surface = sessionId && projectId
    ? "session"
    : projectId
      ? "project"
      : "workspace";

  return {
    surface,
    workspaceId,
    folderId,
    projectId,
    sessionId,
    parentSessionId,
    focusElementId,
    source: normalizeSource(route.source),
  };
}
```

Update `parseProcessMapRoute`:

```js
return normalizeProcessMapRoute({
  workspaceId: params.get("workspace"),
  folderId: params.get("folder"),
  projectId: params.get("project"),
  sessionId: params.get("session"),
  parentSessionId: params.get("parent"),
  focusElementId: params.get("focus"),
  source: options?.source || "direct",
});
```

Update `buildProcessMapUrl` to include `parent` and `focus`:

```js
if (shouldApply("sessionId", "session_id")) {
  if (route.sessionId) params.set("session", route.sessionId);
  else params.delete("session");
}
if (shouldApply("parentSessionId", "parent_session_id")) {
  if (route.parentSessionId) params.set("parent", route.parentSessionId);
  else params.delete("parent");
}
if (shouldApply("focusElementId", "focus_element_id")) {
  if (route.focusElementId) params.set("focus", route.focusElementId);
  else params.delete("focus");
}
```

- [ ] **Step 2: Update `useSessionRouteOrchestration` to expose parent/focus**

Modify `readSelectionFromUrl`:

```js
return {
  projectId: String(route.projectId || "").trim(),
  sessionId: String(route.sessionId || "").trim(),
  parentSessionId: String(route.parentSessionId || "").trim(),
  focusElementId: String(route.focusElementId || "").trim(),
};
```

Modify `writeSelectionToUrl` and `pushSessionSelectionToUrl` to accept and forward `parentSessionId` and `focusElementId`.

- [ ] **Step 3: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/app/processMapRouteModel.js frontend/src/app/useSessionRouteOrchestration.js && git commit -m "feat(subprocess-navigation): parse and emit parent/focus URL params"
```

---

### Task 9: Frontend App.jsx navigation state

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Import new helpers and API**

Add to imports:

```js
import {
  apiNavigateToSubprocess,
  apiReturnToParent,
} from "./lib/api";
```

- [ ] **Step 2: Add navigation state**

Add to component state:

```js
const [subprocessBreadcrumbs, setSubprocessBreadcrumbs] = useState([]);
const [focusElementId, setFocusElementId] = useState("");
```

- [ ] **Step 3: Handle direct URL restore on mount**

In the initial URL handling effect, after reading selection:

```js
const { parentSessionId, focusElementId } = initialSelectionRef.current || {};
if (parentSessionId) {
  setSubprocessBreadcrumbs([{ session_id: parentSessionId, name: "" }, { session_id: sessionId, name: "" }]);
}
if (focusElementId) {
  setFocusElementId(focusElementId);
}
```

- [ ] **Step 4: Add navigate/return handlers**

```js
const navigateToSubprocess = useCallback(async (sessionId, elementId) => {
  const res = await apiNavigateToSubprocess(sessionId, elementId);
  if (!res.ok) {
    console.error("navigate failed", res.error);
    return;
  }
  setSubprocessBreadcrumbs(res.breadcrumbs || []);
  setFocusElementId(res.targetElementId || "");
  pushSessionSelectionToUrl({
    projectId: projectIdOf(activeProjectRef.current),
    sessionId: res.subprocessSessionId,
    projectContext: currentProjectContext,
  });
  openSession(res.subprocessSessionId);
}, [openSession]);

const returnToParent = useCallback(async (sessionId) => {
  const res = await apiReturnToParent(sessionId);
  if (!res.ok) {
    console.error("return failed", res.error);
    return;
  }
  setFocusElementId(res.elementIdInParent || "");
  pushSessionSelectionToUrl({
    projectId: projectIdOf(activeProjectRef.current),
    sessionId: res.parentSessionId,
    projectContext: currentProjectContext,
  });
  openSession(res.parentSessionId);
}, [openSession]);
```

- [ ] **Step 5: Pass handlers and state down**

Add to `AppShell` props:

```jsx
<AppShell
  ...
  subprocessBreadcrumbs={subprocessBreadcrumbs}
  onBreadcrumbNavigate={(sid) => openSession(sid)}
  onReturnToParent={() => returnToParent(sessionIdOf(draft))}
/>
```

- [ ] **Step 6: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/App.jsx && git commit -m "feat(subprocess-navigation): wire navigation state and handlers in App"
```

---

### Task 10: Frontend BpmnStage click handler

**Files:**
- Modify: `frontend/src/components/process/BpmnStage.jsx`

- [ ] **Step 1: Accept navigation callback prop**

Add to prop destructuring / propTypes:

```js
onNavigateToSubprocess,
```

- [ ] **Step 2: Add double-click handler**

In the viewer event binding (near `selection.changed` / `element.contextmenu`), add:

```js
viewer.on("element.dblclick", (event) => {
  const el = event.element;
  if (!el || el.type !== "bpmn:CallActivity") return;
  if (typeof onNavigateToSubprocess === "function") {
    onNavigateToSubprocess(el.id);
  }
});
```

- [ ] **Step 3: Add focus/highlight effect**

After `importXML` resolves in `renderViewerDiagram`, add:

```js
const focusId = window.__SUBPROCESS_FOCUS_ELEMENT_ID__ || "";
if (focusId) {
  try {
    const canvas = viewer.get("canvas");
    canvas.scrollToElement(focusId);
    const overlays = viewer.get("overlays");
    overlays.add(focusId, {
      position: { top: -2, left: -2 },
      html: '<div class="subprocess-focus-highlight"></div>',
    });
  } catch (e) {
    console.warn("focus element not found", focusId, e);
  }
  window.__SUBPROCESS_FOCUS_ELEMENT_ID__ = "";
}
```

- [ ] **Step 4: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/components/process/BpmnStage.jsx && git commit -m "feat(subprocess-navigation): add call activity double-click and focus highlight"
```

---

### Task 11: Frontend SubprocessBreadcrumbs component

**Files:**
- Create: `frontend/src/features/process/SubprocessBreadcrumbs.jsx`

- [ ] **Step 1: Implement component**

```jsx
import React from "react";

export default function SubprocessBreadcrumbs({ breadcrumbs = [], onNavigate, onBack }) {
  if (!breadcrumbs || breadcrumbs.length < 2) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 text-sm">
      <button
        type="button"
        onClick={onBack}
        className="px-2 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
        title="Назад"
      >
        ←
      </button>
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        return (
          <React.Fragment key={crumb.session_id || idx}>
            {idx > 0 && <span className="text-neutral-400">&gt;</span>}
            {isLast ? (
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{crumb.name || "Текущий"}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(crumb.session_id)}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {crumb.name || "..."}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/features/process/SubprocessBreadcrumbs.jsx && git commit -m "feat(subprocess-navigation): add SubprocessBreadcrumbs component"
```

---

### Task 12: Frontend AppShell integration

**Files:**
- Modify: `frontend/src/components/AppShell.jsx`

- [ ] **Step 1: Import component**

```js
import SubprocessBreadcrumbs from "../features/process/SubprocessBreadcrumbs";
```

- [ ] **Step 2: Add props**

```js
export default function AppShell({
  ...,
  subprocessBreadcrumbs,
  onBreadcrumbNavigate,
  onReturnToParent,
}) {
```

- [ ] **Step 3: Render breadcrumbs below TopBar**

```jsx
<TopBar ... />
<SubprocessBreadcrumbs
  breadcrumbs={subprocessBreadcrumbs}
  onNavigate={onBreadcrumbNavigate}
  onBack={onReturnToParent}
/>
{/* rest of layout */}
```

- [ ] **Step 4: Commit**

```bash
cd /opt/processmap-test && git add frontend/src/components/AppShell.jsx && git commit -m "feat(subprocess-navigation): render breadcrumbs in AppShell"
```

---

### Task 13: Frontend build and smoke test

**Files:**
- None (verification only)

- [ ] **Step 1: Run frontend type check / build**

```bash
cd /opt/processmap-test/frontend && npm run build
```

Expected: build succeeds

- [ ] **Step 2: Run backend tests**

```bash
cd /opt/processmap-test/backend && .venv/bin/python -m pytest tests/test_bpmn_navigation_helpers.py tests/test_subprocess_navigation.py -v
```

Expected: all pass

- [ ] **Step 3: Commit any fixes**

```bash
cd /opt/processmap-test && git add -A && git commit -m "fix(subprocess-navigation): build and test fixes" || echo "no fixes needed"
```

---

### Task 14: Documentation and examples

**Files:**
- Create: `docs/superpowers/specs/2026-06-15-subprocess-navigation-curl-examples.md`

- [ ] **Step 1: Write curl examples**

```markdown
# Subprocess Navigation — curl examples

## Navigate into call activity
```bash
curl -s -X POST "http://localhost:8011/api/sessions/{session_id}/subprocess/{element_id}/navigate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  -H "Content-Type: application/json" | jq
```

## Navigate with explicit target
```bash
curl -s -X POST "http://localhost:8011/api/sessions/{session_id}/subprocess/{element_id}/navigate?target_element_id={target_id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  -H "Content-Type: application/json" | jq
```

## Return to parent
```bash
curl -s -X POST "http://localhost:8011/api/sessions/{subprocess_session_id}/return" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  -H "Content-Type: application/json" | jq
```
```

- [ ] **Step 2: Commit**

```bash
cd /opt/processmap-test && git add docs/superpowers/specs/2026-06-15-subprocess-navigation-curl-examples.md && git commit -m "docs(subprocess-navigation): add curl examples"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| JSONB `navigation_stack` + parent/element columns | Task 1, 2 |
| Resolve subprocess (project session → embedded → current XML) | Task 3, 4 |
| Auto-resolve target (userTask → task → null) | Task 3, 4 |
| `POST /api/sessions/{id}/subprocess/{element_id}/navigate` | Task 5 |
| `POST /api/sessions/{id}/return` | Task 4, 5 |
| Lazy-create child session | Task 4 |
| 403 for unauthorized | Task 6 |
| Frontend click on callActivity | Task 10 |
| Focus + highlight target | Task 10 |
| Breadcrumbs UI | Task 11, 12 |
| Back button | Task 9, 11, 12 |
| Direct URL with parent/focus | Task 8, 9 |
| Backward compatible (existing sessions) | Task 1, 2 |

## Placeholder Scan

No TBD/TODO/"implement later"/"handle edge cases" remain.
