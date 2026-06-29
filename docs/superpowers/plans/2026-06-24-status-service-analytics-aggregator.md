# Status Service + Analytics Aggregator Implementation Plan (Phases 4–5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract session status transitions into a dedicated backend `save_services/status_service` with a new `PATCH /api/sessions/{sid}/status` endpoint, switch the frontend optimistic-update hook to use it, and make post-save analytics refresh asynchronous via `save_services/analytics_aggregator` (Celery/Redis).

**Architecture:** Status changes move out of the generic `PATCH /api/sessions/{sid}` handler in `_legacy_main.py` into a focused service; the frontend optimistic-update hook calls the new endpoint. Analytics refresh is no longer invoked synchronously in save paths; instead `property_save`, `status_service`, and `_legacy_main.put_session` publish a `SessionSaved` event that schedules a Celery task.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, Celery + Redis, JavaScript/React, Node test runner.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `backend/app/schemas/legacy_api.py` | New `StatusPatchIn` input schema |
| `backend/app/save_services/status_service/__init__.py` | Package marker / re-export |
| `backend/app/save_services/status_service/status_service.py` | Core `change_session_status()` logic |
| `backend/app/save_services/status_service/status_api.py` | FastAPI router for `PATCH /api/sessions/{sid}/status` |
| `backend/app/services/session_service.py` | Routes status-only patches to `status_service`; rejects mixed payloads |
| `backend/app/_legacy_main.py` | Remove status branch, git-mirror publish block, sync analytics; add async publisher |
| `frontend/src/lib/apiRoutes.js` | New `sessions.status` route |
| `frontend/src/lib/api.js` | New `apiChangeSessionStatus()` helper |
| `frontend/src/features/process/bpmn/stage/optimisticUpdate/useSessionStatusOptimisticUpdate.js` | Call `apiChangeSessionStatus()` instead of `apiPatchSession()` |
| `frontend/src/App.session-status-topbar.test.mjs` | Rewritten to test App.jsx wiring |
| `frontend/src/App.session-status-patch.test.mjs` | Rewritten to test the hook source |
| `frontend/src/features/process/bpmn/stage/optimisticUpdate/useSessionStatusOptimisticUpdate.test.mjs` | New unit tests for optimistic update/rollback |
| `backend/tests/test_status_service.py` | New backend tests for status endpoint and service |
| `backend/app/save_services/analytics_aggregator/__init__.py` | Package marker / re-export `publish_session_saved` |
| `backend/app/save_services/analytics_aggregator/publisher.py` | `publish_session_saved()` → Celery `.delay()` |
| `backend/app/save_services/analytics_aggregator/tasks.py` | Celery task wrapping `refresh_analytics_for_session` |
| `backend/app/celery_app.py` | Import analytics task module so workers discover it |
| `backend/tests/test_analytics_aggregator.py` | New tests for publisher + task |

---

## Task 0 — Stub `analytics_aggregator` for Phase 4

**Files:**
- Create: `backend/app/save_services/analytics_aggregator/__init__.py`

Before Phase 4 finishes, `status_service.py` will import `publish_session_saved` from `analytics_aggregator`. To keep Phase 4 green before Phase 5 is implemented, create a stub package now and overwrite it in Phase 5.

- [ ] **Step 1: Create the stub**

```python
"""Analytics aggregator placeholder.

Phase 5 replaces this stub with the real publisher + Celery task.
"""

from __future__ import annotations


def publish_session_saved(*args, **kwargs) -> None:  # noqa: ARG001
    """No-op until the real publisher is implemented in Phase 5."""
    pass
```

- [ ] **Step 2: Verify Phase 4 imports**

Confirm that `status_service.py` can import `publish_session_saved` from `..analytics_aggregator` without raising `ImportError`.

---

## Phase 4 — `status_service` module

### Task 1: Add `StatusPatchIn` schema

**Files:**
- Modify: `backend/app/schemas/legacy_api.py` (after `SessionMetaPatchIn`)

- [ ] **Step 1: Add the schema**

```python
class StatusPatchIn(BaseModel):
    status: str
    base_diagram_state_version: Optional[int] = None
    reason: Optional[str] = None
    model_config = ConfigDict(extra="allow")
```

- [ ] **Step 2: Verify import shape**

