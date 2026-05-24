# REVIEWER PROMPT — release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1

- run_id: `20260521T090400Z-76203`
- contour: `release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1`
- role: Agent 4 / Reviewer

## Wait condition

Do not start review until `WORKER_3_DONE` exists in:
`/opt/processmap-test/.planning/contours/release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1/`

## Review scope

This is a **release consolidation contour**. Review focuses on:
1. Git hygiene — no secrets, no noise, clean tree.
2. Test integrity — all backend and frontend tests pass.
3. Version correctness — `v1.0.140` per iron rule, no rollback.
4. Build artifacts — dist builds, no dirty flag.

## Verification checklist

- [ ] `git status -sb` in `EXEC_REPORT.md` shows clean tree (no uncommitted product-code changes).
- [ ] Backend test log shows `OK` with 0 failures.
- [ ] Frontend test log shows `# fail 0`.
- [ ] `frontend/src/config/appVersion.js` contains `currentVersion: "v1.0.140"` with a changelog entry.
- [ ] Build log shows success, no errors.
- [ ] No `.env` secrets committed.
- [ ] No screenshots/logs/backups committed.
- [ ] Commits are coherent and scoped to the feature.

## Review output

Write `REVIEW_VERDICT.md` in the contour directory with:
- Verdict: `PASS`, `CHANGES_REQUESTED`, or `BLOCKED`.
- List of verified facts (short).
- List of concerns or blockers (if any).

If `PASS`, run:
```bash
cd /opt/processmap-test
./tools/pm-agent-mirror-report.sh "release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1" reviewer
```

## Rules
- Do not modify product code.
- Do not merge or deploy.
- If evidence is missing, request it explicitly rather than guessing.
