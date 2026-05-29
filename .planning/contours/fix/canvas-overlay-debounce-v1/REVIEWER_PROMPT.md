# Agent 3 / Reviewer Prompt — Overlay Debounce Verification

**Contour**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Language**: English for verification; Russian for reports.

---

## 0. Hard Rules

- **NEVER** approve without independent runtime validation.
- **NEVER** approve based only on synthetic/programmatic tests.
- Must perform **real mouse drag** on the BPMN canvas.
- Must verify `:5177` is actually serving current build (`curl -I http://localhost:5177` or `clearvestnic.ru:5177`).
- If any gate fails → `CHANGES_REQUESTED`, list specific fixes needed.

---

## 1. Pre-Review Checks

1. Verify `WORKER_DONE` exists.
2. Read `WORKER_REPORT.md`, `DEBOUNCE_IMPLEMENTATION.md`, `BEFORE_AFTER_MEASUREMENTS.md`.
3. Verify runtime:
   ```bash
   curl -I http://localhost:5177
   ```
   Must return HTTP 200 with no-cache headers.
4. Check console for errors:
   ```bash
   # Or open DevTools Console on :5177
   ```

---

## 2. Performance Verification (A)

### A1. Large diagram pan FPS
- Load the large diagram (428 elements, 108 KB XML).
- Perform **real mouse drag** pan for at least 3 seconds.
- Measure FPS via DevTools Performance or `measureFPS()`.
- **PASS required**: FPS ≥ 38 (baseline was ~30.4).

### A2. Long tasks during pan
- Record Performance panel during 3-second pan.
- **PASS required**: Long tasks total ≤ 100 ms (baseline was 148 ms).

### A3. Small diagram regression
- Load a small diagram.
- Pan for 3 seconds.
- **PASS required**: FPS still 60. No regression.

---

## 3. Stability Verification (B)

Perform these checks on the **large diagram**:

| # | Check | Method | Pass Criteria |
|---|-------|--------|---------------|
| B1 | No shapes disappear | Pan aggressively to edges | All shapes remain visible |
| B2 | Overlays catch up | Stop panning, wait 200 ms | Overlays snap to correct positions |
| B3 | Overlays visible and correct | Visual inspection after pan | Badges/labels show correct data |
| B4 | Scrubber/minimap | Pan using minimap, pan main canvas | Minimap updates correctly |
| B5 | Zoom in/out | Mouse wheel / buttons | Smooth, no missing elements |
| B6 | Select and drag | Click shape, drag shape | Selection works, drag works |
| B7 | Console errors | DevTools Console | 0 errors, 0 warnings related to overlays |

**PASS required**: All B1–B7 pass.

---

## 4. Code Safety Verification (C)

Review the diff (`git diff` or report from Worker):

| # | Check | Pass Criteria |
|---|-------|---------------|
| C1 | No bpmn-js core modified | Only ProcessMap custom files changed |
| C2 | No DOM removal of shapes | No `element.remove()`, no culling logic |
| C3 | No viewport culling reintroduced | No visibility checks that hide shapes |
| C4 | Overlay functionality preserved | Badges/labels still render correct data |

**PASS required**: All C1–C4 pass.

---

## 5. Runtime Verification (D)

| # | Check | Command / Method | Pass Criteria |
|---|-------|------------------|---------------|
| D1 | :5177 serves current build | `curl -I http://localhost:5177` | HTTP 200, no 502 |
| D2 | No console errors | DevTools Console | 0 errors |
| D3 | No 502 errors | Network panel | 0 502 responses |

**PASS required**: All D1–D3 pass.

---

## 6. Inline Edit Edge Case

If possible, test:
- Double-click an overlay label to enter inline edit.
- Pan the canvas while editing.
- **Expected**: Edit mode persists, cursor stays with the text, overlay does not jump erratically.

---

## 7. Final Verdict

- **REVIEW_PASS**: Only if A+B+C+D all pass.
- **CHANGES_REQUESTED**: If any A/B/C/D gate fails. List:
  - Which gate failed.
  - Specific evidence (numbers, screenshots, logs).
  - What must be fixed.

Write verdict to `REVIEW_VERDICT.md`.

If REVIEW_PASS:
- Create PR to stage.
- **Do NOT merge** without explicit user approval.

---

## 8. Reporting Budget

- Chat: compact status lines only.
- No full diffs, CSS, logs, JSON, or stack traces in chat.
- Use PASS/BLOCKED/CHANGES_REQUESTED labels explicitly.
- Detailed evidence goes into `REVIEW_VERDICT.md`.
