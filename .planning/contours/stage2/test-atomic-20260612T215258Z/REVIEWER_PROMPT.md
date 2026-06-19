# Agent 3 (Reviewer) — Contour: stage2/test-atomic-20260612T215258Z

## Mission
Independently verify the Worker's evidence for the atomic stage-2 contour lifecycle test. Do not approve without confirming the artifact, the clean product tree, and the complete reports.

## Pre-Flight Checklist
- [ ] `cd /opt/processmap-test`
- [ ] Read `PLAN.md` and `WORKER_PROMPT.md`
- [ ] Read `STATE.json` to confirm Worker status
- [ ] Read `WORKER_REPORT.md`

## Independent Verification Steps

### 1. Source truth cross-check
Run:

```bash
cd /opt/processmap-test
git branch --show-current
git rev-parse HEAD
git status -sb
git diff --name-only
git diff --cached --name-only
git diff --check
```

Confirm the values match the Worker's recorded source truth and that no tracked files are modified.

### 2. Artifact verification
Check the contour directory:

```bash
cd /opt/processmap-test/.planning/contours/stage2/test-atomic-20260612T215258Z
ls -la ATOMIC_TEST_ARTIFACT.txt ATOMIC_TEST_ARTIFACT.txt.ready
cat ATOMIC_TEST_ARTIFACT.txt
```

Confirm:
- File exists and is readable.
- Content is exactly `stage2 atomic ok <short-sha>` where `<short-sha>` matches `git rev-parse --short HEAD`.
- `.ready` marker exists.

### 3. Scope containment
Run:

```bash
cd /opt/processmap-test
git status --porcelain
```

Confirm any untracked files are inside `.planning/contours/stage2/test-atomic-20260612T215258Z/` only.

### 4. Cross-check reports
- `WORKER_REPORT.md` covers source truth, artifact evidence, git validation, and explicit unchanged areas.
- `STATE.json` has `worker_status` set to `complete`.

## Approval Criteria
- All `PLAN.md` acceptance criteria are met.
- Product tree is unchanged (no diff, no staged changes).
- Artifact content is deterministic and matches current HEAD short SHA.
- Worker report is complete and factual.

## Outcome
- **PASS** → `REVIEW_REPORT.md` + `REVIEW_PASS`
- **FAIL** → `REVIEW_REPORT.md` + `CHANGES_REQUESTED` + `REWORK_REQUEST.md`
- **BLOCKED** → `REVIEW_BLOCKED.md`

## Deliverables
- `REVIEW_REPORT.md` with verdict (`PASS`, `FAIL`, or `BLOCKED`)
- Updated `STATE.json` with `reviewer_status: "complete"` or `"blocked"`
- `REVIEW_PASS` or `CHANGES_REQUESTED` marker (never both)

Post: `./tools/pm-agent-mirror-report.sh "stage2/test-atomic-20260612T215258Z" reviewer`
