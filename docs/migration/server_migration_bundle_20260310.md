# Server Migration Bundle — Docker Truth Baseline

Date: 2026-03-10

## 1. Docker truth map

| Service/container | Role | Host mount or baked image | Actual source path | Needed for server transfer? | Differs from merge/main? | Notes |
|---|---|---|---|---|---|---|
| `foodproc_process_copilot-api-1` | backend API | bind mount | `./backend -> /app/backend`, `./workspace -> /app/workspace` | yes | yes, current bind-mounted tree has many modified/untracked files | Served by `uvicorn backend.app.main:app` |
| `foodproc_process_copilot-frontend-1` | Vite frontend | bind mount | `./frontend -> /app` | yes | yes, current bind-mounted tree has many modified/untracked files | Runs dev server, not baked static bundle |
| `foodproc_process_copilot-gateway-1` | nginx reverse proxy | bind mount config | `./deploy/nginx/default.conf` | yes | unknown vs missing merge ref; current file is running truth | Proxies `/api` to backend and `/` to frontend |
| `foodproc_process_copilot-postgres-1` | primary DB | named volume | docker volume `foodproc_process_copilot_postgres_data` | yes | runtime data only | No host code mount |
| `foodproc_process_copilot-redis-1` | cache/lock/runtime coordination | image + volume | no host code mount | yes | runtime infra only | Required by current product defaults |

### Running product fact

Current Docker product uses **bind-mounted local source** for both backend and frontend.  
That means the current working product is the **current working tree**, not the image baked from clean Git.

## 2. Working product definition

Working product baseline is the current Docker-backed tree:

- backend served from `backend/`
- frontend served from `frontend/`
- reverse proxy config from `deploy/nginx/default.conf`
- runtime data from Postgres, Redis, and `workspace/`

### Important mismatch from Git baseline

`merge/main` is not available as a local Git revision in this repo right now, so the only reliable baseline is:

1. current bind-mounted Docker runtime
2. current Git `HEAD`
3. current working-tree delta vs `HEAD`

### Exact working delta capture

Captured in:

- [working_state_modified_vs_head_20260310.txt](/Users/mac/PycharmProjects/foodproc_process_copilot/docs/migration/working_state_modified_vs_head_20260310.txt)
- [working_state_untracked_20260310.txt](/Users/mac/PycharmProjects/foodproc_process_copilot/docs/migration/working_state_untracked_20260310.txt)

### Working functionality absent from clean Git `HEAD`

Examples from the current working tree that are powering the Docker product now:

- current explorer implementation:
  - `frontend/src/features/explorer/WorkspaceExplorer.jsx`
  - `frontend/src/features/explorer/explorerApi.js`
- startup decomposition / modular backend routing:
  - `backend/app/startup/*`
  - `backend/app/legacy/*`
  - `backend/app/services/*`
  - `backend/app/routers/org_invites.py`
  - `backend/app/routers/org_listing.py`
  - `backend/app/routers/org_members.py`
- current invite/org/workspace behavior:
  - `backend/app/storage.py`
  - `backend/app/_legacy_main.py`
  - `frontend/src/features/admin/components/orgs/AdminOrgInvitesPanel.jsx`
  - `frontend/src/features/auth/PublicHomePage.jsx`
- current draw.io working set:
  - `frontend/src/components/process/BpmnStage.jsx`
  - `frontend/src/features/process/drawio/**`
  - `frontend/src/features/process/overlay/**`
  - `frontend/e2e/drawio-*.spec.mjs`
  - `scripts/drawio_regression_gate.sh`

## 3. Full test/check inventory

### 3.1 Backend tests

