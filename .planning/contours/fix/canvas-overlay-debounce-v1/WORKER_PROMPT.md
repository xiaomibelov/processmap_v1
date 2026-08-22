# Agent 2 / Worker Prompt — Overlay Debounce Implementation

**Contour**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Language**: English for implementation; Russian for reports.

---

## 0. Hard Rules

- **NEVER** reintroduce viewport culling. It was reverted in `fix/canvas-viewport-culling-v1` due to shapes disappearing and scrubber breaking.
- **NEVER** remove shapes from DOM.
- **NEVER** modify bpmn-js core.
- **NEVER** change backend code.
- **NEVER** touch scrubber/minimap logic.
- If blocked, write `EXEC_BLOCKED.md` and stop.

---

## 1. Scope

Find and debounce/throttle **custom overlay position updates** during canvas pan.

### What to debounce
- Property labels, status badges, AI indicators — any ProcessMap custom overlay that updates position on viewbox change.
- The subscription/handler that reacts to `canvas.viewbox.changed` or similar events.

### What must NOT be debounced
- bpmn-js internal shape rendering (shapes must move at 60 FPS).
- Connection line rendering.
- Selection highlight.

### What to preserve
- Overlays catch up to correct positions within 100–200 ms after pan stops.
- If an overlay is in inline-edit mode → bypass debounce for that overlay.
- Zoom, select, drag, click, scrubber, minimap — all unaffected.

---

## 2. Technical Investigation (do first)

Run these searches to locate the overlay update code:

```bash
grep -r "overlay\|badge\|label\|indicator" frontend/src/components/process/ --include="*.jsx" --include="*.js" | grep -v "node_modules"
grep -r "viewbox.changed\|canvas.viewbox\|addOverlay\|removeOverlay" frontend/src/components/process/ --include="*.jsx" --include="*.js"
```

Likely files to inspect:
- `ProcessMapOverlayManager.jsx` / `.js`
- `BpmnStage.jsx` (overlay hooks)
- `useBpmnSettledDecorFanout.js`
- Any file calling `overlays.add()` / `overlays.remove()` on the bpmn-js API

Questions to answer:
- Does overlay update happen inside a `requestAnimationFrame` loop?
- Does it call `overlays.get({ element: id })` on every viewbox change?
- Does it force `elementRegistry.getAll()` iteration on every frame?

Write findings to `OVERLAY_CODE_LOCATION.md`.

---

## 3. Implementation

Choose ONE of these approaches (prefer #1 or #2):

### Option 1: Debounce with trailing edge (recommended)
- Use `lodash.debounce` or a lightweight native `setTimeout` debounce.
- Delay: **150 ms**.
- `trailing=true` (fire after pan stops).
- `leading=false` (do not fire on first event).

### Option 2: rAF throttle
- Update overlays every **3rd** `requestAnimationFrame` instead of every frame.
- Still significantly reduces DOM churn.

### Option 3: CSS transform (if DOM position updates are the bottleneck)
- Apply `transform: translate3d(...)` instead of updating `top/left` or inline styles.
- GPU-composited, avoids reflow.

### Requirements
- After debounce fires, overlays must snap to the **exact** correct positions.
- During active inline text edit on an overlay → bypass debounce for that overlay only.
- Do not break existing overlay create/update/delete lifecycle.

---

## 4. Testing & Measurement

### Test environment
- Run frontend dev server on `:5177`.
- Use the **same** large diagram as audit (428 elements, 108 KB XML).
- Use the **same** small diagram for regression check.

### Baseline measurement (capture before changes)
- Pan the large diagram for 3 seconds.
- Record FPS via `measureFPS()` or DevTools Performance.
- Record long tasks total time via DevTools Performance.
- Save screenshot of Performance panel.

### After measurement (capture after changes)
- Same 3-second pan test.
- Record FPS and long tasks.
- Save screenshot.

### Acceptance for Worker (internal check before declaring done)
- [ ] Large diagram pan FPS ≥ 38 (baseline ~30.4).
- [ ] Long tasks ≤ 100 ms (baseline 148 ms).
- [ ] Small diagram pan FPS still 60.
- [ ] No shapes disappear during pan.
- [ ] Overlays visible and correctly positioned after pan stops.
- [ ] Scrubber/minimap works.
- [ ] Zoom in/out works.
- [ ] Select and drag work.
- [ ] No console errors on :5177.

If any internal check fails, iterate. Do NOT create `WORKER_DONE` until passed.

---

## 5. Deliverables

Write all reports in **Russian**.

| File | Content |
|------|---------|
| `WORKER_REPORT.md` | Summary: what was changed, why, files modified |
| `OVERLAY_CODE_LOCATION.md` | Where overlay update code lives, how it was found |
| `DEBOUNCE_IMPLEMENTATION.md` | Chosen approach, code changes, rationale |
| `BEFORE_AFTER_MEASUREMENTS.md` | FPS and long tasks: baseline vs after |
| `RUNTIME_PROOF_5177.md` | `curl -I`, console check, screenshot references |
| `TEST_RESULTS.md` | Checklist results from section 4 |
| `WORKER_DONE` | Empty marker file — signals completion |

If blocked: `EXEC_BLOCKED.md` with reason and context.

---

## 6. Reporting Budget

- Chat: compact status lines only.
- No full diffs, CSS, logs, JSON, or stack traces in chat.
- Use file paths, line references, `git diff --stat`.
- Detailed evidence goes into report files above.
