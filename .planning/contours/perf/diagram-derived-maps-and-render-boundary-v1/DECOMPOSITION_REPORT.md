# DECOMPOSITION_REPORT.md

## Contour
`perf/diagram-derived-maps-and-render-boundary-v1`

## What Was Extracted

### 1. `useDiagramElementMetaModel`
**Source**: `frontend/src/components/ProcessStage.jsx` lines ~2857-2938  
**Destination**: `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js`

Extracted useMemos:
- `nodePathMetaMap` — from `draft?.bpmn_meta?.node_path_meta`
- `flowTierMetaMap` — from `draft?.bpmn_meta?.flow_meta`
- `robotMetaByElementId` — from `draft?.bpmn_meta?.robot_meta_by_element_id`
- `robotMetaStatusByElementId` — derived from `robotMetaByElementId`
- `robotMetaCounts` — derived from `robotMetaStatusByElementId`
- `robotMetaNodeCatalogById` — from `draft?.nodes`
- `hybridLayerMapLive` — from `hybridLayerByElementId`
- `hybridLayerItems` — combined from robotMeta and hybridLayerMap

Stability mechanism: each computation uses stable primitive version keys (`bpmnMetaKey`, `nodesKey`, `hybridLayerKey`) instead of `draft` object identity.

### 2. `useDiagramDodQualityModel`
**Source**: `frontend/src/components/ProcessStage.jsx` lines ~3717-4130  
**Destination**: `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`

Extracted useMemos:
- `diagramDodSnapshot` — from `computeDodSnapshotFromDraft`
- `dodReadinessV1` — from `buildDodReadinessV1`
- `qualityOverlayCatalog` — from `diagramDodSnapshot` + coverage data
- `qualityOverlayHints` — from `qualityOverlayFilters` + `qualityOverlayCatalog`
- `diagramHints` — combined hints from quality, coverage, path, attention, report
- `pathHighlightHints` — from path highlight state + `nodePathMetaMap` + `flowTierMetaMap`
- `qualityOverlayRows` — catalog rows for UI
- `activeQualityOverlayCount` — enabled filter count
- `qualityOverlayListItems` — search-filtered list items

Stability mechanism: each computation uses `buildDraftVersionKey` and shallow keys for object inputs instead of raw object identities.

### 3. `diagramDerivedModelHash`
**Destination**: `frontend/src/features/process/bpmn/stage/derived/diagramDerivedModelHash.js`

Lightweight hash/version helpers:
- `buildBpmnMetaVersionKey` — prefers `bpmn_graph_fingerprint`, falls back to shallow hash
- `buildInterviewVersionKey` — steps length + analysis keys + notes keys
- `buildNodesVersionKey` — array length + first/last id hashes
- `buildNotesVersionKey` — key count + total item count
- `buildHybridLayerVersionKey` — key count
- `buildDiagramSourceKey` — composite primitive key for full model

### 4. `buildInterviewDecorSignature`
**Source**: `frontend/src/components/process/BpmnStage.jsx` lines ~460-508  
**Destination**: `frontend/src/features/process/bpmn/stage/derived/buildInterviewDecorSignature.js`

Pure function extracted so ProcessStage can pre-compute the stable signature and pass it to BpmnStage.

### 5. `useDiagramDerivedModel`
**Destination**: `frontend/src/features/process/bpmn/stage/derived/useDiagramDerivedModel.js`

Orchestrator hook composing `useDiagramElementMetaModel` + `useDiagramDodQualityModel` + `interviewDecorSignature`. Returns `{ elementMetaModel, dodQualityModel, sourceKey, interviewDecorSignature }`.

## Line Count Delta

| File | Before | After | Delta |
|------|--------|-------|-------|
| ProcessStage.jsx | 6,898 | ~6,626 | -272 |
| BpmnStage.jsx | 5,759 | ~5,760 | +1 |
| New files total | — | ~470 | +470 |
| **Net** | — | — | **+199** |

ProcessStage line count decreased significantly. BpmnStage stayed flat (only added props). New extracted modules are ~470 lines. Net increase is acceptable for decomposition; the heavy logic was in god files and is now in dedicated, testable modules.

## Behavior Preserved Evidence

- `npm run build` passes ✅
- Existing Node tests: 1923 pass, 24 fail (same pre-existing failures as before changes) ✅
- New unit test: `diagramDerivedModelHash.test.mjs` — 6/6 pass ✅
- `useBpmnSettledDecorFanout.test.mjs` — 2/2 pass ✅
