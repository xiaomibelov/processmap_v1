# fix/diagram-real-drag-performance-and-engine-decomposition-v1

## GSD Discipline

- GSD availability result: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Commands checked:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd` ✅
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` ✅
  - `/opt/processmap-test/bin/gsd` exists and is executable ✅
  - `/root/.codex/get-shit-done/bin/gsd-tools.cjs` exists ✅
  - GSD skills directory has 50+ gsd-* skills ✅
- Mode: `GSD_PROCESSMAP_WRAPPER_PLANNING` — using ProcessMap-local `/opt/processmap-test/bin/gsd` wrapper.
- Implementation не выполнялся.
- Product files не менялись.
- Contour bounded.
- Decomposition-first обязательна.
- Agent 2 / Agent 3 gates prepared below.

## Source / Runtime Truth

| Check | Value |
|-------|-------|
| pwd | `/opt/processmap-test` |
| whoami | `root` |
| hostname | `clearvestnic.ru` |
| date | `2026-05-15T22:39:14+00:00` |
| branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| dirty files | 34 frontend files + `.env` + `docker-compose.yml` (pre-existing from prior contours) |
| 8088 health | `{"ok":true,"status":"ok",...}` ✅ |
| 5180 response | HTTP/1.1 200 OK ✅ |
| docker gateway | `processmap_test-gateway-1` up, port 5180→80 ✅ |
| 5180 build-info SHA | `a9a9d9c` matches HEAD ✅ |
| 5180 build-info contourId | `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1` (stale from previous build) |
| served JS asset | `assets/index-3k3VEgia.js` |

**Observation**: The current 5180 runtime was built during the previous contour (`diagram-loading-state-machine...`). A fresh rebuild is required so the new contour ID appears in `build-info.json`.

## User Screenshot / UX Regression

- Diagram canvas rendered.
- Top-left canvas overlay shows:
  `a9a9d9c · 16.05.2026 · fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`
- **This placement is wrong.** The badge is rendered inside `BpmnStage.jsx` at absolute position `top: 8, left: 8, zIndex: 101` directly over the canvas viewport (`bpmnStack`).
- Build/version marker must not be on top of canvas.
- It interferes visually and conceptually with BPMN work area.
- Must move to bottom status/version area, footer, or app shell.
- `AppShell.jsx` already has a footer line (`footerHint`) showing `Версия v1.0.126 · shaShort · date` — this is the preferred extension target.

## Real Drag Scenario

Previous Agent testing was insufficient because it tested:
- click;
- programmatic pan/zoom (zoom button clicks);
- DOM counts;
- network safety.

**Actual user scenario:**
1. Hold left mouse button on empty canvas and drag canvas (pan).
2. Hold left mouse button on BPMN element and drag/move element.
3. Large diagram (`wewe / Описание процессов Долгопрудный`).
4. No overlays (`.fpcPropertyOverlay = 0`).
5. Lag visible during pointermove/drag, not just after click.

**Hard requirement**: Agent 3 must use Playwright `mouse.down/move/up` or browser-level real pointer events. Programmatic zoom button click is not enough. Static DOM count is not enough. “Pan/zoom functional” is not enough. Need smoothness/latency/long-task evidence.

## Previous Contours / Invalid Test Gap

| Contour | Verdict | Relevance to Real Drag |
|---------|---------|------------------------|
| `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1` | REVIEW_PASS | Fixed stuck loading; added version badge on canvas (wrong placement); did NOT test real drag. |
| `fix/diagram-visible-version-and-large-canvas-lag-v1` | REVIEW_PASS | Added visible version; switched viewer-first; tested programmatic zoom clicks, NOT real mouse drag. |
| `fix/diagram-5180-version-proof-and-canvas-lag-regression-v1` | REVIEW_PASS | Version proof; programmatic zoom only; no real drag. |
| `audit/diagram-post-optimization-runtime-profile-v1` | REVIEW_PASS | Read-only audit; noted pan/zoom anomaly with synthetic events; no real mouse drag baseline. |

