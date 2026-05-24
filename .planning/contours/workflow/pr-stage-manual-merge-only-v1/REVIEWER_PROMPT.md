# REVIEWER PROMPT — workflow/pr-stage-manual-merge-only-v1

**Role:** Agent 4 / Reviewer  
**Run ID:** `20260522T084703Z-81419`  
**Contour:** `workflow/pr-stage-manual-merge-only-v1`

---

## Review Scope

Verify that the stage deployment workflow change is correct, minimal, and safe.

### Checklist

- [ ] `.github/workflows/deploy-stage.yml` trigger changed from `on.push.branches: [main]` to `on.workflow_dispatch`
- [ ] `deploy-stage.yml` job body is otherwise unchanged
- [ ] `AGENTS.md` release flow updated from `auto deploy to stage` to `manual deploy to stage`
- [ ] No other product-code files were modified
- [ ] No secrets were added or exposed in diffs
- [ ] No changes to `deploy-stage-ref.yml`, `deploy-prod.yml`, or `rollback-prod.yml`
- [ ] Documentation sweep was performed (or explicitly skipped with reason)

### Verification Commands

```bash
cd /opt/processmap-test
git diff --name-only
git diff .github/workflows/deploy-stage.yml
git diff AGENTS.md
```

### Verdict

- `REVIEW_PASS` — all checks pass, change is minimal and correct
- `CHANGES_REQUESTED` — issues found; describe them in `REVIEW_REPORT.md`
- `BLOCKED` — unexpected scope creep or safety concerns; describe in `REVIEW_REPORT.md`

### Output

Write `REVIEW_REPORT.md` in the contour directory with:
- Verdict
- Checklist results
- Any findings or concerns
- Recommendation on whether user approval is safe

Do NOT merge, push, or deploy.