Open `backend/app/schemas/legacy_api.py` and confirm:
- `BaseModel`, `ConfigDict`, and `Optional` are imported.
- `StatusPatchIn` is defined at module level near `SessionMetaPatchIn`.

---

### Task 2: Create `status_service` module

**Files:**
- Create: `backend/app/save_services/status_service/__init__.py`
- Create: `backend/app/save_services/status_service/status_service.py`
- Create: `backend/app/save_services/status_service/status_api.py`

- [ ] **Step 1: Create `__init__.py`**

```python
"""Status transition service."""

from .status_service import change_session_status

__all__ = ["change_session_status"]
```

- [ ] **Step 2: Create `status_service.py`**

```python
"""Core status transition service."""

from __future__ import annotations

import time
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from ..._legacy_main import (
    _audit_log_safe,
    _can_edit_workspace,
    _can_manage_workspace,
    _invalidate_session_caches,
    _legacy_load_session_scoped,
    _require_diagram_cas_or_409,
    _resolve_base_diagram_state_version,
    _session_api_dump,
    get_default_org_id,
)
from ...legacy.request_context import request_auth_user as _request_auth_user
from ...services.org_workspace import org_role_for_request as _org_role_for_request
from ...services.publish_git_mirror import execute_git_mirror_publish
from ...session_status import validate_session_status_transition
from ...storage import get_storage


def change_session_status(
    session_id: str,
    inp: Any,
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    """Validate and apply a session status transition.

    Enforces the same CAS check as diagram-truth writes so that status changes
    do not silently overwrite concurrent edits.
    """
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}

    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False

    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    data = inp.model_dump(exclude_unset=True) if hasattr(inp, "model_dump") else dict(inp or {})
    next_status_raw = data.get("status")
    client_base_version = _resolve_base_diagram_state_version(request=request, payload=data)
    _require_diagram_cas_or_409(
        sess=sess,
        session_id=session_id,
        request=request,
        client_base_version=client_base_version,
    )

    next_status = validate_session_status_transition(
        (sess.interview or {}).get("status"),
        next_status_raw,
        can_edit=_can_edit_workspace(role, is_admin=is_admin),
        can_archive=_can_manage_workspace(role, is_admin=is_admin),
    )

    sess.interview = {**(sess.interview or {}), "status": next_status}
    st = get_storage()
    st.save(sess, user_id=user_id, org_id=oid, is_admin=True)

    if next_status == "ready":
        interview_pending = dict(getattr(sess, "interview", {}) or {})
        mirror_pending = interview_pending.get("git_mirror_publish")
        if not isinstance(mirror_pending, dict):
            mirror_pending = {}
        mirror_pending = {
            **mirror_pending,
            "schema_version": "git_mirror_publish_v1",
            "mirror_state": "pending",
            "last_attempt_at": int(time.time()),
            "last_error": None,
        }
        interview_pending["git_mirror_publish"] = mirror_pending
        sess.interview = interview_pending
        st.save(sess, user_id=user_id, org_id=oid, is_admin=True)

        mirror_result = execute_git_mirror_publish(
            sess,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            user_id=user_id,
        )
        next_interview = mirror_result.get("interview")
        if isinstance(next_interview, dict):
            sess.interview = next_interview
            st.save(sess, user_id=user_id, org_id=oid, is_admin=True)

    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.update",
        entity_type="session",
        entity_id=str(getattr(sess, "id", "") or session_id),
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=str(getattr(sess, "id", "") or session_id),
        meta={"keys": ["status"], "status": next_status},
    )
    _invalidate_session_caches(
        sess,
        org_id=oid or getattr(sess, "org_id", "") or get_default_org_id(),
    )
    return _session_api_dump(sess)
```

- [ ] **Step 3: Create `status_api.py`**

```python
"""Router for status transition operations."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ...schemas.legacy_api import StatusPatchIn
from .status_service import change_session_status

router = APIRouter()


@router.patch("/api/sessions/{session_id}/status")
def change_session_status_endpoint(
    session_id: str,
    inp: StatusPatchIn,
    request: Request,
):
    """Dedicated status transition endpoint."""
    return change_session_status(session_id, inp, request)
```

---

### Task 3: Wire the new router

**Files:**
- Modify: `backend/app/routers/__init__.py`

- [ ] **Step 1: Import and register status router**

Add near the existing `property_save_router` import:

```python
from ..save_services.status_service.status_api import router as status_service_router
```