**Gap**: All previous passes validated programmatic pan/zoom, not real pointermove drag lifecycle. User still reports drag lag. This contour must close that gap.

## Version Marker Relocation Plan

1. **Remove** the `<DiagramRuntimeVersionBadge>` from `BpmnStage.jsx` canvas overlay (lines ~5799–5801).
2. **Extend** the existing `AppShell.jsx` footer status line (`footerHint`) to include:
   - app version (`v1.0.126`)
   - git short SHA
   - build date/time
   - contour/build id (when on `fix/*` branch or `clearvestnic.ru:5180`)
3. Keep `build-info.json` generation and `window.__PROCESSMAP_BUILD_INFO__` exactly as-is.
4. Ensure the marker is visible, readable, and **not** intercepting pointer events on canvas.
5. If `AppShell.jsx` footer is not suitable, fallback to a non-canvas app shell header/status area.

## Real Drag Reproduction Plan

### Baseline (before fix)
1. Fresh browser context on `http://clearvestnic.ru:5180/?cb=<timestamp>`.
2. Navigate to large Diagram session (`wewe / Описание процессов Долгопрудный`).
3. Confirm overlays off: `.fpcPropertyOverlay = 0`.
4. **Canvas pan baseline**: Playwright real mouse drag on empty canvas area:
   - `mouse.move(x, y)` → `mouse.down()` → `mouse.move(x+200, y+0, {steps: 20})` → `mouse.move(x+400, y+100, {steps: 20})` → `mouse.up()`
   - Record duration, visible smoothness, transform change, JS errors, network.
5. **Element drag baseline**: If edit mode accessible, pick BPMN task and drag with steps. Record lag, position change, auto-save behavior.
6. **Side-effect audit during drag**: Check if any of these fire repeatedly:
   - React state updates in BpmnStage/ProcessStage
   - `selection.changed` events spam
   - `canvas.viewbox.changed` spam
   - Decor fanout (`useBpmnSettledDecorFanout`)
   - Property panel rebuild
   - `commandStack.changed`
   - Network PUT/PATCH

### After fix
Repeat all baseline scenarios and compare.

## Pointer / Drag Source Map Targets

### A. BpmnStage.jsx (~5850 lines — god file, decomposition required)
- Lines ~5799–5801: `DiagramRuntimeVersionBadge` rendered on canvas overlay → **remove**.
- Lines ~1272–1273: `viewerRef`, `modelerRef` — lifecycle owners.
- Lines ~4395–4470: `ensureViewer()`, `ensureModeler()` — engine instantiation.
- Lines ~5562–5577: `useBpmnSettledDecorFanout` wiring — may update during drag.
- Lines ~5645–5702: Selection clearing, `syncAiQuestionPanelWithSelection` — may fire during drag.

### B. wireBpmnStageRuntimeEvents.js (611 lines)
- Lines ~248–252: `drag.start` / `drag.cleanup` flags → `dragInProgress`.
- Lines ~277–278: `eventBus.on("drag.start", 2300, onDragStart)`.
- Lines ~287–284: `eventBus.on("drag.cleanup", 2300, onDragCleanup)`.
- Lines ~363–398: `selection.changed` handler in viewer mode — may sync selection during drag.
- Lines ~431–433: `canvas.viewbox.changed` — may trigger React updates.
- Lines ~575–590: `directEditing.activate`, `drag.start`, `create.start`, `connect.start`, `resize.start` all trigger `enterDiagramEditMode`.

### C. useBpmnSettledDecorFanout.js
- Applies decor to viewer/modeler instances.
- May run on every selection change or viewport change.
- **Hypothesis**: Decor fanout runs during drag and causes lag.

### D. AppShell.jsx
- Lines ~350–364: Footer version line — **extend** with SHA/timestamp/contour.
- Lines ~366–370: Fixed bottom-right badge — can be removed or kept as secondary; primary must be footer.

### E. useProcessTabs.js
- `tab === "diagram"` branching.
- `flushFromActiveTab` on tab switch — pre-existing PUT `/bpmn` on switch, not in scope to remove but must not worsen.

