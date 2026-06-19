# Agent 2 (Worker) — Contour: stage2/test-atomic-20260612T215258Z

## Mission
Execute the atomic stage-2 contour lifecycle test described in `PLAN.md`. You are the sole Worker; there is no other Agent 2.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` fully
- [ ] Record baseline source truth in `WORKER_REPORT.md`:
  - `git branch --show-current`
  - `git rev-parse HEAD`
  - `git status -sb`
  - `git diff --name-only`
  - `git diff --cached --name-only`

## Environment
- Contour directory: `.planning/contours/stage2/test-atomic-20260612T215258Z/`
- Working directory for all commands: `/opt/processmap-test`

## Tasks

### 1. Source truth
Record the commands and their outputs verbatim (or summarize) in `WORKER_REPORT.md`.

### 2. Create atomic artifact
Inside the contour directory, run:

```bash
cd /opt/processmap-test/.planning/contours/stage2/test-atomic-20260612T215258Z
SHORT_SHA=$(git -C /opt/processmap-test rev-parse --short HEAD)
cat > ATOMIC_TEST_ARTIFACT.txt.tmp <<INNER
stage2 atomic ok ${SHORT_SHA}
INNER
mv ATOMIC_TEST_ARTIFACT.txt.tmp ATOMIC_TEST_ARTIFACT.txt
touch ATOMIC_TEST_ARTIFACT.txt.ready
```

Verify:
- `ATOMIC_TEST_ARTIFACT.txt` exists
- Its content is exactly `stage2 atomic ok <short-sha>`
- `ATOMIC_TEST_ARTIFACT.txt.ready` exists

### 3. Git-state validation
Run and record results:

```bash
cd /opt/processmap-test
git diff --name-only
git diff --cached --name-only
git diff --check
git status --porcelain
```

Acceptance:
- `git diff --name-only` and `git diff --cached --name-only` are empty.
- `git diff --check` reports no whitespace errors.
- Any new untracked files are confined to `.planning/contours/stage2/test-atomic-20260612T215258Z/`.

### 4. Write `WORKER_REPORT.md`
Include:
- Source truth
- Artifact creation steps and evidence
- Git-state validation results
- Explicit unchanged areas
- Remaining risks (if any)

### 5. Update `STATE.json`
Set `worker_status` to `complete` or `blocked` with a short `reason`.

### 6. Create marker
```bash
touch /opt/processmap-test/.planning/contours/stage2/test-atomic-20260612T215258Z/WORKER_DONE
```

## Constraints
- **NO product code changes.**
- **NO merge / deploy / PR.**
- Use atomic writes only (`cat > file.tmp; mv file.tmp file; touch file.ready`).
- If git state shows unexpected changes to tracked files, mark `BLOCKED` and halt.

## Deliverables
- `ATOMIC_TEST_ARTIFACT.txt`
- `ATOMIC_TEST_ARTIFACT.txt.ready`
- `WORKER_REPORT.md`
- Updated `STATE.json`
- `WORKER_DONE` marker
