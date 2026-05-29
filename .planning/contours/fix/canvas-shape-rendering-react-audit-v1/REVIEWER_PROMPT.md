# Reviewer Prompt — Agent 3

**Contour**: `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID**: `20260529T000236Z-27528`  
**Language**: English for prompts, Russian for reports

---

## Scope

You are Agent 3 / Reviewer. Verify the implementation of safe CSS shape-rendering optimizations and React re-render audit on the BPMN canvas.

### What to verify

1. **Overlays stability (CRITICAL)**
   - Overlays visible during entire pan operation.
   - Overlays do NOT disappear at any point.
   - Overlays correctly positioned after pan stops.
   - No overlay detachment from shapes.

2. **CSS safety**
   - No `will-change` on `.djs-container` or SVG.
   - No `contain` on `.djs-container`.
   - No `transform` / `translateZ` on `.djs-container`.
   - Only `shape-rendering` and `vector-effect` added.

3. **React re-render audit**
   - `BpmnStage` does NOT re-render during pan (verified via React DevTools or logging).
   - Any `setState` on `viewbox.changed` removed or moved to ref.
   - No state updates triggered by pan events.

4. **Performance**
   - Large diagram pan FPS ≥ 38 (was ~30).
   - Small diagram pan FPS still 60.
   - No perceived stutter.

5. **Runtime**
   - `:5177` serves current build.
   - No console errors.
   - No 502 errors.

---

## Verification steps

### Step 1: Source/runtime truth
```bash
cd /opt/processmap-test
git branch --show-current
git diff --name-only
git diff --stat
curl -s -o /dev/null -w "%{http_code}" http://localhost:5177/
```
Must be HTTP 200.

### Step 2: CSS safety check
```bash
curl -s http://localhost:5177/assets/index-*.css | grep -E 'will-change|contain:|translateZ' || echo "PASS: no forbidden CSS"
curl -s http://localhost:5177/assets/index-*.css | grep 'shape-rendering' || echo "FAIL: no shape-rendering"
curl -s http://localhost:5177/assets/index-*.css | grep 'vector-effect' || echo "FAIL: no vector-effect"
```

### Step 3: Overlays check
- Open browser to `:5177`.
- Load large diagram (428 elements).
- Start real mouse drag pan.
- Watch overlays (property panels, labels, markers) — must remain visible entire time.
- If ANY overlay disappears → `CHANGES_REQUESTED`.

### Step 4: React re-render check
- Open React DevTools.
- Enable "Highlight updates when components render".
- Pan canvas.
- `BpmnStage` and `.djs-container` must NOT flash.
- If flash observed → `CHANGES_REQUESTED`.

### Step 5: FPS measurement
- Use same `measureFPS()` method as Worker (3-second pan).
- Large diagram must show ≥ 38 FPS.
- Small diagram must show 60 FPS.

### Step 6: Console check
- Open DevTools Console.
- Pan, zoom, select.
- No errors, no warnings related to canvas.

---

## Final verdict

- `REVIEW_PASS` only if ALL of A+B+C+D+E pass.
- `CHANGES_REQUESTED` if overlays disappear OR FPS target missed OR any forbidden CSS found OR React re-renders observed during pan.

---

## Reports (in Russian)

Create these files under `.planning/contours/fix/canvas-shape-rendering-react-audit-v1/`:

| Report | Content |
|--------|---------|
| `REVIEW_REPORT.md` | Full review with verdict |
| `REVIEW_VERDICT.md` | `REVIEW_PASS` or `CHANGES_REQUESTED` |
| `REVIEW_STARTED` / `REVIEW_PASS` / `REVIEW_BLOCKED` | Marker files |

Do NOT merge. Do NOT create PR.
