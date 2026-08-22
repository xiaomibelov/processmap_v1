# TESTS.md — RBAC 5 core features

## Existing RBAC tests (must stay green)
- `backend/tests/test_templates_rbac.py`
- `backend/tests/test_session_read_rbac.py`
- `backend/tests/test_bpmn_save_rbac_scope.py`
- `backend/tests/test_notes_mvp1_api.py`

## New tests (to be created in Phase 3)
- `backend/tests/test_rbac_5_features.py`
  - Per-feature test classes:
    - `TestTemplatePermissions`
    - `TestSessionPermissions`
    - `TestSessionVersionPermissions`
    - `TestBpmnElementPermissions`
    - `TestNoteMentionPermissions`
  - Each failing-before-patch / passing-after-patch test.

## Commands
```bash
cd /opt/processmap-test/.worktrees/fix-rbac-5-features
PYTHONPATH=/opt/processmap-test/.worktrees/fix-rbac-5-features .venv/bin/pytest \
  backend/tests/test_rbac_5_features.py \
  backend/tests/test_templates_rbac.py \
  backend/tests/test_session_read_rbac.py \
  backend/tests/test_bpmn_save_rbac_scope.py \
  backend/tests/test_notes_mvp1_api.py \
  -q

cd frontend
node --test src/**/*.test.mjs
```

## Frontend tests (optional)
- Extend `frontend/src/features/templates/model/templatesRbac.test.mjs` for granular `can_edit`/`can_delete`.
- Add note-thread authz tests if UI decides visibility.
