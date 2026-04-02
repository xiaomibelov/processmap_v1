set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
TS="$(date +%F_%H%M%S)"
git tag -a "cp/step_14_start_${TS}" -m "checkpoint: step_14 start (${TS})" >/dev/null 2>&1 || true

echo "== git =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true

if [ -n "$(git status --porcelain)" ]; then
  git stash push -u -m "wip: before step_14 mermaid/roles"
fi

PATCH_ZIP="fpc_step_14_patch_bundle.zip"
if [ ! -f "${PATCH_ZIP}" ]; then
  echo "missing ${PATCH_ZIP} in repo root"
  false
fi

BK="workspace/_bak_step14_${TS}"
mkdir -p "${BK}/patch"

cp -f backend/app/exporters/mermaid.py "${BK}/mermaid.py.bak" 2>/dev/null || true
cp -f backend/app/validators/coverage.py "${BK}/coverage.py.bak" 2>/dev/null || true
cp -f backend/app/main.py "${BK}/main.py.bak" 2>/dev/null || true

unzip -oq "${PATCH_ZIP}" -d "${BK}/patch"

cp -f "${BK}/patch/backend/app/exporters/mermaid.py" backend/app/exporters/mermaid.py
cp -f "${BK}/patch/backend/app/validators/coverage.py" backend/app/validators/coverage.py
cp -f "${BK}/patch/backend/app/main.py" backend/app/main.py

echo "== py_compile =="
python -m py_compile backend/app/exporters/mermaid.py 2>/dev/null || true
python -m py_compile backend/app/validators/coverage.py 2>/dev/null || true
python -m py_compile backend/app/main.py 2>/dev/null || true

echo "== docker compose up =="
docker compose build
docker compose up -d
docker compose ps

HOST_PORT="$(grep -E '^HOST_PORT=' .env | head -n1 | cut -d= -f2)"
echo "== probe =="
curl -sS "http://127.0.0.1:${HOST_PORT}/" | head -n 15 || true

echo "== diff stat =="
git diff --stat || true

git add -A
git status -sb || true
git commit -m "fix: stabilize mermaid lanes ids, placeholders and role options" || true

TS2="$(date +%F_%H%M%S)"
git tag -a "cp/step_14_done_${TS2}" -m "checkpoint: step_14 done (${TS2})" >/dev/null 2>&1 || true

echo "== done =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
echo "Open: http://localhost:${HOST_PORT}/"
