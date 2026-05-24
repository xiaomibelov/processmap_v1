# BASELINE_PROFILE_REPORT — audit/diagram-baseline-no-overlays-canvas-profile-v1

**Session**: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)  
**Runtime**: `http://clearvestnic.ru:5180`  
**Date**: 2026-05-15

---

## 1. Environment

| Item | Value |
|------|-------|
| Git branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| API health | `{"ok":true,"status":"ok"}` |
| Frontend | HTTP 200 OK |
| Browser | Playwright (Chromium) |

---

## 2. Scenario A — Baseline Open (Diagram tab, overlays OFF)

| Metric | Value |
|--------|-------|
| Time to visible canvas | ~4 seconds (navigate → project → session → tab load) |
| Total DOM nodes | 8,025 |
| SVG nodes | 2,392 |
| `.djs-overlay` | 17 |
| `.fpcPropertyOverlay` | 0 |
| `[data-element-id]` | 276 |
| `.djs-shape` | 162 |
| `.djs-connection` | 112 |
| `.bpmnCanvas` | 2 |
| `.djs-container` | 1 |
| Console errors | 0 relevant (pre-existing 401 on `/api/auth/me` and `/api/sessions/*/presence`) |
| Network mutations | 0 PUT /bpmn, 0 PATCH /sessions |
| `versions?limit=1` | 3 calls during load window (~30 s apart) |

**Note**: BPMN loaded with `GET /api/sessions/4c515d1c6e/bpmn?raw=1&include_overlay=0`. Server explicitly excluded overlay data.

---

## 3. Scenario B — Pan/Zoom Latency

| Cycle | Total DOM | SVG | `.djs-overlay` | `.fpcPropertyOverlay` |
|-------|-----------|-----|----------------|----------------------|
| Before pan | 8,025 | 2,392 | 17 | 0 |
| After pan +50px | 8,025 | 2,392 | 17 | 0 |
| After pan back | 8,025 | 2,392 | 17 | 0 |
| After zoom in | 8,025 | 2,392 | 17 | 0 |
| After zoom out | 8,025 | 2,392 | 17 | 0 |

**Observation**: With overlays OFF, pan and zoom produce **zero DOM change**. No network mutations. No console errors.

---

## 4. Scenario C — Selection Latency

| Click # | Element ID | Total DOM | SVG | `.djs-overlay` | `.selected` |
|---------|-----------|-----------|-----|----------------|-------------|
| Before | — | 8,028 | 2,392 | 17 | 3 |
| 1 | Event_1duwp2k | 11,226 | 5,578 | 17 | 4 |
| 2 | Activity_1c5b5zb | 11,251 | 5,603 | 17 | 4 |
| 3 | Gateway_08u1e7m | 11,227 | 5,579 | 17 | 4 |
| 4 | Activity_02lb8je | 11,251 | 5,603 | 17 | 4 |
| 5 | Activity_0feapi8 | 11,251 | 5,603 | 17 | 4 |
| 6 | Gateway_0l1w0nu | 11,227 | 5,579 | 17 | 4 |
| 7 | Activity_0fo9c9n | 11,251 | 5,603 | 17 | 4 |
| 8 | Activity_16ju22m | 11,251 | 5,603 | 17 | 4 |
| 9 | DataStoreReference_1l3udtf | 11,223 | 5,579 | 17 | 4 |
| 10 | DataStoreReference_0bkhcag | 11,223 | 5,579 | 17 | 4 |

**Key observation**: Selection causes an immediate and persistent **+3,198 total DOM nodes (+40%)** and **+3,186 SVG nodes (+133%)**.

**What gets added** (source analysis):
- `g.djs-bendpoint`: 916 (connection waypoint handles)
- `g.djs-bendpoints.fpcFocusDim`: 907 (focus-dimmed bendpoints)
- `g.djs-visual`: 517
- `g.djs-group`: 275
- `text.djs-label`: 226
- `g.djs-segment-dragger`: 251 (horizontal + vertical)
- Selection outlines and context pads

**Cause**: `BpmnStage.jsx` `applySelectionFocusDecor` iterates **all** selectable elements in the registry and calls `canvas.addMarker(id, "fpcFocusDim")` on every non-selected, non-neighbor element. In modeler/editor mode, bpmn-js also renders connection bendpoints and segment draggers for the entire diagram when any element is selected.

**Network**: 0 mutations from all 10 selections.

---

## 5. Scenario D — Hover Latency

| Hover # | Element ID | Total DOM | SVG |
|---------|-----------|-----------|-----|
| Before | — | 11,192 | 5,570 |
| 1–10 | Various | 11,192 | 5,570 |

**Observation**: Hover produces **zero DOM change**. No flicker, no console errors.

---

## 6. Scenario E — Tab Return

| Step | Total DOM | SVG | `.fpcPropertyOverlay` | Active Tab |
|------|-----------|-----|----------------------|------------|
| Diagram baseline | 11,192 | 5,570 | 0 | Diagram |
| After Analysis click | 11,192 | 5,570 | 0 | Analysis |
| After Diagram return | 11,192 | 5,570 | 0 | Diagram |
| After XML click | 11,192 | 5,570 | 0 | XML |
| After Diagram return (final) | 7,994 | 2,383 | 0 | Diagram |

