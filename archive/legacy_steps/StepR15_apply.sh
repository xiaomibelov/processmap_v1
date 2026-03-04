#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r15-graphite-contrast-v1"
TAG_START="cp/foodproc_frontend_r15_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r15_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r15_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R15 start (${TS})" >/dev/null 2>&1 || true
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
git restore --staged StepR*.sh 2>/dev/null || true
git restore --staged Run_StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged artifacts/* 2>/dev/null || true
git restore --staged backend 2>/dev/null || true

THEME="frontend/src/styles/theme_graphite.css"
mkdir -p frontend/src/styles "$ZIP_DIR"

echo
echo "== styles: R15 contrast + BPMN dark canvas =="

if [ ! -f "$THEME" ]; then
  echo "warn: $THEME not found, creating"
  cat > "$THEME" <<'EOF'
:root{
  --bg0:#070A14;
  --bg1:#0B1020;

  --panel:rgba(255,255,255,.06);
  --panel2:rgba(255,255,255,.04);
  --border:rgba(255,255,255,.12);

  --text:rgba(255,255,255,.92);
  --muted:rgba(255,255,255,.62);

  --ok:#2FE58C;
  --warn:#FFBF3F;
  --err:#FF4D4D;
  --info:#7C5CFF;

  --ring:rgba(124,92,255,.55);
  --shadow:0 18px 55px rgba(0,0,0,.55);

  --r-lg:18px;
  --r-md:14px;
}
body{
  color:var(--text);
  background:
    radial-gradient(1100px 650px at 18% 12%, rgba(124,92,255,.18), transparent 60%),
    radial-gradient(900px 500px  at 80% 18%, rgba(47,229,140,.10), transparent 55%),
    linear-gradient(180deg,var(--bg0),var(--bg1));
}
.panel{
  background:var(--panel);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  box-shadow:var(--shadow);
  backdrop-filter: blur(14px);
}
EOF
fi

if ! grep -q "R15: contrast fixes" "$THEME"; then
  cat >> "$THEME" <<'EOF'

/* R15: contrast fixes + BPMN dark canvas (reduce white glare) */

/* Titles / headers: always visible on graphite */
.stageTitle, .stageHead, .stageHeader,
.panelHead, .panelTitle, .sectionTitle,
h1, h2, h3 {
  color: var(--text);
}

/* Cards should not be pure white in graphite */
.card {
  background: var(--panel2) !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}

/* Inputs and placeholders: readable */
.input, textarea, select, option {
  color: var(--text);
}
.input::placeholder, textarea::placeholder {
  color: rgba(255,255,255,.45);
}

/* BPMN-js: make canvas dark and invert strokes/text for readability */
.djs-container {
  background: transparent !important;
}

.djs-container .djs-background {
  fill: rgba(255,255,255,.035) !important;
}

.djs-container svg {
  background: transparent !important;
}

/* Node shapes: subtle translucent fill, light strokes */
.djs-container .djs-visual rect,
.djs-container .djs-visual circle,
.djs-container .djs-visual polygon {
  fill: rgba(255,255,255,.03) !important;
}

.djs-container .djs-visual path,
.djs-container .djs-visual rect,
.djs-container .djs-visual circle,
.djs-container .djs-visual polygon,
.djs-container .djs-visual polyline,
.djs-container .djs-visual line {
  stroke: rgba(255,255,255,.78) !important;
}

/* Text labels: light */
.djs-container .djs-visual text {
  fill: rgba(255,255,255,.88) !important;
}

/* Selection ring */
.djs-container .djs-outline,
.djs-container .djs-visual .djs-hit {
  stroke: rgba(124,92,255,.75) !important;
}
EOF
fi

echo
echo "== git diff --stat =="
git diff --stat || true

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== commit (frontend only) =="
git add "$THEME"
git status -sb || true
git commit -m "fix(frontend): graphite contrast + dark BPMN canvas (less glare)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R15 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null 2>&1 || true
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
