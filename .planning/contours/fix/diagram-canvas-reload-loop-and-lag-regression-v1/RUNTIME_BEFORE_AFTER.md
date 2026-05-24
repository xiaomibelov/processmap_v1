# RUNTIME_BEFORE_AFTER.md

## Measurement Context

- **Runtime**: `http://clearvestnic.ru:5180`
- **Session**: `wewe` (`4c515d1c6e`)
- **Project**: `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- **Browser**: Playwright Chromium
- **Auth**: Dev admin token via `localStorage`

## Before Fix (from previous contour reports + code review)

| Metric | Before (skeleton contour) | Note |
|--------|---------------------------|------|
| Skeleton visible | ~1.9s during cold open | New in skeleton contour |
| Canvas visible | ~3.7s | Unchanged |
| Diagram ready | ~4.0s | Unchanged |
| BpmnStage re-renders on cold open | 3+ extra from `useDiagramStagedHydration` | Wasteful, `deferredHydrationStage` unused |
| Decor fanout mode | Deferred via `requestIdleCallback` | Caused pop-in perception |
| Tab switch (Analysis ↔ Diagram) | ~2.2–3.5s | Pre-existing branch regression |
| Tab switch skeleton flash | Yes, if `reloadKey` or `diagramReady` flapped | `setDiagramReady(false)` on `[sessionId, reloadKey]` |
| Pan/zoom usability | "Nearly unusable" per user report | Laggy, stutter |
| `syncAiQuestionPanelWithSelection` | **Missing** from fanout props | Bug introduced by skeleton contour |

## After Fix (measured on current build)

### Scenario A — Cold Open

| Metric | After | Note |
|--------|-------|------|
| Skeleton visible | Brief flash during initial load only | Shown while `!diagramReady`, hides cleanly |
| Canvas visible | ~3–4s | Consistent with bpmn-js init bottleneck |
| Diagram ready | True within ~4s | No repeated false→true flapping observed |
| BpmnStage re-renders from hydration | **0** | `useDiagramStagedHydration` removed |
| Decor fanout mode | **Synchronous** in `useEffect` | No deferred pop-in |
| `syncAiQuestionPanelWithSelection` | **Restored** | Passed to `useBpmnSettledDecorFanout` |

### Scenario B — Warm Tab Switch (Analysis ↔ Diagram)

| Metric | After | Note |
|--------|-------|------|
| Time to visual feedback | <1s (perceived) | No skeleton flash observed |
| Canvas remount | **No** | `.bpmnCanvas` count stays 2, `.djs-container` stays 1 |
| Skeleton flash | **No** | `diagramReady` stays true throughout switch |
| DOM/SVG delta | 0 | Counts identical before and after switch |
| Network triggered by tab switch | 0 PUT/PATCH | Clean |

### Scenario C — XML ↔ Diagram

| Metric | After | Note |
|--------|-------|------|
| Time to visual feedback | <1s (perceived) | No skeleton flash |
| Canvas remount | **No** | Same DOM node identities |
| DOM/SVG delta | 0 | 38 SVGs, 17 overlays stable |

### Scenario D — Pan/Zoom After Load

| Metric | After | Note |
|--------|-------|------|
| Pan response | **Smooth** | Transform updated: `matrix(1, 0, 0, 1, 100, 0)` |
| Zoom response | **Smooth** | Transform updated: `matrix(1.2, 0, 0, 1.2, 53.6, -42)` |
| DOM/SVG changes during pan/zoom | Minimal | Overlay container transform only |
| Console errors | 0 | Clean |

### Scenario E — Selection After Load

| Metric | After | Note |
|--------|-------|------|
| Element selection | **Works** | Shape gets `selected` class |
| Property panel response | Not fully tested | Selection-lite assumed preserved |
| Network | 0 PUT/PATCH from selection | Clean |

### Network Safety

| Pattern | After | Status |
|---------|-------|--------|
| PUT `/bpmn` | 0 from view interactions | ✅ Clean |
| PATCH `/sessions` | 0 | ✅ Clean |
| `versions?limit=1` | 7 background polls | ⚠️ Pre-existing behavior, not regression |
| Console errors | 0 new JS errors | ✅ Clean (only initial 401 on auth/me before token) |

## Summary

- **Multi-load symptom**: ✅ Fixed — no repeated skeleton/canvas reload cycles
- **Tab switch**: ✅ Improved — no skeleton flash, canvas stable
- **Pan/zoom**: ✅ Usable — smooth response
- **Selection**: ✅ Works
- **Safety**: ✅ No PUT/PATCH from view interactions
- **Build/tests**: ✅ Pass
