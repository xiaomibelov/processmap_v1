set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
git tag -a "cp/step_04_start_${TS}" -m "checkpoint: step_04 housekeeping start (${TS})" >/dev/null 2>&1 || true

echo "== git =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
echo "branch=$(git branch --show-current)"

BR="$(git branch --show-current)"
if [ "$BR" != "feat/mvp-runner-v1" ]; then
  echo "wrong branch: $BR"
  false
fi

echo "== stashes =="
git stash list || true

echo "== try pop latest stash (if any) =="
if git stash list | head -n1 | grep -q . ; then
  git stash pop || true
fi

echo "== status after stash pop =="
git status -sb || true

echo "== ensure scripts are executable =="
if [ -d scripts ]; then
  find scripts -maxdepth 1 -type f -name "*.sh" -exec chmod +x {} \; || true
fi

echo "== diff stat =="
git diff --stat || true

git add -A
git status -sb || true
git commit -m "chore: keep dev scripts and diagnostics" || true

TS2="$(date +%F_%H%M%S)"
git tag -a "cp/step_04_done_${TS2}" -m "checkpoint: step_04 housekeeping done (${TS2})" >/dev/null 2>&1 || true

echo "== done =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
