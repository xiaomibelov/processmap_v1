#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r16-contrast-bpmn-v1"
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
echo "== unstage helper scripts/artifacts if any =="
git restore --staged Run_StepR*.sh StepR*.sh artifacts 2>/dev/null || true
git restore --staged artifacts/* 2>/dev/null || true

THEME="frontend/src/styles/theme_graphite.css"
if [ ! -f "$THEME" ]; then
  echo "ERROR: not found: $THEME"
  false
fi

echo
echo "== theme: ensure titles + muted are readable on dark =="
if ! grep -q "R16_TITLES" "$THEME"; then
  cat >> "$THEME" <<'EOF'

/* R16_TITLES: make section titles readable on dark */
h1, h2, h3, h4,
.panelHead, .panelTitle, .sectionTitle, .stageTitle, .processTitle,
.stageHeader, .panelHeader, .processHeader {
  color: var(--text);
}
.muted { color: var(--muted); }
.small { color: var(--text); }
.small.muted { color: var(--muted); }

/* Reduce glare on large white BPMN canvas container (in case bpmn-js CSS sets white bg) */
.bpmnStage, .bpmnCanvas, .bpmnWrap, .workflowCanvas, .processCanvas {
  background: rgba(255,255,255,.03);
}
EOF
fi

echo
echo "== theme: BPMN canvas background + node colors (override bpmn-js light defaults) =="
if ! grep -q "R16_BPMN_CANVAS_BG" "$THEME"; then
  cat >> "$THEME" <<'EOF'

/* R16_BPMN_CANVAS_BG: bpmn-js light theme overrides */
.djs-container,
.djs-container .djs-canvas,
.djs-container .djs-canvas > svg {
  background: #0b1020 !important;
}

/* Slightly dimmer fills, softer strokes (avoid pure white) */
.djs-container .djs-visual rect,
.djs-container .djs-visual circle,
.djs-container .djs-visual polygon,
.djs-container .djs-visual path {
  fill: rgba(255,255,255,.06) !important;
  stroke: rgba(255,255,255,.35) !important;
}

.djs-container .djs-visual text,
.djs-container .djs-label {
  fill: rgba(255,255,255,.86) !important;
}

/* Lanes / pool borders */
.djs-container .djs-visual .djs-outline,
.djs-container .djs-visual .djs-lane {
  stroke: rgba(255,255,255,.22) !important;
}

/* Sequence flows a bit brighter */
.djs-container .djs-visual .djs-connection path {
  stroke: rgba(255,255,255,.48) !important;
}
EOF
fi

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (theme only) =="
git add "$THEME"
git status -sb || true
git commit -m "fix(frontend): improve contrast (titles) + dark BPMN canvas overrides" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R16 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend/src/styles/theme_graphite.css -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
