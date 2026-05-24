# perf/diagram-property-overlays-viewport-culling-v1

## GSD Discipline

- **GSD availability check performed**: yes
- **Commands executed**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found
- **GSD mode used**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Implementation performed**: no
- **Product files changed**: no
- **Contour bounded**: yes
- **Agent 2 / Agent 3 gates prepared**: yes

## Audit Source Truth

Previous audit contour reviewed: `audit/diagram-property-overlays-performance-gsd-v1`  
Audit status: `REVIEW_PASS` (Run ID: 20260514T220133Z-82898)

Key audit findings used as source truth:

| Finding | Value |
|---------|-------|
| Baseline DOM nodes (overlays OFF) | 8,025 |
| Baseline `.djs-overlay` (overlays OFF) | 17 |
| Baseline `.fpcPropertyOverlay` (overlays OFF) | 0 |
| Overlays ON DOM nodes | 10,795 (+34.5%) |
| Overlays ON `.djs-overlay` | 197 |
| Overlays ON `.fpcPropertyOverlay` | 180 |
| Diagram remount on tab switch | NO — CSS `display` toggle only |
| Duplicate overlays on tab switch | NO |
| Pan/zoom DOM stability | STABLE — `geometrySignature` dedupe works |
| Large-diagram projection | 500–1,000+ overlay nodes possible |

Separate findings **excluded** from this contour:
- `GET /api/sessions/{id}/bpmn/versions?limit=1` spam → separate contour `fix/bpmn-versions-head-check-dedupe`
- `PUT /bpmn` without explicit save → separate contour

## Source / Runtime Truth

| Property | Value |
|----------|-------|
| `pwd` | `/opt/processmap-test` |
| `whoami` | `root` |
| `hostname` | `clearvestnic.ru` |
| `date -Is` | `2026-05-14T22:38:17+00:00` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git status -sb` | `## fix/lockfile-sync-test` + modified frontend files (pre-existing, unrelated) |
| API health | `{"ok":true,"status":"ok",...}` |
| Frontend | `HTTP/1.1 200 OK` |
| Runtime frontend URL | `http://clearvestnic.ru:5180` |
| Runtime API URL | `http://clearvestnic.ru:8088` |

## Problem Statement

Property overlays on the Diagram/BPMN surface render DOM nodes for **all** diagram elements when `alwaysEnabled=true`, regardless of whether those elements are visible in the current viewport. On the audited session (~15–20 BPMN elements) this creates 180 `.fpcPropertyOverlay` nodes and increases total DOM nodes by +34.5%. Linear scaling projects 500–1,000+ overlay nodes for larger diagrams, creating layout/paint cost and memory pressure.

Additionally, the current zoom-change trigger (`applyPropertiesOverlayDecorForZoomChange`) only tracks **zoom bucket**, not viewport position. Panning the canvas does **not** re-evaluate overlays, which means viewport-culling would not respond to pan unless the trigger is extended.

## Goal

Reduce DOM/render cost of property overlays by:
1. **Viewport-culling**: only create/render `.fpcPropertyOverlay` nodes for BPMN elements that intersect the visible canvas area plus a safe buffer.
2. **Pan-aware updates**: extend the viewbox trigger so panning also re-evaluates which overlays should be visible.
3. **Preserve all existing behaviors**: dedupe (`geometrySignature`), zoom stability, tab-switch stability, no duplicates, no network side effects.

## Scope

Bounded frontend-only changes in:
- `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` (export `readElementBounds`)
- `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` (optional CSS class batching)

## Non-goals

- Do not fix `/bpmn/versions?limit=1` spam here.
- Do not fix `PUT /bpmn` without explicit save here.
- Do not change version/history modal behavior.
- Do not change save/publish/version safety logic.
- Do not change BPMN XML.
- Do not change backend.
- Do not change Product Actions / RAG / AG-UI.
- Do not redesign Diagram UI.
- Do not remove property overlays entirely.
- Do not hide overlays behind a global off switch as the only fix.
- Do not implement WebGL/canvas renderer.
- Do not rewrite bpmn-js integration.
- Do not introduce new dependencies.

## Source Map

### Core overlay render loop

