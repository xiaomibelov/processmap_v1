# EXECUTOR_PROMPT — perf/diagram-human-perceived-pan-and-drag-smoothness-v1

**Role**: Agent 2 / Executor  
**Contour**: `perf/diagram-human-perceived-pan-and-drag-smoothness-v1`  
**Scope**: P0 frontend performance — human-perceived Diagram pan/drag smoothness, pointer-follow latency, visual jitter, dense-region SVG/rendering bottlenecks.  
**Language rule**: All reports, docs, and user-facing summaries must be written in **Russian**. Preserve exact Russian UI labels when referencing ProcessMap UI. This prompt is in English.

---

## 0. Pre-Flight

### 0.1 RAG Preflight
Before writing any product code, run:
```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role executor \
  --contour "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" \
  --query "Diagram human perceived pan drag smoothness pointer-follow latency visual jitter dense SVG bpmn-js canvas" \
  --format md \
  --top-k 12
```
Save output to `RAG_PREFLIGHT_EXECUTOR.md` in this contour directory.

Your `EXEC_REPORT.md` must contain a section `## RAG Context Used` referencing this preflight.

### 0.2 Source / Runtime Truth
Capture and record in `EXEC_REPORT.md`:
- `pwd`, `whoami`, `hostname`, `date -Is`
- `git status -sb`, `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`
- `git diff --name-only`, `git diff --stat`
- `curl -s http://clearvestnic.ru:8088/health`
- `curl -I http://clearvestnic.ru:5180`
- Docker ps / compose status
- `build-info.json` content
- Served JS assets from 5180 HTML
- Local dist assets

### 0.3 GSD Check
```bash
echo "PATH=$PATH"
command -v gsd || true
command -v gsd-sdk || true
test -x /opt/processmap-test/bin/gsd && echo "PROCESSMAP_GSD_WRAPPER_FOUND" || echo "PROCESSMAP_GSD_WRAPPER_MISSING"
test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs && echo "CODEX_GSD_TOOLS_FOUND" || echo "CODEX_GSD_TOOLS_MISSING"
```
If GSD unavailable, document as `GSD_FALLBACK_MANUAL_EXECUTION_ONLY` in `EXEC_REPORT.md`.

---

## 1. Goal

Implement a bounded smoothness improvement that is **human-perceptible**.

The user's hard source of truth:
- v1.0.131 (perf/process-stage-baseline-jank-v1) was formally REVIEW_PASS.
- User manually tested and said: "maybe 10% smoother", "still jitters", "canvas does not keep up with pointer".
- **Formal REVIEW_PASS ≠ user-visible solved.**

You must:
1. Reproduce the user's real complaint.
2. Measure human-perceived smoothness, not only long tasks.
3. Identify the residual bottleneck with evidence.
4. Implement bounded fix.
5. Validate with human-perceived before/after evidence.
6. Update version/update ledger to v1.0.132.
7. Produce all required reports.

---

## 2. Reproduce User Complaint

Target diagram:
- Project: `wewe` / «Описание процессов Долгопрудный»
- Session: large no-overlays Diagram
- Mode: Modeler default (palette visible)
- Overlays OFF (`window.fpcPropertyOverlay = 0`)

Navigate if direct URL unknown:
1. Open `http://clearvestnic.ru:5180/?cb=<timestamp>` in fresh browser context.
2. Authenticate.
3. Select project `wewe`.
4. Open session «Описание процессов Долгопрудный».
5. Ensure Diagram tab active.
6. Disable overlays.

Perform real manual-like interactions:
- Empty region canvas pan (quick, slow, diagonal).
- Dense region canvas pan (quick, slow).
- Element drag (BPMN shape).

Record subjective notes immediately.

---

## 3. Baseline Measurement (Before Code)

### 3.1 Human-Perceived Smoothness Baseline
Create `HUMAN_PERCEIVED_SMOOTHNESS_BASELINE.md`.

Classify each scenario:
- smooth
- slightly jittery
- materially jittery
- unusable

Include exact location/zoom/interaction notes.

### 3.2 Pointer-Follow Latency
Create `POINTER_FOLLOW_LATENCY_PROFILE.md`.