### F. diagramAnalyticsMode.js
- `isDiagramEditMode`, `enterDiagramEditMode` — interaction mode boundary.

## Decomposition-First Plan

If BpmnStage.jsx is touched for drag performance, extraction is mandatory:

1. **DiagramPointerInteractionController** (new module)
   - Classify pointerdown/move/up.
   - Distinguish canvas pan vs element drag vs click.
   - Set `dragInProgress` ref (not state) during active drag.
   - Prevent side-effect propagation while `dragInProgress === true`.

2. **DiagramViewPanController** (new module or inline in existing)
   - Pan behavior in view/analytics mode.
   - Coalesce viewport updates with RAF if needed.
   - Avoid React setState per pointermove.

3. **DiagramElementDragController** (new module)
   - Edit-mode element drag behavior.
   - View mode: prevent element drag unless explicit edit mode.
   - No autosave/mutation during continuous drag.

4. **DiagramInteractionPerfMonitor** (dev/test-only, new module)
   - `pointermove` count, frame budget, long tasks.
   - Expose via `window.__PM_DRAG_PERF__` only in dev/test.
   - No console spam, no DB writes.

5. **BpmnRuntimeEngineBoundary** (extract from BpmnStage.jsx)
   - Decide Viewer vs Modeler mode.
   - Keep lifecycle stable.
   - No repeated `importXML`.

Exact module paths must follow existing conventions:
- `frontend/src/features/process/bpmn/stage/interaction/`
- `frontend/src/features/process/bpmn/stage/load/`
- `frontend/src/features/process/bpmn/stage/derived/`

## Engine Evaluation Plan

Agent 2 must produce bounded `ENGINE_EVALUATION.md` even if no migration is done.

| Engine | Pros | Cons | Verdict for this contour |
|--------|------|------|--------------------------|
| **bpmn-js** (current) | Native BPMN XML, current deep integration, editing palette, existing decor. | SVG stack laggy on large drag; Modeler heavy. | **Primary**: optimize drag pipeline first. |
| **GoJS** | Canvas-based, BPMN sample, rich interaction. | Commercial license; BPMN XML compat must be built; high migration cost. | **Evaluate only** — no install. |
| **yFiles** | Strong large-graph perf docs, mature interaction. | Commercial license; BPMN semantics mapping required. | **Evaluate only** — no install. |
| **JointJS+** | BPMN import/export plugin in commercial tier. | Commercial; migration/integration cost. | **Evaluate only** — no install. |
| **React Flow / XYFlow** | React-native workflow UI. | Not BPMN-native; large graph perf unproven; XML mapping required. | **Evaluate only** — no install. |
| **Custom Canvas/Pixi/Konva** | Useful as analytics/LLM overlay. | Not replacement for BPMN editor without massive custom work. | **Reject** for editor replacement. |

**Decision rule**: If bpmn-js still fails after suppressing React updates, decor fanout, and selection sync during drag, then recommend a research/prototype contour for alternative engine. Do not install or migrate in this contour.

## Hypotheses

| ID | Hypothesis | Test Method | Owner |
|----|-----------|-------------|-------|
| H1 | Review missed real drag scenario. | Playwright real mouse drag baseline. | Agent 3 |
| H2 | Version marker overlay on canvas interferes visually/pointer-wise. | Screenshot before/after relocation. | Agent 2 |
| H3 | Pointermove triggers React state updates in BpmnStage/ProcessStage. | Inject perf monitor; check setState call count during drag. | Agent 2 |
| H4 | Pointermove triggers property panel / selected element sync. | Monitor `selection.changed` and `syncAiQuestionPanelWithSelection` during drag. | Agent 2 |
| H5 | Pointermove triggers decor fanout or derived model recalculation. | Monitor `useBpmnSettledDecorFanout` activity during drag. | Agent 2 |
| H6 | View mode uses incorrect bpmn-js interaction stack. | Verify `.djs-bendpoint`, `.djs-segment-dragger`, `.djs-palette` counts in view mode. | Agent 3 |
| H7 | Element drag in edit mode is inherently heavy due to Modeler. | Measure edit-mode drag separately; compare with view-mode pan. | Agent 2 |
| H8 | Large SVG pan is bpmn-js/SVG engine limit. | If suppression of all React side effects does not improve drag, document as engine limit. | Agent 2 |
| H9 | useProcessTabs/parent shell still creates background churn during drag. | Check ProcessStage re-render count during drag. | Agent 2 |
| H10 | Alternative engine should be evaluated. | If H8 confirmed with evidence, produce ENGINE_EVALUATION.md recommending next contour. | Agent 2 |