**Observation**: On the **second** Diagram return (after XML), the selection-related DOM inflation is **fully cleaned up**. Counts return to near-baseline (7,994 vs 8,025). This confirms the extra nodes are part of the Diagram tab's React/bpmn-js subtree and get unmounted/remounted on tab switch.

**Network**: 0 mutations.

---

## 7. Scenario F — Overlays OFF Comparison

Overlays were already OFF for the entire session (`include_overlay=0` in API). The "Слои ON ⚠ hidden" toggle button did not respond to Playwright clicks (consistent with previous audit findings).

Cannot produce a true overlays-ON vs overlays-OFF comparison in this session. However, previous audits reported:
- Overlays ON: `.fpcPropertyOverlay` ≈ 70 (after viewport culling), total DOM ≈ 9,175
- Overlays OFF: `.fpcPropertyOverlay` = 0, total DOM ≈ 8,025

The current profile shows that even at the overlays-OFF baseline (8,025), **selection alone** pushes total DOM to ~11,250. The selection inflation (+3,200) dwarfs the overlay inflation (+1,150 from previous audits).

---

## 8. Scenario G — Decor Pipeline Source/Runtime Check

**Source evidence** (`useBpmnSettledDecorFanout.js`):

All 5 fanout effects fire unconditionally based on `readySignal` and `view`:

| Fanout | Effect deps | Calls decor function? |
|--------|------------|----------------------|
| Notes | `notesSig`, `readySignal`, `diagramDisplayMode`, `view` | Yes (`applyUserNotesDecor`) |
| StepTime | `draft?.nodes`, `stepTimeUnit`, `readySignal`, `view` | Yes (`applyStepTimeDecor`) |
| RobotMeta | `draft?.bpmn_meta`, `robotMetaOverlayEnabled`, `robotMetaOverlayFilters`, `robotMetaStatusByElementId`, `readySignal`, `view` | Yes (`applyRobotMetaDecor`) |
| Properties | `propertiesOverlayAlwaysEnabled`, `propertiesOverlayAlwaysPreviewByElementId`, `selectedPropertiesOverlayPreview`, `readySignal`, `view` | Yes (`applyPropertiesOverlayDecor`) |
| Selection | `notesSig`, `readySignal`, `diagramDisplayMode`, `selectedMarkerStateRef`, `settledSelectionFanoutRef`, `view` | Yes (`emitElementSelection`, `syncAiQuestionPanelWithSelection`) |

**Properties fanout specifically** (`postStagingFanout.js` lines 233-238):
```js
measureSettledStep(`settled.properties.active.${activeKind}`, () => {
  options.applyPropertiesOverlayDecor?.(activeInst, activeKind);
}, meta);
```

This **always** calls `applyPropertiesOverlayDecor` on the active instance, even when overlays are off.

Inside `applyPropertiesOverlayDecor` (`decorManager.js` lines 1594-1635):
- Checks `propertiesOverlayAlwaysEnabledRef?.current`
- If false and no selected preview → calls `clearPropertiesOverlayDecor` and returns early
- **The function is still invoked**; refs are read; `elementRegistry.getAll()` is NOT called on the early-exit path

**Verdict**: The decor pipeline **does run** when overlays are off, but the early-exit path is cheap (no registry iteration, no DOM creation). The cost is the function call + ref reads + effect scheduling overhead.

---

## 9. Scenario H — Chrome Performance Trace

**Status**: Not captured. Playwright trace was not enabled in this session.

**Fallback**: The dominant cost categories are inferred from DOM evidence:
1. **SVG node creation** (selection): +3,186 nodes = likely **Rendering + Layout**
2. **CSS class application** (`fpcFocusDim`): 907 elements = likely **Style recalculation**
3. **Decor fanout effects**: Function calls on every `readySignal` change = **Scripting**

Subjective feel in Playwright: pan/zoom was smooth; selection had a slight but perceptible delay (~100-200 ms).

---

## 10. React Render Churn (Source-Level)

### ProcessStage.jsx
- 70+ state values from `useProcessStageLocalState`
- `useHybridStore` returns ~20 values
- `sessionCompanionBridgeSnapshot` `useMemo` has 11 deps including `saveDirtyHint`, `isManualSaveBusy`
- `useProcessStageShellController` `useMemo` has 18 deps

### BpmnStage.jsx
- `diagramReady` state toggles on `sessionId` / `reloadKey` changes
- `trackRuntimeStatus` calls `setDiagramReady` (line 1691)
- `useEffect` for every prop ref update (lines 1398-1468): 14 separate `useEffect` hooks just to sync refs
- `useBpmnSettledDecorFanout` receives 25+ props

### useProcessStageLocalState.js
- Composes 4 sub-hooks: `modeState`, `actionState`, `dialogState`, `panelState`
- Any change in any sub-hook propagates to `ProcessStage`

**Verdict**: There is React-level prop/state churn, but the runtime evidence suggests the **SVG DOM inflation** from selection is a larger immediate cost than React render time.
