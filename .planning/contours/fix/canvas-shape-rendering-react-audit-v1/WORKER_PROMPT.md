# Worker Prompt — Agent 2

**Contour**: `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID**: `20260529T000236Z-27528`  
**Language**: English for prompts, Russian for reports

---

## Scope

You are Agent 2 / Worker. Implement safe CSS-only rendering optimizations and audit React re-renders on the BPMN canvas.

### A. CSS shape-rendering optimization (safe, CSS-only, no JS)

Add to global CSS targeting bpmn-js SVG:

```css
/* Target the SVG root inside bpmn-js canvas */
.djs-container svg {
  shape-rendering: optimizeSpeed; /* Browser uses faster algorithm for curves */
}

/* Optional: non-scaling stroke prevents stroke-width recalculation on zoom */
.djs-container svg .djs-connection {
  vector-effect: non-scaling-stroke;
}

/* Optional: crisp edges for shapes (less anti-aliasing cost) */
.djs-container svg .djs-shape {
  shape-rendering: crispEdges;
}
```

**Why safe:**
- Pure CSS, no DOM manipulation.
- No positioning changes.
- No layer promotion (`will-change`, `translateZ`).
- `shape-rendering` is a hint; browser ignores if unsupported.
- Overlays are HTML elements outside SVG, unaffected.

**File target**: `frontend/src/styles/legacy/legacy_bpmn.css` or `frontend/src/index.css` or a dedicated `bpmn-overrides.css`.

**Check**: Verify no other `.djs-container` rules conflict (especially from reverted GPU compositing).

### B. React re-render audit (critical)

**Hypothesis**: `BpmnStage.jsx` or wrapper component calls `setState` on every `canvas.viewbox.changed` event, triggering React reconciliation of the entire component tree including 3754 SVG nodes.

**You must:**
1. Find `BpmnStage.jsx` (or equivalent BPMN canvas React component).
2. Search for state updates inside event handlers:
   - `canvas.on('viewbox.changed', ...)`
   - `canvas.on('canvas.viewbox.changed', ...)`
   - `eventBus.on('canvas.viewbox.changing', ...)`
   - Any `useState` setter called from bpmn-js event callbacks.
3. Check if `setState` updates:
   - Viewbox coordinates (x, y, scale)?
   - Selection state?
   - Overlay data?
   - Any other state that changes every pan frame?
4. If found: move viewbox tracking to `useRef` (not `useState`) or debounce state update to 200ms trailing.
5. Ensure React DevTools "Highlight updates" shows NO re-renders on `.djs-container` during pan.

**Fix pattern:**
```javascript
// BAD: causes re-render every pan frame
const [viewbox, setViewbox] = useState(null);
useEffect(() => {
  modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => setViewbox(viewbox));
}, []);

// GOOD: ref only, no re-render
const viewboxRef = useRef(null);
useEffect(() => {
  modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => { viewboxRef.current = viewbox; });
}, []);
```

### C. Verification via React DevTools

- Install React DevTools extension (or use react-devtools standalone).
- Enable "Highlight updates when components render".
- Pan canvas — `.djs-container` and `BpmnStage` must NOT flash (no re-render).
- Only `BpmnStage` should re-render on: initial load, element selection, diagram import.

---

## Forbidden (strict non-goals)

**STRICTLY FORBIDDEN** — these caused overlay disappearance in previous contour:
- NO `will-change` on `.djs-container` or SVG.
- NO `contain` CSS property on `.djs-container`.
- NO `translateZ(0)` or `transform` on `.djs-container`.
- NO viewport culling (no DOM removal).
- NO `display:none` / `visibility:hidden` on shapes.
- NO bpmn-js core modification.
- NO overlay debounce changes (already done in separate contour `fix/canvas-overlay-debounce-v1`).

---

## Implementation details

### CSS changes
- File: `frontend/src/styles/legacy/legacy_bpmn.css` or `frontend/src/index.css`
- Add `.djs-container svg { shape-rendering: optimizeSpeed; }`
- Add `.djs-container svg .djs-connection { vector-effect: non-scaling-stroke; }`
- Verify no other `.djs-container` rules conflict (especially from reverted GPU compositing).

### React audit
- File: `frontend/src/components/process/BpmnStage.jsx` (or `BpmnCanvas.jsx`)
- Search: `useState`, `setState`, `useReducer`, `dispatch` inside bpmn-js event hooks.
- Check: `useEffect(() => { modeler.on('...', () => setX(...)) }, [])`

### Verification
- Build: `npm run build` must pass.
- Deploy to `:5177`.
- Measure FPS before/after.
- React DevTools or console logging for re-render count.

---

## Reports (in Russian)

Create these files under `.planning/contours/fix/canvas-shape-rendering-react-audit-v1/`:

| Report | Content |
|--------|---------|
| `WORKER_REPORT.md` | Summary of all changes |
| `CSS_OPTIMIZATION.md` | What CSS was added, where, why safe |
| `REACT_AUDIT.md` | What `setState` calls found, which fixed |
| `RENDER_FIX.md` | Exact code changes for React fix |
| `BEFORE_AFTER_MEASUREMENTS.md` | FPS numbers before and after |
| `RUNTIME_PROOF_5177.md` | Proof that `:5177` serves current build |
| `WORKER_DONE` | Marker file |

If blocked: create `EXEC_BLOCKED.md` with reason.

---

## Acceptance criteria for your work

- [ ] CSS `shape-rendering: optimizeSpeed` present in served bundle.
- [ ] No forbidden CSS (`will-change`, `contain`, `translateZ`) on `.djs-container`.
- [ ] React audit completed — `REACT_AUDIT.md` documents findings.
- [ ] If `setState` on pan found — fixed via `useRef` or debounce.
- [ ] React DevTools shows NO re-renders on `BpmnStage` during pan.
- [ ] Large diagram pan FPS ≥ 38 (was ~30).
- [ ] Small diagram pan FPS still 60.
- [ ] Overlays visible and correctly positioned during pan.
- [ ] No console errors.
- [ ] `npm run build` passes.
- [ ] `:5177` serves current build.
