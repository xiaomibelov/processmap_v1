# PR: fix/session-count-semantics

## Что исправлено

- Workspace explorer aggregates теперь считают только root sessions: строки `sessions` с непустым `parent_session_id` не попадают в `sessions_count`, `descendant_sessions_count`, `trackable_sessions_count`, `done_sessions_count`.
- Folder rollups получают уже очищенные project-level metrics, поэтому progress folder/section больше не включает подпроцессы.
- Legacy workspace dashboard (`/api/enterprise/workspace`) игнорирует subprocess rows в `summary.total`, `projects[].session_count`, `users[].session_count`.
- Frontend contract зафиксирован тестом: item с `sessions_count=3`, `done_sessions_count=1`, `subprocesses_count=148` отображается как `1/3 сессии`.

## Root Cause

Backend aggregation в `backend/app/domains/storage/explorer/repository.py` считал все строки таблицы `sessions` по `project_id`. Материализованные подпроцессы тоже лежат в этой таблице, но имеют `parent_session_id`, поэтому внешний UI получал число подпроцессов как число сессий.

## Тесты

- `pytest backend/tests/test_workspace_access_controls.py::WorkspaceAccessControlsTest::test_workspace_aggregates_count_only_root_sessions_not_subprocesses -q` — `1 passed`.
- `pytest backend/tests/test_workspace_access_controls.py -q` — `9 passed`.
- `node --test frontend/src/features/explorer/explorerTableFormat.test.mjs frontend/src/features/explorer/explorerColumnVisibility.test.mjs frontend/src/features/explorer/work3TreeState.test.mjs frontend/src/features/explorer/explorerSortModel.test.mjs` — `31 passed`.
- `npm run lint` — passed.
- `npm run build` — passed.

Локально `node --test frontend/src/features/explorer/*.test.mjs frontend/src/features/explorer/*.source.test.mjs` даёт `184 passed / 1 failed`; единственный fail — baseline `SessionCreateModal.test.mjs` под Node 22.14.0 (`navigator` getter), вне изменений контура.

## Merge

Merge в `main` только после approve владельца.
