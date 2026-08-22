# FIX.md — Планируемые патчи для fix/rbac-gaps

> Это planning-артефакт: описание будущих патчей. Код не написан до approve PLAN.md.

## Общий helper (`backend/app/utils/authz.py`)

```python
from ..storage import list_user_org_memberships

_PERMISSION_KEYS = ("view", "create", "edit", "export", "delete", "manage_users")


def _all_true_permissions() -> Dict[str, bool]:
    return {k: True for k in _PERMISSION_KEYS}


def get_user_org_permissions(
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    request: Optional[Request] = None,
) -> Dict[str, bool]:
    """Return normalized permissions dict for a user/org.

    Reads from request.state.org_memberships if available; otherwise hits DB.
    Platform admin gets all-True. Missing/invalid data falls back to role template.
    """
    if request is not None:
        auth_user = getattr(request.state, "auth_user", None) or {}
        if isinstance(auth_user, dict) and bool(auth_user.get("is_admin")):
            return _all_true_permissions()
        memberships = getattr(request.state, "org_memberships", None) or []
        target_org = str(org_id or getattr(request.state, "active_org_id", "") or "").strip()
        for row in memberships:
            if str((row or {}).get("org_id") or "").strip() == target_org:
                perms = (row or {}).get("permissions")
                if isinstance(perms, dict):
                    return perms

    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        return {}
    for row in list_user_org_memberships(uid, is_admin=False):
        if str((row or {}).get("org_id") or "").strip() == oid:
            perms = (row or {}).get("permissions")
            if isinstance(perms, dict):
                return perms
    return {}


def request_has_org_permission(request: Request, org_id: str, permission: str) -> bool:
    if not request:
        return False
    user = getattr(request.state, "auth_user", None) or {}
    if isinstance(user, dict) and bool(user.get("is_admin")):
        return True
    perms = get_user_org_permissions(request=request, org_id=org_id)
    return bool(perms.get(permission))


def require_org_permission(request: Request, org_id: str, permission: str):
    if request_has_org_permission(request, org_id, permission):
        return
    raise HTTPException(status_code=403, detail="forbidden")


def require_session_permission(request: Request, session_id: str, permission: str):
    sess, scope, err = session_access_from_request(request, session_id)
    if err is not None:
        raise HTTPException(status_code=err.status_code, detail=err.body)
    org_id = getattr(request.state, "active_org_id", "") or ""
    if request_has_org_permission(request, org_id, permission):
        return sess, scope
    raise HTTPException(status_code=403, detail="forbidden")
```

---

## Patch 1 — Session delete

**Где:** `backend/app/services/session_service.py`, `delete_session`

**Текущий код:**
```python
if not ctx_is_admin:
    owner_id = str(getattr(sess, "owner_user_id", "") or "").strip()
    if not ctx_user_id or not owner_id or owner_id != str(ctx_user_id or "").strip():
        raise HTTPException(status_code=403, detail="Только владелец сессии может её удалить.")
```

**Патч:**
```python
if not ctx_is_admin:
    owner_id = str(getattr(sess, "owner_user_id", "") or "").strip()
    is_owner = bool(ctx_user_id and owner_id and owner_id == str(ctx_user_id).strip())
    if is_owner:
        pass  # owner can delete
    else:
        sess_org_id = str(getattr(sess, "org_id", "") or ctx_org_id or "").strip()
        perms = get_user_org_permissions(ctx_user_id, sess_org_id, request=request)
        if not bool(perms.get("delete")):
            raise HTTPException(status_code=403, detail="Только владелец сессии или пользователь с правом delete может её удалить.")
```

**Поведение:**
- owner → OK
- platform admin → OK
- org_admin с пустым `permissions_json` → fallback delete=True → OK
- editor с пустым `permissions_json` → fallback delete=False → 403
- editor с `permissions_json={"delete": true}` → OK
- editor с `permissions_json={"delete": false}` → 403

**Тесты:**
- `test_editor_without_delete_cannot_delete_session` → 403
- `test_editor_with_delete_can_delete_session` → 200
- `test_org_admin_can_delete_session_by_role_fallback` → 200

**Regression:** `test_session_read_rbac.py::test_org_admin_cannot_delete_someone_elses_session` переписывается на ожидание 200.

---

## Patch 2 — Export

**Где:** `backend/app/routers/sessions.py`, `export`, `export_zip`

**Текущий код:**
```python
@router.get('/api/sessions/{session_id}/export')
def export(session_id: str):
    return _svc.export(session_id)

@router.get('/api/sessions/{session_id}/export.zip')
def export_zip(session_id: str):
    return _svc.export_zip(session_id)
```

