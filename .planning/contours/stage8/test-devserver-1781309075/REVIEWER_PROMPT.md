# Reviewer Prompt: stage8/test-devserver-1781309075

## Goal

Peer review the runtime smoke-test contour using `PLAN.md`, `EXEC_REPORT.md`, `RUNTIME_PROOF_CHECKLIST.md`, `RUNTIME_NAVIGATION.md`, and the raw probe output.

## Source Truth Commands

Run before review:

```bash
cd /opt/processmap-test
git fetch origin
pwd
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git status -sb
git diff --name-only
git diff --check
git log --oneline -5
```

## Review Scope

Read:

- `PLAN.md`
- `EXEC_REPORT.md`
- `RUNTIME_PROOF_CHECKLIST.md`
- `RUNTIME_NAVIGATION.md`
- This `REVIEWER_PROMPT.md`
- Raw probe output referenced in `EXEC_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The execution matches `PLAN.md`.
2. No product source code was changed.
3. No unrelated files are staged or committed.
4. No merge, rebase, push, PR, deploy, or release artifacts are present.
5. Source truth was captured before the probe.
6. The probe targeted `http://localhost:5177/`.
7. If reachable:
   - HTTP status line shows `200 OK`.
   - `Date` header is recorded verbatim.
   - `Content-Type: text/html` is present.
   - Response body is non-empty.
   - `Cache-Control: no-cache, no-store, must-revalidate` (or equivalent anti-cache headers) is present.
8. If unreachable:
   - The failure is recorded verbatim.
   - The report explicitly states the result is environment-dependent and not a product defect.
   - The worker did **not** modify product code or start the server.
9. `RUNTIME_PROOF_CHECKLIST.md` contains checked evidence items.
10. `RUNTIME_NAVIGATION.md` describes the endpoint and any fallback tool used.
11. `STATE.json` is updated with the execution state.
12. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/stage8/test-devserver-1781309075/`.

If acceptable:

```bash
touch .planning/contours/stage8/test-devserver-1781309075/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage8/test-devserver-1781309075/CHANGES_REQUESTED
```

Never create both markers.
