# fix/create-subprocesses-500 — TESTS

Дата: 2026-09-03.

## Backend

Команда:

```bash
PYTHONPATH=backend .venv311-test/bin/python -m pytest \
  backend/tests/test_create_subprocesses_endpoint_regression.py -q
```

Результат:

```text
1 passed, 10 warnings in 41.55s
```

Покрытие:

- `POST /api/sessions/{id}/create-subprocesses?load_all=true` -> 200.
- `GET /api/sessions/{id}/create-subprocesses?load_all=true` -> 200.
- `load_all=true` создает все 12 child sessions и возвращает `has_more=false`.

Дополнительно вручную прогнаны методы из исторического skipped-файла:

```text
test_endpoint_create_subprocesses_batches_and_load_all passed
test_endpoint_create_subprocesses_get_load_all_is_supported_for_workspace_prefetch passed
```

Прямой pytest по `backend/tests/test_auto_create_subprocess_sessions.py` локально остается `skipped`, потому что файл помечен `skip_if_hanging`, а Redis broker `redis:6379` вне Docker Compose недоступен.

## Frontend

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test \
  frontend/src/features/explorer/workspaceAutoExpandSteps.source.test.mjs \
  frontend/src/features/explorer/workspaceExplorerRemaining.source.test.mjs
```

Результат:

```text
15 passed
```

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test frontend/src/features/explorer/*.source.test.mjs
```

Результат:

```text
83 passed
```

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm run lint
```

Результат: `exit 0`.

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm run build
```

Результат: `exit 0`.

Warnings: existing `%VITE_BUILD_ID%`, stale Browserslist data, browser externalized `crypto`/`zlib`, large chunks.

## OpenAPI

Команда:

```bash
PATH="$PWD/.venv311-test/bin:/Users/mac/.local/node/bin:$PATH" ./scripts/update_openapi.sh
```

Результат:

```text
OK: 298 paths / 377 operations -> docs/openapi.yaml
docs/openapi.yaml: validated
stats: paths 298 (+0), operations 377 (+1)
```

## Alert grep

Команда:

```bash
rg -n "window\.alert|\balert\(" frontend/src -g '*.{js,jsx,mjs,ts,tsx}'
```

Результат: product-code hits отсутствуют. Оставшиеся совпадения только в test strings для XSS/markdown sanitization:

- `frontend/src/features/notes/markdownRenderer.test.mjs`
- `frontend/src/features/process/processman/AgentMarkdown.test.mjs`

## Full Frontend Suite

Команда:

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm test
```

Результат:

```text
3244 tests
3162 passed
78 failed
4 skipped
exit 1
```

Первые unrelated baseline failures:

- `frontend/src/App.leave-navigation-guard.test.mjs`
- `frontend/src/features/process/processman/processmanView.test.mjs`
- `frontend/src/features/process/processman/processmanI18n.test.mjs`
- `frontend/src/styles/dark-theme-contrast.test.mjs`
- `ERR_MODULE_NOT_FOUND`: `frontend/src/features/process/bpmn/stage/profiling/panProfiler`

Explorer targeted tests, lint, build и OpenAPI lint зелёные.