| Test/check | Location | Type | Covers what | Current status | Must keep? | How to run |
|---|---|---|---|---|---|---|
| route compatibility | `backend/tests/test_route_compatibility.py` | backend unittest | legacy export + modular router coexistence | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_route_compatibility -q` |
| org invites | `backend/tests/test_org_invites.py` | backend unittest | invite lifecycle, roles, visibility, activation | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_org_invites -q` |
| org invites email flow | `backend/tests/test_org_invites_email_flow.py` | backend unittest | invite email/public flow path | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_org_invites_email_flow -q` |
| enterprise workspace endpoint | `backend/tests/test_enterprise_workspace_endpoint.py` | backend unittest | workspace/org read model | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_enterprise_workspace_endpoint -q` |
| enterprise org scope | `backend/tests/test_enterprise_org_scope_api.py` | backend unittest | org/member read scope | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_enterprise_org_scope_api -q` |
| project membership scope | `backend/tests/test_project_membership_scope.py` | backend unittest | workspace/project access scope | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_project_membership_scope -q` |
| workspace access controls | `backend/tests/test_workspace_access_controls.py` | backend unittest | role matrix, delete/status/rename guards | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_workspace_access_controls -q` |
| bpmn meta | `backend/tests/test_bpmn_meta.py` | backend unittest | BPMN-first, shared-meta safety | green | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_bpmn_meta -q` |
| drawio persisted sanitize | `backend/tests/test_drawio_persisted_state_sanitize.py` | backend unittest | persisted draw.io state sanitation | green | keep | `PYTHONPATH=backend python3 -m unittest backend.tests.test_drawio_persisted_state_sanitize -q` |
| auth JWT flow | `backend/tests/test_auth_jwt_flow.py` | backend unittest | login/token lifecycle | not rerun in this pass | keep | `PYTHONPATH=backend python3 -m unittest backend.tests.test_auth_jwt_flow -q` |

### 3.2 Frontend unit / DOM / invariant tests

| Test/check | Location | Type | Covers what | Current status | Must keep? | How to run |
|---|---|---|---|---|---|---|
| frontend build | `frontend/package.json` | build sanity | current frontend compiles | green | yes | `cd frontend && npm run build` |
| API admin/auth tests | `frontend/src/lib/api.enterprise-admin.test.mjs`, `apiRoutes.test.mjs`, `apiClient.test.mjs` | node tests | API path/auth wrappers | not rerun in this pass | keep | `cd frontend && node --test src/lib/*.test.mjs` |
| explorer/current workspace tests | `frontend/src/features/workspace/*.test.mjs` | node tests | workspace VM/progress helpers | not rerun in this pass | keep | `cd frontend && node --test src/features/workspace/*.test.mjs` |
| draw.io overlay matrix | `frontend/src/features/process/drawio/runtime/drawioOverlayMatrix.test.mjs` | node test | live-vs-stale matrix source | green | yes | `cd frontend && node --test src/features/process/drawio/runtime/drawioOverlayMatrix.test.mjs` |
| draw.io overlay state | `frontend/src/features/process/drawio/runtime/drawioOverlayState.test.mjs` | node test | pointer/selection state | green | yes | `cd frontend && node --test src/features/process/drawio/runtime/drawioOverlayState.test.mjs` |
| draw.io unified editing | `frontend/src/features/process/drawio/unifiedEditingContract.test.mjs` | node test | runtime/editor lineage continuity | green | yes | `cd frontend && node --test src/features/process/drawio/unifiedEditingContract.test.mjs` |
| draw.io hydrate boundary | `frontend/src/features/process/drawio/runtime/useDrawioPersistHydrateBoundary.test.mjs` | node test | rehydrate/persist contract | not rerun in this pass | yes | `cd frontend && node --test src/features/process/drawio/runtime/useDrawioPersistHydrateBoundary.test.mjs` |
| overlay/panel truth | `frontend/src/features/process/overlay/models/buildOverlayPanelModel.test.mjs` | node test | panel truthfulness | not rerun in this pass | keep | `cd frontend && node --test src/features/process/overlay/models/buildOverlayPanelModel.test.mjs` |
| session-meta boundary | `frontend/src/features/session-meta/sessionMetaBoundary.test.mjs` | node test | draw.io/BPMN boundary | not rerun in this pass | yes | `cd frontend && node --test src/features/session-meta/sessionMetaBoundary.test.mjs` |

### 3.3 Browser / e2e

