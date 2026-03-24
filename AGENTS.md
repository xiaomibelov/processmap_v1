# AGENTS.md

## Purpose

This file is the binding operational contract for any agent working in this repository.

Do not mix:

- code truth
- runtime truth
- data truth
- product truth

---

## Branch Policy

- Canonical merge branch is `main` only.
- Start new work from up-to-date `main`.
- Allowed short-lived branches only: `fix/*`, `feat/*`, `refactor/*`, `release/*`, `hotfix/*`, `cutover/*`.
- Local `main` must match `origin/main`; resolve divergence before any branch cleanup.
- Never delete a branch with unique commits without archive proof first.
- Clean local git before remote: archive-first, then delete proven-safe stale branches.
- Do not touch the current branch, active worktree branches, or manually-classified active branches.
- After merge, delete local and remote branch unless there is explicit archival value.
- Do not create a second "truth" in release/hotfix branches; final truth lives only in `main`.

---

## Core laws

- Clean worktree before implementation, commit, push, release, or deploy.
- Never push from dirty tree.
- Dirty tree is audit-only.
- Bounded changes only.
- No broad refactor without proven ownership.
- No mixed contours in one change set.
- No improvisation on live prod.
- Technical smoke is not product acceptance.
- If a fatal red flag appears during cutover: rollback once and stop.

## Project operating model

### Product contours

- Backend: `backend/`
- Frontend: `frontend/`
- Base compose/runtime: `docker-compose.yml`
- Source-root overlay: `docker-compose.source-root.yml`
- Deploy/ops layer: `deploy/`

### Serving contours

This project has multiple serving modes and they must never be mentally mixed:

- **Dev / Vite serving**
- frontend dev server
- HMR / WebSocket behavior
- **Prod-like / static gateway serving**
- gateway image
- nginx config
- static asset serving
- prod/stage serving overlays

A release is not prod-ready unless it is validated in a serving mode materially matching prod.

### Operational contours

Release-critical operational files include:

- `Dockerfile.gateway.prod`
- `frontend/Dockerfile`
- `docker-compose.prod.yml`
- `docker-compose.ssl.yml`
- `docker-compose.prod.gateway.yml`
- `docker-compose.stage.yml`
- `docker-compose.stage.prodlike.yml`
- `deploy/nginx/*`
- `deploy/scripts/*`

These files are part of release truth whenever the release depends on them.

### Runtime/data truth

These are not product code and must not be treated as release source-of-truth:

- `workspace/`
- `backend/workspace/`
- `.session_store/`
- postgres data mounts / volumes
- runtime release directories under `/opt/processmap/releases/...` on servers

### Important runtime fact

`docker-compose.yml` bind-mounts source code and workspace.

This means runtime behavior depends on:

- mounted source roots
- mounted data roots

not only on Git history.

---

## Runtime Source Truth Before Validation

Before any validation or verdict, prove:

1. intended repo / branch / SHA
2. actual served frontend source
3. actual served backend source
4. workspace mount truth
5. DB truth
6. env / compose truth
7. serving truth

If intended truth != actual served truth:

- verdict = `BLOCKED`
- next step = source/runtime repair only

---

## Release type law

Only two release types are allowed:

### `full-product`

- full product acceptance required

### `bounded-contour`

- narrow technical rollout only
- must never be reported as full-product success

If acceptance expects full product behavior, release type must be `full-product`.

---

## Release contract

Before any stage or prod action, a release contract is mandatory.

It must include:

- release name
- owner
- rollback owner
- datetime
- baseline SHA
- release SHA
- release type
- include / delete / exclude manifests
- acceptance contract
- code / workspace / db / env / serving planes
- operational contract
- rollback contract
- gate verdict

Without release contract: `BLOCKED`

---

## Build reproducibility law

Build reproducibility is part of release truth.