## Bounded Fix / Rollback Strategy

### Bounded fix options
- **Option A** (mandatory): Move version marker out of canvas.
- **Option B**: Suppress React updates during drag/pan (refs for transient drag state, RAF coalescing).
- **Option C**: Disable analytics selection/focus updates during active drag.
- **Option D**: Pause non-critical decor/derived fanout during drag.
- **Option E**: Fix view vs edit interaction mode (no edit drag in view mode).
- **Option F**: Engine evaluation/prototype decision (if bpmn-js remains insufficient).

### Rollback
- If drag fix causes regression (stuck loading, broken selection, broken edit mode), revert drag-related changes and keep only version marker relocation.
- If version relocation breaks footer layout, revert to fixed bottom-right badge but never restore canvas overlay.

## Acceptance Criteria

Agent 3 should pass only if ALL are true:

**Version marker:**
1. Marker no longer overlays canvas.
2. Marker is visible in bottom status/version area or non-canvas app shell.
3. Marker includes app version + SHA + timestamp/build info.
4. `build-info.json` works.
5. `window.__PROCESSMAP_BUILD_INFO__` works.
6. Fresh 5180 browser proof captured.

**Real drag:**
7. Agent 3 performs real mouse drag canvas pan.
8. Agent 3 performs real mouse drag element movement or verifies view-mode correctly prevents movement and edit mode handles it.
9. Programmatic zoom/click alone is not accepted.
10. Large no-overlays diagram is used.
11. `.fpcPropertyOverlay = 0` confirmed.
12. Before/after drag evidence exists.
13. Pan/drag is materially improved or exact remaining engine limit is documented with evidence.
14. If no material improvement, no REVIEW_PASS.

**Runtime:**
15. No stuck loading.
16. No repeated canvas reload cycles.
17. No PUT `/bpmn` from view interactions.
18. No PATCH `/sessions` from view interactions.
19. No versions spam regression.
20. Console has no new errors.

**Architecture:**
21. Decomposition-first followed if BpmnStage/ProcessStage touched.
22. No god-file bloat.
23. Interaction modules are bounded.

**Engine:**
24. `ENGINE_EVALUATION.md` exists.
25. Recommendation is evidence-based.
26. No jump to migration without proof.
27. No dismissal of alternatives without proof.

**Safety:**
28. No backend/schema/storage changes.
29. No BPMN XML mutation from view interactions.
30. No Product Actions/RAG/AG-UI changes.
31. Build/tests pass.

## Non-goals

- No Product Actions implementation.
- No registry/reестр changes.
- No AG-UI implementation.
- No RAG implementation.
- No stage/prod deploy.
- No PR/merge/push.
- No backend/schema/storage unless blocked and explicitly justified.
- No BPMN XML semantics change.
- No full engine migration in this contour.
- No library install.
- No cosmetic-only fix.
- No review based only on source.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, latest contour reports.
2. Fix version placement:
   - Remove `DiagramRuntimeVersionBadge` from `BpmnStage.jsx` canvas overlay.
   - Extend `AppShell.jsx` footer `footerHint` with SHA + timestamp + contour.
   - Rebuild frontend, restart gateway, verify served assets.
3. Baseline real drag (before any drag fix):
   - Large diagram, overlays off.
   - Playwright real mouse canvas pan with steps.
   - Playwright real element drag (edit mode if needed).
   - Record duration, smoothness, DOM/SVG counts, network, console.
