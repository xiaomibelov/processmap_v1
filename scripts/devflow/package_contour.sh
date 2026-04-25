#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/devflow/package_contour.sh [options]

Required:
  --repo-root PATH              Canonical repo root used for bootstrap discovery
  --branch NAME                 Target contour branch name
  --commit-message MSG          Commit message to use after validation passes

Optional:
  --base REF                    Base ref for workspace bootstrap (default: origin/main)
  --bootstrap-mode MODE         worktree-first (default) or clone-only
  --worktree-path PATH          Preferred worktree path to create/reuse
  --clone-path PATH             Fallback clone path to create/reuse
  --validate CMD                Validation command (repeatable, runs in workspace)
  --add-path PATH               Path to stage on success (repeatable)
  --add-all                     Stage all repo changes instead of explicit paths
  --pr-title TITLE              PR title for optional gh pr create
  --pr-body TEXT                PR body text for optional gh pr create
  --pr-body-file PATH           PR body file for optional gh pr create
  --skip-pr                     Skip gh pr create even after successful push
  --summary-file PATH           Write human-readable summary to this file
  --summary-json-file PATH      Write machine-readable JSON summary to this file
  --origin-remote NAME          Git remote to use (default: origin)
  --help                        Show this help

Behavior:
  - prefers git worktree bootstrap from a clean repo root
  - falls back to clone bootstrap when worktree creation is blocked or repo root is dirty
  - runs git diff --check by default plus any extra validation commands
  - stages only declared paths unless --add-all is used
  - stops on validation, commit, push, or PR blockers without fake success
  - emits human-readable and machine-readable summaries on both success and failure
EOF
}

log() {
  echo "[package_contour] $*"
}

json_escape() {
  local s="${1-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '"%s"' "$s"
}