Add `status_service_router` to `ROUTERS` near `property_save_router`:

```python
ROUTERS = (
    # ... existing routers ...
    sessions_router,
    property_save_router,
    status_service_router,
    # ... rest ...
)
```

---

### Task 4: Route status patches in `session_service`

**Files:**
- Modify: `backend/app/services/session_service.py` (`patch_session` function)

- [ ] **Step 1: Replace the body of `patch_session`**

```python
def patch_session(session_id: str, inp, request=None):
    """Patch session metadata."""
    data = inp.model_dump(exclude_unset=True) if hasattr(inp, "model_dump") else dict(inp or {})
    if "status" in data:
        if len(data) > 1:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "STATUS_ONLY_ENDPOINT",
                    "message": "status changes must use PATCH /api/sessions/{id}/status",
                },
            )
        from ..save_services.status_service import change_session_status
        return change_session_status(session_id, inp, request)
    import app._legacy_main as _lm
    return _lm.patch_session(session_id, inp, request)
```

Make sure `HTTPException` is imported at the top of `session_service.py`:

```python
from fastapi import HTTPException
```

---

### Task 5: Remove status handling from `_legacy_main.patch_session`

**Files:**
- Modify: `backend/app/_legacy_main.py`

- [ ] **Step 1: Remove `"status"` from diagram-truth keys**

Change:

```python
_DIAGRAM_TRUTH_PATCH_KEYS = {"bpmn_meta", "interview", "nodes", "edges", "questions", "status"}
```

to:

```python
_DIAGRAM_TRUTH_PATCH_KEYS = {"bpmn_meta", "interview", "nodes", "edges", "questions"}
```

- [ ] **Step 2: Delete the status branch inside `patch_session`**

Remove the following block from `patch_session`:

```python
    if "status" in data:
        next_status = _validate_session_status_transition(
            (sess.interview or {}).get("status"),
            data.get("status"),
            role_raw=role,
            is_admin=effective_is_admin,
        )
        sess.interview = {**(sess.interview or {}), "status": next_status}
        publish_requested = next_status == "ready"
        handled = True
```

Also remove the variable `publish_requested` from the function if it is no longer assigned elsewhere. Search the function for `publish_requested` and remove all uses (the git-mirror block below).

- [ ] **Step 3: Delete the git-mirror publish block from `patch_session`**

Remove:

```python
    if publish_requested:
        interview_pending = dict(getattr(sess, "interview", {}) or {})
        mirror_pending = interview_pending.get("git_mirror_publish")
        if not isinstance(mirror_pending, dict):
            mirror_pending = {}
        mirror_pending = {
            **mirror_pending,
            "schema_version": "git_mirror_publish_v1",
            "mirror_state": "pending",
            "last_attempt_at": int(time.time()),
            "last_error": None,
        }
        interview_pending["git_mirror_publish"] = mirror_pending
        sess.interview = interview_pending
        st.save(sess, user_id=user_id, org_id=oid, is_admin=True)

        mirror_result = execute_git_mirror_publish(
            sess,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            user_id=user_id,
        )
        next_interview = mirror_result.get("interview")
        if isinstance(next_interview, dict):
            sess.interview = next_interview
            st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
```

- [ ] **Step 4: Replace sync analytics refresh with async publisher**

Replace the final `try/except refresh_analytics_for_session` block in `patch_session`:

```python
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
    try:
        refresh_analytics_for_session(str(getattr(sess, "id", "") or session_id), oid or str(getattr(sess, "org_id", "") or get_default_org_id()))
    except Exception:
        pass
    return _session_api_dump(sess)
```

with:

```python
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
    from .save_services.analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(sess, "id", "") or session_id),
        oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
    )
    return _session_api_dump(sess)
```

---

### Task 6: Add frontend route and API helper

**Files:**
- Modify: `frontend/src/lib/apiRoutes.js`
- Modify: `frontend/src/lib/api.js`

- [ ] **Step 1: Add `status` route**

In `frontend/src/lib/apiRoutes.js`, inside `sessions: { ... }`, add:

```javascript
status: (sessionId) => `/api/sessions/${encode(sessionId)}/status`,
```

Place it next to `item` and `meta`.

- [ ] **Step 2: Add `apiChangeSessionStatus()`**

In `frontend/src/lib/api.js`, after `apiPatchSessionProperties`:

