#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ts="$(date +%Y%m%d_%H%M%S)"

echo "== git status (before) =="
git status -sb || true

echo
echo "== changed files =="
changed_files="$(git status --porcelain | awk '{print $2}')"
if [ -z "${changed_files}" ]; then
  echo "No changes to isolate."
  exit 0
fi
printf '%s\n' "${changed_files}"

git tag "cp/drawio_forensics_v2_start_${ts}" 2>/dev/null || true

keep_file() {
  local f="$1"
  case "$f" in
    frontend/src/features/process/drawio/*) return 0 ;;
    frontend/src/features/process/hybrid/controllers/useHybridTransformController.js) return 0 ;;
    frontend/src/features/process/hybrid/tools/useHybridToolsController.js) return 0 ;;
    frontend/e2e/drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs) return 0 ;;
    docs/debug/drawio_jitter_factpack_20260306_101030.md) return 0 ;;
    docs/debug/drawio_stability_factpack_v2_*.md) return 0 ;;
    scripts/isolate_unrelated_wip_drawio_v1.sh) return 0 ;;
  esac
  return 1
}

stash_list=()
while IFS= read -r f; do
  [ -z "${f}" ] && continue
  if keep_file "${f}"; then
    continue
  fi
  stash_list+=("${f}")
done <<< "${changed_files}"

if [ "${#stash_list[@]}" -eq 0 ]; then
  echo
  echo "No unrelated files detected."
else
  echo
  echo "== stashing unrelated files =="
  printf '  %s\n' "${stash_list[@]}"
  git stash push -u -m "drawio-forensics-unrelated-${ts}" -- "${stash_list[@]}"
fi

echo
echo "== git status (after) =="
git status -sb || true
