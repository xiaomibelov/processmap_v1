# TESTS.md — Контур secrets-hardening

## Regression-тесты (новые)

### `backend/tests/test_security_secrets_hardening.py`

Команда запуска:

```bash
cd backend
source .venv/bin/activate
python -m pytest tests/test_security_secrets_hardening.py -v
```

Результат (последний прогон):

```
12 passed in 118.25s
```

Покрытие:

- `test_jwt_secret_missing_raises` — `JWT_SECRET` не задан → `AuthError`.
- `test_jwt_secret_too_short_raises` — `JWT_SECRET` короче 32 байт → `AuthError`.
- `test_validate_jwt_secret_on_boot_ok` — startup guard проходит с валидным секретом.
- `test_jwt_rejects_alg_none` — токен с `alg: none` отклоняется.
- `test_jwt_rejects_hs512` — токен с `alg: HS512` отклоняется.
- `test_jwt_validates_issuer_and_audience` — `iss`/`aud` проверяются.
- `test_llm_encryption_key_missing_raises` — `LLM_SETTINGS_ENCRYPTION_KEY` не задан → `RuntimeError`.
- `test_llm_settings_roundtrip_encrypted` — шифрование/дешифрование `_llm_settings.json`; plaintext API key не попадает в файл.
- `test_llm_settings_backwards_compatible_plaintext` — старый plaintext-файл читается.
- `test_scanner_flags_aws_key` — `tools/security/scan-secrets.py` находит AWS access key ID.
- `test_scanner_allows_env_example_empty_values` — `.env.example` с пустыми секретами не триггерит false positive.
- `test_scanner_cli_all_mode_passes_on_clean_repo` — `scan-secrets.py --all` проходит по текущему репо.

### `backend/services/agent/tests/test_security_agent_token.py`

Команда запуска:

```bash
cd backend/services/agent
source /Users/mac/agents_place/kimi_PM/server-backup/root/processmap_v1/backend/.venv/bin/activate
python -m pytest tests/test_security_agent_token.py -v
```

Результат (последний прогон):

```
4 passed, 4 warnings in 10.05s
```

Покрытие:

- `test_startup_rejects_empty_token` — agent service startup падает с пустым `AGENT_SVC_INTERNAL_TOKEN`.
- `test_startup_rejects_placeholder` — старый placeholder `"dev-insecure-change-me"` отклоняется.
- `test_internal_llm_rejects_unconfigured_token` — `POST /internal/llm/complete` возвращает 401, если токен не настроен.
- `test_internal_llm_rejects_placeholder_token` — placeholder токен возвращает 401.

## Изменения в существующих тестах

- `backend/tests/test_auth_jwt_flow.py` — `JWT_SECRET` увеличен с `"unit-test-secret"` до `"unit-test-secret-for-processmap-jwt-only-32b"`, чтобы проходить новую валидацию длины.
- `backend/tests/conftest.py` — добавлены `setdefault` для `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `AGENT_SVC_INTERNAL_TOKEN`, `LLM_SETTINGS_ENCRYPTION_KEY`.
- `backend/services/notifications/tests/conftest.py` — `JWT_SECRET` увеличен до 32+ байт.

## Проверка существующего suite

Запуск representative subset:

```bash
cd backend
python -m pytest \
  tests/test_auth_jwt_flow.py \
  tests/test_security_secrets_hardening.py \
  tests/test_int64_clamp_regression.py \
  tests/test_openapi_rate_limit_429.py \
  tests/test_deprecated_alias_headers.py \
  -v
```

Результат:

```
25 passed, 14 warnings in 89.57s
```

Также проверены:

- `backend/services/agent/tests/test_security_agent_token.py` — 4 passed.
- `backend/services/notifications/tests/test_error_events.py` — passed.
- `backend/services/notifications/tests/test_repo.py` — passed.

## Известные pre-existing failures (не вызваны контуром)

При локальном прогоне наблюдались следующие падения, которые воспроизводятся и на чистом main при тех же условиях:

1. `tests/test_role_authorization.py` — `ModuleNotFoundError: No module named 'backend'` (некорректный импорт в самом тесте).
2. `tests/test_precheck.py` — `ModuleNotFoundError: No module named 'backend'` (некорректный импорт в самом тесте).
3. `tests/test_session_meta_endpoint.py` — `405 Method Not Allowed` на `PATCH /api/sessions/{id}/meta` (endpoint отсутствует в main).
4. `tests/test_llm_status_api.py::test_status_404_foreign_user` — возвращает 200 вместо 404, если в dev-БД только `org_default` (логика `single_default_mode` в `storage.py` автоматически добавляет пользователя в default org).
5. `tests/test_llm_feedback_api.py::test_feedback_404_foreign_user` — та же причина (`single_default_mode`).
6. `backend/services/notifications/tests/test_notifications.py`, `test_system_events.py` — 404 на create/list endpoints (роутеры/флаги endpoint'ов не подключены в текущем main).

Эти тесты не относятся к скоупу secrets-hardening и не блокируют приёмку контура.

## Проверка на отсутствие секретов в diff

```bash
python tools/security/scan-secrets.py
```

Результат:

```
No potential secrets found in 22 file(s).
```

## Примечание по окружению

- Локальный прогон выполнен на Python 3.11.4 в виртуальном окружении `backend/.venv`.
- `cryptography==42.0.8` установлен отдельно, так как `cryptography>=50.0` не собирается под текущий macOS Rust target (x86_64 target отсутствует). В production-образе (Linux) `cryptography>=42.0.0` разрешается в свежий бинарный wheel.