```javascript
export async function apiChangeSessionStatus(sessionId, patch) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing session_id" };
  const r = okOrError(
    await request(apiRoutes.sessions.status(id), { method: "PATCH", body: patch || {} }),
  );
  return r.ok
    ? {
        ok: true,
        status: r.status,
        session: {
          ...(r.data && typeof r.data === "object" ? r.data : {}),
          _sync_source: "change_session_status",
        },
      }
    : r;
}
```

---

### Task 7: Update the optimistic-update hook

**Files:**
- Modify: `frontend/src/features/process/bpmn/stage/optimisticUpdate/useSessionStatusOptimisticUpdate.js`

- [ ] **Step 1: Replace the API import**

Change:

```javascript
import { apiGetSession, apiPatchSession } from "../../../../../lib/api.js";
```

to:

```javascript
import { apiGetSession, apiChangeSessionStatus } from "../../../../../lib/api.js";
```

- [ ] **Step 2: Replace the API call**

Change:

```javascript
const r = await apiPatchSession(sid, payload);
```

to:

```javascript
const r = await apiChangeSessionStatus(sid, payload);
```

No other logic in the hook changes.

---

### Task 8: Rewrite frontend tests

**Files:**
- Modify: `frontend/src/App.session-status-topbar.test.mjs`
- Modify: `frontend/src/App.session-status-patch.test.mjs`
- Create: `frontend/src/features/process/bpmn/stage/optimisticUpdate/useSessionStatusOptimisticUpdate.test.mjs`

- [ ] **Step 1: Rewrite `App.session-status-topbar.test.mjs`**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

test("App imports and uses useSessionStatusOptimisticUpdate", () => {
  assert.equal(source.includes('import useSessionStatusOptimisticUpdate from "'), true);
  assert.equal(source.includes("const { changeCurrentSessionStatus } = useSessionStatusOptimisticUpdate"), true);
});

test("App wires topbar status from draft.interview status resolver", () => {
  assert.equal(source.includes("resolveSessionStatusFromDraft"), true);
  assert.equal(source.includes('sessionStatus={resolveSessionStatusFromDraft(draft, "draft")}'), true);
});

test("App passes onChangeSessionStatus to TopBar when user can change status", () => {
  assert.equal(source.includes("onChangeSessionStatus={workspacePermissions.canChangeStatus ? changeCurrentSessionStatus : undefined}"), true);
});
```

- [ ] **Step 2: Rewrite `App.session-status-patch.test.mjs`**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(
  path.join(__dirname, "features/process/bpmn/stage/optimisticUpdate/useSessionStatusOptimisticUpdate.js"),
  "utf8",
);

function extractFunction(src, name) {
  const start = src.indexOf(`const ${name} = useCallback(async`);
  if (start === -1) return "";
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return src.slice(start, end);
}

const fnText = extractFunction(source, "changeCurrentSessionStatus");

test("changeCurrentSessionStatus reads base diagram state version from draft", () => {
  assert.equal(
    fnText.includes("draft?.diagram_state_version ?? draft?.diagramStateVersion"),
    true,
    "should read diagram_state_version from draft",
  );
});

test("changeCurrentSessionStatus falls back to apiGetSession when draft version is missing", () => {
  assert.equal(fnText.includes("apiGetSession(sid)"), true);
  assert.equal(
    /snapshot\?\.session\?\.diagram_state_version|\bsnapshot\?\.session\?\.diagramStateVersion/.test(fnText),
    true,
  );
});

test("changeCurrentSessionStatus includes base_diagram_state_version in payload", () => {
  assert.equal(fnText.includes("base_diagram_state_version"), true);
});

test("changeCurrentSessionStatus calls apiChangeSessionStatus", () => {
  assert.equal(fnText.includes("apiChangeSessionStatus(sid, payload)"), true);
});

test("changeCurrentSessionStatus rounds finite base diagram state version", () => {
  assert.equal(fnText.includes("Math.round(baseDiagramStateVersion)"), true);
});
```

- [ ] **Step 3: Create `useSessionStatusOptimisticUpdate.test.mjs`**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, "useSessionStatusOptimisticUpdate.js"), "utf8");

test("useSessionStatusOptimisticUpdate imports apiChangeSessionStatus", () => {
  assert.match(source, /import\s+\{[^}]*apiChangeSessionStatus[^}]*\}\s+from\s+"\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/lib\/api\.js"/);
});