Implement or use browser snippets to measure:
- pointermove event timestamp
- next requestAnimationFrame timestamp
- canvas/viewbox/transform update timestamp if accessible
- frame gap distribution
- p95 frame gap
- max frame gap during drag

If direct measurement is hard:
- Document limitation.
- Measure frame pacing and transform mutation cadence via MutationObserver.

### 3.3 Frame Pacing
Create `FRAME_PACING_PROFILE.md`.

During 3-second pan/drag, collect RAF deltas:
- total frames
- avg frame delta
- p95 frame delta
- max frame delta
- frames > 16.7ms
- frames > 33ms
- frames > 50ms

### 3.4 Dense Region Rendering
Create `DENSE_REGION_RENDERING_PROFILE.md`.

Compare empty vs dense region:
- DOM total count
- SVG node count
- `.djs-container`, `.fpcPropertyOverlay`, `.djs-overlay`, `.fpcFocusDim`, `.fpcAnalyticsSelected`, `.djs-bendpoint`, `.djs-segment-dragger`
- Frame pacing comparison

### 3.5 Element Drag
Create `ELEMENT_DRAG_SMOOTHNESS_PROFILE.md`.

- 3 attempts
- Measure frame pacing, jitter
- Property panel / render impact
- Confirm no unintended durable save during drag (PUT after pointerup is pre-existing auto-save)

### 3.6 Tab Switch Sanity
- Analysis → Diagram
- XML → Diagram
- Ensure no regression from previous contour

---

## 4. Identify Bottleneck

Create `SMOOTHNESS_ROOT_CAUSE.md`.

Test and rank hypotheses H1–H9 with evidence:

**H1.** Visual jitter is caused by SVG repaint/composite cost in dense diagram regions.  
**H2.** Pointer-follow latency is caused by bpmn-js canvas pan transform update cadence.  
**H3.** Non-essential side effects still run during active pan/drag.  
**H4.** CSS/SVG effects increase paint cost during interaction.  
**H5.** Text/stroke/label rendering in large SVG causes dense-region frame drops.  
**H6.** React is mostly clean but still has micro-renders during pointer movement.  
**H7.** Playwright long-task metrics are not adequate for human smoothness.  
**H8.** Element drag has different bottleneck than canvas pan.  
**H9.** Remaining issue requires interaction-mode optimization or alternate read-only viewer spike.

Do not proceed to fix without evidence.

---

## 5. Implementation Boundary

### You MAY:
- Modify frontend files for smoothness fix.
- Update version/update ledger (v1.0.131 → v1.0.132).
- Add bounded interaction-mode logic.
- Add bounded frame-pacing instrumentation (gated/removed after validation if needed).
- Add CSS interaction-state simplification.
- Add RAF coalescing/suppression around non-essential side effects.
- Extract modules if touching BpmnStage/ProcessStage (decomposition-first).

### You MUST NOT:
- Modify backend/schema/storage.
- Modify Product Actions.
- Modify RAG tooling.
- Modify AG-UI.
- Install packages.
- Change BPMN XML semantics.
- Deploy stage/prod.
- Commit/push/PR.
- Introduce full alternative engine.
- Introduce WebGL/canvas replacement in this contour.

### Decomposition-First Rule
If ProcessStage or BpmnStage is touched:
- Do not add more logic directly into god files unless explicitly justified.
- Extract to existing or new modules under `frontend/src/features/process/bpmn/stage/`.
- Document in `DECOMPOSITION_REPORT.md`.

---

## 6. Possible Fix Directions

Choose based on evidence.

**Option A — Interaction mode suppressor**
- On active canvas pan / element drag:
  - Add root class like `.fpcDiagramInteracting`.
  - Disable expensive hover/selection effects.
  - Defer property panel sync.
  - Suppress non-essential React state updates.
  - Restore on pointerup/cancel.

**Option B — Dense SVG repaint reduction**
- Reduce CSS effects active during interaction (shadows, filters, transitions, heavy strokes, text effects).
- Use interaction-mode CSS only while dragging/panning.

**Option C — RAF transform / side-effect coalescing**
- Ensure side effects happen at most once per frame.
- Do not run analytics/decor/panel sync per pointermove.

