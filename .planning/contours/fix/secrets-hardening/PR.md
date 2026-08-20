# PR — Контур secrets-hardening

## Что исправлено

| ID находки | Файл:строка было/стало | Суть фикса |
|---|---|---|
| PM-SEC-001 | `.env` удалён из индекса; `.gitignore` + `.env.example` | tracked `.env` больше не попадает в git; `.env.example` — единственный tracked шаблон с пустыми секретами |
| PM-SEC-001 | `tools/security/scan-secrets.py` (новый), `.github/workflows/secret-scan.yml` (новый), `.pre-commit-config.yaml` (новый) | pre-commit + CI lightweight сканер утечек секретов |
| PM-SEC-004 | `backend/app/auth.py:118-177` | удалён `DEFAULT_JWT_SECRET`; `jwt_secret()` fail-fast; startup guard; алгоритм захардкожен на HS256; валидация `iss`/`aud` |
| PM-SEC-004 | `backend/app/startup/app_factory.py:48-53`, `boot_checks.py:14-25` | startup вызывает `validate_jwt_secret_on_boot()` и `validate_llm_encryption_key_on_boot()` |
| PM-SEC-004/M-4 | `backend/services/agent/main.py:47-68`, `routers/internal_llm.py:49-57` | убран fallback `"dev-insecure-change-me"`; пустой/placeholder токен отклоняется на старте и в ручке |
| PM-SEC-004/M-4 | `backend/services/agent/services/auth_service.py` | убран fallback JWT secret |
| PM-SEC-004 | `backend/services/notifications/app/config.py` | убран default `"dev-secret"`; валидация длины при импорте |
| PM-SEC-015/016 | `backend/app/settings.py:28-148` | `_llm_settings.json` шифруется Fernet; backward-compatible plaintext; права 0600; fail-fast ключа |
| PM-SEC-015/016 | `.env.example`, `docker-compose.yml` | добавлен `LLM_SETTINGS_ENCRYPTION_KEY` как required секрет |
| — | `backend/requirements.txt` | добавлен `cryptography>=42.0.0` |

## Как проверено

- `python -m pytest tests/test_security_secrets_hardening.py` — 12 passed.
- `cd backend/services/agent && python -m pytest tests/test_security_agent_token.py` — 4 passed.
- Representative subset основного suite — 25 passed.
- `python tools/security/scan-secrets.py` — no potential secrets in staged files.
- `python tools/security/scan-secrets.py --all` — no potential secrets in 4235 files.

Подробнее в `TESTS.md`.

## Скоуп

**Входит:** кодовая часть PM-SEC-001, PM-SEC-004, PM-SEC-015, PM-SEC-016.

**Не входит:**
- Ротация уже скомпрометированных токенов и scrub git-истории (см. runbook ниже).
- Client-side перевод на HttpOnly cookie (PM-SEC-016 UI-часть) — отдельный контур `frontend-token-xss`.
- SSRF, CORS, security headers, hardening контейнеров, CI SHA-pinning — отдельные контуры.

## Runbook для пользователя: ротация токена и scrub истории (PM-SEC-001)

> Выполнять только по явной команде пользователя, шаг за шагом.

1. Сгенерировать новые значения для `JWT_SECRET`, `AGENT_SVC_INTERNAL_TOKEN`, `LLM_SETTINGS_ENCRYPTION_KEY`, `DEEPSEEK_API_KEY` (если используется).
2. Обновить `.env` на всех runtime-контурах (dev, stage, prod) и в secret manager.
3. Обновить токены во всех consumers:
   - CI secrets (`JWT_SECRET`, `AGENT_SVC_INTERNAL_TOKEN`).
   - Agent service env.
   - Notifications service env.
   - Все локальные `.env` разработчиков.
4. Установить `git-filter-repo`:
   ```bash
   pip install git-filter-repo
   ```
5. Подготовить `replace.txt`:
   ```text
   literal:OLD_JWT_SECRET==>NEW_JWT_SECRET
   literal:OLD_AGENT_TOKEN==>NEW_AGENT_TOKEN
   literal:OLD_LLM_KEY==>NEW_LLM_KEY
   literal:OLD_DEEPSEEK_KEY==>NEW_DEEPSEEK_KEY
   ```
   (заменить `literal:` на актуальные префиксы/постфиксы; git-filter-repo использует формат `regex:` или `literal:`).
6. Запустить scrub:
   ```bash
   git filter-repo --replace-text replace.txt --force
   ```
7. Force-push в защищённые ветки (требует временного разрешения force-push):
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```
8. Уведомить команду о необходимости пересоздать локальные клоны из origin.
9. В GitHub: запросить очистку кэша/secret scanning alerts через support.

## Замечено вне скоупа

- `tests/test_role_authorization.py`, `tests/test_precheck.py` — некорректный импорт `backend.app.main`.
- `tests/test_session_meta_endpoint.py` — `PATCH /api/sessions/{id}/meta` возвращает 405 (endpoint отсутствует).
- `tests/test_llm_status_api.py::test_status_404_foreign_user`, `tests/test_llm_feedback_api.py::test_feedback_404_foreign_user` — flaky при единственной `org_default`.
- `backend/services/notifications/tests/test_notifications.py`, `test_system_events.py` — endpoint'ы возвращают 404.

## Риски и обратная совместимость

- **Ломающее изменение:** приложение теперь не стартует без `JWT_SECRET` (≥32 байт), `AGENT_SVC_INTERNAL_TOKEN`, `LLM_SETTINGS_ENCRYPTION_KEY`. Все runtime-конфиги должны быть обновлены ДО deploy.
- **Ломающее изменение:** JWT токены, выданные до включения `JWT_ISSUER`/`JWT_AUDIENCE`, будут отклонены, если эти env заданы. Рекомендация: не включать `JWT_ISSUER`/`JWT_AUDIENCE` до принудительного re-login всех пользователей, либо сначала задать их, выпустить новые токены, затем включить валидацию.
- **Backward compatible:** `_llm_settings.json` в plaintext автоматически мигрируется в encrypted при следующем `save_llm_settings`.
- **Backward compatible:** `AGENT_SVC_INTERNAL_TOKEN` остаётся shared secret; меняется только запрет placeholder.

## Чек-лист регламента

- [x] минимальный диф
- [x] regression-тесты на каждую находку
- [x] representative suite зелёный (pre-existing failures задокументированы)
- [x] нет секретов в дифе (scan-secrets.py проходит)
- [x] готов к приёмке по промту security-acceptance
