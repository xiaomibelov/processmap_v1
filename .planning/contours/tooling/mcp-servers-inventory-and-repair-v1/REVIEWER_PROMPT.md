# Reviewer Prompt: tooling/mcp-servers-inventory-and-repair-v1

## Goal
Peer review the contour using `PLAN.md`, `EXEC_REPORT.md`, `MCP_HEALTH_MATRIX.md`, `git diff`, and runtime proof.

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
- `REVIEWER_PROMPT.md`
- `MCP_HEALTH_MATRIX.md`
- Changed files from `git diff`
- Runtime proof referenced in `EXEC_REPORT.md`

Do not read all Obsidian history. Obsidian is archive context, not the control plane.

## Checks
1. The implementation matches `PLAN.md`.
2. Diff paths stay inside the allowed scope (no product code changes).
3. `~/.kimi/mcp.json` is valid JSON and contains all required MCP servers.
4. GSD runner is accessible via `PATH`.
5. Obsidian vault is non-empty.
6. Validation commands were run and are sufficient for the blast radius.
7. Runtime proof is present or correctly marked not applicable.
8. `EXEC_REPORT.md` is short, factual, and reusable by the next agent.

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
