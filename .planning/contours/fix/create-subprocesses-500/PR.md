# PR: fix/create-subprocesses-500

## Что исправлено

- Починен 500 в `create_subprocess_sessions`: сервис теперь вызывает импортированный `org_role_for_request`, а не несуществующий `_org_role_for_request`.
- Добавлен backend GET-alias `/api/sessions/{session_id}/create-subprocesses?load_all=true` для background/workspace path; POST сохранен.
- Добавлена регрессия, где POST и GET с `load_all=true` возвращают `200` и создают все child subprocess sessions.
- `WorkspaceExplorer` больше не показывает native `alert` при ошибке догрузки подпроцессов: ошибка остается inline рядом со строкой, есть кнопка `Повторить`, дополнительно показывается toast.
- Убраны оставшиеся `window.alert` из product-code `WorkspaceExplorer.jsx`; status/delete ошибки теперь идут через inline error + toast.
- В `AGENTS.md` добавлено правило: frontend product-code не использует native `alert/confirm/prompt` для ошибок/продуктовых действий.
- `docs/openapi.yaml` регенерирован: `+1` operation для GET.

## Root Cause

Локальный persisted `backend_exception` на route `/api/sessions/{session_id}/create-subprocesses` показал:

```text
NameError
sessions.py:get_create_subprocess_sessions
session_service.py:create_subprocess_sessions:1446
```

В `session_service.py` функция импортировала `org_role_for_request`, но вызывала `_org_role_for_request`. До создания подпроцессов backend падал 500. Проверка `executemany`: в текущем `origin/main` `_PgCompatConnection.executemany` уже есть, это не тот же дефект compat layer.

Stage telemetry/container logs не были доступны: stage admin seed credentials возвращают `invalid_credentials`, Docker daemon локально выключен, SSH secrets недоступны. Stage `/version` подтвержден: `main`, `9cc9d882cc0014e182e05e1751f82516a5598f4d`.

## Тесты

```bash
PYTHONPATH=backend .venv311-test/bin/python -m pytest backend/tests/test_create_subprocesses_endpoint_regression.py -q
```

Результат: `1 passed`.

```bash
PATH="/Users/mac/.local/node/bin:$PATH" node --test frontend/src/features/explorer/*.source.test.mjs
```

Результат: `83 passed`.

```bash
PATH="/Users/mac/.local/node/bin:$PATH" npm run lint
PATH="/Users/mac/.local/node/bin:$PATH" npm run build
PATH="$PWD/.venv311-test/bin:/Users/mac/.local/node/bin:$PATH" ./scripts/update_openapi.sh
```

Результат: все `exit 0`, OpenAPI lint valid.

Полный `npm test` остается красным по unrelated baseline: `3162 passed / 78 failed / 4 skipped`.

## Merge

Merge в `main` только после approve владельца.