branch_name_from_ref() {
  local ref="$1"
  case "$ref" in
    refs/heads/*) printf '%s\n' "${ref#refs/heads/}" ;;
    origin/*) printf '%s\n' "${ref#origin/}" ;;
    *) printf '%s\n' "$ref" ;;
  esac
}

sanitize_branch_name() {
  printf '%s' "$1" | tr '/:' '__'
}

git_top_or_empty() {
  git -C "$1" rev-parse --show-toplevel 2>/dev/null || true
}

repo_is_clean() {
  [ -z "$(git -C "$1" status --porcelain)" ]
}

record_blocker() {
  local message="${1:-unknown failure}"
  BLOCKER="$message"
  STATUS="failed"
  log "ERROR: $message"
}

fail() {
  record_blocker "$1"
  exit 1
}

write_human_summary() {
  local summary_path="${SUMMARY_FILE:-}"
  [ -n "$summary_path" ] || return 0
  mkdir -p "$(dirname "$summary_path")"
  {
    echo "status: $STATUS"
    echo "bootstrap path: $BOOTSTRAP_PATH"
    echo "repo root: $REPO_ROOT"
    echo "workspace path: $WORKSPACE_PATH"
    echo "branch: $BRANCH"
    echo "base ref: $BASE_REF"
    echo "bootstrap mode: $BOOTSTRAP_MODE"
    echo "repo root clean: $REPO_ROOT_CLEAN"
    echo "fetch status: $FETCH_STATUS"
    echo "commit sha: $COMMIT_SHA"
    echo "push status: $PUSH_STATUS"
    echo "pr status: $PR_STATUS"
    echo "pr url: $PR_URL"
    echo "blocker: $BLOCKER"
    echo
    echo "validation commands:"
    for cmd in "${VALIDATE_CMDS[@]}"; do
      echo "  - $cmd"
    done
    echo
    echo "staged paths:"
    if [ "$ADD_ALL" = "1" ]; then
      echo "  - <all>"
    else
      for path in "${ADD_PATHS[@]}"; do
        echo "  - $path"
      done
    fi
    echo
    echo "manual next commands:"
    [ -n "$MANUAL_CLONE_BOOTSTRAP_COMMAND" ] && echo "  bootstrap_clone: $MANUAL_CLONE_BOOTSTRAP_COMMAND"
    [ -n "$MANUAL_PUSH_COMMAND" ] && echo "  push: $MANUAL_PUSH_COMMAND"
    [ -n "$MANUAL_PR_COMMAND" ] && echo "  pr: $MANUAL_PR_COMMAND"
  } >"$summary_path"
  return 0
}

write_json_array() {
  local first="1"
  local item
  printf '['
  for item in "$@"; do
    [ "$first" = "1" ] || printf ','
    first="0"
    json_escape "$item"
  done
  printf ']'
}

write_json_summary() {
  local summary_path="${SUMMARY_JSON_FILE:-}"
  [ -n "$summary_path" ] || return 0
  mkdir -p "$(dirname "$summary_path")"
  {
    printf '{\n'
    printf '  "status": %s,\n' "$(json_escape "$STATUS")"
    printf '  "bootstrap_path": %s,\n' "$(json_escape "$BOOTSTRAP_PATH")"
    printf '  "repo_root": %s,\n' "$(json_escape "$REPO_ROOT")"
    printf '  "workspace_path": %s,\n' "$(json_escape "$WORKSPACE_PATH")"
    printf '  "branch": %s,\n' "$(json_escape "$BRANCH")"
    printf '  "base_ref": %s,\n' "$(json_escape "$BASE_REF")"
    printf '  "bootstrap_mode": %s,\n' "$(json_escape "$BOOTSTRAP_MODE")"
    printf '  "repo_root_clean": %s,\n' "$(json_escape "$REPO_ROOT_CLEAN")"
    printf '  "fetch_status": %s,\n' "$(json_escape "$FETCH_STATUS")"
    printf '  "commit_sha": %s,\n' "$(json_escape "$COMMIT_SHA")"
    printf '  "push_status": %s,\n' "$(json_escape "$PUSH_STATUS")"
    printf '  "pr_status": %s,\n' "$(json_escape "$PR_STATUS")"
    printf '  "pr_url": %s,\n' "$(json_escape "$PR_URL")"
    printf '  "blocker": %s,\n' "$(json_escape "$BLOCKER")"
    printf '  "validation_commands": %s,\n' "$(write_json_array "${VALIDATE_CMDS[@]}")"
    if [ "$ADD_ALL" = "1" ]; then
      printf '  "staged_paths": ["<all>"],\n'
    else
      printf '  "staged_paths": %s,\n' "$(write_json_array "${ADD_PATHS[@]}")"
    fi
    printf '  "manual_next_commands": {\n'
    printf '    "bootstrap_clone": %s,\n' "$(json_escape "$MANUAL_CLONE_BOOTSTRAP_COMMAND")"
    printf '    "push": %s,\n' "$(json_escape "$MANUAL_PUSH_COMMAND")"
    printf '    "pr": %s\n' "$(json_escape "$MANUAL_PR_COMMAND")"
    printf '  }\n'
    printf '}\n'
  } >"$summary_path"
  return 0
}

write_summary() {
  write_human_summary
  write_json_summary
}

ensure_existing_workspace() {
  local path="$1"
  [ -d "$path" ] || return 1
  local top
  top="$(git_top_or_empty "$path")"
  [ -n "$top" ] || fail "existing workspace is not a git repo: $path"

  local status_output
  status_output="$(git -C "$path" status --porcelain)"
  if [ -n "$status_output" ]; then
    fail "existing workspace is dirty: $path"
  fi

  git -C "$path" remote set-url "$ORIGIN_REMOTE" "$REMOTE_URL" || true
  git -C "$path" fetch "$ORIGIN_REMOTE" >/dev/null 2>&1 || true
  git -C "$path" checkout -B "$BRANCH" "$BASE_REF"
  WORKSPACE_PATH="$path"
}

run_validation() {
  local cmd
  for cmd in "${VALIDATE_CMDS[@]}"; do
    log "validation: $cmd"
    if ! (cd "$WORKSPACE_PATH" && bash -lc "$cmd"); then
      fail "validation failed: $cmd"
    fi
  done
}

build_manual_commands() {
  local base_branch
  base_branch="$(branch_name_from_ref "$BASE_REF")"
  MANUAL_CLONE_BOOTSTRAP_COMMAND="git clone --no-hardlinks \"$REPO_ROOT\" \"$CLONE_PATH\" && git -C \"$CLONE_PATH\" remote set-url \"$ORIGIN_REMOTE\" \"$REMOTE_URL\" && git -C \"$CLONE_PATH\" fetch \"$ORIGIN_REMOTE\" && git -C \"$CLONE_PATH\" checkout -B \"$BRANCH\" \"$BASE_REF\""
  if [ -n "$WORKSPACE_PATH" ]; then
    MANUAL_PUSH_COMMAND="git -C \"$WORKSPACE_PATH\" push -u \"$ORIGIN_REMOTE\" \"$BRANCH\""
  fi
  if [ -n "$PR_TITLE" ]; then
    if [ -n "$PR_BODY_FILE" ]; then
      MANUAL_PR_COMMAND="cd \"$WORKSPACE_PATH\" && gh pr create --base \"$base_branch\" --head \"$BRANCH\" --title \"$PR_TITLE\" --body-file \"$PR_BODY_FILE\""
    elif [ -n "$PR_BODY" ]; then
      MANUAL_PR_COMMAND="cd \"$WORKSPACE_PATH\" && gh pr create --base \"$base_branch\" --head \"$BRANCH\" --title \"$PR_TITLE\" --body \"$PR_BODY\""
    else
      MANUAL_PR_COMMAND="cd \"$WORKSPACE_PATH\" && gh pr create --base \"$base_branch\" --head \"$BRANCH\" --title \"$PR_TITLE\" --fill"
    fi
  fi
}

create_pr_if_possible() {
  if [ "$SKIP_PR" = "1" ]; then
    PR_STATUS="skipped_by_flag"
    return 0
  fi

  if ! command -v gh >/dev/null 2>&1; then
    PR_STATUS="blocked"
    BLOCKER="${BLOCKER:-gh CLI is not installed}"
    log "PR skipped: gh CLI is not installed"
    return 0
  fi

  if ! gh auth status >/dev/null 2>&1; then
    PR_STATUS="blocked"
    BLOCKER="${BLOCKER:-gh is not authenticated}"
    log "PR skipped: gh is not authenticated"
    return 0
  fi

  local repo_slug
  repo_slug="$(printf '%s' "$REMOTE_URL" | sed -E 's#(git@github.com:|https://github.com/)##; s#\\.git$##')"
  if [[ "$repo_slug" != */* ]]; then
    PR_STATUS="blocked"
    BLOCKER="${BLOCKER:-origin remote is not a GitHub repository URL}"
    log "PR skipped: origin remote is not a GitHub slug"
    return 0
  fi

  if [ -z "$PR_TITLE" ]; then
    PR_STATUS="blocked"
    BLOCKER="${BLOCKER:-PR title is required when PR creation is enabled}"
    log "PR skipped: missing --pr-title"
    return 0
  fi

  local base_branch
  base_branch="$(branch_name_from_ref "$BASE_REF")"
  local pr_output=""
  local pr_rc=0
  local tmp_body=""
  if [ -n "$PR_BODY_FILE" ]; then
    pr_output="$(cd "$WORKSPACE_PATH" && gh pr create --repo "$repo_slug" --base "$base_branch" --head "$BRANCH" --title "$PR_TITLE" --body-file "$PR_BODY_FILE" 2>&1)" || pr_rc=$?
  elif [ -n "$PR_BODY" ]; then
    tmp_body="$(mktemp /tmp/package_contour_pr_body.XXXXXX)"
    printf '%s\n' "$PR_BODY" >"$tmp_body"
    pr_output="$(cd "$WORKSPACE_PATH" && gh pr create --repo "$repo_slug" --base "$base_branch" --head "$BRANCH" --title "$PR_TITLE" --body-file "$tmp_body" 2>&1)" || pr_rc=$?
    rm -f "$tmp_body"
  else
    pr_output="$(cd "$WORKSPACE_PATH" && gh pr create --repo "$repo_slug" --base "$base_branch" --head "$BRANCH" --title "$PR_TITLE" --fill 2>&1)" || pr_rc=$?
  fi

  if [ "$pr_rc" -ne 0 ]; then
    PR_STATUS="blocked"
    BLOCKER="${BLOCKER:-$pr_output}"
    log "PR creation blocked: $pr_output"
    return 0
  fi

  PR_URL="$(printf '%s\n' "$pr_output" | tail -n 1)"
  PR_STATUS="created"
}

