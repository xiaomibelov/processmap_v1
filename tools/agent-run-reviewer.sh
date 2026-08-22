#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: tools/agent-run-reviewer.sh <contour-id> [--execute]

Default mode is dry-run: validate READY_FOR_REVIEW and print REVIEWER_PROMPT.md.
With --execute, starts Claude by piping REVIEWER_PROMPT.md to ${CLAUDE_BIN:-claude}.
USAGE
}

execute=false
contour_id=""

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --execute)
      execute=true
      ;;
    *)
      if [[ -z "$contour_id" ]]; then
        contour_id="$arg"
      else
        echo "Unexpected argument: $arg" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$contour_id" ]]; then
  usage >&2
  exit 2
fi

if [[ "$contour_id" = /* || "$contour_id" == *".."* || "$contour_id" == *"//"* ]]; then
  echo "Invalid contour id: must be a relative path without '..' or duplicate slashes." >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
contour_dir="$repo_root/.planning/contours/$contour_id"
prompt_path="$contour_dir/REVIEWER_PROMPT.md"

if [[ ! -d "$contour_dir" ]]; then
  echo "Contour not found: $contour_dir" >&2
  exit 1
fi

if [[ ! -f "$contour_dir/READY_FOR_REVIEW" ]]; then
  echo "Not ready for review: missing $contour_dir/READY_FOR_REVIEW" >&2
  exit 1
fi

if [[ ! -f "$contour_dir/EXEC_REPORT.md" ]]; then
  echo "Not ready for review: missing $contour_dir/EXEC_REPORT.md" >&2
  exit 1
fi

if [[ ! -f "$prompt_path" ]]; then
  echo "Missing reviewer prompt: $prompt_path" >&2
  exit 1
fi

cat <<EOF
Reviewer prompt:
  $prompt_path
EOF

if [[ "$execute" != true ]]; then
  cat <<'EOF'

Dry-run only. Claude was not launched.
Run with --execute to start the reviewer.
EOF
  exit 0
fi

claude_bin="${CLAUDE_BIN:-claude}"
if ! command -v "$claude_bin" >/dev/null 2>&1; then
  echo "Claude binary not found: $claude_bin" >&2
  exit 1
fi

cd "$repo_root"
"$claude_bin" < "$prompt_path"
