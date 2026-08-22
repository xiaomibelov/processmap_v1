# Plan: fix/rbac-sessions-drift

## Goal

Устранить dual behavior для `DELETE /api/sessions/{id}` и `PUT /api/sessions/{id}/bpmn` между `sessions.py` и `sessions_new.py`, применив единый authz стандарт.

## Source Truth

- Repo: `/root/processmap_v1`
- Branch: `fix/rbac-sessions-drift`
- HEAD: `b3b93dd50ccfa418e1af2c701510df0a0f0d03b1`
- Base truth: `main`

## Scope

### Allowed files

- `backend/app/routers/sessions.py`
- `backend/app/routers/sessions_new.py`
- `backend/app/services/session_service.py`
- `backend/tests/test_sessions_drift.py` (new)
- `.planning/contours/fix/rbac-sessions-drift/PR.md` (new)

### Changes

1. **DELETE `/api/sessions/{id}`**
   - `sessions.py`: сейчас `_svc.delete_session` (owner/platform-admin only).
   - `sessions_new.py`: сейчас `_svc.delete_session_api(session_id)` без request (broken/bypass).
   - Единый стандарт: `_can_delete_workspace_content` (org admin/owner + platform_admin).
   - Решение: добавить `_svc.delete_session_api(session_id, request)` как wrapper над `_legacy_main.delete_session_api` и использовать его в обоих роутерах.

2. **PUT `/api/sessions/{id}/bpmn`**
   - `sessions.py`: `_svc.bpmn_save(session_id, inp, request)` → `_legacy_main.session_bpmn_save` уже проверяет `_can_edit_workspace`.
   - `sessions_new.py`: `_svc.session_bpmn_save(session_id, inp)` без request — bypass.
   - Решение: в `sessions_new.py` передавать `request` в `_svc.bpmn_save(session_id, inp, request)`.

3. **sessions_new.py imports**
   - Минимально добавить недостающие импорты (`Optional`, `Query`, схемы), чтобы файл импортировался и тестировался.

### Non-goals

- Не рефакторить остальные методы `sessions_new.py`.
- Не изменять `DELETE /api/sessions/{id}/bpmn` (это в scope `fix/rbac-gaps`).
- Не подключать `sessions_new.py` к `ROUTERS`.

## Implementation Steps

### Task 1: Service-layer wrapper

**Files:** `backend/app/services/session_service.py`

- [ ] Добавить `delete_session_api(session_id: str, request: Any = None)` — thin wrapper над `_legacy_main.delete_session_api(session_id, request)`.

### Task 2: Router `sessions.py`

**Files:** `backend/app/routers/sessions.py`

- [ ] `DELETE /api/sessions/{id}`: заменить `_svc.delete_session(session_id, request=request)` на `_svc.delete_session_api(session_id, request)`.
- [ ] `PUT /api/sessions/{id}/bpmn`: убедиться, что `_svc.bpmn_save` получает `request` (уже так).

### Task 3: Router `sessions_new.py`

**Files:** `backend/app/routers/sessions_new.py`

- [ ] Добавить минимальные импорты (`Optional`, `Query`, схемы).
- [ ] `DELETE /api/sessions/{id}`: заменить на `_svc.delete_session_api(session_id, request)`.
- [ ] `PUT /api/sessions/{id}/bpmn`: заменить `_svc.session_bpmn_save(session_id, inp)` на `_svc.bpmn_save(session_id, inp, request)`.

### Task 4: Tests

**Files:** `backend/tests/test_sessions_drift.py` (new)

- [ ] Создать `_DummyRequest` helper и базовый `unittest.TestCase` с org/project/session/users.
- [ ] `test_delete_session_viewer_denied_in_both_routers` — viewer получает 403 в `sessions.py` и `sessions_new.py`.
- [ ] `test_put_bpmn_editor_allowed_viewer_denied_in_both_routers` — editor получает 200, viewer получает 403 в обоих роутерах.

### Task 5: Validation

- [ ] `PYTHONPATH=. .venv/bin/pytest tests/test_sessions_drift.py -v`
- [ ] `PYTHONPATH=. .venv/bin/pytest tests/test_bpmn_save_rbac_scope.py -v`
- [ ] `PYTHONPATH=. .venv/bin/pytest tests/test_session_read_rbac.py -v`
- [ ] `git diff --check`

### Task 6: Commit and PR.md

- [ ] Скоммитить с сообщением:
  ```
  fix(rbac): выровнять authz sessions.py vs sessions_new.py

  - DELETE: единый _can_delete_workspace_content в обоих роутерах
  - PUT bpmn: _can_edit_workspace в обоих, request передаётся в service
  - tests: cross-router 403 для viewer
  ```
- [ ] Написать `.planning/contours/fix/rbac-sessions-drift/PR.md`.
- [ ] Остановиться и запросить explicit approve для push.

## Validation

- `git diff --check` — без whitespace-ошибок.
- Новые тесты проходят.
- Существующие тесты не ломаются.
- Только scoped файлы изменены.

## Runtime Proof

- `pytest` output для новых и регрессионных тестов.
- `git diff --stat`.
