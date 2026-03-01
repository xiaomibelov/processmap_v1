#!/usr/bin/env bash
set -u

cd "$(git rev-parse --show-toplevel)"

echo "== repo =="
git status -sb
echo
echo "Branch: $(git branch --show-current)"
echo "HEAD:   $(git rev-parse --short HEAD)"
echo
echo "== latest checkpoint tags =="
git tag --list 'cp/interview_pre_path_highlight_*' --sort=-creatordate | head -n 3 || true
git tag --list 'cp/interview_path_highlight_branch_start_*' --sort=-creatordate | head -n 3 || true
echo
echo "== stash list (top 5) =="
git stash list | head -n 5 || true
echo
echo "== stash@{0} stat =="
git stash show --stat stash@{0} || true
