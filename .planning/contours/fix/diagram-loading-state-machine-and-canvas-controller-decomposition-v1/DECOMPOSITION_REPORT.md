# Decomposition Report

## New Modules Created

### 1. useDiagramLoadStateMachine

**Path**: `frontend/src/features/process/bpmn/stage/load/useDiagramLoadStateMachine.js`

**Responsibility**: Explicit state machine for Diagram loading lifecycle.

**Interface**:
```js
useDiagramLoadStateMachine({ warmTimeoutMs, coldTimeoutMs })
// Returns: { loadState, isReady, isCanvasVisible, isSkeletonVisible, isError, errorReason, lastTransitionAt, transition }
```

**States**: idle, initializing, importing, canvas-ready, ready, error, timeout

**Rationale**: Replaces the single `diagramReady` boolean that had no timeout, no error state, and no explicit transitions. The previous boolean could stay `false` forever without any recovery path.

### 2. DiagramLoadBoundary

**Path**: `frontend/src/features/process/bpmn/stage/load/DiagramLoadBoundary.jsx`

**Responsibility**: Controls skeleton, error panel, and canvas visibility.

**Interface**:
```jsx
<DiagramLoadBoundary loadState errorReason onRetry>
  {children}
</DiagramLoadBoundary>
```

**Key behaviors**:
- Skeleton ONLY for `initializing | importing`
- Error panel for `error | timeout` with retry button
- Children always in DOM (opacity toggle) to keep bpmn-js container stable

**Rationale**: Isolates loading UI from BpmnStage's 5800-line god file. Prevents canvas remount which breaks bpmn-js container attachment.

### 3. useBpmnCanvasLifecycle

**Path**: `frontend/src/features/process/bpmn/stage/load/useBpmnCanvasLifecycle.js`

**Responsibility**: Lightweight lifecycle tracker wrapping existing `ensureViewer`/`ensureModeler`/`renderViewer`/`renderModeler`.

**Interface**:
```js
useBpmnCanvasLifecycle({ ensureViewer, ensureModeler, renderViewer, renderModeler, destroyRuntime, viewerRef, modelerRef })
// Returns: { getInstance, importXml, destroy, lifecycleState, subscribe, publishEvent }
```

**Rationale**: Extracts lifecycle tracking from BpmnStage while keeping the actual bpmn-js imperative API in place. Can be expanded later to fully encapsulate creation/import/destroy.

### 4. DiagramRuntimeVersionBadge

**Path**: `frontend/src/features/process/stage/ui/DiagramRuntimeVersionBadge.jsx`

**Responsibility**: Visible runtime version badge showing appVersion + shaShort + date + contourId.

**Interface**:
```jsx
<DiagramRuntimeVersionBadge buildInfo={PROCESSMAP_BUILD_INFO} />
```

**Rationale**: Version marker must be visible in the same screenshot as the Diagram tab. Footer and bottom-right badge were too easy to miss. Badge is placed at top-left of canvas area.

## Files Modified

### BpmnStage.jsx
- Replaced `const [diagramReady, setDiagramReady] = useState(false)` with `useDiagramLoadStateMachine`
- `trackRuntimeStatus` now calls `transition("import_success")` / `transition("destroy")`
- After `renderViewer` / `renderModeler` success: `transition("import_success")`
- Added `DiagramRuntimeVersionBadge` and `DiagramLoadBoundary` in JSX
- Added `window.__PM_DIAGRAM_RUNTIME__` diagnostic object

### scripts/generate-build-info.mjs
- Updated fallback `contourId` to current contour

## Backward Compatibility

- `diagramReady` boolean removed entirely; only used in 3 places inside BpmnStage.jsx
- No other component referenced `diagramReady`
- `window.__PROCESSMAP_BUILD_INFO__` preserved
- `build-info.json` format unchanged
