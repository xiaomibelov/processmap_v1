#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: tools/agent-create-contour.sh <contour-id>

Creates .planning/contours/<contour-id>/ from repo-local templates.
This script does not run an LLM.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

contour_id="${1:-}"
if [[ -z "$contour_id" ]]; then
  usage >&2
  exit 2
fi

if [[ "$contour_id" = /* || "$contour_id" == *".."* || "$contour_id" == *"//"* ]]; then
  echo "Invalid contour id: must be a relative path without '..' or duplicate slashes." >&2
  exit 2
fi

if [[ ! "$contour_id" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "Invalid contour id: use only letters, numbers, dot, underscore, hyphen, and slash." >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
template_dir="$repo_root/.planning/templates"
contour_dir="$repo_root/.planning/contours/$contour_id"

if [[ -e "$contour_dir" ]]; then
  echo "Contour already exists: $contour_dir" >&2
  exit 1
fi

required_templates=(
  "STATE.template.json"
  "PLAN.template.md"
  "EXECUTOR_PROMPT.template.md"
  "REVIEWER_PROMPT.template.md"
)

for template in "${required_templates[@]}"; do
  if [[ ! -f "$template_dir/$template" ]]; then
    echo "Missing template: $template_dir/$template" >&2
    exit 1
  fi
done

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\\&#]/\\&/g'
}

created_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
contour_escaped="$(escape_sed_replacement "$contour_id")"
created_escaped="$(escape_sed_replacement "$created_at")"

mkdir -p "$contour_dir"

render_template() {
  local source="$1"
  local target="$2"
  sed \
    -e "s#__CONTOUR_ID__#$contour_escaped#g" \
    -e "s#__CREATED_AT__#$created_escaped#g" \
    "$source" > "$target"
}

render_template "$template_dir/STATE.template.json" "$contour_dir/STATE.json"
render_template "$template_dir/PLAN.template.md" "$contour_dir/PLAN.md"
render_template "$template_dir/EXECUTOR_PROMPT.template.md" "$contour_dir/EXECUTOR_PROMPT.md"
render_template "$template_dir/REVIEWER_PROMPT.template.md" "$contour_dir/REVIEWER_PROMPT.md"

cat > "$contour_dir/SOURCE_TRUTH.md" <<EOF
# Source Truth: $contour_id

Generated: $created_at

Fill this during planner phase:

\`\`\`bash
git fetch origin
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git log --oneline -15 origin/main
\`\`\`
EOF

touch "$contour_dir/READY_FOR_EXECUTION"

cat <<EOF
Created contour queue:
  $contour_dir

Next:
  tools/agent-run-executor.sh "$contour_id"
EOF
