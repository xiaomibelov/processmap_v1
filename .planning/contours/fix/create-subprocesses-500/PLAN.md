# fix/create-subprocesses-500 — PLAN

Дата: 2026-09-03.
Ветка: `fix/create-subprocesses-500`.
Baseline: `origin/main` (`9cc9d882cc0014e182e05e1751f82516a5598f4d`).

## Контекст

На stage (`https://stage.processmap.ru/version`) отдается `main` / `9cc9d882cc0014e182e05e1751f82516a5598f4d`.

Пользовательские пути:

- background/prefetch: `GET /api/sessions/1e4e833505/create-subprocesses?load_all=true` -> 500.
- click: `POST /api/sessions/1e4e833505/create-subprocesses?load_all=true` -> 500.
- frontend показывает `alert("internal_server_error")`, что запрещено для product UX.

Stage telemetry/container logs не удалось прочитать из этой сессии: `admin@local/admin` на stage возвращает `invalid_credentials`, Docker daemon локально недоступен, SSH secrets в repo не раскрыты. Для root-cause поднят локальный persisted `backend_exception` на том же route после добавления GET-alias.

## Root Cause

Локальный stack trace:

```text
event_type: backend_exception
exception_type: NameError
route: /api/sessions/{session_id}/create-subprocesses
method: GET
stack:
  sessions.py:get_create_subprocess_sessions
  session_service.py:create_subprocess_sessions:1446
```

Причина: `backend/app/services/session_service.py` импортирует `org_role_for_request`, но `create_subprocess_sessions()` вызывал несуществующий `_org_role_for_request`. Поэтому endpoint падал 500 до основной логики авторизации/создания подпроцессов. Это не повтор старого `_PgCompatConnection.executemany`: в текущем `origin/main` `executemany` уже реализован.

Дополнительный контрактный gap: в `origin/main` был только `POST /api/sessions/{id}/create-subprocesses`; для background GET-пути нужен явный GET-alias.

## Изменения

1. Backend:
   - заменить `_org_role_for_request(...)` на `org_role_for_request(...)`;
   - добавить `GET /api/sessions/{session_id}/create-subprocesses` с тем же service behavior и `load_all`;
   - регенерировать `docs/openapi.yaml`.

2. Frontend:
   - убрать `window.alert` из `WorkspaceExplorer.jsx`;
   - для ошибки догрузки подпроцессов показать inline row рядом со строкой сессии;
   - дать кнопку `Повторить`;
   - показать toast через существующий `WorkspaceExplorerToast`;
   - status/delete ошибки в `ProjectPane` перевести на inline error + toast вместо alert.

3. Contract:
   - зафиксировать в `AGENTS.md` запрет native `alert/confirm/prompt` для product frontend ошибок/действий.

## Acceptance

- `POST /api/sessions/{id}/create-subprocesses?load_all=true` -> 200.
- `GET /api/sessions/{id}/create-subprocesses?load_all=true` -> 200.
- `frontend/src` product-code не содержит `alert(`; оставшиеся grep hits только XSS-test strings.
- Ошибка frontend load-all subprocesses handled inline + toast + retry.
- OpenAPI обновлен, lint valid.

