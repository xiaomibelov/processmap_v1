# RAG Preflight — Planner Context

## Project: ProcessMap BPMN Canvas Performance Audit

### Existing Bottleneck Facts (from `tools/rag/facts/processmap-bottleneck-facts.ndjson`)

**Fact: bn-diagram-drag-lag**
- Problem: Diagram drag lag remained after multiple performance contours
- Current hypothesis: React bundle re-rendering dominates CPU (~95%) during drag; bpmn-js engine cost is minimal (~0.5%)
- Rejected hypotheses:
  - Pointermove event frequency is primary bottleneck (addressed but insufficient)
  - bpmn-js engine is primary bottleneck (profiler evidence contradicts)
- Evidence: Profiler shows React at ~95%, bpmn-js at ~0.5%
- Next contour: `perf/process-stage-baseline-jank-v1`

**Fact: bn-react-cpu-95**
- Problem: React bundle consumes ~95% CPU during diagram drag
- Current hypothesis: React reconciliation and state updates triggered by pointer move events cause frame drops
- Rejected hypotheses:
  - bpmn-js SVG rendering is bottleneck (profiler shows ~0.5%)
  - Network latency is bottleneck (local runtime, no network during drag)
- Next contour: `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`

### Architecture Facts

**Frontend Canvas Stack:**
- Main component: `frontend/src/components/process/BpmnStage.jsx`
  - Uses React 18.3.1
  - Uses bpmn-js 18.12.0
  - Manages viewer/modeler instances via refs
  - Tracks overlay IDs in state array (`overlayIds`)
  - Has many `useState` hooks that may trigger re-renders
- Viewer: `frontend/src/features/notation/bpmn/BpmnViewer.jsx`
  - Lightweight wrapper with zoom controls
- Lifecycle: `frontend/src/features/process/bpmn/stage/load/useBpmnCanvasLifecycle.js`
  - States: idle/creating/importing/ready/error
- Overlay system: `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
  - Adds/removes DOM overlay badges for notes, docs, status

**Backend Endpoints:**
- `GET /api/sessions/{id}/bpmn` — BPMN XML
- `GET /api/sessions/{id}/bpmn_meta` — Metadata
- `GET /api/sessions/{id}/bpmn/versions` — Version history

**Runtime:**
- Frontend dev server: `:5177`
- Backend API: `localhost:8088`
- Stage: `http://clearvestnic.ru:5180`

### Previous Contours (Referenced but may not exist on disk)

The following contours are referenced in bottleneck facts but their directories may have been cleaned up:
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`
- `fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- `fix/diagram-visible-version-and-large-canvas-lag-v1`
- `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`

**Implication:** Prior profiler evidence is referenced but not directly accessible. This audit must produce **fresh, standalone evidence**.

### Key Code Patterns (Suspicion Targets)

1. **State churn in BpmnStage.jsx**
   - Multiple `useState` hooks for XML state (`xml`, `xmlDraft`, `xmlDirty`, `xmlSaveBusy`)
   - `overlayIds` array in state (line 384)
   - Panel state management (AI question panel, context menu)

2. **Overlay lifecycle**
   - `decorManager.js` adds/removes overlay DOM elements
   - Each overlay creates new DOM nodes outside React's control
   - Overlay updates may not be batched

3. **Event binding**
   - `wireBpmnStageRuntimeEvents.js` binds modeler/viewer events
   - Pointer events may trigger React state updates

### Audit Scope Boundaries

**In scope:**
- Frontend canvas rendering performance
- DOM/SVG node overhead
- Overlay churn
- Memory leaks
- Event listener accumulation
- Backend API latency (as isolation check)

**Out of scope:**
- Backend query optimization (measure only, don't fix)
- Network infrastructure
- Database performance
- Code refactoring or fixes
