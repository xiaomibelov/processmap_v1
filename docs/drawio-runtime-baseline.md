# draw.io Runtime Baseline — Handoff Document

**Branch:** `fix/drawio-stability-v2`
**HEAD at time of writing:** `a229fae373fea47fa4490c6eeaa5de58b2513c1d`
**Last cp tag:** `cp/worktree_split_pass_done_20260307_013348`
**Date:** 2026-03-08

---

## 1. Architectural contracts (DO NOT break)

| Contract | Owner files | Rule |
|---|---|---|
| BPMN-first | All | BPMN = process truth. draw.io = visual overlay only |
| draw.io ≠ orchestrator | `drawioMeta.js`, `drawioOverlayState.js` | draw.io must never take ownership of process state |
| hybrid ≠ draw.io | `HybridLegacyRenderer.jsx`, `useHybridPipelineController.js` | These are separate layers with separate semantics |
| Redis = helper only | `useHybridStore.js` | Redis is not a primary state owner |
| runtime ≠ full editor | `drawioCreateGuard.js`, `useDiagramRuntimeBridges.js` | runtime embedded mode never auto-opens full editor |
| visibility contract | `drawioVisibilitySelectionContract.js` | OFF = hidden + not selectable + selection cleared |
| create guard | `drawioCreateGuard.js` | CANVAS_CREATE_TOOL_IDS = `rect`, `text`, `container` only |
| viewport sync | `useBpmnViewportSource.js`, `useOverlayViewportSync.js` | draw.io overlay lives in same zoom-space as BPMN |

---

## 2. Locked boundary inventory

### 2a. New files (untracked → must be committed as part of freeze)

#### draw.io runtime sub-hooks (`frontend/src/features/process/drawio/runtime/`)
| File | Purpose |
|---|---|
| `useDrawioOverlayInteraction.js` | Top-level interaction hook (compositor) |
| `useDrawioPointerDrag.js` | Pointer/drag decomposition (712 lines) |
| `useDrawioSelection.js` | Selection lifecycle |
| `useDrawioKeyboardActions.js` | Keyboard gating |
| `useDrawioInteractionGate.js` | Visibility/editability gating |
| `useDrawioPersistHydrateBoundary.js` | Persist/hydrate session boundary |
| `drawioCreateGuard.js` | Create guard (tool allowlist + intent resolver) |
| `drawioRuntimePlacement.js` | Runtime rect/text/container placement |
| `drawioOverlayState.js` | SVG render-state: layer/element visibility, opacity, offset, selection |
| `drawioRuntimeProbes.js` | Runtime diagnostic probes (non-product) |
| `drawioNormalizationDiagnostics.js` | Normalization diagnostics |

#### Unit tests (`frontend/src/features/process/drawio/runtime/*.test.mjs`)
| File | Covers |
|---|---|
| `useDrawioPointerDrag.test.mjs` | pointer/mouse dedupe |
| `useDrawioSelection.test.mjs` | selection lifecycle |
| `useDrawioKeyboardActions.test.mjs` | keyboard gating |
| `useDrawioInteractionGate.test.mjs` | visibility/editability gating |
| `useDrawioOverlayInteraction.dom.test.mjs` | DOM-backed integration |
| `drawioCreateGuard.test.mjs` | create guard allowlist + blocking |
| `drawioRuntimePlacement.test.mjs` | placement patch correctness |
| `drawioOverlayState.test.mjs` | SVG render-state mutations |
| `drawioNormalizationDiagnostics.test.mjs` | diagnostics |

#### Visibility/selection domain contract
- `frontend/src/features/process/drawio/domain/drawioVisibilitySelectionContract.js`
- `frontend/src/features/process/drawio/domain/drawioVisibilitySelectionContract.test.mjs`

#### Viewport source/sync
- `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js` (360 lines)
- `frontend/src/features/process/stage/controllers/useOverlayViewportSync.js` (59 lines)

#### ProcessStage orchestration state split
- `frontend/src/features/process/stage/orchestration/state/useProcessStageLocalState.js`
- `frontend/src/features/process/stage/orchestration/state/useProcessStageModeState.js`
- `frontend/src/features/process/stage/orchestration/state/useProcessStageDialogState.js`
- `frontend/src/features/process/stage/orchestration/state/useProcessStagePanelState.js`
- `frontend/src/features/process/stage/orchestration/state/useProcessStageActionState.js`

#### Overlay panel model sections
- `frontend/src/features/process/overlay/models/sections/buildDrawioOverlaySection.js`
- `frontend/src/features/process/overlay/models/sections/buildHybridLegacySection.js`

