# React Audit Requirements

**Контур**: `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID**: `20260529T000236Z-27528`

---

## Hypothesis

`BpmnStage.jsx` or a wrapper component calls `setState` on every `canvas.viewbox.changed` event, triggering React reconciliation of the entire component tree including 3754 SVG nodes.

## Files to audit

1. `frontend/src/components/process/BpmnStage.jsx` — PRIMARY
2. `frontend/src/components/ProcessStage.jsx` — shell wrapper, check prop churn
3. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` — event bus listeners
4. Any custom hook that subscribes to bpmn-js events.

## Search patterns

```javascript
// BAD patterns that cause re-render every pan frame:
canvas.on('viewbox.changed', ...) // with setState inside
canvas.on('canvas.viewbox.changed', ...) // with setState inside
eventBus.on('canvas.viewbox.changing', ...) // with setState inside
modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => setViewbox(viewbox))
useEffect(() => { eventBus.on(..., () => setX(...)) }, [])
```

## What to check

Does `setState` update:
- Viewbox coordinates (x, y, scale)?
- Selection state?
- Overlay data?
- Any other state that changes every pan frame?

## Fix patterns

### Option 1: useRef instead of useState
```javascript
// BAD
const [viewbox, setViewbox] = useState(null);
useEffect(() => {
  modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => setViewbox(viewbox));
}, []);

// GOOD
const viewboxRef = useRef(null);
useEffect(() => {
  modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => { viewboxRef.current = viewbox; });
}, []);
```

### Option 2: debounce state update to 200ms trailing
```javascript
// If state MUST be updated (e.g. for UI indicator), debounce:
const debouncedSetViewbox = useMemo(() => debounce(setViewbox, 200), []);
useEffect(() => {
  modeler.get('canvas').on('viewbox.changed', ({ viewbox }) => debouncedSetViewbox(viewbox));
}, []);
```

## Verification

1. React DevTools extension → Settings → «Highlight updates when components render» → ON.
2. Pan canvas.
3. Expected: `.djs-container` and `BpmnStage` do **NOT** flash (no re-render).
4. Only `BpmnStage` should re-render on: initial load, element selection, diagram import.

## Expected deliverables from Agent 2

- `REACT_AUDIT.md`: what `setState` calls were found, which ones were fixed.
- `RENDER_FIX.md`: exact changes made.
- Console log or DevTools screenshot proving zero re-renders during pan.
