set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r8-local-bpmn-no-fetch-v1"
TAG_START="cp/foodproc_frontend_r8_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r8_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r8_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R8 start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_START"

echo
echo "== git (before) =="
git status -sb || true
git show -s --format='%ci %h %d %s' || true

echo
echo "== branch =="
git switch -c "$BR" >/dev/null 2>&1 || git switch "$BR" >/dev/null
git status -sb || true

echo
echo "== locate BpmnStage.jsx =="
F="$(git ls-files | grep -E 'frontend/src/.*/BpmnStage\.jsx$' | head -n 1 || true)"
if [ -z "$F" ]; then
  echo "ERROR: cannot find BpmnStage.jsx under frontend/src"
  false
fi
echo "$F"

echo
echo "== patch: do not fetch /bpmn for local_* sessionId =="
python -c 'import re, pathlib, sys
p=pathlib.Path(sys.argv[1])
s=p.read_text(encoding="utf-8")
if "startsWith(\\"local_\\")" in s:
    print("skip: already patched")
    sys.exit(0)

pat=r"(if\\s*\\(\\s*!\\s*sessionId\\s*\\)\\s*return\\s+MOCK_XML\\s*;)"
m=re.search(pat, s)
if not m:
    print("ERROR: pattern not found: if (!sessionId) return MOCK_XML;")
    sys.exit(2)

ins="if (!sessionId) return MOCK_XML;\\n  if (typeof sessionId === \\"string\\" && sessionId.startsWith(\\"local_\\")) return MOCK_XML;"
s2=re.sub(pat, ins, s, count=1)

p.write_text(s2, encoding="utf-8")
print("ok: patched")' "$F"

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "fix(frontend): do not fetch /bpmn for local_* sessions (use mock)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R8 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend \
  -x "frontend/node_modules/*" \
  -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