test("changeCurrentSessionStatus snapshots previous status values", () => {
  assert.match(
    source,
    /statusChangeSnapshotRef\.current\s*=\s*\{\s*interviewStatus:\s*previousInterviewStatus,\s*directStatus:\s*previousDirectStatus\s*\}/,
  );
});

test("changeCurrentSessionStatus applies optimistic status update", () => {
  assert.match(source, /next\.interview\s*=\s*next\.interview\s*&&\s*typeof\s+next\.interview\s*===\s*"object"\s*\?\s*\{\s*\.\.\.next\.interview,\s*status\s*\}\s*:\s*\{\s*status\s*\}/);
  assert.match(source, /next\.status\s*=\s*status;/);
});

test("changeCurrentSessionStatus rolls back on failure", () => {
  assert.match(source, /if\s*\(\s*!r\.ok\s*\)\s*\{[\s\S]*?setDraftPersisted\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{\s*const\s+next\s*=\s*\{\s*\.\.\.prev\s*\}/s);
  assert.match(source, /if\s*\(\s*snap\.interviewStatus\s*!==\s*undefined\s*\)\s*next\.interview\.status\s*=\s*snap\.interviewStatus;/);
  assert.match(source, /else\s+delete\s+next\.interview\.status;/);
});

test("changeCurrentSessionStatus shows Russian 409 message", () => {
  assert.match(
    source,
    /if\s*\(\s*r\.status\s*===\s*409\s*\)\s*\{\s*markFail\s*\(\s*"Переход в выбранный статус недоступен для текущего состояния сессии\."\s*\)/,
  );
});
```

---

### Task 9: Add backend tests for `status_service`

**Files:**
- Create: `backend/tests/test_status_service.py`

- [ ] **Step 1: Create the test file**

```python
"""Tests for the dedicated status transition endpoint and service."""

from __future__ import annotations

import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.save_services.status_service.status_service import change_session_status
from app.schemas.legacy_api import StatusPatchIn
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


class TestStatusService(unittest.TestCase):
    def setUp(self):
        self.st = get_storage()
        self.client = TestClient(app)

        self.owner = create_user("owner_status_service@local", "password", is_admin=True)
        self.editor = create_user("editor_status_service@local", "password", is_admin=False)
        self.viewer = create_user("viewer_status_service@local", "password", is_admin=False)

        self.org_id = "org_status_service"
        create_org_record("Status Service Org", created_by=str(self.owner["id"]), org_id=self.org_id)
        upsert_org_membership(self.org_id, str(self.owner["id"]), "owner")
        upsert_org_membership(self.org_id, str(self.editor["id"]), "editor")
        upsert_org_membership(self.org_id, str(self.viewer["id"]), "viewer")
        upsert_project_membership(self.org_id, "proj_1", str(self.owner["id"]), "owner")
        upsert_project_membership(self.org_id, "proj_1", str(self.editor["id"]), "editor")
        upsert_project_membership(self.org_id, "proj_1", str(self.viewer["id"]), "viewer")

        self.owner_token = create_access_token(str(self.owner["id"]))
        self.editor_token = create_access_token(str(self.editor["id"]))
        self.viewer_token = create_access_token(str(self.viewer["id"]))

        self.sid = self.st.create(
            title="status-service-session",
            user_id=str(self.owner["id"]),
            org_id=self.org_id,
            project_id="proj_1",
        )

    def _status(self, sid, payload, token):
        return self.client.patch(
            f"/api/sessions/{sid}/status",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    def _load(self):
        return self.st.load(self.sid, org_id=self.org_id, is_admin=True)

    def test_status_endpoint_transitions_draft_to_in_progress(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)

        response = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.owner_token,
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(((data.get("interview") or {}).get("status")), "in_progress")

    def test_status_endpoint_requires_base_diagram_state_version(self):
        response = self._status(self.sid, {"status": "in_progress"}, self.owner_token)
        self.assertEqual(response.status_code, 409)
        detail = response.json().get("detail") or {}
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")

    def test_status_endpoint_rejects_stale_base_version(self):
        response = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": 999},
            self.owner_token,
        )
        self.assertEqual(response.status_code, 409)
        detail = response.json().get("detail") or {}
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_CONFLICT")

    def test_status_endpoint_rejects_invalid_transition(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        response = self._status(
            self.sid,
            {"status": "review", "base_diagram_state_version": base},
            self.owner_token,
        )
        self.assertEqual(response.status_code, 409)
        detail = response.json().get("detail") or {}
        self.assertEqual(detail.get("code"), "STATUS_TRANSITION_INVALID")

    def test_status_endpoint_forbids_viewer(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        response = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.viewer_token,
        )
        self.assertEqual(response.status_code, 403)

    def test_editor_can_change_status_but_not_archive(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        r1 = self._status(
            self.sid,
            {"status": "in_progress", "base_diagram_state_version": base},
            self.editor_token,
        )
        self.assertEqual(r1.status_code, 200)

        r2 = self._status(
            self.sid,
            {"status": "archived", "base_diagram_state_version": base + 1},
            self.editor_token,
        )
        self.assertEqual(r2.status_code, 403)

    def test_mixed_payload_with_status_rejected(self):
        sess = self._load()
        base = int(getattr(sess, "diagram_state_version", 0) or 0)
        response = self.client.patch(
            f"/api/sessions/{self.sid}",
            json={"status": "in_progress", "title": "new title", "base_diagram_state_version": base},
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(response.status_code, 422)

    def test_service_returns_not_found_for_missing_session(self):
        result = change_session_status("missing_session_xyz", StatusPatchIn(status="in_progress"))
        self.assertEqual(result.get("error"), "not found")

    def test_service_returns_not_found_without_request_scope(self):
        result = change_session_status(
            self.sid,
            StatusPatchIn(status="in_progress", base_diagram_state_version=0),
        )
        self.assertEqual(result.get("error"), "not found")


if __name__ == "__main__":
    unittest.main()
```

Note: `test_service_forbids_without_edit_rights` intentionally passes `request=None`; `_legacy_load_session_scoped` returns not found because no request scope resolves. This documents the direct-call behavior.

---

## Phase 5 — `analytics_aggregator` module

### Task 10: Create `analytics_aggregator` module

**Files:**
- Create: `backend/app/save_services/analytics_aggregator/__init__.py`
- Create: `backend/app/save_services/analytics_aggregator/publisher.py`
- Create: `backend/app/save_services/analytics_aggregator/tasks.py`

- [ ] **Step 1: Overwrite the Phase 4 stub in `__init__.py`**

Replace the no-op stub from Task 0 with the real re-export:

```python
"""Analytics aggregator: event-driven, asynchronous analytics refresh."""

from .publisher import publish_session_saved

__all__ = ["publish_session_saved"]
```

- [ ] **Step 2: Create `publisher.py`**

```python
"""Publisher for analytics refresh events."""

from __future__ import annotations

from .tasks import refresh_session_analytics_task


def publish_session_saved(session_id: str, org_id: str) -> None:
    """Enqueue an asynchronous analytics refresh for a saved session."""
    refresh_session_analytics_task.delay(session_id, org_id)
```

- [ ] **Step 3: Create `tasks.py`**

```python
"""Celery tasks for analytics aggregation."""

from __future__ import annotations

import logging

from ...analytics_read_model import refresh_analytics_for_session
from ...celery_app import app

logger = logging.getLogger(__name__)


@app.task(bind=True, max_retries=1, default_retry_delay=5)
def refresh_session_analytics_task(self, session_id: str, org_id: str):
    """Recompute session, project, and workspace analytics snapshots."""
    try:
        return refresh_analytics_for_session(session_id, org_id)
    except Exception as exc:
        logger.exception("refresh_session_analytics_task failed for %s/%s", session_id, org_id)
        raise self.retry(exc=exc, countdown=5)
```

---

### Task 11: Register the Celery task

**Files:**
- Modify: `backend/app/celery_app.py`

- [ ] **Step 1: Import analytics task module**

Change:

```python
# Import task modules so workers discover them
from . import tasks  # noqa: E402
```

to:

```python
# Import task modules so workers discover them
from . import tasks  # noqa: E402
from .save_services.analytics_aggregator import tasks as analytics_tasks  # noqa: F401,E402
```

---

### Task 12: Publish analytics events from save paths

**Files:**
- Modify: `backend/app/save_services/property_save/property_save_service.py`
- Modify: `backend/app/save_services/status_service/status_service.py`
- Modify: `backend/app/_legacy_main.py` (`put_session`)

- [ ] **Step 1: Publish from `property_save_service.patch_session_properties`**

After the existing `_invalidate_session_caches(...)` call, add:

```python
    from ..analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(updated, "id", "") or session_id),
        str(getattr(updated, "org_id", "") or oid or get_default_org_id()),
    )
```

Place it just before the `return { ... }`.

- [ ] **Step 2: Publish from `status_service.change_session_status`**

After the existing `_invalidate_session_caches(...)` call, add:

```python
    from ..analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(sess, "id", "") or session_id),
        oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
    )
```

Place it just before `return _session_api_dump(sess)`.

- [ ] **Step 3: Publish from `_legacy_main.put_session`**

After the existing `_invalidate_session_caches(...)` call, replace the sync analytics block:

```python
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
    try:
        refresh_analytics_for_session(str(getattr(sess, "id", "") or session_id), oid or str(getattr(sess, "org_id", "") or get_default_org_id()))
    except Exception:
        pass
    return _session_api_dump(sess)
```

with:

```python
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
    from .save_services.analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(sess, "id", "") or session_id),
        oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
    )
    return _session_api_dump(sess)
