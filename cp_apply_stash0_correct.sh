#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "== repo =="
git status -sb
echo
echo "Branch: $(git branch --show-current)"
echo "HEAD:   $(git rev-parse --short HEAD)"
echo

echo "== stash list (top 3) =="
git stash list | head -n 3 || true
echo

echo "== stash@{0} stat =="
git stash show --stat stash@{0} || true
echo

TS="$(date +%Y%m%d_%H%M%S)"
TAG_BEFORE="cp/restore_stash_before_apply_${TS}"
git tag -a "${TAG_BEFORE}" -m "Checkpoint before applying stash@{0} on $(git branch --show-current)."
echo "Tagged: ${TAG_BEFORE}"
echo

echo "Applying stash@{0} with --index (restore staged state if any)..."
git stash apply --index stash@{0}

echo
echo "== after apply =="
git status -sb
echo

TS2="$(date +%Y%m%d_%H%M%S)"
TAG_AFTER="cp/restore_stash_after_apply_${TS2}"
git tag -a "${TAG_AFTER}" -m "Checkpoint after applying stash@{0} on $(git branch --show-current)."
echo "Tagged: ${TAG_AFTER}"
echo
echo "NOTE: stash is still kept. If everything looks good, you can remove it with:"
echo "  git stash drop stash@{0}"