REPO_ROOT=""
BRANCH=""
BASE_REF="origin/main"
BOOTSTRAP_MODE="worktree-first"
WORKTREE_PATH=""
CLONE_PATH=""
COMMIT_MESSAGE=""
PR_TITLE=""
PR_BODY=""
PR_BODY_FILE=""
SUMMARY_FILE=""
SUMMARY_JSON_FILE=""
ORIGIN_REMOTE="origin"
ADD_ALL="0"
SKIP_PR="0"
REMOTE_URL=""
BOOTSTRAP_PATH="uninitialized"
WORKSPACE_PATH=""
FETCH_STATUS="not_run"
STATUS="running"
BLOCKER=""
COMMIT_SHA=""
PUSH_STATUS="not_run"
PR_STATUS="not_run"
PR_URL=""
REPO_ROOT_CLEAN="unknown"
MANUAL_CLONE_BOOTSTRAP_COMMAND=""
MANUAL_PUSH_COMMAND=""
MANUAL_PR_COMMAND=""
declare -a VALIDATE_CMDS=()
declare -a ADD_PATHS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --base) BASE_REF="$2"; shift 2 ;;
    --bootstrap-mode) BOOTSTRAP_MODE="$2"; shift 2 ;;
    --worktree-path) WORKTREE_PATH="$2"; shift 2 ;;
    --clone-path) CLONE_PATH="$2"; shift 2 ;;
    --commit-message) COMMIT_MESSAGE="$2"; shift 2 ;;
    --pr-title) PR_TITLE="$2"; shift 2 ;;
    --pr-body) PR_BODY="$2"; shift 2 ;;
    --pr-body-file) PR_BODY_FILE="$2"; shift 2 ;;
    --summary-file) SUMMARY_FILE="$2"; shift 2 ;;
    --summary-json-file) SUMMARY_JSON_FILE="$2"; shift 2 ;;
    --origin-remote) ORIGIN_REMOTE="$2"; shift 2 ;;
    --validate) VALIDATE_CMDS+=("$2"); shift 2 ;;
    --add-path) ADD_PATHS+=("$2"); shift 2 ;;
    --add-all) ADD_ALL="1"; shift ;;
    --skip-pr) SKIP_PR="1"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

