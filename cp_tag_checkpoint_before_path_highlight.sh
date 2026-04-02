#!/usr/bin/env bash
set -u

cd "$(git rev-parse --show-toplevel)"

echo "== repo =="
git status -sb
echo
echo "HEAD: $(git rev-parse --short HEAD)"
echo

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "WARN: working tree has uncommitted changes."
  echo "      Tag will point to HEAD commit only (uncommitted changes are NOT included)."
  echo
fi

TS="$(date +%Y%m%d_%H%M%S)"
TAG="cp/interview_pre_path_highlight_${TS}"

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  TAG="${TAG}_dup"
fi

git tag -a "${TAG}" -m "Checkpoint before Path Highlight implementation (Interview UI)."

echo
echo "Created tag: ${TAG}"
git show -s --oneline "${TAG}"
