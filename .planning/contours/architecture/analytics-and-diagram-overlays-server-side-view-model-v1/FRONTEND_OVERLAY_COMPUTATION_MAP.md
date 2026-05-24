# Frontend overlay computation map

Run ID: `20260519T090224Z-17699`

## Overlay props/view-model assembly

| Area | Evidence | Notes |
|---|---|---|
| ProcessStage computes overlay inputs from `draft.bpmn_meta`, nodes and hybrid state | `frontend/src/components/ProcessStage.jsx:2962`-`:3043`, `:3120`-`:3140` | robot meta, hybrid layer items, viewport-projected rows |
| Stable overlay prop segmentation | `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js:71`-`:106`, `:252`-`:295` | frontend memo layer for Bpmn/Drawio/Hybrid props |
| Bpmn overlay props include selected/always properties preview maps | `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js:7`-`:70` | passes data to `BpmnStage` |
| Overlay renderer mounts Bpmn, Drawio and Hybrid layers | `frontend/src/features/process/stage/ui/ProcessDiagramOverlayLayers.jsx:13`-`:37` | frontend render boundary |

## Properties overlay data preparation

| Computation | Evidence | Classification |
|---|---|---|
| Build overlay preview rows from Camunda extension state/dictionary | `frontend/src/features/process/camunda/propertyDictionaryModel.js:278`-`:360`, `:427` onward | frontend-derived only |
| BpmnStage reads `bpmn_meta.camunda_extensions_by_element_id` | `frontend/src/components/process/BpmnStage.jsx:2362`-`:2379` | frontend-derived from durable meta |
| BpmnStage refreshes overlay preview map after Camunda map changes | `BpmnStage.jsx:2464`-`:2495` | frontend-derived |
| Sequence-flow overlay items from business object | `frontend/src/features/process/bpmn/stage/decor/decorManager.js:1532`-`:1559`, `:1607`-`:1631` | runtime/frontend-derived |

## Overlay decorations/classes and DOM/SVG creation

| Rendering path | Evidence | Cost owner |
|---|---|---|
| `applyPropertiesOverlayDecor` iterates preview entries and resolves bpmn-js elements | `decorManager.js:1561`-`:1687` | frontend |
| Per-overlay geometry/content signatures | `decorManager.js:1360`-`:1376`, `:1701`-`:1719` | frontend |
| DOM container/table/row creation | `decorManager.js:1378`-`:1457`, `:1721`-`:1741` | frontend DOM |
| bpmn-js overlay add/remove | `decorManager.js:1743`-`:1757`, `:1770`-`:1777`; clear at `:1339`-`:1358` | frontend/bpmn-js overlay manager |
| Viewbox listener re-applies properties overlays only after pan ends and only if zoom bucket changed | `BpmnStage.jsx:4076`-`:4084`; `wireBpmnStageRuntimeEvents.js:293`-`:319`, `:415`-`:440` | frontend runtime |
| Existing bounds/geometry reader is internal to overlay layout model | `overlayLayoutModel.js:58`-`:86`, `:98`-`:145` | candidate for viewport culling |

## Other overlay rendering paths

| Path | Evidence | Notes |
|---|---|---|
| Hybrid viewport projection marks `insideViewport` with 220px buffer | `frontend/src/features/process/stage/hooks/hybridLayerViewportProjection.js:15`-`:106` | existing frontend culling model for hybrid layer |
| Hybrid controller rebuilds render rows on viewport/matrix changes | `frontend/src/features/process/stage/hooks/useHybridLayerViewportController.js:90`-`:114` | frontend computation |
| Hybrid renderer emits SVG/elements/legacy overlay DOM | `frontend/src/features/process/hybrid/renderers/HybridOverlayRenderer.jsx:54`-`:184` | frontend DOM/SVG |
| Viewport source batches viewbox changes through rAF and exposes changing signal | `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js:277`-`:305`, `:393`-`:408` | frontend runtime utility |

## Rendering boundary

Confirmed:
- Backend can prepare read-only overlay view-models: element ids, labels, chips, status/counts, signatures.
- Frontend still owns bpmn-js `overlays.add`, DOM row creation, SVG render, pointer/selection/viewport state.
- Server-side data preparation alone will not remove `.djs-overlay`, `.fpcPropertyOverlay`, SVG or React render cost.

Future backend requirement:
- `GET /api/analytics/diagram-overlays` can return compact read-only overlay data.
- Viewport-aware endpoint is only a later feasibility target; frontend still needs viewport state and visible-only rendering.
