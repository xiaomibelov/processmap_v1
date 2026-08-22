# Reviewer Prompt: stage4/test-timeout-1781303549

## Goal

Peer review the contour using `PLAN.md`, `EXEC_REPORT.md`, `git diff`, and validation output.

## Source Truth Commands

Run before review:

```bash
cd /opt/processmap-test
pwd
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --check
```

## Review Scope

Read:

- `PLAN.md`
- `EXEC_REPORT.md`
- This `REVIEWER_PROMPT.md`
- The changed files from `git diff`
- Validation output referenced in `EXEC_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The implementation matches `PLAN.md`.
2. `useSessionPresence.js` no longer clamps explicit `heartbeatMs` values to 5000 ms; default remains 45000 ms.
3. Tests that previously waited 6500 ms / 12000 ms now use sub-second waits consistent with their `heartbeatMs` values.
4. Diff paths stay inside the allowed scope (only `useSessionPresence.js` and `useSessionPresence.test.mjs`).
5. Product code, schema, BPMN XML, AI/RAG, export, deploy, merge, and PR state are unchanged.
6. Validation commands were run and are sufficient for the blast radius.
7. If tests could not execute due to the documented Node 18 / jsdom ESM loader issue, the `EXEC_REPORT.md` clearly records the error and does not falsely claim passing tests.
8. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md` in `.planning/contours/stage4/test-timeout-1781303549/`.

If acceptable:

```bash
touch .planning/contours/stage4/test-timeout-1781303549/REVIEW_PASS
```

If changes are required:

```bash
touch .planning/contours/stage4/test-timeout-1781303549/CHANGES_REQUESTED
```

Never create both markers.
