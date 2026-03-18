set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
git tag -a "cp/dev_up_${TS}" -m "checkpoint: dev_up (${TS})" >/dev/null 2>&1 || true

echo "== git =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true

echo "== port =="
grep -E '^HOST_PORT=' .env || true

echo "== up =="
exec "${PWD}/scripts/runtime_source.sh" up --build
