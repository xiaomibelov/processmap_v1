# PLAN: fix/deploy-verify-and-healthchecks

**Contour:** `fix/deploy-verify-and-healthchecks`  
**Role:** Planner  
**Branch:** `fix/deploy-verify-and-healthchecks` (from `origin/main` `9d99e8ae`)  
**Goal:** устранить ложные FAIL verify-deploy.sh, починить healthcheck celery-worker, привести `/agent/version` к консистентности, оценить BRPOP-шум агента, задокументировать план ликвидации drift `/home/deploy/app`.

---

## 1. Scope

### In scope
1. `verify-deploy.sh`:
   - нормализация SHA перед сравнением;
   - автоматическое определение compose project name по label контейнера;
   - `missing` контейнер сервиса, которого нет в стеке, → `WARN` вместо `FAIL`.
2. `docker-compose.yml`: добавить корректный healthcheck для `celery-worker` (`celery inspect ping`).
3. `backend/services/agent/routers/health.py`: привести ответ `/version` к формату `/version` монолита (для консистентности и чтобы nginx-прокси не получал 404 после пересборки).
4. `backend/services/agent/memory/schema_memory.py`: понизить уровень логирования BRPOP-таймаута с `warning` до `debug`, чтобы не засорять логи шумом.
5. Тесты:
   - `scripts/tests/test_verify_deploy.sh` — unit-тесты функций verify-deploy.sh;
   - расширение `backend/services/agent/tests/test_memory_worker.py` на логирование TimeoutError.
6. Документация drift `/home/deploy/app` vs `/opt/processmap/app` — план безопасной ликвидации (без удаления на сервере).

### Out of scope
- Изменения на prod-сервере (`/opt/processmap/app`, `/home/deploy/app`, системные пакеты, docker-compose-override продакшена).
- Ремонт seccomp/runtime — это контур `audit/seccomp-runtime-remediation`.
- Merge/deploy/PR-merge без явного approve пользователя.

---

## 2. Source/runtime truth (зафиксировано)

