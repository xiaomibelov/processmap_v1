# fix/session-count-semantics — тесты

## RED

```bash
PYTHONPATH=backend /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix-create-subprocesses-500/.venv311-test/bin/python -m pytest backend/tests/test_workspace_access_controls.py::WorkspaceAccessControlsTest::test_workspace_aggregates_count_only_root_sessions_not_subprocesses -q
```

Результат до фикса:

- `AssertionError: 151 != 3`
- folder `descendant_sessions_count` включал 148 subprocess rows.

## GREEN

```bash
PYTHONPATH=backend /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix-create-subprocesses-500/.venv311-test/bin/python -m pytest backend/tests/test_workspace_access_controls.py::WorkspaceAccessControlsTest::test_workspace_aggregates_count_only_root_sessions_not_subprocesses -q
```

Результат: `1 passed`.

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test frontend/src/features/explorer/explorerTableFormat.test.mjs frontend/src/features/explorer/explorerColumnVisibility.test.mjs frontend/src/features/explorer/work3TreeState.test.mjs frontend/src/features/explorer/explorerSortModel.test.mjs
```

Результат: `31 passed`.

```bash
PYTHONPATH=backend /Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix-create-subprocesses-500/.venv311-test/bin/python -m pytest backend/tests/test_workspace_access_controls.py -q
```

Результат: `9 passed`.

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm run lint
PATH="/Users/mac/.local/node/bin:$PATH" npm run build
```

Результат: оба `exit 0`.

```bash
git diff --check
graphify update .
```

Результат: `git diff --check` — `exit 0`; `graphify update .` — `exit 0`.

## Ограничение локального прогона

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test frontend/src/features/explorer/*.test.mjs frontend/src/features/explorer/*.source.test.mjs
```

Результат: `184 passed / 1 failed`. Единственный fail — `SessionCreateModal.test.mjs`, `TypeError: Cannot set property navigator ... which has only a getter` под локальным Node 22.14.0. Тест не связан с изменениями этого контура.

`./tools/pm-agent-mirror-report.sh "fix/session-count-semantics" executor` локально не выполнился: script делает `cd /opt/processmap-test`, такого пути на этой машине нет.
