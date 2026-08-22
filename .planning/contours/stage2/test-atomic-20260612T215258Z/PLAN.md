# Contour: stage2/test-atomic-20260612T215258Z

## 1. Objective
Validate the atomic stage-2 multi-agent handoff and contour-lifecycle machinery with a minimal, non-destructive test. The Worker creates a deterministic atomic artifact inside the contour directory, confirms that no product code or tracked files are modified, and produces a reusable report. The Reviewer independently verifies the artifact and the unchanged working tree.

## 2. Bounded Scope
- **In scope:**
  - Atomic file creation discipline inside `.planning/contours/stage2/test-atomic-20260612T215258Z/`.
  - Git-state verification: no changes to tracked product files, no staged changes.
  - `STATE.json` lifecycle transitions (`worker_status`, `reviewer_status`).
  - `WORKER_REPORT.md` and `REVIEW_REPORT.md` production.
- **Out of scope:**
  - Product frontend/backend code.
  - DB/schema changes.
  - BPMN XML, AI/RAG, export, deploy logic.
  - Merge, PR, or release operations.
  - UI/runtime navigation or Playwright tests.

## 3. Source Truth
- Repo: `/opt/processmap-test`
- Remote: `origin git@github.com:xiaomibelov/processmap_v1.git`
- Branch: `analitics/analytics_work`
- HEAD: `1fb821cb99207c12c59eb1aab05f30d02eae7730`
- HEAD short SHA: `1fb821cb`
- Base truth (`origin/main`): `8757b231fa32a027e2810dc487bb561a086e9c7f`
- Status: dirty (unrelated untracked files present); no staged changes; no tracked-file modifications.

## 4. Acceptance Criteria
| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Source truth recorded | `git branch --show-current`, `git rev-parse HEAD`, `git status -sb`, `git diff --name-only`, `git diff --cached --name-only` captured in `WORKER_REPORT.md` |
| 2 | Atomic artifact created | `ATOMIC_TEST_ARTIFACT.txt` exists in contour directory with exact content `stage2 atomic ok <HEAD short sha>` |
| 3 | Atomic write discipline used | Artifact created via temp-file + `mv` + marker (`ATOMIC_TEST_ARTIFACT.txt.ready`) |
| 4 | Product tree unchanged | `git diff --name-only` and `git diff --cached --name-only` are empty |
| 5 | Scope containment | New untracked files are limited to `.planning/contours/stage2/test-atomic-20260612T215258Z/` |
| 6 | Worker report complete | `WORKER_REPORT.md` includes source truth, artifact evidence, validation results |
| 7 | Reviewer independently verifies | `REVIEW_REPORT.md` confirms artifact content and clean product tree |
| 8 | State file updated | `STATE.json` reflects `worker_status` and `reviewer_status` |

## 5. Execution Steps
1. Capture source truth (`git branch --show-current`, `git rev-parse HEAD`, `git status -sb`, `git diff --name-only`, `git diff --cached --name-only`).
2. Compute short HEAD SHA.
3. Create `ATOMIC_TEST_ARTIFACT.txt` atomically:
   - `cat > ATOMIC_TEST_ARTIFACT.txt.tmp <<'INNER'` with content `stage2 atomic ok <short-sha>`
   - `mv ATOMIC_TEST_ARTIFACT.txt.tmp ATOMIC_TEST_ARTIFACT.txt`
   - `touch ATOMIC_TEST_ARTIFACT.txt.ready`
4. Verify artifact content and marker presence.
5. Verify product tree is unchanged:
   - `git diff --name-only` must be empty
   - `git diff --cached --name-only` must be empty
   - `git diff --check` reports no whitespace errors
   - New files outside contour directory must be absent (compare against pre-flight `git status --porcelain`)
6. Write `WORKER_REPORT.md`.
7. Update `STATE.json` with `worker_status: "complete"` or `"blocked"`.
8. Create marker `WORKER_DONE`.

## 6. Validation
- `git diff --check`
- `git diff --name-only` and `git diff --cached --name-only` empty
- Artifact content matches expected deterministic string
- Marker file exists

## 7. Runtime Proof
Runtime proof: not applicable. This is a planning/Git-state atomic test.

## 8. Review Inputs
- `PLAN.md`
- `WORKER_REPORT.md`
- `git diff` (expected empty for product files)
- `ATOMIC_TEST_ARTIFACT.txt` and `.ready` marker
- `STATE.json`

## 9. Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Working tree has unrelated changes | Worker records baseline status; only the contour directory may gain new files |
| Artifact collision | Use deterministic content derived from HEAD SHA; overwrite not expected |
| Reviewer cannot read artifact | Artifact is a plain-text file inside the contour directory |

## 10. Handoff Marker
Agent 2 waits for: `READY_FOR_EXECUTION` directory marker present in `.planning/contours/stage2/test-atomic-20260612T215258Z/`.
