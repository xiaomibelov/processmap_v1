set -u

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/foodproc_frontend_r2_resume_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r2_${TS}.zip"
MSG="feat(frontend): layout like BPMN (left notes + process canvas) + copilot overlays inside stage (R2)"

echo
echo "== checkpoint tag =="
git tag -a "$TAG" -m "checkpoint: frontend R2 resume (${TS})" >/dev/null 2>&1 || true
echo "$TAG"

echo
echo "== git =="
git status -sb || true
git show -s --format='%ci %h %d %s' || true

echo
echo "== node/npm =="
node -v 2>/dev/null || true
npm -v 2>/dev/null || true

echo
echo "== frontend sanity =="
ls -la frontend 2>/dev/null || true
ls -la frontend/package.json 2>/dev/null || true

echo
echo "== frontend install (if needed) =="
if [ -d frontend/node_modules ]; then
  echo "ok: frontend/node_modules exists"
else
  ( cd frontend && npm install ) || true
fi

echo
echo "== frontend build =="
BUILD_RC=0
( cd frontend && npm -s run build )
BUILD_RC=$?

echo
echo "== build rc =="
echo "$BUILD_RC"

if [ "$BUILD_RC" -ne 0 ]; then
  echo
  echo "RESULT=BLOCKER (build failed)"
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== git add/commit =="
git add -A
git status -sb || true
git commit -m "$MSG" >/dev/null 2>&1 || true

TAG_DONE="cp/foodproc_frontend_r2_done_${TS}"
echo
echo "== done tag =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R2 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend >/dev/null 2>&1 || true
ls -la "$ZIP_PATH" || true

echo
echo "RESULT=OK"
echo "rollback: git checkout \"$TAG\""
echo "run dev: cd frontend && npm run dev"
