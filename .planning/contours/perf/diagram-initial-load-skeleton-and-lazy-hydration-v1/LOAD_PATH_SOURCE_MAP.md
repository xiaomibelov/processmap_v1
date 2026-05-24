# LOAD_PATH_SOURCE_MAP.md

## Critical Path — Canvas First Paint

| File | Role | Lines | Blocks First Paint | Deferrable | Decomposition Need | Risk |
|------|------|-------|-------------------|------------|-------------------|------|
| `frontend/src/components/ProcessStage.jsx` | Session tab shell | 6,626 | Yes (parent re-render cost) | Partial | **High** — god file | High |
| `frontend/src/components/process/BpmnStage.jsx` | BPMN canvas, `diagramReady` state | 5,765 | Yes (core canvas) | Partial (canvas no, decor yes) | **High** — god file | High |
| `frontend/src/features/process/hooks/useProcessTabs.js` | Tab switch logic | 1,035 | Yes (tab switch latency) | No | Low | Medium |
| `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js` | Builds all BpmnStage props | 297 | Yes (object churn) | Partial (can memoize) | Low | Medium |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Decor application manager | 1,804 | Yes (synchronous decor) | Partial (defer non-critical) | Medium | Medium |

## Non-Critical — Deferrable After Canvas First Paint

| File | Role | Lines | Blocks First Paint | Deferrable | Decomposition Need | Risk |
|------|------|-------|-------------------|------------|-------------------|------|
| `frontend/src/components/NotesPanel.jsx` | Property/sidebar panel | 3,286 | No | **Yes** | Medium | Medium |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Fanout: notes, stepTime, robotMeta, properties, selection | 201 | Yes (fires immediately) | **Yes** (all non-selection) | Low | Low |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js` | Element meta maps | ~80 | No | **Yes** | Low (already extracted) | Low |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js` | DOD/quality overlay maps | ~120 | No | **Yes** | Low (already extracted) | Low |
| `frontend/src/features/process/quality/useQualityDerivation.js` | Quality hints/lint | ~130 | No | **Yes** | Low | Low |
| `frontend/src/features/process/coverage/useCoverageDerivation.js` | Coverage matrix | ~150 | No | **Yes** | Low | Low |
| `frontend/src/features/process/stage/ui/ProcessPanels.jsx` | Attention panel, top panels | 643 | No | **Yes** | Low | Low |
| `frontend/src/components/sidebar/ElementSettingsControls.jsx` | Element settings sidebar | 2,436 | No | **Yes** | Medium | Medium |
| `frontend/src/features/process/bpmn/stage/playbackAdapter.js` | Playback overlays | 983 | No | **Yes** | Medium | Medium |

## Extraction Summary

Three new modules were extracted from the god files:

1. `features/process/bpmn/stage/load/DiagramSkeleton.jsx` — lightweight skeleton UI
2. `features/process/bpmn/stage/load/useDiagramStagedHydration.js` — staged hydration state machine
3. `features/process/bpmn/stage/load/useDeferredDecorFanout.js` — wraps `useBpmnSettledDecorFanout` with deferred scheduling

Additionally, `ProcessStageDiagramControls` was wrapped in `React.memo` to reduce re-render cost.
