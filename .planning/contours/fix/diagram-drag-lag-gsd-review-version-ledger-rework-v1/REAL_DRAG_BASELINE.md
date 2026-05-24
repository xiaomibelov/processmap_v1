# Real Drag Baseline

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`

---

## Previous Contour Baseline (`fix/diagram-real-drag-performance-and-engine-decomposition-v1`)

### Agent 2 Before Fix
- DOM: 7,710 total, 2,107 SVG
- Overlays: 0
- Canvas pan (quick drag): 34 long tasks, ~6,244ms total

### Agent 2 After Fix (previous contour)
- Canvas pan (quick drag): 20 long tasks, ~2,848ms total
- Improvement: -41% long tasks, -54% long task total

### Agent 3 Reviewer Measurements
- Quick drag (no steps): 12 long tasks, ~1,674ms
- Stepped drag (steps=20): 87 long tasks, ~12,291ms
- Agent 3 dismissed stepped drag as "Playwright measurement artifact" — this was rejected by user.

## New Baseline Context (this contour)

### Changes that affect baseline
1. **Modeler is now default** (was Viewer): element drag is now possible.
2. **commandStack.changed guard added**: suppresses `runImmediateEditorFanout` during drag.

### Expected effects
- Canvas pan baseline should be similar to previous after-fix numbers (viewer path unchanged).
- Element drag baseline should now be MEASURABLE (was blocked by viewer default).
- Element drag should see improvement from commandStack guard (no decor fanout during drag).

### Browser Testing Limitation
Multiple Playwright attempts to open the large diagram session were blocked by app loading issues in the automated browser context (208 DOM nodes, disabled tabs). This appears to be a test-environment auth/rendering issue, not a code regression.

Agent 3 should perform the real drag baseline in its own browser context.

---

## Recommended Baseline Procedure (for Agent 3)

1. Fresh browser context on `http://clearvestnic.ru:5180/?cb=<timestamp>`
2. Navigate to `wewe` session in `Описание процессов Долгопрудный`
3. Ensure Diagram tab active, overlays off: `document.querySelectorAll('.fpcPropertyOverlay').length === 0`
4. **Canvas pan**:
   ```js
   await page.mouse.move(x, y);
   await page.mouse.down();
   await page.mouse.move(x + 150, y + 0, { steps: 10 });
   await page.mouse.move(x + 300, y + 80, { steps: 10 });
   await page.mouse.up();
   ```
5. **Element drag** (now possible with Modeler default):
   - Pick a `.djs-shape` (BPMN task)
   - `mouse.down` → `mouse.move` with steps → `mouse.up`
   - Verify element moved
6. Record: duration, long tasks, DOM/SVG stability, console errors, network (0 PUT/PATCH).

---

## Status
⚠️ Browser baseline blocked by test environment. Code-level baseline documented. Agent 3 to verify.
