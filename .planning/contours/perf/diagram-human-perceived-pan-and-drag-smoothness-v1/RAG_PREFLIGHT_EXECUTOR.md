# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: perf/diagram-human-perceived-pan-and-drag-smoothness-v1
- **area/query**: Diagram human perceived pan drag smoothness pointer-follow latency visual jitter dense SVG bpmn-js canvas
- **generated_at**: 2026-05-16T21:43:10.368Z

## Structured Facts

### Agent Rules
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)

### User Rejections
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.

### Contour Facts
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-visible-version-and-large-canvas-lag-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Real Drag Scenario
- **score**: 43.952
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-real-*drag*-performance-and-engine-decomposition-v1] ## Real *Drag* Scenario
Previous Agent testing was insufficient because it tested: - click; - programmatic *pan*/zoom (zoom button clicks); - DOM counts; - network safety. **Actual user scenario:** 1. Hold left mouse button on empty *canvas* and *drag* *canvas* (*pan*). 2. Hold left mouse button on *BPMN* element and *drag*/move element. 3. Large *diagram* (`wewe / Описание процессов Долгопрудный`). 4. No overlays (`.fpcPropertyOverlay = 0`). 5. Lag visible during *pointer*move/*drag*, not just after click. **Hard requirement**: Agent 3 must use P…
```

### #2 — Real Drag Scenario
- **score**: 40.952
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-real-drag-performance-and-engine-decomposition-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## Real *Drag* Scenario
Previous Agent testing was insufficient because it tested: - click; - programmatic *pan*/zoom (zoom button clicks); - DOM counts; - network safety. **Actual user scenario:** 1. Hold left mouse button on empty *canvas* and *drag* *canvas* (*pan*). 2. Hold left mouse button on *BPMN* element and *drag*/move element. 3. Large *diagram* (`wewe / Описание процессов Долгопрудный`). 4. No overlays (`.fpcPropertyOverlay = 0`). 5. Lag visible during *pointer*move/*drag*, not just after click. **Hard requirement**: Agent 3 must use Playwright `mouse.down/move/up` or browser-level real *pointer* events. …
```

### #3 — Scenario C — XML ↔ Diagram
- **score**: 37.220
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-canvas-reload-loop-and-lag-regression-v1/RUNTIME_BEFORE_AFTER.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-*canvas*-reload-loop-and-lag-regression-v1] ## Scenario C — XML ↔ *Diagram*
| Metric | After | Note | |--------|-------|------| | Time to *visual* feedback | <1s (*perceived*) | No skeleton flash | | *Canvas* remount | **No** | Same DOM node identities | | DOM/*SVG* delta | 0 | 38 *SVG*s, 17 overlays stable |
```

### #4 — Scenario C — Pan/Zoom After Load
- **score**: 37.082
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-canvas-reload-loop-and-lag-regression-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-*canvas*-reload-loop-and-lag-regression-v1] ## Scenario C — *Pan*/Zoom After Load
1. Wait until *Diagram* stable (no skeleton, no loading spinners). 2. *Pan* *canvas* 5 cycles (*drag*). 3. Zoom in/out 3 cycles. 4. Record: - Lag perception (smooth vs stutter). - DOM/*SVG* changes during *pan*/zoom. - Overlay count changes. - Long delays (>100ms) between input and *visual* response. - Console errors.
```

### #5 — bpmn-js Engine Work
- **score**: 36.753
- **path**: `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/POINTERMOVE_SIDE_EFFECTS_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-modeler-*drag*-hot-path-and-*pointer*move-suppression-v1] ## *bpmn*-*js* Engine Work
- *SVG* viewport transforms during *canvas* *pan* - Shape position updates during element *drag* - These are internal to *bpmn*-*js* and cannot be suppressed without engine replacement
```

### #6 — Verdict
- **score**: 36.537
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *diagram*-5180-version-proof-and-*canvas*-lag-regression-v1] **REVIEW_PASS** All criteria for this contour pass: - Runtime version proof is present, verified fresh, and matches source HEAD. - Delivery loop is fixed (bind volume), eliminating stale runtime as the primary cause of *perceived* lag. - *Canvas* is stable: no remount, no skeleton flapping, no repeated load cycles. - Tab switch preserves *canvas* DOM without full reload. - *Pan*/zoom and selection function correctly. - No NEW console errors or network mutations introduced by this contour's changes. - Scope compliance confirmed. The rem…
```

