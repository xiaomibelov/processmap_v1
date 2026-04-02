set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/foodproc_frontend_r3_pack_light_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r3_LIGHT_${TS}.zip"

echo
echo "== checkpoint tag =="
git tag -a "$TAG" -m "checkpoint: frontend R3 pack light (${TS})" >/dev/null 2>&1 || true
echo "$TAG"

echo
echo "== zip (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend \
  -x "frontend/node_modules/*" \
  -x "frontend/dist/*" \
  -x "frontend/.DS_Store" \
  -x "frontend/**/.DS_Store" >/dev/null

ls -la "$ZIP_PATH" || true

echo
echo "RESULT=OK"
echo "zip: $ZIP_PATH"
