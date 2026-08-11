# Docker Egress Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the proven Docker `DOCKER-USER` egress fix reproducible and persistent without changing application code.

**Architecture:** Add a repo-owned, idempotent host script that detects the default outbound interface and known ProcessMap Docker bridge networks, then applies or rolls back only the required `DOCKER-USER` forwarding rules. Add a systemd unit template that runs the script after Docker/UFW, plus runbook documentation with verification and rollback.

**Tech Stack:** Bash, Docker CLI, iptables, systemd, Node.js `node --test` static contract tests.

---

### Task 1: Contract Test

**Files:**
- Create: `deploy/scripts/processmap_docker_egress_persist.test.mjs`
- Create: `deploy/scripts/processmap_docker_egress_persist.sh`
- Create: `deploy/systemd/processmap-docker-egress.service`

- [ ] **Step 1: Write the failing test**

Create `deploy/scripts/processmap_docker_egress_persist.test.mjs` with assertions that the script and systemd unit exist and encode the safety contract: `apply`, `rollback`, `verify`, `DOCKER-USER`, `iptables -C`, default route detection, known stage/prod Docker networks, and `After=docker.service ufw.service network-online.target`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test deploy/scripts/processmap_docker_egress_persist.test.mjs`
Expected: FAIL because the implementation files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create an idempotent Bash script:
- `apply`: detect `ip route show default`, resolve Docker bridge names for `app_default`, `processmap_stage_default`, `processmap_edge_net`, `docker0`, `docker5`, and insert missing `DOCKER-USER` rules with `iptables -C || iptables -I`.
- `rollback`: remove only those exact rules with `iptables -D` loops.
- `verify`: print default interface, bridges, `DOCKER-USER`, and attempt DNS/TCP checks from prod and stage API containers without changing containers.

Create a systemd unit:
- `Type=oneshot`
- `RemainAfterExit=yes`
- `After=docker.service ufw.service network-online.target`
- `ExecStart=/opt/processmap/app/deploy/scripts/processmap_docker_egress_persist.sh apply`
- `ExecStop=/opt/processmap/app/deploy/scripts/processmap_docker_egress_persist.sh rollback`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test deploy/scripts/processmap_docker_egress_persist.test.mjs`
Expected: PASS.

- [ ] **Step 5: Shell syntax check**

Run: `bash -n deploy/scripts/processmap_docker_egress_persist.sh`
Expected: exit 0.

### Task 2: Runbook

**Files:**
- Modify: `DEPLOY_RUNBOOK.md`

- [ ] **Step 1: Document install**

Add a "Docker egress persistence" section covering prerequisites, backup, install commands, verification commands, and the explicit note that Docker daemon restart requires an approved maintenance window because prod and stage share the daemon.

- [ ] **Step 2: Document rollback**

Add exact rollback commands:
`systemctl disable --now processmap-docker-egress.service`
and
`/opt/processmap/app/deploy/scripts/processmap_docker_egress_persist.sh rollback`.

- [ ] **Step 3: Verify docs mention the backup path**

Ensure the runbook references `/opt/processmap/backup/network-20260811-124357/runtime-fix-rollback-20260811-132311.sh` as the existing runtime rollback artifact.

### Task 3: PR Verification

**Files:**
- Test: `deploy/scripts/processmap_docker_egress_persist.test.mjs`

- [ ] **Step 1: Run focused tests**

Run:
`node --test deploy/scripts/processmap_docker_egress_persist.test.mjs && bash -n deploy/scripts/processmap_docker_egress_persist.sh`

- [ ] **Step 2: Confirm branch scope**

Run:
`git status -sb && git diff --stat origin/main...HEAD`

- [ ] **Step 3: Commit and push**

Run:
`git add deploy/scripts/processmap_docker_egress_persist.test.mjs deploy/scripts/processmap_docker_egress_persist.sh deploy/systemd/processmap-docker-egress.service DEPLOY_RUNBOOK.md docs/superpowers/plans/2026-08-11-docker-egress-persistence.md`
`git commit -m "ops(network): persist docker egress rules"`
`git push -u origin ops/docker-egress-persistence`

### Step 1 Server Application Gate

Do not restart Docker daemon or apply new persistent firewall state without an approved maintenance window. The PR can be merged first; installing the unit and restarting Docker are operational changes on a host shared by prod and stage.