| File | Function / Symbol | Lines | Current Role |
|------|-------------------|-------|--------------|
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | `applyPropertiesOverlayDecor()` | 1561–1785 | Main overlay render loop. Iterates `previewEntries`, finds element, checks signatures, reuses or rebuilds container/table, calls `overlays.add()`. |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | `clearPropertiesOverlayDecor()` | 1340–1358 | Removes all tracked overlays and resets `propertiesOverlayStateRef` for the kind. |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | `buildPropertiesOverlayGeometrySignature()` | 1368–1376 | Dedupe key for geometry + zoom bucket. |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | `applyPropertiesOverlayContainerStyle()` | 1378–1405 | Heavy inline style injection per overlay (8+ CSS custom properties). |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | `rebuildPropertiesOverlayTable()` | 1407–1457 | Full DOM rebuild of table rows per overlay. |
| `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | `readElementBounds()` | 58–85 | Reads element bounds in **model coordinates** (`x`, `y`, `width`, `height` or waypoint min/max). **Not currently exported.** |
| `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | `buildOverlayGeometry()` | 98–120 | Computes overlay geometry from element bounds + zoom. |
| `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | `readOverlayCanvasZoom()` | 88–96 | Reads current canvas zoom from bpmn-js `canvas.zoom()`. |

### Trigger / lifecycle

| File | Function / Symbol | Lines | Current Role |
|------|-------------------|-------|--------------|
| `frontend/src/components/process/BpmnStage.jsx` | `applyPropertiesOverlayDecorForZoomChange()` | 4076–4084 | Called on `canvas.viewbox.changed`. Only tracks **zoom bucket**; returns early if zoom bucket unchanged. **Pan does not trigger overlay re-evaluation.** |
| `frontend/src/components/process/BpmnStage.jsx` | `propertiesOverlayStateRef` | 1285 | Ref holding `{ viewer: {}, editor: {} }` overlay state maps. |
| `frontend/src/components/process/BpmnStage.jsx` | `propertiesOverlayZoomBucketRef` | 1286 | Ref holding last zoom bucket string per mode. |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | `bindViewerStageEvents()` | 257–311 | Registers `canvas.viewbox.changed` → `applyPropertiesOverlayDecorForZoomChange(inst, "viewer")`. |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | `bindModelerStageEvents()` | 364–427 | Registers `canvas.viewbox.changed` → `applyPropertiesOverlayDecorForZoomChange(inst, "editor")`. |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Properties fanout effect | 146–161 | React `useEffect` that fires when `propertiesOverlayAlwaysEnabled`, preview maps, `readySignal`, or `view` change. |

### CSS

| File | Role |
|------|------|
| `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` | `.fpcPropertyOverlay`, `.fpcPropertyOverlay--table`, `.fpcPropertyOverlay--task`, `.fpcPropertyOverlay--sequence`, `.fpcPropertyRow`, `.fpcPropertyCell`, etc. |

### Safe change area for Agent 2

- Add viewport intersection check inside `decorManager.js:applyPropertiesOverlayDecor()` loop.
- Export `readElementBounds` from `overlayLayoutModel.js` and import it into `decorManager.js`.
- Extend `BpmnStage.jsx:applyPropertiesOverlayDecorForZoomChange()` to track viewbox `x` and `y` (or a combined viewbox signature), so pan triggers re-evaluation.
- Optionally replace some inline styles in `applyPropertiesOverlayContainerStyle()` with predefined CSS classes for zoom buckets.
- Optionally coalesce overlay triggers via `requestAnimationFrame` in `useBpmnSettledDecorFanout.js`.

### Forbidden change area

- `ProcessStage.jsx` — versions head-check / network logic.
- `wireBpmnStageRuntimeEvents.js` — eventBus wiring architecture (use existing listeners only).
- `App.jsx` — global state, draft merge, save logic.
- Backend / API / storage / schema.
- `package.json` / lock files.
- BPMN XML parsers or mutators.

## Bounded Implementation Strategy

### A. Viewport culling in `decorManager.js`

**Where**: inside `applyPropertiesOverlayDecor()`, after `const canvasZoom = readOverlayCanvasZoom(inst);` (line 1663) and before the `previewEntries.forEach` loop.

**What**:
1. Read canvas viewbox: `inst.get("canvas").viewbox()` → `{ x, y, width, height, scale }`.
2. Compute buffer in **model coordinates**: `bufferModel = BUFFER_PX / Math.max(viewbox.scale, 0.001)`.
3. Build expanded viewport rect: `left = viewbox.x - bufferModel`, `top = viewbox.y - bufferModel`, `right = left + viewbox.width + bufferModel * 2`, `bottom = top + viewbox.height + bufferModel * 2`.
4. In the loop, after resolving `el` (line 1681), read element bounds via `readElementBounds(el)`.
5. If bounds exist and element does **not** intersect the expanded viewport, `return` early (skip overlay creation; do not add to `nextState`). The stale cleanup loop (lines 1770–1776) will remove any previously-existing overlay for this element because its `prev` stays in `currentState` and is not moved to `nextState`.
6. If bounds are missing, fall back to **visible** (conservative) to avoid losing overlays.

**Buffer recommendation**: start with `200` px. Agent 2 should document the chosen value and keep it tunable as a constant near the top of `applyPropertiesOverlayDecor`.

### B. Pan-aware trigger in `BpmnStage.jsx`

**Where**: `applyPropertiesOverlayDecorForZoomChange()` (lines 4076–4084).

**Current behavior**:
```js
const zoomBucket = String(Math.round(Number(zoom || 1) * 1000) / 1000);
if (propertiesOverlayZoomBucketRef.current[mode] === zoomBucket) return;
propertiesOverlayZoomBucketRef.current[mode] = zoomBucket;
applyPropertiesOverlayDecor(inst, mode);
```

**Required change**:
- Replace `propertiesOverlayZoomBucketRef` with a `propertiesOverlayViewboxSigRef` that captures both zoom and position.
- Compute a lightweight signature: e.g. `viewboxSig = `${Math.round(vb.x)}:${Math.round(vb.y)}:${zoomBucket}``.
- Only return early if `viewboxSig` is unchanged.
- Rename the function to `applyPropertiesOverlayDecorForViewboxChange` if convenient, or keep the name and expand its behavior. The callers in `wireBpmnStageRuntimeEvents.js` already pass the right args.

**Why**: Without this, panning the canvas leaves offscreen overlays in the DOM and does not create newly-visible overlays.

### C. Stable overlay identity

- Overlay identity remains tied to `resolvedElementId` + overlay type (`fpc-properties`).
- `geometrySignature` dedupe must continue to work for visible elements.
- Cleanup of offscreen elements happens naturally through the existing stale-entry loop because skipped elements are not added to `nextState`.

### D. Coalesced viewbox updates (optional, if needed)

- The `canvas.viewbox.changed` event can fire rapidly during pan.
- `geometrySignature` already prevents DOM rebuilds for visible elements whose geometry hasn't changed.
- The main cost during pan is:
  - Intersection math for each preview entry.
  - `overlays.remove()` for elements that scrolled offscreen.
  - `overlays.add()` for elements that scrolled onscreen.
- If profiling shows jank, Agent 2 may add a `requestAnimationFrame` coalescing queue in `useBpmnSettledDecorFanout.js` properties effect (lines 146–161), but this is secondary to viewport culling.

### E. CSS / style batching (optional, if safe and local)

- `applyPropertiesOverlayContainerStyle()` sets 8+ inline CSS custom properties per overlay.
- If Agent 2 can bucket zoom levels into 3–5 predefined CSS classes (e.g. `.fpcPropertyOverlay--zoom-s`, `--zoom-m`, `--zoom-l`) and only set `width` and the class dynamically, this reduces per-overlay style mutations.
- Must keep dynamic `width` because it depends on element width.
- If this adds complexity or risk, skip it — viewport culling is the primary target.

### F. No network side effects

- Overlay visibility / pan / zoom must not call:
  - `GET /bpmn/versions`
  - `PUT /bpmn`
  - `PATCH` session
  - Any other mutation endpoint.
- If such requests are observed during implementation testing, document them as potential separate contours.

## Acceptance Metrics

### Baseline (from audit)

| Metric | Value |
|--------|-------|
| Total DOM nodes (overlays OFF) | 8,025 |
| Total DOM nodes (overlays ON) | 10,795 |
| `.djs-overlay` (overlays OFF) | 17 |
| `.djs-overlay` (overlays ON) | 197 |
| `.fpcPropertyOverlay` (overlays OFF) | 0 |
| `.fpcPropertyOverlay` (overlays ON) | 180 |

### Expected after fix

1. On the same audited viewport, if not all 180 elements are visible, `.fpcPropertyOverlay` count must drop materially.
2. If all elements happen to be visible at current zoom, count may remain similar, but panning to an empty area must drop `.fpcPropertyOverlay` to near-zero.
3. Repeated pan/zoom cycles must not cause monotonic growth of `.fpcPropertyOverlay` or total DOM nodes.
4. Tab switch (Analysis ↔ Diagram) must not duplicate overlays.
5. Visible overlays must still appear correctly on visible BPMN elements.
6. No new console errors.
7. No mutation requests triggered by overlay interactions / pan / zoom.
8. No BPMN XML mutation.

### Agent 3 pass criteria

1. Baseline overlay count before optimization documented in `PERFORMANCE_BEFORE_AFTER.md`.
2. After optimization, overlay count is tied to viewport-visible elements, not total diagram elements.
3. Repeated pan/zoom does not grow `.fpcPropertyOverlay` count unbounded.
4. Analysis ↔ Diagram tab switch does not duplicate overlays.
5. Visible overlays still appear on visible elements.
6. No layout explosions, no missing canvas.
7. No new console errors.
8. No product code outside bounded frontend overlay files changed.
9. No backend changes.
10. No BPMN XML mutation.

## Agent 2 Execution Plan

1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, previous audit reports, and `STATE.json`.
2. Capture baseline **before touching code**:
   - Open runtime URL, navigate to test session.
   - Record `document.querySelectorAll('*').length`, `.djs-overlay`, `.fpcPropertyOverlay`.
   - Record pan/zoom behavior and tab-switch behavior.
3. Implement bounded changes:
   - Export `readElementBounds` from `overlayLayoutModel.js`.
   - Add viewport intersection check in `decorManager.js:applyPropertiesOverlayDecor`.
   - Extend `BpmnStage.jsx:applyPropertiesOverlayDecorForZoomChange` to track viewbox x/y.
4. Run build/tests: `npm run test` or equivalent in frontend.
5. Runtime validation:
   - Before/after DOM counts.
   - Pan to empty area → overlay count drops.
   - Pan back → overlays reappear.
   - Zoom in/out → stable, no duplicates.
   - Tab switch → stable, no duplicates.
   - Console → no new errors.
   - Network → no mutation requests from pan/zoom.
6. Create deliverables:
   - `EXEC_REPORT.md`
   - `IMPLEMENTATION_NOTES.md`
   - `PERFORMANCE_BEFORE_AFTER.md`
   - `READY_FOR_REVIEW`
7. If blocked: create `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. Read `PLAN.md`, `EXEC_REPORT.md`, `IMPLEMENTATION_NOTES.md`, `PERFORMANCE_BEFORE_AFTER.md`, `RUNTIME_PROOF_CHECKLIST.md`.
2. Use Playwright/browser review against `http://clearvestnic.ru:5180`.
3. Verify:
   - Visible overlays still render.
   - Offscreen overlays are culled after pan.
   - Pan/zoom causes overlays to appear/disappear correctly.
   - No duplicate overlays after tab switch.
   - No unbounded DOM growth after 5+ pan/zoom cycles.
   - No new console errors.
   - No mutation requests from overlay interactions.
   - `git diff --name-only` shows only bounded frontend overlay files.