### #7 — B2 Canvas pan baseline
- **score**: 35.611
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-real-*drag*-performance-and-engine-decomposition-v1] ## B2 *Canvas* *pan* baseline
```*js* // Playwright pseudo-code await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 200, y, { steps: 20 }); await page.mouse.move(x + 400, y + 100, { steps: 20 }); await page.mouse.up(); ``` - Record: - Total *drag* duration (ms). - Visible *smoothness* (honest subjective note). - *SVG* transform/viewbox changed. - Long pauses or freezes. - DOM/*SVG* delta after *drag*. - *JS* errors in console. - Network requests during *drag*.
```

### #8 — Hypothesis (REVISED)
- **score**: 35.162
- **path**: `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/ENGINE_LIMIT_NOTE.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *diagram*-modeler-*drag*-hot-path-and-*pointer*move-suppression-v1] The remaining *drag* cost is **NOT** attributable to the *bpmn*-*js* *SVG* rendering engine. Profiler evidence shows the engine handles large-*diagram* *canvas* *drag* in ~56 ms. The app-side delta (~1,500 ms+) comes from: 1. `Move*Canvas*` (*diagram*-*js* *pan* tool) bypassing our `*drag*.start` guards, causing `*canvas*.viewbox.changed` to trigger expensive React-side work on every frame. 2. Continuous baseline jank (~7 long tasks / sec, ~130 ms each) present even when idle and on non-*diagram* tabs. ---
```

### #9 — Scenario C — Pan/Zoom After Load
- **score**: 34.082
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-canvas-reload-loop-and-lag-regression-v1/RUNTIME_NAVIGATION.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## Scenario C — *Pan*/Zoom After Load
1. Wait until *Diagram* stable (no skeleton, no loading spinners). 2. *Pan* *canvas* 5 cycles (*drag*). 3. Zoom in/out 3 cycles. 4. Record: - Lag perception (smooth vs stutter). - DOM/*SVG* changes during *pan*/zoom. - Overlay count changes. - Long delays (>100ms) between input and *visual* response. - Console errors.
```

### #10 — How to Pan / Zoom
- **score**: 34.078
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-loading-state-machine-and-*canvas*-controller-decomposition-v1] ## How to *Pan* / Zoom
- *Pan*: *drag* *canvas* background. - Zoom: use mouse wheel or UI zoom buttons. - Verify via *SVG* transform: ```*js* document.querySelector('.d*js*-container *svg*').style.transform ```
```

### #11 — Measurements
- **score**: 33.904
- **path**: `/opt/processmap-test/.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *diagram*-property-overlays-performance-gsd-v1] - [ ] Subjective *smoothness* (smooth / slight jank / heavy jank / frozen); - [ ] Console errors during *pan*/zoom; - [ ] Network requests during *pan*/zoom; - [ ] Overlay position updates (do overlays *follow* *canvas* smoothly or lag?); - [ ] DOM node count change during *pan*/zoom.
```

### #12 — Verdict
- **score**: 33.537
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
**REVIEW_PASS** All criteria for this contour pass: - Runtime version proof is present, verified fresh, and matches source HEAD. - Delivery loop is fixed (bind volume), eliminating stale runtime as the primary cause of *perceived* lag. - *Canvas* is stable: no remount, no skeleton flapping, no repeated load cycles. - Tab switch preserves *canvas* DOM without full reload. - *Pan*/zoom and selection function correctly. - No NEW console errors or network mutations introduced by this contour's changes. - Scope compliance confirmed. The remaining subjective lag is attributable to pre-existing `useProcessTa
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "perf/diagram-human-perceived-pan-and-drag-smoothness-v1" --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