- **Repo:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-deploy-verify-and-healthchecks`
- **Remote:** `git@github.com:xiaomibelov/processmap_v1.git`
- **Branch:** `fix/deploy-verify-and-healthchecks`
- **HEAD:** `9d99e8ae7e990992aab573f7f3a8e5d4408de139` (== `origin/main`)
- **Status:** clean
- **Prod runtime:** `/opt/processmap/app`, detached HEAD `9d99e8ae`, compose project `app`
- **Drift checkout:** `/home/deploy/app`, branch `main`, HEAD `1b610d9`

---

## 3. Task-by-task plan

### 3.1 verify-deploy.sh

**Проблемы:**
1. `LOCAL_HASH=$(git rev-parse --short HEAD)` — 8 символов; `SERVER_HASH` — полный SHA с `/version`. Сравнение всегда `!=`.
2. `AGENT_CONTAINER="${AGENT_CONTAINER:-processmap_v1-agent-1}"` — хардкод под project name `processmap_v1`, на проде project name `app`.
3. Отсутствующий контейнер считается `FAIL`, хотя сервиса может не быть в стеке.

**Изменения:**
- Ввести функцию `normalize_sha(sha)` — обрезать/дополнять до одной длины (рекомендуется 8 символов, как `git rev-parse --short`).
- Ввести функцию `detect_compose_project()` — находит running-контейнер с label `com.docker.compose.project`, берёт первое значение; fallback на `processmap_v1` для локальной разработки.
- Ввести функцию `get_expected_containers(project)` — получает список сервисов из `docker compose ps --format json` или имена контейнеров; если сервис не в стеке, `SKIP`/`WARN`.
- `AGENT_CONTAINER` формировать как `${PROJECT}-agent-1` только если `agent` есть в compose-стеке; иначе `WARN`.
- Missing container state → `WARN: agent service not present in compose stack` и `AGENT_OK=1` (не влияет на exit code).
- Добавить `set -euo pipefail` сохранить; main code обернуть в функцию `main`, чтобы `scripts/tests/test_verify_deploy.sh` мог source'ить функции.

**Тесты:**
- `test_normalize_sha` — короткий, полный, mixed case.
- `test_detect_project_from_label` — мок docker inspect.
- `test_missing_agent_service_warn` — мок `docker compose ps` без agent.
- `test_version_match` — мок curl + git rev-parse.

### 3.2 celery-worker healthcheck

**Проблема:** текущий healthcheck celery-worker (если он был активен) пытался распарсить не-JSON и падал с `JSONDecodeError`.

**Решение:** добавить в `docker-compose.yml` сервису `celery-worker` healthcheck:
```yaml
healthcheck:
  test: ["CMD-SHELL", "celery -A backend.app.celery_app inspect ping --destination celery@$$HOSTNAME || exit 1"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 30s
```
- Используется стандартная Celery-команда `inspect ping`, не требует HTTP-endpoint.
- `$$HOSTNAME` — escape для Compose, чтобы подставлялся hostname контейнера.

**Тест:**
- Python-тест парсит `docker-compose.yml` и проверяет, что `celery-worker.healthcheck.test` содержит `celery inspect ping`.

### 3.3 Agent `/version`

**Проблема:** на проде `/agent/version` возвращает 404, потому что агентский контейнер был собран из старого коммита (`BUILD_ID=e1387bc7`). В коде `origin/main` endpoint уже есть, но формат отличается от монолита.

**Решение:** привести `backend/services/agent/routers/health.py::version_check` к формату `backend/app/routers/version.py`:
```python
{
    "commit": BUILD_ID,
    "buildTime": BUILD_TIME,
    "sha": BUILD_ID,
    "builtAt": BUILD_TIME,
    "containerId": os.uname().nodename,
    "branch": BUILD_BRANCH,
    "env": BUILD_ENV,
}
```
- Это не добавляет endpoint (он уже есть), а делает ответ консистентным с `/version` монолита.

**Тест:**
- Обновить/добавить тест в `backend/services/agent/tests/`, проверяющий поля ответа `/version`.

### 3.4 Agent BRPOP timeout logging

**Проблема:** `run_memory_worker_once` логирует любое исключение BRPOP на уровне `warning`. На проде это приводит к спаму `BRPOP failed: Timeout reading from socket`.

**Решение:** разделить исключения:
```python
from redis.exceptions import TimeoutError as RedisTimeoutError
...
except RedisTimeoutError as exc:
    logger.debug("run_memory_worker_once: BRPOP timeout (queue empty or slow): %s", exc)
except Exception as exc:
    logger.warning("run_memory_worker_once: BRPOP failed: %s", exc)
```
- Таймаут long-poll — нормальное состояние, не требует warning.

**Тест:**
- В `backend/services/agent/tests/test_memory_worker.py` добавить тест: при `redis.exceptions.TimeoutError` лог пишется уровнем `debug`, а не `warning`.

### 3.5 Drift `/home/deploy/app`

**Факты:**
- `/home/deploy/app` — checkout на `main`, HEAD `1b610d9` (revert merge).
- `/opt/processmap/app` — serving runtime, detached HEAD `9d99e8ae`.
- В `/home/deploy/app` есть untracked файлы: `AUDIT_RECOVERY.md`, `AUDIT_SESSION_LOAD.md`, `afd6a56d15_v123.bpmn`.
- `/home/deploy/app` **не содержит `.env`**, `/opt/processmap/app` содержит `.env` с prod-конфигурацией.
- Ни один running-контейнер не ссылается на `/home/deploy/app` (prod stack запущен из `/opt/processmap/app`).

**План безопасной ликвидации (только после approve, в отдельном ops-контуре):**
1. Сделать backup untracked файлов (`AUDIT_*.md`, `.bpmn`) в `/home/deploy/app-backup-YYYY-MM-DD/`.
2. Проверить cron, systemd units, symlinks, активные Docker Compose project dirs (`docker compose ls -a`), deploy scripts, `.bash_history` на упоминания `/home/deploy/app`.
3. Проверить, не используется ли `/home/deploy/app` как canonical dev checkout или worktree source.
4. Если ни один процесс не зависит — `rm -rf /home/deploy/app`.
5. Оставить `AGENTS.md`/README в `/opt/processmap/app` единственным источником контракта.

---

## 4. Files to change

| File | Change |
|------|--------|
| `verify-deploy.sh` | рефакторинг + SHA normalize + project autodetect + WARN на missing |
| `scripts/tests/test_verify_deploy.sh` | новые unit-тесты для verify-deploy.sh |
| `docker-compose.yml` | healthcheck для `celery-worker` |
| `backend/services/agent/routers/health.py` | формат `/version` как у монолита |
| `backend/services/agent/memory/schema_memory.py` | BRPOP TimeoutError → debug log |
| `backend/services/agent/tests/test_memory_worker.py` | тест на debug-логирование таймаута |
| `backend/services/agent/tests/test_health.py` или расширение существующего | тест формата `/version` |
| `.planning/contours/fix/deploy-verify-and-healthchecks/EXEC_REPORT.md` | отчёт после выполнения |

---

## 5. Test strategy

1. **Bash tests for verify-deploy.sh:**
   - Source script in test mode (guard `if [[ "${BASH_SOURCE[0]}" == "${0}" ]]`).
   - Test `normalize_sha` with mocked inputs.
   - Test project detection with fake `docker inspect` output.
2. **Python tests:**
   - Agent `/version` response shape.
   - Agent BRPOP timeout log level.
   - Docker Compose YAML assertion for celery healthcheck.
3. **Local smoke (optional, не mutating shared env):**
   - `bash scripts/tests/test_verify_deploy.sh`.
   - `pytest backend/services/agent/tests/test_memory_worker.py`.

---

## 6. PR description (draft)

```markdown
# fix(deploy/health): verify-deploy, celery healthcheck, agent consistency

## Что починено
- `verify-deploy.sh` теперь корректно сравнивает SHA (нормализует к short),
  автоматически определяет compose project name и не падает с FAIL, если
  сервис agent отсутствует в стеке.
- У `celery-worker` появился healthcheck `celery inspect ping`.
- `/version` в agent-сервисе приведён к формату `/version` монолита.
- BRPOP-таймаут в агентском memory worker теперь логируется на уровне debug.

## Чек-лист
- [ ] `bash scripts/tests/test_verify_deploy.sh` — зелёные
- [ ] `pytest backend/services/agent/tests/test_memory_worker.py` — зелёные
- [ ] `pytest backend/services/agent/tests/test_health.py` — зелёные
- [ ] stage deploy + `verify-deploy.sh` возвращает MATCH
- [ ] `docker ps` показывает celery-worker healthy

## Rollback
- Откатить коммит `fix/deploy-verify-and-healthchecks` → `origin/main`.
- Пересобрать/перезапустить affected services.
```

---

## 7. Acceptance criteria

- [ ] `verify-deploy.sh` в `/opt/processmap/app` после merge не выдаёт ложный FAIL по SHA и project name.
- [ ] `celery-worker` получает рабочий healthcheck.
- [ ] `/agent/version` возвращает JSON в формате монолита.
- [ ] BRPOP timeout не спамит warning в логах агента.
- [ ] Все новые/обновлённые тесты проходят.
- [ ] PR создан и готов к review; merge только после explicit approve.
