# Docker Recovery Report — 2026-03-04 01:29:20

## Repo Snapshot
- Branch: `feat/hybridlayer-fix-v1`
- HEAD: `3801c2c`
- Status (`git status -sb`):
  - `M backend/app/storage.py`
  - `?? scripts/docker_recover_v1.sh`
  - plus pre-existing untracked files:
    - `backend/workspace/`
    - `docs/handoff_factpack_20260303_233843.md`
    - `docs/handoff_pack_20260303_232803.md`
    - `docs/handoff_pack_20260303_232803_tables.md`
    - `scripts/docker_compose_safe_stop.sh`
- Checkpoint tag: `cp/docker_recover_start_20260304_012413`

## Compose Entry
- Compose file: `docker-compose.yml`
- Services (`docker compose config --services`):
  - `api`
  - `frontend`
  - `gateway`
- Published ports (from `docker compose config`):
  - `api`: `8011 -> 8000/tcp`
  - `gateway`: `5177 -> 80/tcp`

## Recovery Run
- Script created: `scripts/docker_recover_v1.sh`
- Script actions:
  1. Print Docker/Compose versions
  2. `docker compose down --remove-orphans` (no `-v`)
  3. `docker compose pull`
  4. `docker compose up -d --build`
  5. Print `docker compose ps`
  6. Print `docker compose logs --tail=200`
  7. If unhealthy/restarting services exist: print focused logs + health inspect
- Execution result: services recovered to `Up` state.

Final `docker compose ps`:
- `foodproc_process_copilot-api-1` — Up — `0.0.0.0:8011->8000/tcp`
- `foodproc_process_copilot-frontend-1` — Up
- `foodproc_process_copilot-gateway-1` — Up — `0.0.0.0:5177->80/tcp`

## Failures and Fixes
### Failure 1
- Service: `api` (runtime request path)
- Symptom: authenticated call `GET /api/auth/me` returned `500`.
- Error snippet from logs:
  - `sqlite3.OperationalError: no such column: org_id`
  - stack pointed to `backend/app/storage.py`, function `_ensure_schema` while creating index `idx_projects_org_updated`.
- Root cause (fact): in `_ensure_schema`, indexes on `projects.org_id` / `sessions.org_id` were created before `ALTER TABLE ... ADD COLUMN org_id` for legacy DBs.
- Applied fix:
  - moved these two index-creation statements to run **after** column backfill checks.
  - file changed: `backend/app/storage.py`
- Verification after fix:
  - `POST /api/auth/login` with `admin@local/admin` -> token returned
  - `GET /api/auth/me` with bearer token -> `200 OK`

## Volumes / Data
- `docker volume ls` includes project volume:
  - `foodproc_process_copilot_frontend_node_modules`
- This stack stores application data in bind mounts (from compose):
  - `./workspace -> /app/workspace`
  - `./backend -> /app/backend`
- SQLite files found:
  - `workspace/.session_store/processmap.sqlite3` (5.7M)
  - `backend/workspace/.session_store/processmap.sqlite3` (664K)
- Data verification inside `api` container (`/app/workspace/.session_store/processmap.sqlite3`):
  - non-empty tables:
    - `projects: 118`
    - `sessions: 168`
    - `storage_meta: 1`

Conclusion: volumes were not deleted; active DB data is present and non-empty.

## Smoke Results
### API
- `curl http://127.0.0.1:8011/health` -> `200 {"ok":true}`
- `curl http://127.0.0.1:8011/api/auth/me` (no token) -> `401 {"detail":"missing_bearer"}` (expected)
- `curl /api/auth/me` with valid bearer token -> `200` with user/org payload

### Frontend/Gateway
- `curl http://127.0.0.1:5177/` -> `200 OK` (Vite HTML delivered through nginx gateway)

### E2E Smoke
- Command: `./scripts/e2e_enterprise.sh`
- Result: `4 passed (19.7s)`
  - `accept-invite-enterprise.spec.mjs`
  - `org-settings-invites-audit.spec.mjs`
  - `org-switcher.spec.mjs`
  - `reports-delete-enterprise.spec.mjs`

## Next Actions
1. Commit recovery artifacts in one clear commit (`scripts/docker_recover_v1.sh` + schema-order fix in `backend/app/storage.py`).
2. Keep `scripts/docker_recover_v1.sh` as standard restart playbook for local incidents.
3. Optionally add a tiny startup check endpoint/assertion for schema readiness to catch legacy DB drift earlier.
4. If needed, remove stale duplicate DB under `backend/workspace/.session_store/` after confirming it is not referenced by runtime.
