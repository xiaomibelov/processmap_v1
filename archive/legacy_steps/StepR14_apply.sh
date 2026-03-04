#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="fix/frontend-r14-contrast-paper-v1"
TAG_START="cp/foodproc_frontend_r14_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r14_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r14_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R14 start (${TS})" >/dev/null 2>&1 || true
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
git restore --staged StepR*.sh Run_StepR*.sh 2>/dev/null || true
git restore --staged artifacts 2>/dev/null || true
git restore --staged artifacts/* 2>/dev/null || true
git restore --staged backend 2>/dev/null || true

echo
echo "== theme: graphite glass + readable typography + paper canvas =="
mkdir -p frontend/src/styles
cat > frontend/src/styles/theme_graphite.css <<'EOF'
:root{
  --bg0:#070A14;
  --bg1:#0B1020;

  --panel:rgba(255,255,255,.06);
  --panel2:rgba(255,255,255,.04);
  --border:rgba(255,255,255,.12);

  --text:rgba(255,255,255,.92);
  --muted:rgba(255,255,255,.66);

  --ok:#2FE58C;
  --warn:#FFBF3F;
  --err:#FF4D4D;
  --info:#7C5CFF;

  --ring:rgba(124,92,255,.55);
  --shadow:0 18px 55px rgba(0,0,0,.55);

  --r-lg:18px;
  --r-md:14px;

  /* "paper" for BPMN canvas (keep diagram readable, but not retina-burning white) */
  --paper0: rgba(255,255,255,.74);
  --paper1: rgba(245,248,255,.70);
  --paperBorder: rgba(16,24,40,.14);
  --ink: rgba(16,24,40,.92);
}

html, body { height: 100%; }

body{
  color:var(--text);
  background:
    radial-gradient(1100px 650px at 18% 12%, rgba(124,92,255,.18), transparent 60%),
    radial-gradient(900px 500px  at 80% 18%, rgba(47,229,140,.10), transparent 55%),
    linear-gradient(180deg,var(--bg0),var(--bg1));
  margin:0;
}

.panel{
  background:var(--panel);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  box-shadow:var(--shadow);
  backdrop-filter: blur(14px);
}

.panelHead{
  font-weight: 900;
  letter-spacing: .2px;
  color: var(--text);
}

.small{ font-size: 12px; line-height: 1.35; }
.muted{ color: var(--muted); }
.hr{ height:1px; background: rgba(255,255,255,.10); margin: 10px 0; border-radius: 999px; }

.input{
  width:100%;
  padding:10px 12px;
  border-radius:12px;
  background: rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.12);
  color:var(--text);
}
.input:focus{
  outline:2px solid var(--ring);
  outline-offset:2px;
  border-color: rgba(255,255,255,.18);
}

.btn{
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.06);
  color: var(--text);
  padding: 10px 12px;
  font-weight: 800;
}
.btn:hover{ border-color: rgba(255,255,255,.22); }
.btn:focus{ outline:2px solid var(--ring); outline-offset:2px; }
.btn.primary{
  background: linear-gradient(180deg, rgba(124,92,255,.92), rgba(124,92,255,.62));
  border-color: rgba(124,92,255,.65);
}
EOF

echo
echo "== app.css: overrides for contrast + BPMN 'paper' canvas =="
APP_CSS="frontend/src/styles/app.css"
mkdir -p "$(dirname "$APP_CSS")"
if [ ! -f "$APP_CSS" ]; then
  cat > "$APP_CSS" <<'EOF'
/* base file created by R14 */
EOF
fi

# idempotent append marker
if ! grep -q "R14_GRAPHITE_PAPER_OVERRIDES" "$APP_CSS"; then
cat >> "$APP_CSS" <<'EOF'

/* R14_GRAPHITE_PAPER_OVERRIDES */

/* left column cards: stop using bright white in dark theme */
.card{
  background: var(--panel2) !important;
  border: 1px solid var(--border) !important;
  border-radius: 14px !important;
  box-shadow: none !important;
  color: var(--text) !important;
}

/* strengthen text visibility */
.panelBody, .panelBody * { color: var(--text); }
.panelBody .muted, .panelBody .small.muted { color: var(--muted) !important; }

/* primary button: premium look + readable */
.primaryBtn{
  background: linear-gradient(180deg, rgba(124,92,255,.92), rgba(124,92,255,.62)) !important;
  border: 1px solid rgba(124,92,255,.65) !important;
  color: var(--text) !important;
  border-radius: 14px !important;
  font-weight: 900 !important;
}
.primaryBtn:disabled{
  opacity: .55 !important;
  filter: saturate(.8) !important;
}

/* BPMN stage: avoid pure white, keep labels readable */
.bpmnStage, .processStage, .stage{
  background: rgba(255,255,255,.02) !important;
}

.bpmnStage .djs-container{
  background:
    radial-gradient(900px 500px at 22% 18%, rgba(124,92,255,.10), transparent 62%),
    linear-gradient(180deg, var(--paper0), var(--paper1)) !important;
  border: 1px solid var(--paperBorder) !important;
  border-radius: 16px !important;
}

/* make sure svg doesn't paint its own harsh background */
.bpmnStage svg{ background: transparent !important; }

/* diagram text is drawn inside SVG; ensure it's not washed out */
.bpmnStage .djs-label,
.bpmnStage .djs-label tspan{
  fill: var(--ink) !important;
}

/* reduce glare of controls on the canvas */
.bpmnStage .bpmnControls button,
.bpmnStage button{
  background: rgba(255,255,255,.08) !important;
  border: 1px solid rgba(255,255,255,.14) !important;
  color: var(--text) !important;
}
EOF
fi

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== commit (frontend only) =="
git add -A frontend/src/styles
git status -sb || true
git commit -m "fix(frontend): graphite-glass contrast + soften BPMN paper canvas" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R14 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact (exclude node_modules/dist) =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend/src/styles -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null 2>&1 || true
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout \"$TAG_START\""
