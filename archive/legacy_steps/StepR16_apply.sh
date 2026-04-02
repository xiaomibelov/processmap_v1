#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r16-process-title-bpmn-bg-v1"
TAG_START="cp/foodproc_frontend_r16_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r16_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r16_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R16 start (${TS})" >/dev/null 2>&1 || true
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
echo "== unstage helper scripts/artifacts/backend if any =="
git restore --staged Run_StepR*.sh 2>/dev/null || true
git restore --staged StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged backend 2>/dev/null || true

echo
echo "== ensure .tools dir =="
mkdir -p .tools

echo
echo "== theme: force white titles + soften BPMN canvas =="
THEME="frontend/src/styles/theme_graphite.css"
if [ ! -f "$THEME" ]; then
  echo "WARN: $THEME not found; fallback to frontend/src/styles/app.css"
  THEME="frontend/src/styles/app.css"
fi

cat >> "$THEME" <<'EOF'

/* R16: readability fixes (titles + BPMN canvas) */
.panelHead,
.panelTitle,
.stageTitle,
.stageHead,
.sectionTitle,
h1, h2, h3 {
  color: var(--text) !important;
}

.panelHead .muted,
.panelTitle .muted,
.stageTitle .muted,
.small.muted {
  color: var(--muted) !important;
}

/* BPMN canvas: reduce glare (not pure white), keep high readability */
.bpmnHost,
.djs-container,
.bjs-container,
.bjs-container .djs-container {
  background: rgba(255,255,255,0.86) !important;
  border-radius: var(--r-lg);
}

/* subtle frame to separate from glass */
.bpmnHost {
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);
}

/* labels in SVG (bpmn-js) */
.djs-container .djs-visual text,
.djs-container .djs-visual .djs-label {
  fill: rgba(16,24,40,0.88) !important;
}
EOF

echo
echo "== BpmnStage.jsx: add .bpmnHost class to container div =="
cat > .tools/patch_r16_bpmn_stage.py <<'PY'
from pathlib import Path

p = Path("frontend/src/components/process/BpmnStage.jsx")
if not p.exists():
    raise SystemExit("BpmnStage.jsx not found at frontend/src/components/process/BpmnStage.jsx")

s = p.read_text(encoding="utf-8")

old = '<div ref={hostRef} style={{ height: "100%", background: "transparent" }} />'
new = '<div ref={hostRef} className="bpmnHost" style={{ height: "100%" }} />'

if old in s:
    s = s.replace(old, new)
else:
    s2 = s
    s2 = s2.replace('ref={hostRef} style={{ height: "100%", background: "transparent" }}',
                    'ref={hostRef} className="bpmnHost" style={{ height: "100%" }}')
    if s2 == s:
        s2 = s2.replace('ref={hostRef}', 'ref={hostRef} className="bpmnHost"', 1)
    s = s2

p.write_text(s, encoding="utf-8")
print("patched:", p)
PY

python .tools/patch_r16_bpmn_stage.py

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add "$THEME" frontend/src/components/process/BpmnStage.jsx .tools/patch_r16_bpmn_stage.py
git status -sb || true
git commit -m "fix(ui): make Process title readable + soften BPMN canvas (graphite glass)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R16 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend .tools -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
