# Reviewer Prompt — fix/canvas-overlay-regression-emergency-v1

**Contour**: `fix/canvas-overlay-regression-emergency-v1`  
**Run ID**: `20260528T224900Z-21407`  
**Agent**: Agent 3 / Reviewer

---

## Task

Verify that the emergency revert removed GPU compositing / zoom simplification regression and restored stable overlay behavior on `:5177`.

---

## 1. Source Truth Verification

### A. Check what was reverted
```bash
cd /opt/processmap-test
git diff HEAD -- frontend/src/styles/legacy/legacy_bpmn.css
# EXPECTED: no diff (file matches HEAD, GPU compositing CSS removed)

git diff HEAD -- frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js
# EXPECTED: only overlay debouncer + deferUpdate calls remain;
#            NO bindGpuCompositingAndZoomHooks, NO updateZoomClass,
#            NO GPU_PAN_ACTIVE_CLASS, NO zoom-simplified/minimal classes

git diff HEAD -- frontend/src/components/process/BpmnStage.jsx
# EXPECTED: deferUpdate: true remains (from stable debounce contour)

git diff HEAD -- frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js
# EXPECTED: deferUpdate: true remains (from stable debounce contour)
```

### B. Check runtime served bundles
```bash
curl -s http://localhost:5177/assets/index-*.css | grep -E 'pan-active|zoom-simplified|zoom-minimal|translateZ\(0\)|contain:'
# EXPECTED: empty output — no GPU compositing CSS served

curl -s http://localhost:5177/assets/index-*.js | grep -E 'bindGpuCompositingAndZoomHooks|updateZoomClass|GPU_PAN_ACTIVE_CLASS'
# EXPECTED: empty output — no GPU compositing JS served
```

---

## 2. Runtime Verification (Browser)

Open `:5177`, load diagram, open DevTools.

### A. Overlay behavior during pan
1. **Real mouse drag** on canvas (not programmatic zoom/click).
2. Observe overlays during pan:
   - Overlays must NOT disappear permanently.
   - Overlays may briefly hide due to debounce (150 ms) — acceptable.
   - After pan stops, overlays must snap to correct positions within 200 ms.
3. Pan fast, pan slow, pan in all directions.

### B. DevTools Elements panel
1. Find `.djs-overlay` elements during pan.
   - They must exist in DOM.
   - They must NOT have `display: none` or `visibility: hidden` after pan stops.
   - They must NOT be positioned off-screen.

### C. DevTools Styles panel
1. Select `.djs-container`.
   - Computed `will-change` must be `auto` (NOT `transform`).
   - Computed `contain` must be `none` (NOT `layout paint style`).
2. Select `.djs-canvas` during pan.
   - Must NOT have class `pan-active` after pan stops.

### D. Console
- No errors from bpmn-js overlay module during pan.

---

## 3. Acceptance Criteria

| # | Criteria | Verdict |
|---|----------|---------|
| 1 | GPU compositing CSS (`will-change`, `contain`, `translateZ(0)`) removed from served bundle | ⬜ |
| 2 | Zoom simplification CSS (`zoom-simplified`, `zoom-minimal`) removed from served bundle | ⬜ |
| 3 | `bindGpuCompositingAndZoomHooks` removed from JS bundle | ⬜ |
| 4 | Overlay debouncer (`bindOverlayPanDebouncer`) still present in JS bundle | ⬜ |
| 5 | `deferUpdate: true` still present in JS bundle | ⬜ |
| 6 | Overlays visible at load | ⬜ |
| 7 | Overlays do NOT disappear during real mouse drag pan | ⬜ |
| 8 | Overlays snap to correct positions after pan | ⬜ |
| 9 | Zoom in/out scales overlays correctly | ⬜ |
| 10 | Scrubber works | ⬜ |
| 11 | No console errors | ⬜ |

**All 11 must be PASS.** Any FAIL → CHANGES_REQUESTED.

---

## 4. Deliverables (in Russian)

- `REVIEW_REPORT.md` — findings, verdict
- `REVIEW_VERDICT.md` — PASS or CHANGES_REQUESTED with specific blockers
- `RUNTIME_PROOF_5177.md` — screenshots, curl output, DevTools evidence
- `REVIEW_PASS` or `CHANGES_REQUESTED` marker file

---

## 5. Hard Rules

- Must perform **real mouse drag**, not only programmatic zoom/click.
- Must verify **runtime served bundles** match source truth (`intended == served`).
- If `:5177` serves stale bundles → BLOCKED until runtime/source truth mismatch resolved.
- Do NOT approve based only on source code inspection.
