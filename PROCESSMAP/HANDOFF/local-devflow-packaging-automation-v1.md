# local-devflow-packaging-automation-v1

## Old behavior

- contour packaging depended on agent sandbox write access to `.git/FETCH_HEAD`, `.git/worktrees`, and remote network/auth
- when worktree bootstrap failed, packaging often stopped before commit/push/PR
- there was no single local script that logged bootstrap path, validation commands, commit SHA, push result, and PR status

## New behavior

- local packaging is handled by `scripts/devflow/package_contour.sh`
- bootstrap strategy is:
  1. worktree first
  2. fresh clone fallback second
- the script can reuse an existing worktree/clone path or create one if missing
- validations are explicit and contour-specific via repeated `--validate`
- staging is explicit via repeated `--add-path` or `--add-all`
- successful packaging produces:
  - commit
  - push
  - optional PR create attempt
  - summary file with exact outcomes

## Workflow names / tooling seams

- local script:
  - `scripts/devflow/package_contour.sh`
- stage workflows referenced during design:
  - `.github/workflows/deploy-stage.yml`
  - `.github/workflows/deploy-stage-ref.yml`
- prod workflow intentionally untouched:
  - `.github/workflows/deploy-prod.yml`

## Bootstrap rules

- preferred:
  - `git fetch origin`
  - `git worktree add <path> <base>`
- fallback:
  - `git clone --no-hardlinks <repo_root> <clone_path>`
  - reset `origin` to the canonical remote URL
  - `git checkout -B <branch> <base>`

## Validation contract

- default includes `git diff --check`
- contour can append targeted tests and build commands with repeated `--validate`
- any failed validation stops packaging before commit

## PR behavior

- PR creation is optional
- requires:
  - `gh` installed
  - `gh auth status` passing
  - GitHub remote URL
  - PR title
- if any of these fail, the script records the exact blocker instead of reporting fake success

## Validation performed

- source map of stage/prod workflows and existing deploy scripts
- script implemented with worktree-first + clone fallback
- local dry-run scenarios planned:
  - worktree bootstrap path
  - clone fallback path
  - validation failure stop
  - success path with commit/push

## Rollback

- revert the automation script/doc PR
- no product logic is changed by this contour