4. Source forensic:
   - Map pointer/drag stack in `wireBpmnStageRuntimeEvents.js`.
   - Check `useBpmnSettledDecorFanout` for drag-time activity.
   - Check `selection.changed` → `syncAiQuestionPanelWithSelection` path.
   - Check `canvas.viewbox.changed` → React update path.
   - Check `useProcessTabs` parent churn.
5. Decomposition/fix:
   - Extract interaction controllers if needed.
   - Suppress/coalesce drag-time side effects.
   - Keep view-mode read-only unless explicit edit.
   - Pause non-critical decor updates during drag if needed.
6. Engine evaluation:
   - Create `ENGINE_EVALUATION.md`.
   - Recommend next path if bpmn-js remains insufficient.
7. Validate:
   - Build/tests.
   - Fresh 5180 browser.
   - Version marker not on canvas.
   - Real drag before/after.
   - Tab switch stability.
   - Network safety.
8. Create reports:
   - `EXEC_REPORT.md`
   - `VERSION_MARKER_RELOCATION_PROOF.md`
   - `REAL_DRAG_BASELINE.md`
   - `DRAG_LAG_ROOT_CAUSE.md`
   - `RUNTIME_BEFORE_AFTER.md`
   - `DECOMPOSITION_REPORT.md` (if extraction happened)
   - `ENGINE_EVALUATION.md`
   - `IMPLEMENTATION_NOTES.md`
   - `READY_FOR_REVIEW`

If blocked → `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. Read all Agent 2 reports.
2. Source/runtime version review:
   - Verify source HEAD.
   - Verify visible marker not on canvas.
   - Verify marker in bottom/app shell.
   - Verify `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__`.
3. Playwright real interaction review:
   - Fresh context/cache-busted 5180.
   - Open large Diagram, overlays off.
   - Real mouse drag canvas pan: `mouse.down` → `mouse.move` with steps → `mouse.up`.
   - Element drag test: edit mode if needed, or verify view mode prevents edit drag.
   - Measure/observe lag.
   - Check DOM/SVG deltas.
   - Check no PUT/PATCH from view interactions.
   - Check no console errors.
4. Strict verdict:
   - If version marker still overlays canvas → CHANGES_REQUESTED.
   - If real drag not tested → CHANGES_REQUESTED.
   - If no material improvement and no clear engine-limit evidence → CHANGES_REQUESTED.
   - If stuck loading returns → CHANGES_REQUESTED.
   - If pass → `REVIEW_REPORT.md` + `REVIEW_PASS`.

## Risks

1. **BpmnStage.jsx is a god file** (~5850 lines). Any change risks unintended side effects. Decomposition-first is mandatory.
2. **Real drag measurement is subjective**. Need concrete before/after numbers (duration, event count, long tasks).
3. **bpmn-js SVG engine may have inherent limits**. If suppression of React churn does not improve drag, user-perceived lag may remain. Must document evidence and recommend engine research contour.
4. **Dirty working tree** (34 files) makes it hard to isolate contour changes. Agent 2 must document exactly which files were changed for this contour.
5. **Edit mode on large diagrams is slow to init** (~15s). Element drag test may require patience or a smaller test diagram.

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — source/runtime truth captured
- [x] Gate 3 — user real-drag scenario captured
- [x] Gate 4 — visible version relocation plan defined
- [x] Gate 5 — real mouse drag reproduction plan defined
- [x] Gate 6 — pointer/drag lifecycle source map targets defined
- [x] Gate 7 — decomposition-first plan defined
- [x] Gate 8 — bpmn-js vs alternative engine evaluation plan defined
- [x] Gate 9 — measurable before/after criteria defined
- [x] Gate 10 — rollback/rework strategy defined
- [x] Gate 11 — Agent 2 executor prompt ready
- [x] Gate 12 — Agent 3 reviewer prompt ready
- [ ] Gate 13 — READY_FOR_EXECUTION marker created (will be created after this file is written)