4. If any issue remains:
   - `CHANGES_REQUESTED`
   - `REWORK_REQUEST.md`
   - No `REVIEW_PASS`.
5. If pass:
   - `REVIEW_REPORT.md`
   - `REVIEW_PASS`.

## Risks

| Risk | Mitigation |
|------|------------|
| Viewport coordinate math incorrect (overlays hidden when they should be visible) | Use model-space intersection, keep buffer generous (200 px), test on both viewer and editor. |
| Pan trigger fires too often causing jank | `geometrySignature` dedupe prevents DOM rebuilds; only `overlays.add/remove` for crossing elements. If needed, add RAF coalescing. |
| `readElementBounds` not exported — adding export touches another file | `overlayLayoutModel.js` is in the same bounded decor directory; export is safe and minimal. |
| Offscreen overlays removed but not recreated on pan back | Ensure `applyPropertiesOverlayDecorForZoomChange` tracks x/y, not just zoom. |
| Sequence flow auto-detection (lines 1609–1628) still builds previews for all elements | Previews are lightweight objects; the heavy cost is `overlays.add()`. Culling at render loop is sufficient. |

## Validation

- Source tests must pass.
- Runtime before/after DOM counts must show material reduction when viewport shows fewer than all elements.
- Runtime must show stable counts across pan/zoom/tab-switch cycles.
- No new console errors.
- No network mutation side effects.

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Audit source truth reviewed
- [x] Gate 3 — Runtime/source truth captured
- [x] Gate 4 — Overlay source map captured
- [x] Gate 5 — Bounded optimization strategy defined
- [x] Gate 6 — Non-goals locked
- [x] Gate 7 — Acceptance metrics defined
- [x] Gate 8 — Agent 2 executor prompt ready
- [x] Gate 9 — Agent 3 reviewer prompt ready
- [ ] Gate 10 — READY_FOR_EXECUTION marker created
