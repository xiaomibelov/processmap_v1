# Reviewer Prompt: __CONTOUR_ID__

## Goal

Peer review the contour using `PLAN.md`, `EXEC_REPORT.md`, `git diff`, and runtime proof.

## Source Truth Commands

Run before review:

```bash
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
- Runtime proof referenced in `EXEC_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks

1. The implementation matches `PLAN.md`.
2. Diff paths stay inside the allowed scope.
3. Product code, schema, BPMN XML, AI/RAG, export, deploy, merge, and PR state are unchanged unless explicitly allowed.
4. Validation commands were run and are sufficient for the blast radius.
5. Runtime proof is present or correctly marked not applicable.
6. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

## Output

Write `REVIEW_REPORT.md`.

If acceptable:

```bash
touch REVIEW_PASS
```

If changes are required:

```bash
touch CHANGES_REQUESTED
```

Never create both markers.
