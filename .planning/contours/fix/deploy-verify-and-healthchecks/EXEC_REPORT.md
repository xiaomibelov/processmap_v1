# EXEC REPORT: fix/deploy-verify-and-healthchecks

**Contour:** `fix/deploy-verify-and-healthchecks`  
**Role:** Executor  
**Branch:** `fix/deploy-verify-and-healthchecks`  
**HEAD:** `b2c68524` on top of `origin/main` `9d99e8ae7e990992aab573f7f3a8e5d4408de139`  
**PR:** https://github.com/xiaomibelov/processmap_v1/pull/850  
**Status:** awaiting user approve for merge/deploy  

---

## 1. What was done

### 1.1 `verify-deploy.sh`
- Added `normalize_sha()` — compares both sides as 8-char lowercase SHA.
- Added `detect_compose_project()` — reads `com.docker.compose.project` label from a running container whose working dir matches `pwd`; falls back to `processmap_v1` for local dev.
- Added `check_agent_container()` — returns `running`, `missing`, `not_in_stack`, or `no_docker`.
- Missing agent service in the active compose stack is now `WARN`, not `FAIL`.
- Wrapped `main` in a guard so the script can be sourced by unit tests.

### 1.2 Celery worker healthcheck
- Added a `celery inspect ping` healthcheck to `docker-compose.yml` for the `celery-worker` service.
- No HTTP endpoint required; works inside the worker container.

### 1.3 Agent `/version`
- Updated `backend/services/agent/routers/health.py::version_check` to mirror the format of `backend/app/routers/version.py`:
  `commit`, `sha`, `buildTime`, `builtAt`, `containerId`, `branch`, `env`.

### 1.4 Agent BRPOP timeout logging
- In `backend/services/agent/memory/schema_memory.py`, `redis.exceptions.TimeoutError` during `brpop` is now logged at `debug` level.
- All other exceptions remain at `warning` level.

### 1.5 Tests
- `scripts/tests/test_verify_deploy.sh` — 9 shell unit tests (normalize_sha, project detection, missing agent service).
- `scripts/tests/test_compose_healthchecks.py` — smoke test asserting celery-worker healthcheck uses `celery inspect ping`.
- `backend/services/agent/tests/test_health.py` — updated to assert new `/version` shape.
- `backend/services/agent/tests/test_memory_worker.py` — added test asserting BRPOP timeout is logged at debug.

### 1.6 `.gitignore`
- Added `.venv-test/` so local test virtualenvs are not committed.

---

## 2. Verification

### 2.1 Shell tests
```text
$ bash scripts/tests/test_verify_deploy.sh
PASS: normalize_sha truncates full SHA
PASS: normalize_sha keeps short SHA
PASS: normalize_sha lowercases and truncates
PASS: normalize_sha keeps short non-8-char SHA unchanged
PASS: normalize_sha handles empty input
PASS: detect_compose_project falls back to processmap_v1
PASS: check_agent_container returns not_in_stack when agent absent
PASS: check_agent_container returns running for healthy agent

=== verify-deploy tests: 9 passed, 0 failed ===
```

### 2.2 Python tests
```text
$ python3.11 -m pytest backend/services/agent/tests/test_health.py backend/services/agent/tests/test_memory_worker.py scripts/tests/test_compose_healthchecks.py -q
.........                                                                [100%]
9 passed, 6 warnings in 0.88s
```

Warnings are pre-existing FastAPI deprecations (`on_event`, `app` shortcut in httpx), not introduced by this change.

### 2.3 Git proof
```text
$ git status -sb
## fix/deploy-verify-and-healthchecks...origin/fix/deploy-verify-and-healthchecks
$ git log --oneline -3
b2c68524 docs(planning): add PR body for deploy-verify-and-healthchecks fix
0a582d18 fix(deploy/health): verify-deploy SHA/project, celery healthcheck, agent version, BRPOP log level
9d99e8ae fix(canvas): инициализация поиска при фокусе на input (#849)
```

---

## 3. Server-side observations (no changes made)

- Prod is serving from `/opt/processmap/app`, detached HEAD `9d99e8ae`, compose project `app`.
- `/home/deploy/app` is a separate checkout on `main` HEAD `1b610d9` and is **not** the serving runtime.
- Drift liquidation plan is documented in `PLAN.md` section 3.5; do not act on it without a separate ops approve.

---

## 4. Next steps (require explicit user approve)

1. Review PR https://github.com/xiaomibelov/processmap_v1/pull/850.
2. Approve and merge.
3. Deploy to prod from `main`.
4. On the server, run `./verify-deploy.sh` in `/opt/processmap/app` and confirm `MATCH`.
5. Check `docker ps` — `app-celery-worker-1` should be `healthy`.
6. Verify `curl https://processmap.ru/agent/version` returns 200 with expected fields.

---

## 5. Risks / limitations

- `detect_compose_project()` requires at least one running container from the same compose working directory. If no containers are running, it falls back to `processmap_v1` and prints a WARN about missing agent service.
- The celery healthcheck assumes `celery -A backend.app.celery_app inspect ping` works inside the worker container. If the app import path differs in production images, the command may need adjustment.
- `/agent/version` will only return the new format after the agent container is rebuilt from this branch.
- No server-side changes were made; production is still running the old agent image (hence `/agent/version` currently 404).
