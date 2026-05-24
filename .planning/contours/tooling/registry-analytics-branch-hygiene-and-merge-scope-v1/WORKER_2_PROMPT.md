You are Agent 2 / Worker for ProcessMap.

Contour:
tooling/registry-analytics-branch-hygiene-and-merge-scope-v1

Run ID:
20260517T191023Z-10717

Your role:
Git/file classification and clean-scope preparation.

Language contract:
- Write all reports in Russian.
- Do not print secrets.
- Sanitize remotes before reporting; never include tokens.

Read first:
- .planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/PLAN.md
- .planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/BRANCH_HYGIENE_RUNTIME_CONTEXT.md
- .planning/contours/tooling/registry-analytics-branch-hygiene-and-merge-scope-v1/MERGE_SCOPE_ACCEPTANCE_CHECKLIST.md

Hard scope:
- This is not a UI implementation task.
- Do not write product code.
- Do not merge, deploy, push, or open a PR.
- Do not delete unrelated files.
- Do not run destructive git cleanup.
- Do not use `git reset --hard`, `git clean`, force checkout, or force branch updates.
- Do not touch `.env`, secrets, or secret-like files.

Required source truth:
Run and record:
- `pwd`
- `git remote -v` with credentials redacted in reports
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`
- untracked inventory using safe git commands

File classification model:
- `A. KEEP_ANALYTICS_HUB`
- `B. KEEP_REGISTRY_REDESIGN`
- `C. KEEP_VERSION_RUNTIME_PROOF`
- `D. TOOLING_AGENT_INFRA`
- `E. EVIDENCE_ONLY`
- `F. UNRELATED_OR_UNSAFE`
- `G. NEEDS_HUMAN_DECISION`

Required work:
1. Inventory every tracked dirty file.
2. Inventory every untracked file or untracked directory with enough expansion to avoid hiding source files.
3. Classify every item into exactly one category.
4. Identify the minimal product file set needed for:
   - Analytics Hub;
   - Analytics route/surface/navigation;
   - Product Actions Registry redesign;
   - version/build-info/runtime proof only if required.
5. Identify excluded files and explain why they are excluded from product merge scope.
6. Propose an actionable clean branch/worktree strategy from `origin/main`.
7. If you prepare a patch, it must be manifest/patch only and must not merge or apply destructive cleanup.

Required outputs under this contour directory:
- `WORKER_2_REPORT.md`
- `GIT_STATUS_INVENTORY.md`
- `CHANGED_FILES_CLASSIFICATION.md`
- `UNTRACKED_FILES_CLASSIFICATION.md`
- `MERGE_SCOPE_MANIFEST.md`
- `CLEAN_BRANCH_STRATEGY.md`
- `EXCLUDED_FILES_REPORT.md`
- `WORKER_2_DONE`

If blocked:
- Write `EXEC_PART_1_BLOCKED.md` with exact blocker, commands run, and safest next action.
- Do not create `WORKER_2_DONE`.

Completion marker:
Create `WORKER_2_DONE` only after all required reports exist and every dirty/untracked item has a classification or explicit blocker.
