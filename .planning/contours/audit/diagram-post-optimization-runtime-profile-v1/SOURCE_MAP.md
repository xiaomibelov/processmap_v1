# SOURCE_MAP.md — audit/diagram-post-optimization-runtime-profile-v1

## Core Diagram Components

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/components/process/BpmnStage.jsx` | ~5,765 | Main diagram component; viewer + modeler init, selection, decor, XML import | `bpmnLayerEditor` is `block` on load; initial ready takes 6.5s; modeler/viewer dual init likely dominant | **High**: `ensureViewer`/`ensureModeler` paths, large JSX tree, many refs/effects | **YES — primary** | Medium |
| `frontend/src/components/ProcessStage.jsx` | ~6,626 | Session shell; 70+ state values, 14+ ref-sync effects, derived model orchestration | Tab switch 4–6s observed; parent re-render churn propagates to BpmnStage | **High**: `selectedElementContext` memo churn, version polling, mode state | **YES — secondary** | Medium |

## Analytics / Selection-Lite Modules

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js` | ~60 | Analytics mode selection highlight | Selection clicks in this run did not register (Playwright interception), but prior audits show +238 DOM delta | Low; already proven cheap | No | Low |
| `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js` | ~90 | Focus decor manager | Not triggered in analytics mode (fpcFocusDim=0) | Low in analytics mode | No | Low |
| `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js` | ~70 | Selection emission bridge | Bounded and stable | Low | No | Low |
| `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js` | ~40 | Mode state (`isDiagramAnalyticsMode`) | Simple ref checks | Low | No | Low |

## Derived Model / Render Boundary

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/features/process/bpmn/stage/derived/useDiagramDerivedModel.js` | ~140 | Orchestrator for derived maps | No rebuild detected on stable state; should be stable after prior contour | Low-Medium; verify on selection change | Maybe (verify) | Low |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js` | ~130 | Element meta maps | Uses primitive version keys; stable | Low | No | Low |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js` | ~370 | DOD/quality overlay maps | Uses `buildDraftVersionKey`; verify stability | Low-Medium | Maybe (verify) | Low |
| `frontend/src/features/process/bpmn/stage/derived/buildInterviewDecorSignature.js` | ~50 | Signature builder | Stable; used for interview decor memoization | Low | No | Low |

## Decor / Overlay Pipeline

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | ~1,804 | Decor building and viewport culling | Overlays toggle not accessible in this run; prior audits show culling works | Low when overlays OFF; Medium when ON | Only if overlays ON becomes priority | Medium |
| `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | ~145 | Overlay layout calculations | Not triggered in this run (overlays OFF) | Low in current state | No | Low |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | ~201 | Fanout orchestration for settled decor | No unnecessary effect runs observed at idle | Low | No | Low |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | ~611 | Runtime event wiring | `onSelectionChanged` branches for analytics vs edit; pan/zoom anomaly suggests possible event misfire | Medium | Maybe (investigate edit path) | Medium |

## Property Panel / Sidebar

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/components/NotesPanel.jsx` | ~3,286 | Main property/sidebar panel; massive useMemo/useEffect surface | Panel open latency ~800ms observed; many memos depend on `selectedElementId` | **High candidate** | **YES — backup** | Low-Medium |
| `frontend/src/components/sidebar/SelectedElementCard.jsx` | ~101 | Selected element card | Memoized; low direct cost | Low | No | Low |
| `frontend/src/components/sidebar/SelectedNodeSection.jsx` | ~767 | Selected node section | Memoized; low direct cost | Low | No | Low |
| `frontend/src/components/sidebar/ElementSettingsControls.jsx` | ~2,436 | Element settings form | May rebuild on selection change | Medium | Maybe | Low |
| `frontend/src/components/sidebar/useElementSettingsController.js` | ~180 | Settings controller | Hook stability unknown | Low-Medium | Maybe (verify) | Low |

## CSS / Paint

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` | ~1,375 | Selection/hover/flash stroke styles | Some `drop-shadow` rules remain (start/end events, flash decorators, coverage decorators) | Low-Medium paint cost | No (diminishing returns) | Low |
| `frontend/src/styles/app/04/04-03-llm-bottlenecks.css` | ~896 | Quality/bottleneck overlay styles | Remaining `drop-shadow` rules for quality glow and jump glow | Low-Medium paint cost | No (diminishing returns) | Low |
| `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` | ~377 | Dark theme base | 4 `box-shadow` rules reduced; remaining context-pad/popup shadows | Low paint cost | No | Low |

## Session Shell / React Churn

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/App.jsx` | ~3,585 | App shell; `selectedBpmnElement` state owner | `selectedBpmnElement` changes propagate to many children; initial load orchestration | Medium-High | Indirect (via ProcessStage) | Medium |
| `frontend/src/components/AppShell.jsx` | ~351 | Layout shell | Re-renders on session changes | Low-Medium | No | Low |
| `frontend/src/features/process/stage/orchestration/useProcessStageLocalState.js` | ~220 | Local state composition | Composes mode/action/dialog/panel state | Low-Medium | Maybe (verify) | Low |
| `frontend/src/features/process/stage/controllers/useProcessStageShellController.js` | ~180 | Shell controller | Save status, header view | Low | No | Low |

## Network / Auth

| Path | Lines | Role | Observed Runtime Relation | Likely Residual Cost | Next Fix Target? | Risk |
|------|-------|------|---------------------------|----------------------|------------------|------|
| `frontend/src/components/ProcessStage.jsx` ~1534 | ~30 | `pollRemoteSessionSnapshot` → `apiGetBpmnVersions(sid, { limit: 1 })` | Background poll every interval; 4 observed during run; already deduped but still present | Low | No (acceptable) | Low |
| `frontend/src/features/process/stage/presence/useSessionPresence.js` | ~90 | Presence polling | All presence requests returned 200 in this run; no 401 race observed | Low | No | Low |
