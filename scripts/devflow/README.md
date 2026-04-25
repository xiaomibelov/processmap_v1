# Local Devflow Packaging

`scripts/devflow/package_contour.sh` is the blessed local packaging path for bounded contour work.

It exists for one reason: agent work should not depend on a clean canonical checkout, ad hoc shell history, or throwaway `/tmp` scripts.

## Contract

The script packages bounded work from a local terminal with these guarantees:

- prefers `git worktree` bootstrap from a clean repo root
- falls back to a clean clone when:
  - the repo root is dirty
  - `git worktree` creation is blocked
  - `.git/worktrees` is not usable in the current environment
- reuses an existing clean worktree or clone path when one is already present
- runs `git diff --check` by default plus any contour-specific validation commands
- stages only declared paths unless `--add-all` is explicitly requested
- stops on validation failure before commit
- stops on push failure before PR creation
- attempts PR creation through `gh` by default when enough metadata is present
- reports exact push/PR blockers instead of fake success
- emits both:
  - a human-readable summary
  - a machine-readable JSON summary

## Required tools

- `git`
- `bash`
- `gh` only when you want automatic PR creation
- contour-specific tools such as `node`, `npm`, or test runners only when your validation commands need them

## Recommended usage

```bash
scripts/devflow/package_contour.sh \
  --repo-root /Users/mac/PycharmProjects/processmap_canonical_main \
  --branch ops/canonicalize-local-packaging-and-pr-flow-v1 \
  --base origin/main \
  --worktree-path /Users/mac/PycharmProjects/processmap_canonical_main/.worktrees/ops_canonicalize_local_packaging_and_pr_flow_v1 \
  --clone-path /tmp/processmap_ops_canonicalize_local_packaging_pr_flow_v1 \
  --commit-message "ops(devflow): canonicalize local packaging and PR flow" \
  --pr-title "ops(devflow): canonicalize local packaging and PR flow" \
  --pr-body-file /tmp/ops-canonicalize-local-packaging-and-pr-flow-v1.pr.md \
  --validate "git diff --check" \
  --validate "bash -n scripts/devflow/package_contour.sh" \
  --validate "shellcheck scripts/devflow/package_contour.sh" \
  --add-path scripts/devflow/package_contour.sh \
  --add-path scripts/devflow/README.md \
  --summary-file /tmp/ops-canonicalize-local-packaging-and-pr-flow-v1.summary.txt
```

## Bootstrap policy

Default policy is `worktree-first`.

The script will skip worktree mutation and go directly to clone fallback when the repo root is dirty. This is deliberate. A dirty canonical checkout is not a safe execution base.

To bypass worktree attempts entirely:

```bash
scripts/devflow/package_contour.sh ... --bootstrap-mode clone-only
```

## Validation policy

Default baseline:

- `git diff --check`

You can repeat `--validate` as many times as needed. Any failure stops packaging before commit.

## Staging policy

Preferred:

- explicit `--add-path` entries

Allowed only when intentional:

- `--add-all`

The script does not silently stage unrelated changes unless `--add-all` is set.

## PR behavior

PR creation is attempted by default only after a successful push.

If `gh` is missing, unauthenticated, or blocked, the script:

- does not fake PR success
- records the blocker
- writes an exact manual `gh pr create ...` command into the summaries

Use `--skip-pr` when you want commit/push only.

## Summary artifacts

Every run writes:

- human-readable summary:
  - `--summary-file`
- machine-readable JSON summary:
  - `--summary-json-file`
  - defaults to a sibling `.json` next to the text summary

Both success and failure paths write summaries.

Summary fields include:

- bootstrap path used
- repo root cleanliness
- validation commands
- staged paths
- commit SHA
- push status
- PR status / PR URL
- exact blocker
- exact manual next commands

## Honest blocker examples

`gh` unauthenticated:

- `pr_status=blocked`
- blocker explains `gh` auth failure
- summary includes a manual `gh pr create` command

GitHub DNS or SSH blocked during push:

- `push_status=blocked`
- script stops before PR creation
- summary includes the exact `git push -u ...` retry command

Validation failure:

- no commit
- no push
- blocker points to the exact failed validation command

## Why this is the blessed path

This script is the repo-local answer to the current ProcessMap constraints:

- canonical repo may be dirty
- worktree creation may be blocked
- GitHub auth/network may be unreliable

The goal is not to pretend those constraints do not exist. The goal is to package bounded work truthfully anyway.
