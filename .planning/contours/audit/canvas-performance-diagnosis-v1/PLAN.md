# PLAN — Audit: BPMN Canvas Performance Diagnosis v1

## Contour Identity

| Field | Value |
|-------|-------|
| **Contour ID** | `audit/canvas-performance-diagnosis-v1` |
| **Type** | Audit-only (no fixes) |
| **Scope** | ProcessMap BPMN canvas rendering and interaction performance |
| **Runtime Target** | Frontend dev server `:5177` |
| **Backend Target** | `localhost:8088` |
| **Deliverables** | `AUDIT_REPORT.md` + `evidence/` directory with raw profiler data |
| **Language** | Agent prompts in English. Reports/docs in Russian. |

---

## Objective

Identify the **exact bottleneck** causing BPMN canvas lag during pan, zoom, and initial load operations on the ProcessMap frontend. The audit must be strictly data-driven: every conclusion must be backed by DevTools profiler numbers, DOM counters, heap snapshots, or API latency timings.

**Verdict must name ONE exact cause** from the following candidates:
1. DOM/SVG node creation overhead
2. Overlay creation/destruction churn
3. Backend data preparation latency
4. Excessive event listeners
5. Memory leaks (heap growth without recovery)

---

## Historical Context

Previous contours have produced profiler evidence suggesting React bundle re-rendering dominates CPU (~95%) during diagram drag, while bpmn-js engine cost is minimal (~0.5%). However, this evidence was captured under different conditions and may not represent the current state of `main`. This audit must produce **fresh, reproducible measurements** on the current codebase.

**Key prior hypothesis (to validate or falsify):**
> React reconciliation and state updates triggered by pointer move events cause frame drops. Canvas controller decomposition and selective re-rendering are needed.

**Previous contours referenced:**
- `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`
- `fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- `fix/diagram-visible-version-and-large-canvas-lag-v1`
- `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`

---

## Architecture Under Audit

### Frontend Canvas Stack

| Layer | File | Responsibility |
|-------|------|----------------|
| Canvas Host | `frontend/src/components/process/BpmnStage.jsx` | Main React component; manages viewer/modeler state, overlays, XML sync, event bindings |
| Viewer Wrapper | `frontend/src/features/notation/bpmn/BpmnViewer.jsx` | Lightweight bpmn-js viewer with zoom controls |
| Lifecycle Hook | `frontend/src/features/process/bpmn/stage/load/useBpmnCanvasLifecycle.js` | Tracks idle/creating/importing/ready/error states |
| Overlay Manager | `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Adds/removes overlay badges (notes, docs, status) |
| Event Orchestration | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Binds modeler/viewer stage events |
| Render Lifecycle | `frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js` | Diagram render/import operations |

### Backend Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/sessions/{id}/bpmn` | Fetch BPMN XML for diagram |
| `GET /api/sessions/{id}/bpmn_meta` | Fetch metadata (robot meta, camunda extensions) |
| `GET /api/sessions/{id}/bpmn/versions` | Fetch version history |

### State Variables in BpmnStage.jsx (Suspicion Targets)

The following `useState` hooks are high-suspicion targets for unnecessary re-renders:
- `xml`, `xmlDraft`, `xmlDirty`, `xmlSaveBusy` — XML editing state
- `diagramReady` — readiness flag
- `overlayIds` — overlay tracking array (line 384)
- Various panel states (AI question panel, context menu, etc.)

---

## Audit Strategy

### Phase 1: Baseline Measurement (Small Diagram)
1. Load a small BPMN diagram (≤10 elements) on `:5177`
2. Record baseline metrics:
   - DOM node count (`document.querySelectorAll('*').length`)
   - SVG node count (`document.querySelectorAll('svg *').length`)
   - Overlay count (`document.querySelectorAll('.djs-overlay').length`)
   - Element registry count (`modeler.get('elementRegistry').getAll().length`)
   - FPS at rest (Chrome FPS meter)
   - Heap size (Chrome Memory tab)
   - API latency (`curl -w "%{time_total}"` for `/api/sessions/{id}/bpmn`)

### Phase 2: Interaction Profiling (Small Diagram)
1. Open Chrome DevTools Performance tab
2. Start 3-second recording
3. Perform continuous pan operation (drag canvas)
4. Stop recording
5. Extract:
   - Top 3 longest tasks (flame chart)
   - Total scripting time vs rendering time
   - Frame drops count
   - FPS during pan