| Test/check | Location | Type | Covers what | Current status | Must keep? | How to run |
|---|---|---|---|---|---|---|
| draw.io regression gate | `scripts/drawio_regression_gate.sh` + `docs/drawio-regression-gate.md` | scripted gate | load-bearing draw.io subset | existing gate in repo, not rerun in this pass | yes | `./scripts/drawio_regression_gate.sh --browser` |
| draw.io fresh-session closure | `frontend/e2e/drawio-fresh-session-closure.spec.mjs` | browser e2e | fresh placement + panel truth + re-enter test | **partially blocked** | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-fresh-session-closure.spec.mjs` |
| draw.io browser runtime anchoring | `frontend/e2e/drawio-browser-runtime-anchoring.spec.mjs` | browser e2e | viewport anchoring / transform parity | previously green, not rerun in this pass | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-browser-runtime-anchoring.spec.mjs` |
| draw.io runtime tool placement | `frontend/e2e/drawio-runtime-tool-placement.spec.mjs` | browser e2e | session-first create/edit flows | previously green, not rerun in this pass | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-runtime-tool-placement.spec.mjs` |
| invite flow enterprise | `frontend/e2e/invite-flow-enterprise.spec.mjs` | browser e2e | admin invite -> public activate -> auto login | previously green, not rerun in this pass | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/invite-flow-enterprise.spec.mjs` |
| org settings invites audit | `frontend/e2e/org-settings-invites-audit.spec.mjs` | browser e2e | org/admin invite UI | previously green, not rerun in this pass | keep | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/org-settings-invites-audit.spec.mjs` |
| accept invite enterprise | `frontend/e2e/accept-invite-enterprise.spec.mjs` | browser e2e | public invite acceptance path | not rerun in this pass | keep | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/accept-invite-enterprise.spec.mjs` |
| explorer/session-open flows | `frontend/e2e/workspace-dashboard-smoke.spec.mjs`, `workspace-home-ux.spec.mjs`, `create-project-and-session.spec.mjs` | browser e2e | explorer/project/session navigation | not rerun in this pass | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 npx playwright test <spec>` |

### 3.4 Draw.io re-enter explicit inventory entry

| Test/check | Location | Type | Covers what | Current status | Must keep? | How to run |
|---|---|---|---|---|---|---|
| re-enter initial visibility | `frontend/e2e/drawio-fresh-session-closure.spec.mjs` | browser e2e | create -> leave -> re-enter -> visible before first interaction | **code seam fixed; browser proof partially blocked by current session-open harness on evolved explorer UI** | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-fresh-session-closure.spec.mjs --grep \"re-enter: persisted overlay is visible immediately\"` |
| re-enter fix helper | `frontend/e2e/helpers/diagramReady.mjs` | harness helper | session-open helper used by the re-enter proof | partially adapted, still noisy | yes | travels with the spec |
| re-enter runtime fix | `frontend/src/components/process/BpmnStage.jsx` | product code | emits settled canvas snapshot after BPMN import/fit | code present | yes | product code must ship |

## 4. Keep / exclude matrix

| Path/pattern | Keep/Exclude | Why | Working-product relevance | Notes |
|---|---|---|---|---|
| `backend/**` | keep | running API source | critical | include modified + untracked modules |
| `frontend/**` | keep | running frontend source | critical | include explorer and draw.io working tree |
| `deploy/nginx/default.conf` | keep | running gateway config | critical | used by Docker now |
| `docker-compose.yml` | keep | current runtime orchestration | critical | source of Docker truth |
| `Dockerfile`, `frontend/Dockerfile` | keep | build sources | critical | used by compose build |
| `.env.example`, `deploy/.env.server.example` | keep | safe env templates | critical | do not commit real `.env` |
| `scripts/drawio_regression_gate.sh` | keep | draw.io acceptance gate | critical | must travel |
| `frontend/e2e/drawio-fresh-session-closure.spec.mjs` | keep | re-enter proof path | critical | partially blocked, still must travel |
| `frontend/e2e/helpers/diagramReady.mjs` | keep | e2e session-open helper | critical | linked to re-enter proof |
| `frontend/src/components/process/BpmnStage.jsx` | keep | re-enter code fix | critical | known-risk item |
| `workspace/processes/.keep` | keep | skeleton runtime dir | useful | do not ship live data |
| `workspace/processes/*` | exclude | runtime data | no | excluded by `.gitignore` |
| `workspace/.session_store/**` | exclude | runtime data/cache | no | excluded |
| `node_modules/`, `frontend/node_modules/` | exclude | rebuild on target | no | excluded |
| `dist/`, `build/` | exclude | rebuild on target | no | excluded |
| `test-results/`, `frontend/test-results/`, `playwright-report/` | exclude | ephemeral test artifacts | no | excluded |
| `.env` | exclude | secret/local runtime config | no | excluded |
| `archive/`, `backups/`, `zip/`, `artifacts/` | exclude | local packs/junk/runtime outputs | no | excluded |

