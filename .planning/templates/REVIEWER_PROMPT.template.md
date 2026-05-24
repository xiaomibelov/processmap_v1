# Reviewer Prompt: __CONTOUR_ID__

## Goal

Peer review the contour using `PLAN.md`, `WORKER_REPORT.md`, `git diff`, and runtime proof.

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
- `WORKER_REPORT.md`
- This `REVIEWER_PROMPT.md`
- The changed files from `git diff`
- Runtime proof referenced in `WORKER_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Reviewer runtime proof shortcut

Use:

```bash
node tools/stage-open-session-proof.mjs analysis
node tools/stage-open-session-proof.mjs diagram
```

Use proof JSON fields in `REVIEW_REPORT.md`:
`loaded`, `url`, `hasErrorBoundary`, `activeTabMarkers`, `tabProof`, `consoleErrorCount`.

Do not spend review context rediscovering login, organization, workspace, project, session, or tab paths unless direct session proof fails or `PLAN.md` explicitly asks for navigation coverage.

## Checks

1. The implementation matches `PLAN.md`.
2. Diff paths stay inside the allowed scope.
3. Product code, schema, BPMN XML, AI/RAG, export, deploy, merge, and PR state are unchanged unless explicitly allowed.
4. Validation commands were run and are sufficient for the blast radius.
5. Runtime proof is present or correctly marked not applicable.
6. `WORKER_REPORT.md` is short, factual, and reusable by the next agent.

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
