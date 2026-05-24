# DERIVED_MODEL_REPORT.md

## Model Shape

### `elementMetaModel`
| Property | Type | Stable deps |
|----------|------|-------------|
| `nodePathMetaMap` | object | `bpmnMetaKey` |
| `flowTierMetaMap` | object | `bpmnMetaKey` |
| `robotMetaByElementId` | object | `bpmnMetaKey` |
| `robotMetaStatusByElementId` | object | `robotMetaByElementId` (stable) |
| `robotMetaCounts` | object | `robotMetaStatusByElementId` |
| `robotMetaNodeCatalogById` | object | `nodesKey` |
| `hybridLayerMapLive` | object | `hybridLayerKey` |
| `hybridLayerItems` | array | `robotMetaByElementId`, `robotMetaNodeCatalogById`, `robotMetaStatusByElementId`, `hybridLayerMapLive` |
| `__stableKeys` | object | `{ bpmnMetaKey, nodesKey, hybridLayerKey }` |

### `dodQualityModel`
| Property | Type | Stable deps |
|----------|------|-------------|
| `diagramDodSnapshot` | object/null | `hasSession`, `draftKey`, `lintResultKey` |
| `dodReadinessV1` | object/null | `hasSession`, `draftKey`, `diagramDodSnapshot`, `autoPassPrecheckKey`, `autoPassJobStateKey`, `coverageMatrixKey`, workspace/org/project/sid primitives |
| `qualityOverlayCatalog` | object | `diagramDodSnapshot`, `coverageByIdKey`, `coverageRowsAllKey`, `draftKey` |
| `qualityOverlayHints` | array | `qualityOverlayFilters`, `qualityOverlayCatalog` |
| `diagramHints` | array | `isQualityMode`, `isCoverageMode`, `qualityHintsKey`, `coverageHintsKey`, `customAttentionHintsKey`, `pathHighlightHints`, `qualityOverlayHints`, `reportPathStopHintsKey`, `reportPathFlowConflictHintsKey` |
| `pathHighlightHints` | array | `pathHighlightEnabled`, `pathHighlightTier`, `pathHighlightSequenceKey`, `nodePathMetaMap`, `flowTierMetaMap` |
| `qualityOverlayRows` | array | `qualityOverlayCatalog` |
| `activeQualityOverlayCount` | number | `qualityOverlayFilters` |
| `qualityOverlayListItems` | array | `qualityOverlayRows`, `qualityOverlayListKey`, `qualityOverlaySearch` |

### `sourceKey`
Composite string built from primitives:
```
sid={sessionId}|xmlv={bpmnXmlVersion}|dsv={diagramStateVersion}|bmv={bpmnMetaVersion}|nv={nodesVersion}|iv={interviewVersion}|ntv={notesVersion}|hlv={hybridLayerVersion}|flags={overlaySettingsFlags}
```

### `interviewDecorSignature`
String hash computed by `buildInterviewDecorSignature`. Stable deps in ProcessStage:
- `elementMetaStableKeys?.bpmnMetaKey`
- `elementMetaStableKeys?.nodesKey`
- `buildInterviewVersionKey(draft?.interview)`
- `buildNotesVersionKey(draft?.notes_by_element || draft?.notesByElementId)`
- `isInterviewMode`
- `diagramMode`

**BpmnStage consumption (rework round 1)**: When `interviewDecorSignatureProp` is present, BpmnStage useMemo depends ONLY on the prop (stable primitive string). No `draft` sub-property dependencies. Fallback to full deps only when prop is absent.

## Dependency Graph

```
draft ──► buildDraftVersionKey ──► diagramDodSnapshot
                                     └──► dodReadinessV1

draft?.bpmn_meta ──► buildBpmnMetaVersionKey ──► nodePathMetaMap
                                                  ├──► flowTierMetaMap
                                                  ├──► robotMetaByElementId
                                                  │     └──► robotMetaStatusByElementId
                                                  │           └──► robotMetaCounts
                                                  └──► robotMetaNodeCatalogById (via nodesKey)

draft?.interview ──► buildInterviewVersionKey ──► interviewDecorSignature
draft?.notes* ──► buildNotesVersionKey ──► interviewDecorSignature
```

## Stability Proof

1. **Pan/zoom/hover/selection**: These actions do NOT change `draft` version fields (`bpmn_xml_version`, `diagram_state_version`, `updated_at`). Therefore:
   - `buildDraftVersionKey` stays stable
   - `elementMetaModel` object refs stay stable
   - `dodQualityModel` object refs stay stable
   - `interviewDecorSignature` stays stable

2. **Source data change**: When backend saves/mutates session, version fields increment. The hooks recompute exactly once.

3. **BpmnStage render boundary (rework round 1)**: BpmnStage receives `interviewDecorSignature` as a prop. When the prop is present, the useMemo depends ONLY on `[interviewDecorSignatureProp]` — a stable primitive string. Even if `draft` object identity changes, the useMemo does NOT recompute. The `applyInterviewDecor` effect only fires when the signature value actually changes.

4. **Decor fanout boundary**: `useBpmnSettledDecorFanout` now depends on `bpmnMetaKey` and `nodesKey` (primitives) instead of `draft?.bpmn_meta` and `draft?.nodes` (objects). Pan/zoom/selection do not change these keys → fanout effects do NOT refire.
