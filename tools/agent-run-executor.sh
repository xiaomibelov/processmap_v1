#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: tools/agent-run-executor.sh <contour-id> [--execute]

Default mode is dry-run: validate READY_FOR_EXECUTION and print EXECUTOR_PROMPT.md.
With --execute, starts Claude by piping EXECUTOR_PROMPT.md to ${CLAUDE_BIN:-claude}.
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
prompt_path="$contour_dir/EXECUTOR_PROMPT.md"

if [[ ! -d "$contour_dir" ]]; then
  echo "Contour not found: $contour_dir" >&2
  exit 1
fi

if [[ ! -f "$contour_dir/READY_FOR_EXECUTION" ]]; then
  echo "Not ready for execution: missing $contour_dir/READY_FOR_EXECUTION" >&2
  exit 1
fi

if [[ ! -f "$prompt_path" ]]; then
  echo "Missing executor prompt: $prompt_path" >&2
  exit 1
fi

touch "$contour_dir/EXECUTION_STARTED"

cat <<EOF
Executor prompt:
  $prompt_path

State marker set:
  $contour_dir/EXECUTION_STARTED
EOF

if [[ "$execute" != true ]]; then
  cat <<'EOF'

Dry-run only. Claude was not launched.
Run with --execute to start the executor.
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
