#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "== repo =="
git status -sb
echo
echo "HEAD: $(git rev-parse --short HEAD)"
echo

TAG="$(git tag --list 'cp/interview_pre_path_highlight_*' --sort=-creatordate | head -n 1 || true)"

if [ -z "${TAG}" ]; then
  TS="$(date +%Y%m%d_%H%M%S)"
  TAG="cp/interview_pre_path_highlight_${TS}"
  git tag -a "${TAG}" -m "Checkpoint before Path Highlight implementation (auto-created)."
  echo "No previous checkpoint tag found. Created: ${TAG}"
else
  echo "Using checkpoint tag: ${TAG}"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo
  echo "WARN: working tree has uncommitted changes. Creating a stash to allow checkout..."
  git stash push -u -m "wip before branching (path-highlight) $(date +%Y-%m-%dT%H:%M:%S)"
  echo "Stash created."
fi

BASE_BRANCH="feat/interview-path-highlight"
BRANCH="${BASE_BRANCH}"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  TS="$(date +%Y%m%d_%H%M%S)"
  BRANCH="${BASE_BRANCH}-${TS}"
fi

echo
echo "Creating branch: ${BRANCH} from ${TAG}"
git checkout -b "${BRANCH}" "${TAG}"

TS2="$(date +%Y%m%d_%H%M%S)"
TAG2="cp/interview_path_highlight_branch_start_${TS2}"
git tag -a "${TAG2}" -m "Checkpoint at branch start for Path Highlight work (${BRANCH})."

echo
echo "== done =="
git status -sb
echo "Branch: ${BRANCH}"
echo "Base tag: ${TAG}"
echo "Branch-start tag: ${TAG2}"
echo
echo "If a stash was created, you can view/apply it via:"
echo "  git stash list"
echo "  git stash pop"
