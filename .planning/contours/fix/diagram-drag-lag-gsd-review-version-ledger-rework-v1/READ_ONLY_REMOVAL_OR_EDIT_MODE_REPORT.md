# Read-only / Edit Mode Report

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`

---

## Problem
Previous contour (`fix/diagram-real-drag-performance-and-engine-decomposition-v1`) passed review with:
> "Element did not move — transform unchanged — This is expected NavigatedViewer behavior (view mode prevents element drag) ✅"

User explicitly **rejected** this verdict. Read-only default is NOT acceptable if user expects to edit/move elements.

## Decision: Option A — Modeler as Default

### Rationale
- User requires element drag to work in the normal workflow.
- Modeler init on large diagrams is ~15s (per previous reports), which is below the 20s regression threshold.
- Option C (obvious toggle) was fallback if Modeler default causes >20s regression.

## Implementation

### 1. Extracted `diagramEditModeBoundary.js`
```js
export function useDiagramEditModeBoundary({ view }) {
  const [forceEditorMode, setForceEditorMode] = useState(true);

  useEffect(() => {
    if (view === "xml") {
      setForceEditorMode(false);
    }
    // Intentionally do NOT reset on view === "diagram"
  }, [view]);

  const isEditorActive = view === "editor" || forceEditorMode;
  const isViewerActive = view === "diagram" && !forceEditorMode;

  return { forceEditorMode, setForceEditorMode, isEditorActive, isViewerActive };
}
```

### 2. Modified `BpmnStage.jsx`
- Replaced `const [forceEditorMode, setForceEditorMode] = useState(false);`
- Replaced reset effect (`setForceEditorMode(false)` on diagram tab)
- Updated layer visibility to use `isEditorActive` / `isViewerActive`
- Added "Просмотр" button when `view === "diagram" && forceEditorMode`

### 3. Button Visibility
- **Viewer mode**: Shows "Редактировать BPMN" button (top-right, absolute)
- **Editor mode on diagram tab**: Shows "Просмотр" button (top-right, absolute)

## Safety
- XML tab still forces viewer mode (no accidental mutation in XML view).
- Explicit "Просмотр" button allows returning to lightweight Viewer if needed.
- No backend/schema changes.
- Build passes with 0 errors.

## Known Risks
1. **Modeler init latency**: Large diagrams may take ~15s for initial Modeler render. This is expected bpmn-js behavior and not a regression.
2. **Tab switch**: Switching from Analysis → Diagram will now show Modeler instead of Viewer. If this feels slow, user can click "Просмотр".

---

## Status
✅ Edit mode default implemented. Element drag is now possible immediately.
