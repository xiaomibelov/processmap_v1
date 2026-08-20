# Контур: secrets-hardening

## Находки (из security-audit-20260820/FINDINGS.md)

| ID | Severity | Название | Статус |
|---|---|---|---|
| PM-SEC-001 | Critical | Секреты в git-истории + tracked `.env` | Кодовая часть (без ротации/очистки истории) |
| PM-SEC-004 | Critical | JWT fallback/weak secret, `alg=none` возможен | Исправляется |
| PM-SEC-015 | Medium | LLM API key хранится в plaintext (`_llm_settings.json`) | Исправляется |
| PM-SEC-016 | Medium | JWT secret в client bundle / runtime логах | Кодовая часть: fail-fast, scrub placeholder |

## Что входит в контур

1. Удалить tracked `.env` из индекса (`git rm --cached`).
2. `.gitignore`: игнорировать `.env*` кроме `.env.example`.
3. `.env.example`: все секреты пустые, добавлен `LLM_SETTINGS_ENCRYPTION_KEY`.
4. `docker-compose.yml`: убраны fallback-значения для `JWT_SECRET`, `AGENT_SVC_INTERNAL_TOKEN`; добавлен `LLM_SETTINGS_ENCRYPTION_KEY`; добавлены `JWT_ISSUER`, `JWT_AUDIENCE`.
5. `backend/app/auth.py`:
   - удалён `DEFAULT_JWT_SECRET`;
   - `jwt_secret()` fail-fast при отсутствии/коротком секрете (≥32 bytes);
   - `_jwt_decode()` жёстко проверяет `alg == "HS256"`;
   - валидация `iss`/`aud` при настроенных env.
6. `backend/app/startup/app_factory.py` + `boot_checks.py`: startup guard `validate_jwt_secret_on_boot()` и `validate_llm_encryption_key_on_boot()`.
7. `backend/services/agent/main.py` + `routers/internal_llm.py`: убран fallback `"dev-insecure-change-me"`; пустые/placeholder токены отклоняются на старте и в ручке.
8. `backend/services/notifications/app/config.py`: убран default JWT secret.
9. `backend/app/settings.py`: шифрование `_llm_settings.json` через Fernet с ключом `LLM_SETTINGS_ENCRYPTION_KEY`; обратная совместимость с plaintext; права 0600.
10. `backend/requirements.txt`: добавлен `cryptography>=42.0.0`.
11. `tools/security/scan-secrets.py` + `.github/workflows/secret-scan.yml` + `.pre-commit-config.yaml`: lightweight pre-commit/CI сканер утечек.
12. Regression-тесты:
    - `backend/tests/test_security_secrets_hardening.py`
    - `backend/services/agent/tests/test_security_agent_token.py`

## Что НЕ входит (ответственность пользователя / другие контуры)

- Ротация уже скомпрометированных токенов и scrub git-истории — только runbook в PR.md.
- Исправление client-side хранения/утечки токена (PM-SEC-016 UI-часть) — контур `frontend-token-xss`.
- SSRF / CORS / headers / контейнеры / CI pinning — отдельные контуры.

## Затронутые модули

- `.env.example`, `.gitignore`, `docker-compose.yml`
- `backend/app/auth.py`
- `backend/app/settings.py`
- `backend/app/startup/app_factory.py`, `backend/app/startup/boot_checks.py`
- `backend/services/agent/main.py`, `backend/services/agent/routers/internal_llm.py`
- `backend/services/notifications/app/config.py`
- `backend/requirements.txt`
- `backend/tests/conftest.py`
- `backend/tests/test_security_secrets_hardening.py`
- `backend/services/agent/tests/test_security_agent_token.py`
- `tools/security/scan-secrets.py` (новый)
- `.github/workflows/secret-scan.yml` (новый)
- `.pre-commit-config.yaml` (новый)
