# Loading State Machine Report

## Module

`frontend/src/features/process/bpmn/stage/load/useDiagramLoadStateMachine.js`

## States

| State | Description |
|-------|-------------|
| `idle` | No load in progress |
| `initializing` | Viewer/Modeler creation or reset started |
| `importing` | `importXML` in flight |
| `canvas-ready` | Canvas rendered, secondary decor may still hydrate |
| `ready` | Fully ready for interaction |
| `error` | Import or init failed |
| `timeout` | Exceeded warm/cold timeout |

## Transitions

| Action | From | To | Trigger |
|--------|------|----|---------|
| `reset` | any | `initializing` | `sessionId` change, `reloadKey` change |
| `init_done` | `initializing` / `idle` | `importing` | Canvas lifecycle init complete |
| `import_start` | `initializing` / `idle` / `canvas-ready` | `importing` | XML import begins |
| `import_success` | `importing` / `initializing` / `idle` | `ready` | `importXML` succeeds |
| `import_error` | any | `error` | `importXML` fails |
| `timeout` | `initializing` / `importing` | `timeout` | Timer expires |
| `canvas_ready` | `importing` / `initializing` | `canvas-ready` | Canvas attached |
| `fully_ready` | `canvas-ready` / `importing` | `ready` | All decor applied |
| `destroy` | any | `idle` | Runtime destroyed |

## Timeout Behavior

- **Warm timeout** (tab switch): 10,000 ms
- **Cold timeout** (fresh open): 20,000 ms
- Timer starts when entering `initializing` or `importing`
- Timer clears when entering `ready`, `error`, `timeout`, or `idle`
- On timeout: transitions to `timeout` state, renders error panel with retry

## Integration Points

### BpmnStage.jsx
- `sessionId` / `reloadKey` change → `transition("reset")`
- `renderViewer` success → `transition("import_success")`
- `renderModeler` success → `transition("import_success")`
- `trackRuntimeStatus` (Modeler runtime) → `transition("import_success")` when `nextReady`
- `trackRuntimeStatus` (destroy) → `transition("destroy")` when `nextDestroyed`

### DiagramLoadBoundary.jsx
- Renders skeleton for `initializing | importing`
- Renders error panel for `error | timeout`
- Renders children (canvas) for all states, with `opacity` toggle
- Never unmounts canvas after first paint

## Derived Flags

| Flag | True when |
|------|-----------|
| `isReady` | `canvas-ready` \| `ready` |
| `isCanvasVisible` | `canvas-ready` \| `ready` \| `error` \| `timeout` |
| `isSkeletonVisible` | `initializing` \| `importing` |
| `isError` | `error` \| `timeout` |
