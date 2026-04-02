#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "== before =="
git status -sb || true
git diff --name-only || true

ts="$(date +%Y%m%d_%H%M%S)"
start_tag="cp/unrelated_wip_isolation_start_${ts}"
done_tag="cp/unrelated_wip_isolation_done_${ts}"
git tag "${start_tag}" 2>/dev/null || true

allow_re='^(docs/decompose/D1_contracts\.md|frontend/src/components/ProcessStage\.jsx|frontend/src/features/process/stage/ui/Process(StageShell|Panels|Dialogs|Header|CanvasArea)\.jsx|frontend/src/features/process/stage/controllers/useProcessStage(Actions|Shell)Controller\.js|scripts/isolate_unrelated_wip_v1\.sh)$'

all_files=()
while IFS= read -r f; do
  [ -n "${f}" ] && all_files+=("${f}")
done <<EOF
$(git diff --name-only)
EOF
while IFS= read -r f; do
  [ -n "${f}" ] && all_files+=("${f}")
done <<EOF
$(git ls-files --others --exclude-standard)
EOF

unrelated_files=()
for f in "${all_files[@]:-}"; do
  [ -z "${f}" ] && continue
  if [[ ! "${f}" =~ ${allow_re} ]]; then
    unrelated_files+=("${f}")
  fi
done

if [ ${#unrelated_files[@]} -gt 0 ]; then
  echo
  echo "== stash unrelated =="
  printf '%s\n' "${unrelated_files[@]}"
  git stash push -u -m "unrelated-wip-before-d1-step3 ${ts}" -- "${unrelated_files[@]}"
else
  echo "No unrelated files found."
fi

echo
echo "== after =="
git status -sb || true

after_files=()
while IFS= read -r f; do
  [ -n "${f}" ] && after_files+=("${f}")
done <<EOF
$(git diff --name-only)
EOF
while IFS= read -r f; do
  [ -n "${f}" ] && after_files+=("${f}")
done <<EOF
$(git ls-files --others --exclude-standard)
EOF

left_unrelated=()
for f in "${after_files[@]:-}"; do
  [ -z "${f}" ] && continue
  if [[ ! "${f}" =~ ${allow_re} ]]; then
    left_unrelated+=("${f}")
  fi
done

if [ ${#left_unrelated[@]} -gt 0 ]; then
  echo "WARNING: unrelated files still present:"
  printf '%s\n' "${left_unrelated[@]}"
else
  echo "Working tree isolated (clean or only expected D1 files)."
fi

git tag "${done_tag}" 2>/dev/null || true
echo "Tags: ${start_tag}, ${done_tag}"
