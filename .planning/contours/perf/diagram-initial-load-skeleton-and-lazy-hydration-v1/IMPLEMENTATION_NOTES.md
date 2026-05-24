# IMPLEMENTATION_NOTES.md

## Files Created

1. `frontend/src/features/process/bpmn/stage/load/DiagramSkeleton.jsx`
2. `frontend/src/features/process/bpmn/stage/load/useDiagramStagedHydration.js`
3. `frontend/src/features/process/bpmn/stage/load/useDeferredDecorFanout.js`

## Files Modified

1. `frontend/src/components/process/BpmnStage.jsx`
   - Imports: added `DiagramSkeleton`, `useDiagramStagedHydration`, `useDeferredDecorFanout`
   - Replaced direct `useBpmnSettledDecorFanout` call with `useDiagramStagedHydration` + `useDeferredDecorFanout`
   - Added `{!diagramReady ? <DiagramSkeleton /> : null}` inside `.bpmnStack`

2. `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx`
   - Wrapped export in `React.memo()` to reduce re-render churn

3. `frontend/src/styles/legacy/legacy_bpmn.css`
   - Added `.diagramSkeleton`, `.diagramSkeleton-canvas`, `.diagramSkeleton-pulse`, `.diagramSkeleton-text` styles
   - Added `@keyframes diagramSkeletonPulse`
   - Added dark-mode variants

4. `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`
   - **Bug fix**: replaced all `toArray` calls with `asArray` (imported from `processStageDomain`)
   - `toArray` was used but not imported, causing a runtime `ReferenceError` in the production build

## Deferred Hydration Logic

`useDeferredDecorFanout` wraps the callbacks passed to `useBpmnSettledDecorFanout`:

- **Immediate**: `emitElementSelection`, `syncAiQuestionPanelWithSelection`, `syncCamundaExtensionsToModeler`
- **Deferred via `requestIdleCallback`** (with `setTimeout(fn, 0)` fallback):
  - `applyUserNotesDecor` / `clearUserNotesDecor`
  - `applyStepTimeDecor`
  - `applyRobotMetaDecor`
  - `applyPropertiesOverlayDecor` / `clearPropertiesOverlayDecor`

When the viewer/modeler instance keys change:
1. `onCanvasReady` is called immediately
2. `onDecorLoading` is called immediately
3. `onFullyReady` is scheduled via `requestIdleCallback` with a 500ms timeout

## CSS-Only Skeleton

- No new dependencies added
- Uses `linear-gradient` + `animation` for the pulse effect
- Positioned absolutely inside `.bpmnStack` with `z-index: 5`
- Hides automatically when `diagramReady` becomes true
- Russian label: "Загрузка диаграммы…"

## Build & Test

- `npm run build` passes
- `node --test` on selected test files passes
- Pre-existing runtime issues on `fix/lockfile-sync-test` branch were documented, not caused by this contour

## Risks & Limitations

1. **bpmn-js init bottleneck untouched**: Initial load time to canvas is still ~3.7s. This contour only addresses React hydration churn and perceived load time via skeleton.
2. **Tab switch latency**: The current branch shows elevated tab switch times. Root cause appears to be pre-existing changes in `useProcessTabs.js` flush logic. The deferred fanout should help, but the overall tab switch is dominated by other factors.
3. **Idle callback reliability**: `requestIdleCallback` may not fire in busy main thread. Fallback `setTimeout(fn, 0)` ensures eventual hydration.
4. **Decor "pop-in"**: Deferred decor may cause a visible delay before overlays appear. Selection is immediate to preserve interaction.
