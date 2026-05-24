# Source Map — Diagram / BPMN / Property Overlays

## 1. Core BPMN Stage Component

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/components/process/BpmnStage.jsx` | Main BPMN stage component; hosts viewer + modeler | 1244–1250: `viewerRef`, `modelerRef`, `viewerInitPromiseRef`, `modelerInitPromiseRef` |
| | | 1269–1286: Decor state refs (`markerStateRef`, `overlayStateRef`, `propertiesOverlayStateRef`, `propertiesOverlayZoomBucketRef`) |
| | | 1395–1471: Many `useEffect` hooks for syncing props to refs |
| | | 4242–4374: `resetBpmnStage()` — comprehensive cleanup of all decor, modeler, viewer |
| | | 4447–4614: `ensureViewer()` / `ensureModeler()` — lazy initialization with promise dedupe |
| | | 4665–4673: `renderViewer()` / `renderModeler()` / `renderNewDiagramInModeler()` |
| | | 5797–5805: JSX — two `.bpmnCanvas` divs (viewer + editor), toggled via `display: none/block` |

## 2. Decor Manager — Overlay Lifecycle

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Central overlay creation, update, cleanup | 1340–1358: `clearPropertiesOverlayDecor()` — removes all overlays by `overlayId`, resets state ref |
| | | 1360–1376: `buildPropertiesContentSignature()` / `buildPropertiesOverlayGeometrySignature()` — dedupe keys |
| | | 1378–1405: `applyPropertiesOverlayContainerStyle()` — heavy inline style injection (8+ CSS vars per container) |
| | | 1407–1457: `rebuildPropertiesOverlayTable()` — full DOM rebuild: container → table → rows → cells |
| | | 1561–1785: `applyPropertiesOverlayDecor()` — main overlay render loop |
| | | 1594–1631: Builds `previewByElementId` from `alwaysEnabled` + `selectedPreview` + sequence flow auto-detection |
| | | 1660–1777: Core loop: for each preview entry, find element, check signatures, reuse or rebuild container/table, call `overlays.add()` |
| | | 1712–1720: **Reuse path**: if `contentSignature` && `geometrySignature` match, reuse existing overlay |
| | | 1721–1758: **Rebuild path**: create new container/table, apply styles, `overlays.add()` with `scale: false` |
| | | 1770–1776: Cleanup stale entries from previous state |

## 3. Event Wiring — Triggers for Overlay Updates

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | eventBus listener registration | 257–311: `bindViewerStageEvents()` — `selection.changed`, `canvas.viewbox.changed` |
| | | 287–311: `canvas.viewbox.changed` → calls `applyPropertiesOverlayDecorForZoomChange()` |
| | | 364–427: `bindModelerStageEvents()` — `commandStack.changed`, `selection.changed`, `canvas.viewbox.changed` |
| | | 403–427: `canvas.viewbox.changed` (editor) → calls `applyPropertiesOverlayDecorForZoomChange()` |

## 4. Settled Decor Fanout — React Effect Triggers

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | React effects that trigger decor updates after state settles | 60–72: `cbRef` pattern — stabilizes callbacks to avoid spurious effect re-fires |
| | | 74–80: `readySignal` — derived from `viewerRef.current ? 1 : 0` and `modelerRef.current ? 1 : 0` |
| | | 146–161: **Properties fanout effect** — deps: `propertiesOverlayAlwaysEnabled`, `propertiesOverlayAlwaysPreviewByElementId`, `selectedPropertiesOverlayPreview`, `readySignal`, `view` |
| | | 147–154: Calls `runSettledPropertiesFanout()` → eventually calls `applyPropertiesOverlayDecor()` |

## 5. Property Overlay Preview Hook

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/features/process/camunda/useCamundaPropertiesOverlayPreview.js` | Builds overlay preview data from camunda properties draft | 21–27: `finalizedCamundaPropertiesDraft` — `useMemo` over `camundaPropertiesDraft` + `orgPropertyDictionaryBundle` |
| | | 39–52: `memoizedPropertiesOverlayAlwaysPreview` — `useMemo` over `selectedElementId`, `camundaPropertiesDraft`, `orgPropertyDictionaryBundle` |
| | | 54–70: `memoizedPropertiesOverlayPreview` — `useMemo` over same deps + `resolvedShowPropertiesOverlayOnSelect` |
| | | 72–108: `useEffect` — dispatches preview changes via signature comparison (`buildPropertiesOverlayPreviewSignature`) |

## 6. API / Network Layer

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/lib/api.js` | API client | 1150–1168: `apiGetBpmnXml()` |
| | | 1158–1195: `apiGetBpmnVersions()` — used with `limit=1` for head check |
| | | 1199–1215: `apiGetBpmnVersion()` |
| `frontend/src/components/ProcessStage.jsx` | ProcessStage orchestrator | 1316: imports `apiGetBpmnXml` |
| | | 1518: `const head = await apiGetBpmnVersions(sid, { limit: 1 });` — **head check** |
| | | 4326: `loaded = await apiGetBpmnVersions(sid, { limit, includeXml });` — **full list** |
| | | 4440: `loaded = await apiGetBpmnVersion(sid, versionId);` — **single version** |

## 7. Versions Fetch Controller

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/components/ProcessStage.jsx` | Versions modal / head polling | 4320–4330: `refreshSnapshotVersions()` — deduped via `bpmnVersionsListRequestRef` with key `${requestSid}|limit=${limit}|includeXml=...` |
| | | 4330–4345: Returns existing promise if same key; guards with `bpmnVersionsActiveSessionRef` and `bpmnVersionsOpenRef` |

## 8. App-Level Overlay State

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/App.jsx` | Global overlay state | 260–306: `readPropertiesOverlayAlwaysEnabled()` / `writePropertiesOverlayAlwaysEnabled()` — localStorage |
| | | 876: `const [showPropertiesOverlayAlways, setShowPropertiesOverlayAlways] = useState(false);` |
| | | 1253–1285: `propertiesOverlayAlwaysPreviewByElementId` — `useMemo` over `showPropertiesOverlayAlways`, `draft?.bpmn_meta`, `selectedPropertiesOverlayAlwaysPreview` |
| | | 1721–1722, 1936–1937, 1940–1942: Resets overlay preview on selection change |

## 9. Post-Staging Fanout

| File | Role | Key Lines |
|------|------|-----------|
| `frontend/src/features/process/bpmn/stage/fanout/postStagingFanout.js` | Fanout dispatch | 234: `options.applyPropertiesOverlayDecor?.(activeInst, activeKind);` |

## Cleanup Summary

- `BpmnStage.jsx` `resetBpmnStage()` (line 4284–4310): Resets **all** decor state refs including `propertiesOverlayStateRef` and `propertiesOverlayZoomBucketRef`.
- `decorManager.js` `clearPropertiesOverlayDecor()` (line 1340–1358): Calls `overlays.remove(entry.overlayId)` for each tracked overlay and resets the state ref.
- **No orphaned overlay leak**: Both runtime evidence (stable DOM counts across tab switches) and source code confirm proper cleanup.
