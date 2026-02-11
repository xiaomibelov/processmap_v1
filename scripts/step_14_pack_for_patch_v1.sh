set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
TS="$(date +%F_%H%M%S)"
git tag -a "cp/step_14_pack_for_patch_${TS}" -m "checkpoint: step_14 pack for patch (${TS})" >/dev/null 2>&1 || true

mkdir -p zip
OUT="zip/step_14_patch_inputs_${TS}.zip"
rm -f "$OUT" || true

zip -r "$OUT" \
  backend/app/exporters/mermaid.py \
  backend/app/validators/coverage.py \
  backend/app/main.py \
  backend/app/static/app.js \
  backend/app/static/index.html \
  backend/app/static/styles.css

ls -lh "$OUT" || true