## 5. Git packaging plan

### What must be committed from current working state

1. all current backend code used by Docker bind mount
2. all current frontend code used by Docker bind mount
3. startup decomposition files under `backend/app/startup/`
4. legacy compatibility/routing files under `backend/app/legacy/`
5. modular router slices:
   - `org_invites`
   - `org_listing`
   - `org_members`
6. current explorer implementation:
   - `frontend/src/features/explorer/**`
7. current invite/auth/admin UI
8. current draw.io working set, explicitly including:
   - `frontend/src/components/process/BpmnStage.jsx`
   - `frontend/e2e/drawio-fresh-session-closure.spec.mjs`
   - `frontend/e2e/helpers/diagramReady.mjs`

### Risky/unmerged items

The following are known working-tree-only areas that must not be lost when packaging:

- all files listed in:
  - `docs/migration/working_state_modified_vs_head_20260310.txt`
  - `docs/migration/working_state_untracked_20260310.txt`

### Baseline tag plan

1. Stage only keep-set files from current Docker-working tree.
2. Commit as:
   - `migration/docker-truth-baseline`
3. Tag:
   - `server-migration-baseline-2026-03-10`
4. Do not tag until:
   - frontend build passes
   - backend import/health checks pass
   - core backend tests pass
   - known-risk note is recorded

## 6. Deployment bundle

Included bundle artifacts:

- [deploy/.env.server.example](/Users/mac/PycharmProjects/foodproc_process_copilot/deploy/.env.server.example)
- [deploy/scripts/server_bootstrap.sh](/Users/mac/PycharmProjects/foodproc_process_copilot/deploy/scripts/server_bootstrap.sh)
- [deploy/scripts/server_first_deploy.sh](/Users/mac/PycharmProjects/foodproc_process_copilot/deploy/scripts/server_first_deploy.sh)
- [deploy/scripts/server_update.sh](/Users/mac/PycharmProjects/foodproc_process_copilot/deploy/scripts/server_update.sh)
- [deploy/scripts/server_smoke.sh](/Users/mac/PycharmProjects/foodproc_process_copilot/deploy/scripts/server_smoke.sh)
- [deploy/ROLLBACK.md](/Users/mac/PycharmProjects/foodproc_process_copilot/deploy/ROLLBACK.md)

## 7. Step-by-step migration plan

### Phase A — Docker forensic extraction

1. Freeze current Docker-working tree.
2. Capture:
   - running containers
   - compose config
   - bind mounts
   - working-tree delta vs `HEAD`
3. Record known partially-proven items:
   - draw.io re-enter fix

### Phase B — Git packaging

1. Review modified/untracked keep-set.
2. Do not commit:
   - `.env`
   - runtime data
   - test artifacts
3. Commit working Docker truth as baseline.
4. Tag baseline.

### Phase C — Server bootstrap

1. Clone repo on server.
2. Run:
   - `deploy/scripts/server_bootstrap.sh`
3. Fill `.env`.
4. Run:
   - `deploy/scripts/server_first_deploy.sh`

### Phase D — Server smoke

1. `deploy/scripts/server_smoke.sh`
2. manual acceptance:
   - login
   - org/workspace listing
   - invite create / public resolve
   - project/session open
   - draw.io fresh path
   - draw.io re-enter manual check

### Phase E — Update flow

1. `git fetch --tags --all`
2. `deploy/scripts/server_update.sh <tag-or-commit>`
3. rerun smoke

### Phase F — Rollback flow

1. checkout previous tag
2. rerun update script on previous tag
3. if schema/data incompatible:
   - restore DB backup
4. rerun smoke

## 8. Known risks / acceptance gaps

### Draw.io re-enter visibility

Status:
- exact root cause found
- code fix present
- unit/build checks green
- browser proof still partially blocked by the current session-open harness on evolved explorer UI

Affected files:
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/e2e/drawio-fresh-session-closure.spec.mjs`
- `frontend/e2e/helpers/diagramReady.mjs`

Migration impact:
- does **not** block Git packaging or first server deploy
- must be carried as an explicit known risk
- must be re-checked after deploy with:
  - manual re-enter test
  - then harness cleanup as follow-up

### Additional note

`merge/main` is unavailable as a local ref, so Docker-working tree truth is authoritative here by necessity, not preference.