#### New draw.io e2e specs
| Spec | Gate type |
|---|---|
| `drawio-overlay-runtime-entry-contract.spec.mjs` | runtime ≠ full editor |
| `drawio-runtime-tool-placement.spec.mjs` | runtime placement |
| `drawio-pan-jitter-coupling.spec.mjs` | pan-time drift / snap-back |
| `drawio-ghost-materialization-boundary.spec.mjs` | phantom entity materialization |
| `drawio-runtime-materialization-boundary.spec.mjs` | materialization boundary |
| `drawio-browser-runtime-anchoring.spec.mjs` | anchoring under pan/zoom |
| `drawio-visual-scale-parity.spec.mjs` | BPMN/draw.io scale parity |
| `drawio-runtime-perf-evidence.spec.mjs` | perf counters |
| `drawio-browser-performance-trace.spec.mjs` | browser perf trace |

### 2b. Modified tracked files (draw.io/stage/hybrid/overlay core)

| File | Key change |
|---|---|
| `DrawioEditorModal.jsx` | Editor modal boundary fix |
| `DrawioOverlayRenderer.jsx` | Major rewrite: -1272/+657 lines — interaction decomposition wired |
| `drawioSelectors.js` | Selector normalization and rows fix |
| `drawioVisibility.js` | Toggle/opacity semantics fix |
| `drawioMeta.js` | Interaction mode normalization |
| `drawioSvg.js` | SVG parse/render fix |
| `useHybridPipelineController.js` | Hybrid/draw.io boundary decoupling |
| `useHybridStore.js` | Session guard, no-op hydrate guard |
| `HybridLegacyRenderer.jsx` | Hybrid legacy card routing fix |
| `HybridToolsPalette.jsx` | Tools palette boundary |
| `overlayEntityAdapter.js` | Entity-kind routing fix |
| `useOverlayMutationGateway.js` | Runtime placement wired |
| `buildOverlayPanelModel.js` | Panel model with drawio/hybrid section split |
| `LayersPopover.jsx` | Layers popover rebuilt with runtime tool integration |
| `useDiagramOverlayTransform.js` | Viewport/transform chain (controllers) |
| `useDiagramOverlayTransform.js` | Hook alias (hooks/) |
| `buildDiagramControlsSections.js` | Controls sections wiring |
| `useDiagramRuntimeBridges.js` | Runtime bridges: tool state, create guard, viewport |
| `ProcessStageDiagramControls.jsx` | Diagram controls UI |
| `deleteTrace.js` | Delete trace utility |

---

## 3. Must-freeze-now vs leave-later split

### Must-freeze-now (draw.io/stage/runtime locked baseline)

All files in section 2a + 2b above.

**Suggested commit scope:**
```
freeze(drawio-runtime): lock draw.io runtime baseline — interaction decomp, create guard, placement, viewport sync, visibility contract
```

### Leave-later (separate commit or separate branch)

| File | Reason |
|---|---|
| `frontend/src/App.jsx` | App shell — unrelated scope |
| `frontend/src/components/ProcessStage.jsx` | Shared risky file — needs own careful review before freezing |
| `frontend/src/components/workspace/WorkspaceDashboard.jsx` | App shell |
| `frontend/e2e/helpers/diagramReady.mjs` | Shared helper — leave with other helper changes |
| `frontend/e2e/helpers/e2eAuth.mjs` | Auth helper — leave |
| `frontend/e2e/helpers/processFixture.mjs` | Process fixture helper — leave |
| `frontend/e2e/diagram-zoom-controls.spec.mjs` | Not draw.io specific |
| `frontend/e2e/drawio-overlay-zoom-pan.spec.mjs` | Zoom pan — separate concern |
| `frontend/e2e/drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs` | Pre-existing smoke, already modified |
| `frontend/e2e/drawio-stage1-boundary-smoke.spec.mjs` | Pre-existing smoke, already modified |
| `frontend/package.json` / `frontend/package-lock.json` | Infra/deps |
| `backend/scripts/sanitize_drawio_persisted_state.py` | Not primary runtime fix path |
| `backend/tests/test_drawio_persisted_state_sanitize.py` | Not primary runtime fix path |

---

## 4. Release-gate test pack

Run this sequence before declaring draw.io runtime stable:

### Step 1: Build
```bash
cd frontend && npm run build
```

### Step 2: Node unit tests (fast, no browser)
```bash
cd frontend
node --test \
  src/features/process/drawio/runtime/useDrawioPointerDrag.test.mjs \
  src/features/process/drawio/runtime/useDrawioSelection.test.mjs \
  src/features/process/drawio/runtime/useDrawioKeyboardActions.test.mjs \
  src/features/process/drawio/runtime/useDrawioInteractionGate.test.mjs \
  src/features/process/drawio/runtime/useDrawioOverlayInteraction.dom.test.mjs \
  src/features/process/drawio/runtime/drawioCreateGuard.test.mjs \
  src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs \
  src/features/process/drawio/runtime/drawioOverlayState.test.mjs \
  src/features/process/drawio/domain/drawioVisibilitySelectionContract.test.mjs
```