```

Leave `recompute_session` (the explicit `/recompute` endpoint) using the synchronous `refresh_analytics_for_session`.

---

### Task 13: Verify no sync analytics remain in save paths

**Files:**
- Search: `backend/app/_legacy_main.py` and `backend/app/services/session_service.py`

- [ ] **Step 1: Grep for remaining synchronous analytics calls**

Run:

```bash
grep -n "refresh_analytics_for_session" backend/app/_legacy_main.py backend/app/services/session_service.py
```

Expected remaining hits:
- `backend/app/services/session_service.py` inside `recompute_session` only.
- `backend/app/_legacy_main.py` inside the deprecated `recompute` endpoint only.

If any other hits remain, remove them and replace with `publish_session_saved` from `save_services.analytics_aggregator`.

---

### Task 14: Add tests for `analytics_aggregator`

**Files:**
- Create: `backend/tests/test_analytics_aggregator.py`

- [ ] **Step 1: Create the test file**

```python
"""Tests for the analytics aggregator publisher and task."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app.save_services.analytics_aggregator.publisher import publish_session_saved
from app.save_services.analytics_aggregator.tasks import refresh_session_analytics_task


class TestAnalyticsAggregator(unittest.TestCase):
    @patch("app.save_services.analytics_aggregator.publisher.refresh_session_analytics_task")
    def test_publish_session_saved_enqueues_task(self, mock_task):
        publish_session_saved("sid_123", "org_456")
        mock_task.delay.assert_called_once_with("sid_123", "org_456")

    @patch("app.save_services.analytics_aggregator.tasks.refresh_analytics_for_session")
    def test_refresh_task_calls_refresh_analytics_for_session(self, mock_refresh):
        mock_refresh.return_value = {"session_id": "sid_123", "updated": True}
        result = refresh_session_analytics_task.run("sid_123", "org_456")
        mock_refresh.assert_called_once_with("sid_123", "org_456")
        self.assertEqual(result, {"session_id": "sid_123", "updated": True})

    @patch("app.save_services.analytics_aggregator.tasks.refresh_session_analytics_task.retry")
    @patch("app.save_services.analytics_aggregator.tasks.refresh_analytics_for_session")
    def test_refresh_task_retries_on_failure(self, mock_refresh, mock_retry):
        mock_refresh.side_effect = RuntimeError("analytics failed")
        mock_retry.return_value = MagicMock()
        with self.assertRaises(Exception):
            refresh_session_analytics_task.run("sid_123", "org_456")
        mock_refresh.assert_called_once_with("sid_123", "org_456")
        mock_retry.assert_called_once()

    @patch("app.save_services.analytics_aggregator.publisher.refresh_session_analytics_task")
    def test_properties_endpoint_enqueues_analytics_refresh(self, mock_task):
        from app.auth import create_access_token, create_user
        from app.main import app
        from app.storage import (
            create_org_record,
            get_storage,
            upsert_org_membership,
            upsert_project_membership,
        )
        from fastapi.testclient import TestClient

        st = get_storage()
        client = TestClient(app)

        owner = create_user("owner_analytics_props@local", "password", is_admin=True)
        org_id = "org_analytics_properties"
        create_org_record("Analytics Properties Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(owner["id"]), "owner")
        upsert_project_membership(org_id, "proj_1", str(owner["id"]), "owner")

        token = create_access_token(str(owner["id"]))
        sid = st.create(
            title="analytics-properties-session",
            user_id=str(owner["id"]),
            org_id=org_id,
            project_id="proj_1",
        )

        before = st.load(sid, org_id=org_id, is_admin=True)
        base = int(getattr(before, "diagram_state_version", 0) or 0)

        response = client.patch(
            f"/api/sessions/{sid}/properties",
            json={"bpmn_meta_json": {"custom_key": "custom_value"}, "base_diagram_state_version": base},
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        mock_task.delay.assert_called_once()
        args, _ = mock_task.delay.call_args
        self.assertEqual(args[0], sid)
        self.assertEqual(args[1], org_id)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Confirm integration coverage**

`test_properties_endpoint_enqueues_analytics_refresh` (added in Step 1) already covers the HTTP path.

---

## Verification

### Frontend

- [ ] **Step 1: Build**

Run:

```bash
cd /opt/processmap-test/.worktrees/refactor-property-save-decomposition/frontend
npm run build
```

Expected: exit code 0, no TypeScript/build errors.

- [ ] **Step 2: Frontend tests**

Run:

```bash
cd /opt/processmap-test/.worktrees/refactor-property-save-decomposition/frontend
npm test
```

Expected:
- `App.session-status-topbar.test.mjs` PASS
- `App.session-status-patch.test.mjs` PASS
- `useSessionStatusOptimisticUpdate.test.mjs` PASS

### Backend

- [ ] **Step 3: Targeted tests**

Run:

```bash
cd /opt/processmap-test/.worktrees/refactor-property-save-decomposition/backend
python -m unittest tests.test_status_service tests.test_analytics_aggregator tests.test_session_status_transitions tests.test_session_meta_endpoint tests.test_property_save_service tests.test_workspace_access_controls
```

Expected: all PASS.

- [ ] **Step 4: Full backend suite**

Run:

```bash
cd /opt/processmap-test/.worktrees/refactor-property-save-decomposition/backend
python -m unittest discover -s tests -p 'test_*.py'
```

Expected: all PASS (the existing 53 target tests plus new ones).

### Smoke

- [ ] **Step 5: Start the stack locally and verify**

1. Open a session.
2. Change status via the TopBar dropdown.
3. Confirm the request hits `PATCH /api/sessions/{sid}/status` in the browser network tab.
4. Change a Camunda property and save.
5. Confirm `PATCH /api/sessions/{sid}/meta` returns quickly and a Celery analytics task is enqueued (check Redis/Celery worker logs).

---

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Import cycles when `_legacy_main` and `status_service` reference each other | `status_service` imports the small set of helpers it needs from `_legacy_main`; `_legacy_main` does not import `status_service` at module level. `session_service` imports `change_session_status` inside `patch_session` only. |
| Generic `PATCH /sessions/{sid}` regression for non-status fields | Non-status payloads continue to `_legacy_main.patch_session`; only status-only payloads are rerouted. Mixed payloads receive 422. |
| Existing frontend tests rely on `changeCurrentSessionStatus` living in `App.jsx` | Tests rewritten to read the hook source and assert App.jsx wiring. |
| Analytics becomes eventually inconsistent | Explicit `/recompute` endpoint keeps synchronous refresh; save paths enqueue async refresh. |
| `execute_git_mirror_publish` side effect lost on `ready` transition | `status_service.change_session_status` replicates the exact pending/sync flow from `_legacy_main`. |

---

## Self-Review

- **Spec coverage:**
  - Status extraction from `_legacy_main` / `App.jsx` → Tasks 2, 5, 7.
  - Optimistic update + rollback retained → Task 7 + tests.
  - New `PATCH /status` endpoint → Task 2.
  - Async analytics refresh → Tasks 10–13.
  - CAS preserved for status → Tasks 2, 9.
- **Placeholder scan:** No TODO/TBD placeholders; every task contains concrete file paths, code, and commands.
- **Type consistency:** `StatusPatchIn.status: str`, `base_diagram_state_version: Optional[int]`, `reason: Optional[str]` matches service usage; `publish_session_saved(session_id, org_id)` used consistently across save paths.