**Патч:**
```python
@router.get('/api/sessions/{session_id}/export')
def export(session_id: str, request: Request = None):
    require_session_permission(request, session_id, "export")
    return _svc.export(session_id)

@router.get('/api/sessions/{session_id}/export.zip')
def export_zip(session_id: str, request: Request = None):
    require_session_permission(request, session_id, "export")
    return _svc.export_zip(session_id)
```

**Поведение:**
- viewer без `export=True` → 403
- editor/org_admin → fallback export=True → OK
- viewer с `permissions_json={"export": true}` → OK

**Тесты:**
- `test_viewer_cannot_export_session` → 403
- `test_editor_can_export_session` → 200
- `test_viewer_with_export_can_export_session` → 200

---

## Patch 3 — Discussions create

**Где:** `backend/app/routers/notes.py`, `create_session_note_thread`

**Текущий код:**
```python
@router.post("/api/sessions/{session_id}/note-threads", status_code=201)
def create_session_note_thread(session_id: str, body: CreateNoteThreadBody, request: Request) -> Dict[str, Any]:
    sess, org_id, user_id = _load_session_for_notes(request, session_id, write=True)
```

**Патч:**
```python
@router.post("/api/sessions/{session_id}/note-threads", status_code=201)
def create_session_note_thread(session_id: str, body: CreateNoteThreadBody, request: Request) -> Dict[str, Any]:
    sess, org_id, user_id = _load_session_for_notes(request, session_id, write=True)
    require_org_permission(request, org_id, "create")
```

**Поведение:**
- viewer без `create=True` → 403 (fallback create=False)
- editor → fallback create=True → OK
- viewer с `permissions_json={"create": true}` → OK

**Тесты:**
- `test_viewer_cannot_create_note_thread` → 403
- `test_editor_can_create_note_thread` → 201
- `test_viewer_with_create_can_create_note_thread` → 201

---

## Patch 4 — Templates org-scope

**Где:** `backend/app/routers/templates.py`

**Патч для org-folder create:**
```python
if normalized_scope == "org":
    ...
    if not request_has_org_permission(request, oid, "create"):
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
```

**Патч для org-folder patch/delete (`_template_folder_can_manage`):**
```python
def _template_folder_can_manage(..., request: Request):
    ...
    if scope == "org":
        oid = str(folder.get("org_id") or "").strip()
        return request_has_org_permission(request, oid, "delete" if is_delete else "edit")
```

**Патч для template create (`create_template_endpoint`):**
```python
if normalized_scope == "org":
    ...
    if not request_has_org_permission(request, oid, "create"):
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
```

**Патч для template patch/delete (`_template_can_manage`):**
```python
def _template_can_manage(..., request: Request):
    ...
    if scope == "org":
        oid = str(template.get("org_id") or "").strip()
        return request_has_org_permission(request, oid, "delete" if is_delete else "edit")
```

**Поведение:**
- editor без `create`/`edit`/`delete` → 403
- editor с соответствующим флагом → OK
- org_admin/project_manager fallback → OK (project_manager может create/edit по старой логике для шаблонов; org_admin для папок)

**Тесты:**
- `test_editor_without_create_cannot_create_org_template` → 403
- `test_editor_with_create_can_create_org_template` → 200
- `test_editor_without_delete_cannot_delete_org_template` → 403
- `test_editor_with_delete_can_delete_org_template` → 204
- Аналогично для org folders.

---

## Patch 5 — BPMN save

**Где:** `backend/app/services/session_service.py`, `bpmn_save` (wrapper)

**Текущий код:**
```python
def bpmn_save(session_id: str, inp: Any, request: Any = None) -> Dict[str, Any]:
    import app._legacy_main as _lm
    return _lm.session_bpmn_save(session_id, inp, request)
```

**Патч:**
```python
def bpmn_save(session_id: str, inp: Any, request: Any = None) -> Dict[str, Any]:
    require_session_permission(request, session_id, "edit")
    import app._legacy_main as _lm
    return _lm.session_bpmn_save(session_id, inp, request)
```

**Альтернатива** (если `require_session_permission` не подходит из-за дублирования `_legacy_load_session_scoped`):
проверить permission до вызова `_lm.session_bpmn_save`, который сам проверит `_can_edit_workspace`.

**Поведение:**
- viewer без `edit=True` → 403
- editor/org_admin → fallback edit=True → OK
- org_admin с `permissions_json={"edit": false}` → 403

**Тесты:**
- `test_viewer_cannot_save_bpmn` → 403
- `test_editor_can_save_bpmn` → 200
- `test_org_admin_with_edit_false_cannot_save_bpmn` → 403
- `test_editor_with_edit_true_can_save_bpmn` → 200

---

## Deferred gaps (out of scope)
- Node/edge mutations, BPMN-meta, overlays, BPMN clear, AI questions/answers, global session create, property dictionary, manage_users/view flags — не закрываются в этом контуре.
