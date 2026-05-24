# EXECUTOR PART 1 — release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1

- run_id: `20260521T111303Z-90132`
- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- agent: Agent 2 / Executor
- mode: SINGLE_EXECUTOR_MODE (substantive work)

## Source Truth (verify before starting)

| Check | Command | Expected |
|-------|---------|----------|
| pwd | `pwd` | `/opt/processmap-test` |
| branch | `git branch --show-current` | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `git rev-parse HEAD` | `f01dd66588f2b896b4c212bb49c797ac7617e6f2` |
| origin/main | `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| tree clean | `git status -sb` | no modified tracked files |

If any fact differs, STOP and report divergence.

## Task A — Verify Current State

1. Confirm the branch is `feature/process-properties-registry-backend-contract-v1`.
2. Confirm HEAD is `f01dd66` (or newer if additional commits were made).
3. Confirm `origin/main` is `d805e1c` (or newer if main moved).
4. Run tests to confirm no regressions:
   ```bash
   cd /opt/processmap-test/frontend
   node --test src/components/process/analysis/ProcessAnalyticsHub.test.mjs src/components/process/analysis/ProductActionsRegistryPanel.test.mjs
   ```
   Must be 23/23 pass.
5. Confirm `frontend/dist/build-info.json` exists and has `dirty: false`.

## Task B — Request User Approval for Merge

**CRITICAL: Do NOT merge without explicit user "yes".**

1. Present the user with:
   - Branch: `feature/process-properties-registry-backend-contract-v1`
   - Commits to merge:
     ```
     f01dd66 chore(build): regenerate build-info.json for v1.0.141
     dd1c535 fix(explorer): add analytics hub navigation entry
     29550c7 test: fix ProductActionsRegistryPanel and ProcessAnalyticsHub test assertions
     6f2d23f chore(version): bump to v1.0.140 for staging
     6205e0e feat: consolidate process properties registry frontend contract and analytics hub wiring
     ```
   - Diff stat vs main: `git diff --stat origin/main`
   - Tests: 23/23 pass
   - Review status: `REVIEW_PASS`
2. Ask: "Approve merge to main? (yes/no)"
3. If user says **no** or anything other than **yes**, STOP and document in `EXEC_REPORT.md`.
4. If user says **yes**, proceed to Task C.

## Task C — Merge to Main

```bash
cd /opt/processmap-test
git fetch origin
git checkout main
git pull origin main
# If main moved, verify the branch is still mergeable:
git merge --ff-only feature/process-properties-registry-backend-contract-v1
# If ff-only fails, use:
# git merge feature/process-properties-registry-backend-contract-v1 --no-edit
git push origin main
```

After merge, record:
- New main HEAD
- `git log --oneline -3`
- `git status -sb`

## Task D — Deploy to Stage

1. Use existing deploy scripts:
   ```bash
   cd /opt/processmap-test
   # Check available stage deploy commands
   ls deploy/scripts/
   ```
2. Run the appropriate stage deploy (e.g., `deploy/scripts/server_update.sh` or documented stage flow).
3. If the deploy script requires a specific `.env.stage`, check if it exists and create from `.env.example` if needed.
4. Record deploy output.

## Task E — Runtime Verification

1. Verify stage responds:
   ```bash
   curl -I http://clearvestnic.ru:5180
   ```
   Expected: HTTP 200, fresh `Last-Modified`.
2. Verify build-info:
   ```bash
   curl -s http://clearvestnic.ru:5180/build-info.json | jq .
   ```
   Expected: `currentVersion` or version marker indicates `v1.0.141`, `dirty: false`.
3. If verification fails, document and STOP. Do NOT promote further.

## Task F — 5-Plane Proof

Record in `EXEC_REPORT.md`:

| Plane | Evidence |
|-------|----------|
| Code | `main` HEAD contains merged branch commits |
| Workspace | `/opt/processmap-test` on `main` branch, clean tree |
| DB | No schema changes required |
| Env/Compose | Stage deploy completed, containers running |
| Serving mode | `curl -I http://clearvestnic.ru:5180` returns HTTP 200 with fresh headers |

## Rules
- Do NOT merge without explicit user "yes".
- Do NOT deploy to prod — stage only.
- If any step fails, document and STOP.
- Keep changes minimal — this is promotion only, no product code changes.