### Step 3: E2e gate (smoke)
```bash
cd frontend
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-stage1-boundary-smoke.spec.mjs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs
```

### Step 4: E2e gate (runtime contracts)
```bash
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-overlay-runtime-entry-contract.spec.mjs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-runtime-tool-placement.spec.mjs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-runtime-materialization-boundary.spec.mjs
E2E_HYBRID_LAYER=1 E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-ghost-materialization-boundary.spec.mjs
```

### Step 5: E2e gate (viewport/parity)
```bash
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-browser-runtime-anchoring.spec.mjs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-visual-scale-parity.spec.mjs
E2E_DRAWIO_PAN_JITTER=1 npm run test:e2e -- e2e/drawio-pan-jitter-coupling.spec.mjs
```

### Step 6: Perf evidence (optional, evidence-only)
```bash
E2E_DRAWIO_PERF=1 npm run test:e2e -- e2e/drawio-runtime-perf-evidence.spec.mjs
E2E_DRAWIO_TRACE=1 npm run test:e2e -- e2e/drawio-browser-performance-trace.spec.mjs
```

---

## 5. Dangerous shared files

These files exist in shared paths and have large diffs. Any future edits carry high blast radius:

| File | Risk | Reason |
|---|---|---|
| `frontend/src/components/ProcessStage.jsx` | CRITICAL | Shared orchestration, 361 lines changed, session lifecycle |
| `frontend/src/features/process/hybrid/controllers/useHybridPipelineController.js` | HIGH | draw.io/hybrid boundary, 69 lines changed |
| `frontend/src/features/process/hybrid/renderers/HybridLegacyRenderer.jsx` | HIGH | Hybrid legacy card routing |
| `frontend/src/features/process/stage/orchestration/useDiagramRuntimeBridges.js` | HIGH | Runtime bridge wiring, 117 lines changed |
| `frontend/src/features/process/stage/components/LayersPopover.jsx` | HIGH | Rebuilt with runtime tools |
| `frontend/src/features/process/drawio/DrawioOverlayRenderer.jsx` | HIGH | Major rewrite |
| `frontend/src/features/process/hybrid/controllers/useHybridStore.js` | MEDIUM | Session guard / no-op hydrate |

**Rule:** Do NOT touch these files without a proven, narrowly-scoped root cause. Always verify broken + working scenario before and after.

---

## 6. Broken scenario + working scenario rule

**Every new bugfix pass MUST declare:**

```
Broken scenario:  [what the user currently sees broken, on real UI]
Working scenario: [what must continue to work, verified before the fix]
Root cause:       [factual, not synthetic-path inferred]
Boundary owner:   [which locked boundary owns this bug]
Files changed:    [list, narrow]
Verified:         [broken scenario fixed + working scenario intact]
Intentionally not touched: [list]
```

**PASS in tests ≠ bug is fixed** unless the same scenario was manually verifiable on real runtime.

---

## 7. Known remaining risks

1. **ProcessStage.jsx** — 361 lines changed but not yet frozen. Contains shared orchestration logic. Review before committing.
2. **Exact live-session validation** — agent cannot open user's exact session. Fixes are verified on equivalent paths, not identical sessions.
3. **Dirty worktree** — mixed scopes remain. Any new pass may have unintended blast radius on pre-existing changes.
4. **Some ghost/phantom bugs** — hybrid legacy canvas card layer and draw.io layer can still masquerade as each other in edge cases.
5. **backend/sanitize** — `sanitize_drawio_persisted_state.py` exists but is NOT the primary answer to runtime bugs. It handles historical dirty persisted state only.
6. **e2e helper drift** — `diagramReady.mjs`, `e2eAuth.mjs`, `processFixture.mjs` have modifications not yet reviewed in isolation.

---

## 8. What NOT to do next (locked)

- No new broad refactor of `ProcessStage.jsx` without a proven root cause
- No Redis ownership expansion for overlay visibility/mode/selection/create
- No dual-layer edit mode until basic runtime contract is fully stable in real sessions
- No backend sanitize as primary fix for live runtime bugs
- No mixing draw.io and hybrid semantics back together
- No re-opening of already-fixed boundaries (recursion, mode, viewport, pan, toggle/opacity) without a reproducible user-visible regression

---

## 9. Next recommended actions

1. **Commit the must-freeze-now group** — all runtime/, domain contract, viewport sync, orchestration state, overlay sections, and new e2e specs
2. **Run the release-gate pack** — confirm build + unit tests + smoke pass before the freeze commit
3. **Review ProcessStage.jsx diff** — inspect the 361-line change separately; commit only after confirming no regression
4. **Separate leave-later files** — app shell, helpers, package, backend sanitize into their own commits
5. **Only then** start new bugfix passes against real user-visible regressions