trap write_summary EXIT

[ -n "$REPO_ROOT" ] || fail "--repo-root is required"
[ -n "$BRANCH" ] || fail "--branch is required"
[ -n "$COMMIT_MESSAGE" ] || fail "--commit-message is required"
[ -d "$REPO_ROOT" ] || fail "repo root does not exist: $REPO_ROOT"

case "$BOOTSTRAP_MODE" in
  worktree-first|clone-only) ;;
  *) fail "--bootstrap-mode must be worktree-first or clone-only" ;;
esac

if [ "$ADD_ALL" != "1" ] && [ "${#ADD_PATHS[@]}" -eq 0 ]; then
  fail "at least one --add-path or --add-all is required"
fi

if [ -n "$PR_BODY" ] && [ -n "$PR_BODY_FILE" ]; then
  fail "use either --pr-body or --pr-body-file, not both"
fi

if [ "${#VALIDATE_CMDS[@]}" -eq 0 ]; then
  VALIDATE_CMDS=("git diff --check")
elif ! printf '%s\n' "${VALIDATE_CMDS[@]}" | grep -qx 'git diff --check'; then
  VALIDATE_CMDS=("git diff --check" "${VALIDATE_CMDS[@]}")
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
REMOTE_URL="$(git -C "$REPO_ROOT" remote get-url "$ORIGIN_REMOTE")"

if [ -z "$WORKTREE_PATH" ]; then
  WORKTREE_PATH="$REPO_ROOT/.worktrees/$(sanitize_branch_name "$BRANCH")"
fi
if [ -z "$CLONE_PATH" ]; then
  CLONE_PATH="/tmp/$(basename "$REPO_ROOT")_$(sanitize_branch_name "$BRANCH")"
fi
if [ -z "$SUMMARY_FILE" ]; then
  SUMMARY_FILE="/tmp/package_contour_$(sanitize_branch_name "$BRANCH").summary.txt"