The following must agree:

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/.npmrc`
- `frontend/Dockerfile`
- actual Docker install policy

Rules:

- local success does not matter if Docker build fails
- install policy must be explicit
- release is not prod-ready if clean Docker build is not reproducible

---

## Serving contour law

App contour and serving contour must not live in different truths.

If release depends on gateway/static/nginx/prod compose files, they must either:

1. be inside the release contour, or
2. be explicitly classified as reused operational contract

Rules:

- no serving drift
- no config collision ambiguity
- exactly one effective gateway config must be provable from `docker compose config`
- effective nginx listen config must match published/proxied port behavior

---

## Fresh stage only

No overlay on dirty, mixed, or contaminated stage.

Fresh stage must use:

- baseline export
- exact delta apply
- checksum parity
- explicit operational contract

Stage order:

1. release contract
2. fresh release dir
3. parity proof
4. five truth planes
5. build/tests
6. recreate + health
7. smoke
8. auth
9. product acceptance
10. preservation proof
11. verdict

---

## Stage validation hierarchy

Validation order is strict:

1. source truth
2. build/tests
3. technical smoke
4. auth proof
5. product acceptance
6. preservation proof
7. verdict

Rules:

- `/api/meta = 200` is not success
- containers up != success
- page load alone != sign-off

---

## Canonical route and HMR law

- Raw route mismatch must not be auto-classified as product failure.
- Example: `/app` vs `/app/`
- If canonical user-facing route works, classify separately as blocker / warning / tech debt.

- Vite/HMR/WebSocket noise is not automatically a blocker.
- Classify it only by proven user-facing impact.

---

## Prod-like stage law

A release is not prod-ready unless stage validation uses a serving mode materially matching prod.

If prod uses static/gateway serving:

- Vite-only stage green is insufficient

---

## Fresh prod prepare

Prod cutover is forbidden until prod prepare proves:

1. current live prod truth
2. preservation boundaries
3. fresh prepared release dir from exact approved SHA
4. checksum parity
5. mount truth
6. serving truth
7. rollback readiness

### Bind-mount law

Prepared release dir must physically satisfy all compose bind-mount source paths before cutover.

You must prove:

1. path exists
2. path resolves to preserved target
3. compose resolution shows that exact path
4. cutover switches only code plane, not data plane

Without this: `BLOCKED`

---

## Prod cutover order

Allowed order only:

1. pre-cutover lock
2. pre-cutover checkpoint
3. API switch
4. API health wait
5. gateway/static switch
6. public smoke window
7. auth proof
8. core product flows
9. preservation proof
10. verdict

If public availability, auth, or core flows fail:

- rollback once
- stop

---

## Rollback law

Rollback must be:

- release-switch based
- non-destructive by default
- single-pass
- terminal
- idempotent
- proven before cutover

Forbidden:

- repeated rollback/recreate loops
- continuing validation after rollback trigger
- multiple rollback attempts in one run

After rollback:

- smoke
- auth
- DB sanity
- workspace/auth/session preservation
- stop

---

## Incident lane

If cutover already left prod on prepared release and smoke/auth are green:

- do not re-cutover
- do not restart full release cycle

Do:

1. fix rollback path
2. fix false-negative acceptance gates
3. re-arm rollback
4. validate current live state
5. either finalize or rollback once

---

## Mixed-root prod risk

If live prod uses multiple release roots:

- this is a risk signal
- truth audit is mandatory
- do not assume prod truth is obvious

---

## Canonical server model

Use canonical server model only:

- `/opt/processmap/releases/current`
- `/opt/processmap/releases/previous`
- `/opt/processmap/releases/prepared`
- `/opt/processmap/data/prod/*`
- `/opt/processmap/data/stage/*`
- `/opt/processmap/env/prod.env`
- `/opt/processmap/env/stage.env`

Do not reintroduce mixed-root runtime.

---

## Change discipline

1. read-only audit
2. exact scope and ownership proof
3. minimal bounded diff
4. validation with source truth proof
5. manifest-based reporting

Rules:

- do not touch shared/frozen files without necessity proof
- do not mix backend/frontend/deploy churn without reason
- do not do speculative cleanup during release contour work

---

## Worktree and branch hygiene

### Contamination

- unrelated modified files
- untracked debug/temp/report artifacts
- mixed contours in one diff
- runtime/generated artifacts in release branch

### Rules

- implementation/commit/push only from clean intended tree
- dirty tree is audit-only
- before commit/push always capture:
- `git status -sb`
- `git diff --name-status <baseline>..HEAD`
- release must have explicit include/delete/exclude manifests

---

## Local-only auth

Local-only validation credential:

- email: `admin@local`
- password: `admin`

Rules:

- local only unless runtime truth proves otherwise
- never assume this works on stage or prod
- stage/prod auth must use explicitly proven environment-specific accounts

---

## Repo-critical files

Handle with special care:

- `Dockerfile.gateway.prod`
- `frontend/Dockerfile`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/.npmrc`
- `docker-compose.yml`
- `docker-compose.source-root.yml`
- `docker-compose.prod.yml`
- `docker-compose.ssl.yml`
- `docker-compose.prod.gateway.yml`
- `docker-compose.stage.yml`
- `docker-compose.stage.prodlike.yml`
- `deploy/nginx/*`
- `deploy/scripts/*`
- `workspace/`
- `backend/workspace/`
- `.session_store/`

---

## Required report format

Every serious run must report:

- `SECTION 1 — Runtime/source truth`
- `SECTION 2 — Scope/diff manifest`
- `SECTION 3 — Files changed`
- `SECTION 4 — Validation performed`
- `SECTION 5 — Risks / preservation / rollback status`
- `SECTION 6 — Final verdict`

Allowed verdicts:

- `GO TO STAGE`
- `GO TO PROD PREPARE`
- `GO TO PROD CUTOVER READY`
- `GO TO PROD CUTOVER COMPLETE`
- `ROLLED BACK`
- `HOLD`
- `BLOCKED`

---

## Anti-patterns

- wrong runtime source validation
- bounded contour reported as full-product
- overlay on contaminated stage
- no release contract
- no parity proof
- no mount-truth proof
- no rollback proof
- Vite-only stage green treated as prod-ready
- serving contour outside release truth
- missing bind-mount source paths in prepared release dir
- ambiguous gateway config collisions
- raw route mismatch treated as automatic outage
- HMR noise treated as automatic blocker
- false-negative acceptance gates
- repeated rollback loops
- mixing code truth with data truth
- push from dirty tree
- temp/debug artifacts in release branch
- stale release/hotfix branches treated as second product truth

---

## Deploy Execution Contract

### SECTION 1 — Must Know Before Deploy

1. Prove runtime/source truth first:
   - intended repo/worktree, branch, SHA
   - actual served frontend/backend source
   - workspace truth
   - DB truth
   - env truth
   - serving truth
   If intended truth != actual truth: `BLOCKED`.

2. Declare release type before any action:
   - `full-product`
   - `bounded-contour`
   Never report bounded-contour as full-product success.

3. Release contract is mandatory before stage/prod:
   - release identity
   - baseline SHA
   - release SHA
   - include/delete/exclude manifests
   - acceptance list
   - code/workspace/db/env/serving planes
   - operational contract
   - rollback contract

4. Prove clean Docker build reproducibility:
   - `package.json`
   - `package-lock.json`
   - `.npmrc`
   - Dockerfile install/build policy
   must be consistent.

5. Use canonical server model only:
   - `/opt/processmap/releases/current`
   - `/opt/processmap/releases/previous`
   - `/opt/processmap/releases/prepared`
   - `/opt/processmap/data/prod/*`
   - `/opt/processmap/data/stage/*`
   - `/opt/processmap/env/prod.env`
   - `/opt/processmap/env/stage.env`
   No mixed-root runtime.

6. Prod candidate stage must be prod-like:
   - not Vite-only
   - same class of serving contour as prod

7. Before prod cutover, prove prod-prepare truth:
   - current/previous/prepared truth
   - env truth
   - data truth
   - mount truth
   - gateway truth
   - rollback readiness

8. Enforce bind-mount law:
   - prepared release physically contains all bind-mount source paths
   - paths exist
   - paths resolve correctly
   - compose resolution matches
   - cutover switches code plane only

9. Cutover order is fixed.
   On fatal red flag:
   - rollback once
   - stop

10. Rollback proof must be non-destructive before cutover.
    Rollback execution must be:
   - single-pass
   - terminal
   - idempotent

11. Credentials law:
   - `admin@local / admin` is local-only unless explicitly proven otherwise
   - stage/prod require proven environment-specific validation account

12. If `prepared == current`, agent must explicitly classify the run as:
   - incident/stabilization lane
   - not a normal new deploy

---

### SECTION 2 — Final Deploy Prompt

You are deploy-agent. Follow this contract exactly.

#### MISSION

Execute stage/prod deploy decisions safely.

Rules:

- no improvisation on live
- no mixed-root runtime
- no success claims without proof chain

#### STEP 0 — PRECHECK (MANDATORY)

Prove:

- intended repo/worktree, branch, SHA
- actual served frontend source
- actual served backend source
- workspace truth
- DB truth
- env truth
- serving truth:
  - `/`
  - `/app`
  - `/app/`
  - `/admin`
  - `/api/meta`
  - effective gateway config

If intended truth != actual truth:

- verdict = `BLOCKED`

#### STEP 1 — RELEASE CONTRACT (MANDATORY)

Declare release type:

- `full-product`
- `bounded-contour`

Create release contract with:

- release identity
- baseline SHA
- release SHA
- include/delete/exclude manifests
- acceptance list
- code/workspace/db/env/serving planes
- operational contract
- rollback contract

If missing or incomplete:

- verdict = `BLOCKED`

#### STEP 2 — AUTH VALIDATION CONTRACT

Before stage/prod validation, explicitly prove:

- which validation account is being used
- which environment it belongs to
- why it is valid for that environment

Rules:

- `admin@local / admin` is local-only unless runtime truth proves otherwise
- do not guess stage/prod credentials

If validation account truth is missing:

- verdict = `HOLD`

#### STEP 3 — BUILD REPRODUCIBILITY

Prove clean Docker build reproducibility.

Validate consistency of:

- `package.json`
- `package-lock.json`
- `.npmrc`
- Dockerfiles
- install/build policy

If not reproducible:

- verdict = `HOLD`

#### STEP 4 — STAGE GATE

Rules:

- no overlay on dirty/contaminated stage
- fresh stage only
- prod-candidate stage must be prod-like, not Vite-only

Validation order:

1. source truth
2. build/tests
3. smoke
4. auth
5. product flows
6. preservation proof

If stage green and run is stage-only:

- verdict = `GO TO STAGE`

If stage green and candidate is for prod:

- continue to prod prepare

If stage not green:

- verdict = `HOLD` or `BLOCKED`

#### STEP 5 — PROD PREPARE GATE

Prove all of the following:

- current live prod truth
- `/opt/processmap/releases/current|previous|prepared` truth
- env truth: `/opt/processmap/env/prod.env`
- data truth: `/opt/processmap/data/prod/*`
- mount truth:
  - source paths exist
  - source paths resolve correctly
  - compose resolution matches
- effective gateway config truth:
  - exactly one effective config
- rollback readiness:
  - non-destructive verification
  - command construction proof

Rules:

- in a normal deploy, `prepared` must be a new candidate distinct from `current`
- if `prepared == current`, classify run explicitly as incident/stabilization lane

If any proof missing:

- verdict = `HOLD`

If all green:

- verdict = `GO TO PROD CUTOVER READY`

#### STEP 6 — PROD CUTOVER (ONLY THIS ORDER)

1. pre-cutover lock
2. checkpoint
3. API switch
4. API health wait
5. gateway switch
6. public smoke window
7. auth
8. core flows
9. preservation proof
10. verdict

If fatal red flag appears at any point:

- rollback once
- stop
- verdict = `ROLLED BACK`

#### STEP 7 — ROLLBACK LAW

Rollback proof and rollback execution are separate things.

Rollback proof before cutover must be:

- non-destructive
- side-effect free

Rollback execution on failure must be:

- single-pass
- terminal
- idempotent

After rollback:

- smoke
- auth
- DB/workspace/session preservation checks
- stop

#### STEP 8 — INCIDENT LANE

If prod is already on prepared release and smoke/auth are green:

- do not re-cutover
- do not restart a full deploy cycle
- first fix:
  - rollback path defects
  - false-negative acceptance gates
- then:
  - finalize
  - or rollback once

#### FINAL VERDICTS (ONLY)

- `GO TO STAGE`
- `GO TO PROD PREPARE`
- `GO TO PROD CUTOVER READY`
- `GO TO PROD CUTOVER COMPLETE`
- `ROLLED BACK`
- `HOLD`
- `BLOCKED`
