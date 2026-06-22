# PLAN — Исправление смены статуса сессии (PROJ-7)

**Contour:** `fix/transaction-session-status`
**Date:** 2026-06-15
**Agent role:** Executor
**Branch:** `fix/transaction-session-status` от `origin/main`
**Worktree:** `/opt/processmap-test/.worktrees/fix-transaction-session-status`

## Goal
Исправить ошибку при смене статуса сессии в UI, которая проявляется как `DIAGRAM_STATE_BASE_VERSION_REQUIRED` / воспринимается пользователем как ошибка транзакции.

## RAG preflight summary
- **Query:** `invalid transaction session status change`
- **Key finding:** предыдущий контур `fix/session-status-workflow` уже исправлял backend-валидацию переходов (`archived -> *`).
- **Key finding:** `fix/session-status-workflow/RUNTIME_PROOF_CHECKLIST.md` упоминает проверку отсутствия ошибок при смене статуса.

Полный RAG output: `RAG_PREFLIGHT_PLANNER.md`.

## Runtime/source truth
- `pwd`: `/opt/processmap-test/.worktrees/fix-transaction-session-status`
- `git remote -v`: `origin -> git@github.com:xiaomibelov/processmap_v1.git`
- `git branch --show-current`: `fix/transaction-session-status`
- `git rev-parse HEAD`: `38d4b3664e4de30733cc454fb6e006cce75d7eb5`
- `git rev-parse origin/main`: `38d4b3664e4de30733cc454fb6e006cce75d7eb5`
- Prod runtime: `http://clearvestnic.ru:5177`
- Prod API: `http://clearvestnic.ru:8011`

## Findings
1. Backend-валидация статусов (`backend/app/session_status.py`) работает корректно.
2. Прямые API-вызовы подтверждают корректность переходов:
   - `draft -> in_progress` ✅
   - `in_progress -> review` ✅
   - `review -> ready` ✅
   - `ready -> archived` ✅
   - `archived -> draft` ✅
   - `draft -> review` ✅ 409 `invalid status transition` (ожидаемо)
3. **Frontend не отправляет `base_diagram_state_version` при смене статуса.**
   - `frontend/src/App.jsx::changeCurrentSessionStatus` вызывает `apiPatchSession(sid, { status })` без CAS-поля.
   - Backend требует `base_diagram_state_version` для любого `status`-patch, потому что `status` входит в `_DIAGRAM_TRUTH_PATCH_KEYS` (`backend/app/_legacy_main.py`).
   - Результат: HTTP 409 `DIAGRAM_STATE_BASE_VERSION_REQUIRED`.

## Fix plan
1. В `frontend/src/App.jsx::changeCurrentSessionStatus` добавить `base_diagram_state_version` из `draft?.diagram_state_version` в payload.
2. Добавить/обновить тест, проверяющий, что payload содержит `base_diagram_state_version`.
3. Проверить вручную через API + UI (если возможно).
4. Сделать commit и push в `fix/transaction-session-status`.
5. Создать PR на русском.

## Acceptance criteria
- [ ] `changeCurrentSessionStatus` отправляет `base_diagram_state_version`.
- [ ] Тест проходит.
- [ ] Прямой API-вызов и UI-вызов дают одинаковый результат.
- [ ] PR создан с описанием на русском.
