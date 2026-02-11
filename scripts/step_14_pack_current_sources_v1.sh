set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
git tag -a "cp/step_14_pack_start_${TS}" -m "checkpoint: step_14 pack start (${TS})" >/dev/null 2>&1 || true

mkdir -p zip

echo "== git state =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true

OUT="zip/fpc_sources_${TS}.zip"

rm -f "$OUT" || true

zip -r "$OUT" . \
  -x ".git/*" \
  -x ".venv/*" \
  -x "node_modules/*" \
  -x "frontend/node_modules/*" \
  -x "__pycache__/*" \
  -x "*.pyc" \
  -x ".DS_Store" \
  -x ".idea/*" \
  -x "zip/*"

echo "== packed =="
ls -lh "$OUT" || true

TS2="$(date +%F_%H%M%S)"
git tag -a "cp/step_14_pack_done_${TS2}" -m "checkpoint: step_14 pack done (${TS2})" >/dev/null 2>&1 || true

echo "== done =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
