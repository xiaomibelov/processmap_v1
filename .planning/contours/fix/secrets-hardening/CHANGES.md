# CHANGES.md — Контур secrets-hardening

## Сводка

Минимальный патч, закрывающий кодовую часть находок PM-SEC-001, PM-SEC-004, PM-SEC-015, PM-SEC-016 аудита security-20260820.

## Изменения по файлам

### `.env` / `.gitignore` / `.env.example`

- `git rm --cached .env` — убран tracked `.env` из индекса.
- `.gitignore`: `.env` и `.env.*` игнорируются; `.env.example` оставлен как единственный tracked шаблон.
- `.env.example`: `JWT_SECRET`, `AGENT_SVC_INTERNAL_TOKEN`, `DEEPSEEK_API_KEY`, `LLM_SETTINGS_ENCRYPTION_KEY` — пустые, с комментариями о требованиях.

### `docker-compose.yml`

- Убраны fallback-значения для `JWT_SECRET` и `AGENT_SVC_INTERNAL_TOKEN`.
- Добавлены `JWT_ISSUER`, `JWT_AUDIENCE`, `LLM_SETTINGS_ENCRYPTION_KEY`.

### `backend/app/auth.py` (PM-SEC-004)

- Удалён `DEFAULT_JWT_SECRET`.
- `jwt_secret()` raise `AuthError`, если `JWT_SECRET` не задан или короче 32 байт.
- Добавлены `jwt_issuer()`, `jwt_audience()`, `validate_jwt_secret_on_boot()`.
- `_jwt_encode()` подписывает HS256 и добавляет `iss`/`aud`, если заданы.
- `_jwt_decode()` жёстко проверяет `header["alg"] == "HS256"`, а также `exp`, `iss`, `aud`.

### `backend/app/startup/app_factory.py` + `boot_checks.py`

- `register_boot_events` теперь принимает `validate_llm_encryption_key`.
- На startup вызываются `validate_jwt_secret_on_boot()` и `validate_llm_encryption_key_on_boot()`.

### `backend/app/settings.py` (PM-SEC-015)

- `_llm_settings.json` шифруется Fernet с ключом `LLM_SETTINGS_ENCRYPTION_KEY`.
- Ключ может быть готовым Fernet key (44 url-safe base64 chars) или любым high-entropy секретом; в последнем случае выводится через PBKDF2-HMAC-SHA256.
- Обратная совместимость: plaintext-файлы мигрируются автоматически.
- Файл создаётся с правами `0600`.
- Добавлена `validate_llm_encryption_key_on_boot()`.

### `backend/services/agent/main.py` + `routers/internal_llm.py` (PM-SEC-004/M-4)

- Убран fallback `"dev-insecure-change-me"`.
- В `_INVALID_AGENT_TOKENS` добавлен старый placeholder.
- `main.py`: вынесена `_validate_agent_token_or_die()`; startup падает с `RuntimeError`, если токен пуст/placeholder.
- `internal_llm.py`: `_check_internal_token()` возвращает 401, если токен не настроен или не совпадает.

### `backend/services/notifications/app/config.py`

- Убран default JWT secret `"dev-secret"`; валидация при импорте.

### `backend/requirements.txt`

- Добавлен `cryptography>=42.0.0` (нужен для Fernet в `backend/app/settings.py`).

### `backend/tests/conftest.py`

- Добавлены `setdefault` для `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `AGENT_SVC_INTERNAL_TOKEN`, `LLM_SETTINGS_ENCRYPTION_KEY` — чтобы существующий suite не падал из-за fail-fast.

### `tools/security/scan-secrets.py` (PM-SEC-001)

- Новый lightweight сканер для pre-commit и CI.
- Паттерны: AWS keys, private keys, GitHub/Slack/OpenAI/DeepSeek tokens, generic high-entropy assignments.
- Allowlist для `.env.example`, lock-файлов, бинарей, `.planning/`, `docs/`, deploy-workflows.
- Маскирует найденные значения в выводе.

### `.github/workflows/secret-scan.yml`

- Новый workflow: запускает `tools/security/scan-secrets.py --all` на PR/push.

### `.pre-commit-config.yaml`

- Новый local hook: `python tools/security/scan-secrets.py` над staged файлами.

### Тесты

- `backend/tests/test_security_secrets_hardening.py`:
  - JWT fail-fast (missing/short).
  - Отклонение `alg=none` и `alg=HS512`.
  - Валидация `iss`/`aud`.
  - LLM encryption key fail-fast.
  - Roundtrip шифрования/дешифрования LLM settings.
  - Backwards-compatible plaintext migration.
  - Secret scanner находит AWS key и пропускает `.env.example`.
- `backend/services/agent/tests/test_security_agent_token.py`:
  - Agent service startup fail-fast на пустом/placeholder токене.
  - Internal LLM 401 при не настроенном/placeholder токене.

## Что НЕ изменено

- Нет ротации токенов и scrub git-истории — только runbook в PR.md.
- Нет client-side перевода на cookie (PM-SEC-016 UI) — отдельный контур.
- Нет SSRF/CORS/headers/container/CI pinning fixes — отдельные контуры.