### Phase 3: Scale Test (Large Diagram)
1. Load a large BPMN diagram (≥50 elements, ideally 100+)
2. Repeat Phase 1 and Phase 2 measurements
3. Compare ratios:
   - DOM node growth per element
   - Overlay growth per element
   - FPS degradation factor
   - Heap growth factor

### Phase 4: Memory Leak Detection
1. Take heap snapshot at rest (small diagram)
2. Perform 5 complete pan cycles (drag across full canvas, release, repeat)
3. Take heap snapshot after pan cycles
4. Wait 10 seconds, force GC (`window.gc()` if available, or DevTools "Collect garbage")
5. Take final heap snapshot
6. Compare:
   - Total heap size delta
   - DOM node count delta
   - Event listener count delta
   - Detached DOM tree count

### Phase 5: Backend Latency Isolation
1. Time backend endpoints independently:
   ```bash
   curl -w "\nDNS:%{time_namelookup}\nConnect:%{time_connect}\nTTFB:%{time_starttransfer}\nTotal:%{time_total}\n" \
        -o /dev/null -s http://localhost:8088/api/sessions/{id}/bpmn
   ```
2. Compare `time_starttransfer` (TTFB) vs total frontend load time
3. Determine if backend is a contributing factor

### Phase 6: Event Listener Audit
1. Count total event listeners before interaction
2. Count during pan operation
3. Count after releasing mouse
4. Identify leaked listeners (count that doesn't return to baseline)

---

## Evidence Collection Requirements

Every measurement must be recorded with:
- **Exact value** (e.g., "1450 DOM nodes")
- **Measurement context** (small/large diagram, at rest/during pan/after GC)
- **Tool used** (Chrome DevTools Performance/Memory/FPS, `curl`, console API)
- **Timestamp** (for reproducibility)
- **Screenshot or raw data file** (stored in `evidence/`)

### Evidence Directory Structure

```
evidence/
  ├── small_diagram_baseline.json
  ├── small_diagram_pan_profile.json
  ├── large_diagram_baseline.json
  ├── large_diagram_pan_profile.json
  ├── heap_snapshots/
  │   ├── small_rest.heapsnapshot
  │   ├── small_after_5_pans.heapsnapshot
  │   ├── small_after_gc.heapsnapshot
  │   └── large_rest.heapsnapshot
  ├── screenshots/
  │   ├── performance_tab_small.png
  │   ├── performance_tab_large.png
  │   ├── memory_tab_heap.png
  │   └── fps_meter_during_pan.png
  └── curl_timings/
      ├── bpmn_xml_timing.txt
      └── bpmn_meta_timing.txt
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Profiler skew from DevTools overhead | Take multiple samples (3x per scenario), report median |
| Diagram size inconsistency | Use predefined test diagrams (see `MEASUREMENT_METHODOLOGY.md`) |
| Browser extensions interfering | Use clean Chrome profile or incognito mode |
| Console errors affecting performance | Log all console errors; if present, note in report |
| Backend not running | Verify `:8088` health before starting; report if unreachable |
| `window.gc()` unavailable | Use DevTools "Collect garbage" button instead |

---

## Constraints

- **NO CODE CHANGES** — This is audit-only. Do not modify any source files.
- **NO FIXES** — Do not implement optimizations. Report findings only.
- **NO CONSOLE ERRORS** — If console errors appear during profiling, log them but do not attempt to fix.
- **NUMBERS REQUIRED** — Every claim must have a number. "Feels slow" is not acceptable.
- **SINGLE CAUSE VERDICT** — The report must name exactly one primary bottleneck. Secondary effects may be noted but the verdict must be unambiguous.

---

## Review Gate

Agent 3 (Reviewer) must verify:
1. Every number in the report has a corresponding evidence file
2. The verdict is one of the five allowed causes
3. No speculative conclusions without data backing
4. The comparison between small and large diagrams is present
5. Heap snapshot analysis includes before/after/GC states
6. Backend latency is isolated from frontend rendering time

---

## Success Criteria

- [ ] `AUDIT_REPORT.md` exists with all required sections
- [ ] `evidence/` directory contains at least 8 evidence files
- [ ] Report contains specific numbers (DOM counts, FPS values, heap sizes, API timings)
- [ ] Verdict names exactly one bottleneck cause with data proof
- [ ] Agent 3 review passes with no blocking issues