**Option D — Hover/selection freeze during pan**
- During canvas panning: ignore hover/out events, do not re-render hover UI, do not update selected state until pointerup.

**Option E — Canvas container isolation**
- Ensure canvas area does not trigger layout/reflow of surrounding panels.
- Use CSS containment if safe (`contain`, `will-change`, transform isolation).
- Only after evidence and with regression checks.

**Option F — Element drag-specific side-effect guard**
- Separate element drag from canvas pan.
- Suppress non-essential updates during element drag.
- Restore after command completion/pointerup.

**Option G — Next bottleneck decision**
- If no bounded frontend improvement can materially improve smoothness:
  - Produce `NEXT_BOTTLENECK_DECISION.md` recommending follow-up contours.

---

## 7. Version / Update Ledger

Increment visible version/update row:
- `frontend/src/config/appVersion.js`: `currentVersion: "v1.0.132"`
- Add changelog entry with:
  - version
  - short SHA
  - timestamp
  - contour id
  - summary (human-perceived pan/drag smoothness, pointer-follow latency, dense-region jitter)

Ensure:
- Marker off canvas.
- `build-info.json` valid.
- `window.__PROCESSMAP_BUILD_INFO__` valid.

Create `VERSION_UPDATE_LEDGER_PROOF.md`.

---

## 8. Validation After Code

### Rebuild & Restart
```bash
cd /opt/processmap-test/frontend
npm run build
cd /opt/processmap-test
docker compose restart gateway
```

Verify:
- 5180 serves fresh JS (new hash).
- `build-info.json` SHA matches HEAD.
- Footer shows v1.0.132.
- Marker not on canvas.

### Re-run All Measurements
- Human-perceived smoothness → `HUMAN_PERCEIVED_SMOOTHNESS_BEFORE_AFTER.md`
- Pointer-follow latency → compare to baseline.
- Frame pacing → compare to baseline.
- Dense region → compare to baseline.
- Element drag → compare to baseline.
- Tab switch → no regression.

### Required Browser Counts
```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-container').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcFocusDim').length
document.querySelectorAll('.fpcAnalyticsSelected').length
document.querySelectorAll('.djs-bendpoint').length
document.querySelectorAll('.djs-segment-dragger').length
window.__PROCESSMAP_BUILD_INFO__
```

---

## 9. Required Reports

Write all reports in **Russian** except code snippets.

1. `EXEC_REPORT.md` — master execution report.
2. `RAG_PREFLIGHT_EXECUTOR.md` — executor RAG preflight.
3. `VERSION_UPDATE_LEDGER_PROOF.md` — version proof.
4. `HUMAN_PERCEIVED_SMOOTHNESS_BASELINE.md` — baseline.
5. `HUMAN_PERCEIVED_SMOOTHNESS_BEFORE_AFTER.md` — before/after.
6. `POINTER_FOLLOW_LATENCY_PROFILE.md` — latency.
7. `FRAME_PACING_PROFILE.md` — frame pacing.
8. `DENSE_REGION_RENDERING_PROFILE.md` — dense region.
9. `ELEMENT_DRAG_SMOOTHNESS_PROFILE.md` — element drag.
10. `SMOOTHNESS_ROOT_CAUSE.md` — root cause.
11. `RUNTIME_BEFORE_AFTER.md` — runtime proof.
12. `DECOMPOSITION_REPORT.md` — if extraction happened.
13. `IMPLEMENTATION_NOTES.md` — technical details.
14. `NEXT_BOTTLENECK_DECISION.md` — if not materially solved.
15. `READY_FOR_REVIEW` — marker file when complete.
    Or `EXEC_BLOCKED.md` — if blocked with reason.

---

## 10. Safety Checklist

- [ ] No PUT /bpmn from view pan/canvas drag.
- [ ] No PATCH /sessions from view pan/canvas drag.
- [ ] No BPMN XML mutation from view interactions.
- [ ] No Product Actions changes.
- [ ] No RAG runtime changes.
- [ ] No backend/schema/storage changes.
- [ ] No package install.
- [ ] Build passes (`npm run build` 0 errors).
- [ ] Console errors 0 during tests.