fi
if [ -z "$SUMMARY_JSON_FILE" ]; then
  SUMMARY_JSON_FILE="${SUMMARY_FILE%.*}.json"
fi

if repo_is_clean "$REPO_ROOT"; then
  REPO_ROOT_CLEAN="yes"
else
  REPO_ROOT_CLEAN="no"
fi

log "repo root: $REPO_ROOT"
log "target branch: $BRANCH"
log "base ref: $BASE_REF"
log "bootstrap mode: $BOOTSTRAP_MODE"
log "repo root clean: $REPO_ROOT_CLEAN"
log "preferred worktree path: $WORKTREE_PATH"
log "fallback clone path: $CLONE_PATH"

if [ "$REPO_ROOT_CLEAN" = "yes" ]; then
  if git -C "$REPO_ROOT" fetch "$ORIGIN_REMOTE"; then
    FETCH_STATUS="ok"
  else
    FETCH_STATUS="failed"
    log "fetch failed in repo root; bootstrap fallback remains available"
  fi
else
  FETCH_STATUS="skipped_dirty_repo_root"
  log "repo root is dirty, skipping fetch and worktree mutation"
  if [ "$BOOTSTRAP_MODE" = "worktree-first" ]; then
    log "dirty repo root forces clone fallback"
  fi
fi

if [ "$BOOTSTRAP_MODE" = "worktree-first" ] && [ "$REPO_ROOT_CLEAN" = "yes" ]; then
  if [ -e "$WORKTREE_PATH" ]; then
    BOOTSTRAP_PATH="existing_worktree"
    ensure_existing_workspace "$WORKTREE_PATH"
  else
    if git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" "$BASE_REF"; then
      git -C "$WORKTREE_PATH" checkout -B "$BRANCH" "$BASE_REF"
      git -C "$WORKTREE_PATH" remote set-url "$ORIGIN_REMOTE" "$REMOTE_URL" || true
      WORKSPACE_PATH="$WORKTREE_PATH"
      BOOTSTRAP_PATH="worktree_created"
    else
      log "worktree bootstrap failed, switching to clone fallback"
    fi
  fi
fi

if [ -z "$WORKSPACE_PATH" ]; then
  if [ -e "$CLONE_PATH" ]; then
    BOOTSTRAP_PATH="existing_clone"
    ensure_existing_workspace "$CLONE_PATH"
  else
    git clone --no-hardlinks "$REPO_ROOT" "$CLONE_PATH"
    git -C "$CLONE_PATH" remote set-url "$ORIGIN_REMOTE" "$REMOTE_URL"
    git -C "$CLONE_PATH" fetch "$ORIGIN_REMOTE" >/dev/null 2>&1 || true
    git -C "$CLONE_PATH" checkout -B "$BRANCH" "$BASE_REF"
    WORKSPACE_PATH="$CLONE_PATH"
    BOOTSTRAP_PATH="clone_created"
  fi
fi

[ -n "$WORKSPACE_PATH" ] || fail "could not bootstrap a clean workspace"

build_manual_commands
log "bootstrap path used: $BOOTSTRAP_PATH"
log "workspace path: $WORKSPACE_PATH"

run_validation

if [ "$ADD_ALL" = "1" ]; then
  git -C "$WORKSPACE_PATH" add -A
else
  git -C "$WORKSPACE_PATH" add -- "${ADD_PATHS[@]}"
fi

if git -C "$WORKSPACE_PATH" diff --cached --quiet; then
  fail "no staged changes after git add"
fi

git -C "$WORKSPACE_PATH" commit -m "$COMMIT_MESSAGE"
COMMIT_SHA="$(git -C "$WORKSPACE_PATH" rev-parse HEAD)"

if git -C "$WORKSPACE_PATH" push -u "$ORIGIN_REMOTE" "$BRANCH"; then
  PUSH_STATUS="ok"
else
  PUSH_STATUS="blocked"
  fail "push failed for $BRANCH"
fi

create_pr_if_possible

STATUS="success"
log "commit sha: $COMMIT_SHA"
log "push status: $PUSH_STATUS"
log "pr status: $PR_STATUS"
if [ -n "$PR_URL" ]; then
  log "pr url: $PR_URL"
fi
