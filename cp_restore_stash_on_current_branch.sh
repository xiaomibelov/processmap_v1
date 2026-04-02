#!/usr/bin/env bash
set -u

cd "$(git rev-parse --show-toplevel)"

echo "== before =="
git status -sb
echo "Branch: $(git branch --show-current)"
echo "HEAD:   $(git rev-parse --short HEAD)"
echo

TS="$(date +%Y%m%d_%H%M%S)"
TAG_BEFORE="cp/restore_stash_before_${TS}"
git tag -a "${TAG_BEFORE}" -m "Checkpoint before restoring stash onto current branch."
echo "Tagged: ${TAG_BEFORE}"
echo

echo "Applying stash@{0} (keeping stash, not popping)..."
git stash apply -u --index stash@{0}

echo
echo "== after apply =="
git status -sb
echo

TS2="$(date +%Y%m%d_%H%M%S)"
TAG_AFTER="cp/restore_stash_after_${TS2}"
git tag -a "${TAG_AFTER}" -m "Checkpoint after restoring stash onto current branch."
echo "Tagged: ${TAG_AFTER}"
