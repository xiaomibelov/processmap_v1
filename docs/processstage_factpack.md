# ProcessStage Fact Pack (AS-IS)

## 1) Размер и структура
- File: `frontend/src/components/ProcessStage.jsx`
- Lines: `7564`
- `useState`: `89`
- `useRef`: `44`
- `useEffect/useLayoutEffect`: `56`
- `useCallback`: `12`

### Крупные зоны ответственности (по факту из файла)
- Toolbar + Diagram action bar/popovers: ~`6990-8260`
- BpmnStage wiring + callbacks: ~`8370-8415`
- Hybrid overlay render (v2 + legacy activity cards): ~`8416-8678`
- Playback runtime/events/controls: ~`6152-6435`, UI ~`7415-7630`
- Reports/snapshots/packs: ~`2975-3580`
- AI questions/notes/clarify orchestration: ~`3688-4058`, `4802-5222`
- Hybrid v1/v2 state machine + persist/import/export: ~`5466-6151`
- Session/meta orchestration + effects: ~`1267-5153`

## 2) Inventory: state/refs/effects

### useState inventory (ключевые группы)
- Generation/AI busy/errors: `genBusy`, `genErr`, `infoMsg`, `aiStepBusy`, `aiQuestionsBusy` (~`1162-1197`)
- Snapshots/packs/diff UI: `versions*`, `diff*`, `packs*` (~`1172-1184`)
- Command/quality/insert-between UI: `command*`, `quality*`, `insertBetween*` (~`1189-1201`)
- Diagram action popovers/toggles: `diagramAction*`, `pathHighlight*`, `robotMeta*` (~`1210-1238`)
- Execution plan + playback state: `executionPlan*`, `playback*` (~`1240-1252`)
- Hybrid state: `hybridUiPrefs`, `hybridPeekActive`, `hybridLayerByElementId`, `hybridLayerPositions`, `hybridLayerCardSizes`, `hybridV2Doc`, `hybridV2ToolState`, `hybridV2ActiveId`, `hybridV2BindPickMode` (~`1253-1265`)

### useRef inventory (ключевые группы)
- DOM refs popovers/host: `diagram*PopoverRef`, `bpmnStageHostRef`, `hybridLayerOverlayRef` (~`1122-1133`)
- Hybrid mutable state: drag/size/map/matrix/doc refs (~`1134-1149`)
- Playback mutable runtime: `playbackEngineRef`, `playbackFramesRef`, guard refs (~`1150-1158`)
- Misc guards/hashes: `lastDraftXmlHashRef`, `lastAiGenerateIntentKeyRef` (~`1159-1160`)

### Effects inventory (критичные)
- Full reset on session change (`sid`): clears many states/refs (~`1267+`)
- Hybrid viewport polling + matrix parse + anchor recompute interval 180ms (~`4228+`)
- Hybrid key handlers (`H` peek, `Esc`, delete) (~`4303+`)
- Hybrid drag effects for v1/v2 (~`4341+`, `4414+`)
- Global outside-click closer for diagram popovers (~`4496+`)
- Playback ticker/evolution effects (~`4566+`, `4642+`)
- Persist/autosave effects for hybrid v1/v2 (~`5550+`, `5563+`)

## 3) Hotspots риска (с фактами)
1. **Ref callback + setState loop risk**
   - Historical regression around card ref callback (`~8608`) + size state updates (`~1706`).
   - Факт: цикл рендера уже воспроизводился как `Maximum update depth exceeded`.

2. **Effect that recomputes render-critical state very frequently**
   - Hybrid viewport polling every 180ms updates matrix + positions (~`4228-4300`).
   - Риск: много лишних ререндеров и race при mode switch.

3. **Mixed responsibilities in one component**
   - В одном файле одновременно UI layout, BPMN runtime wiring, playback engine lifecycle, hybrid geometry, reports/packs/snapshots, AI orchestration.

4. **DOM measurement + state updates**
   - Card sizing/clamp depends on DOM measurement + state updates (~`1684-1730`).
   - Нужны строгие guard/compare-before-set.

5. **Global listeners with many deps**
   - Multiple window listeners (`mousedown`, `mousemove`, `mouseup`, `keydown`) attached in different effects (~`4303-4496`).
   - Риск рассинхронизации cleanup/guards.

6. **Large JSX blocks with inline closures**
   - Layers popover and Hybrid overlay render each include many inline handlers (~`7748-8678`).
   - Риск unstable callbacks and accidental rerender storms.

## 4) Контрольные точки декомпозиции (strangler)
- Step A (extract-only, no behavior change):
  - move pure coord utils (`parseSvgMatrix/matrixToScreen/matrixToDiagram`)
  - move Hybrid overlay renderer JSX into dedicated component
  - move Layers popover JSX into dedicated component
- Step B:
  - isolate session meta persist adapter (`useSessionMetaPersist` style interface)
  - isolate canvas/viewbox controller (`useBpmnCanvasController`)
- Step C:
  - keep ProcessStage as orchestration shell (layout + wiring + props)

## 5) Что проверять после каждого шага
- No `Maximum update depth exceeded` when toggling Hybrid `View/Edit`.
- Diagram interactions unchanged in View mode.
- Playback controls and manual gateway popover still work.
- Hybrid v1/v2 persist on reload still works.
- Reports/RobotMeta/Paths buttons remain functional.

## 6) Теперь маршруты и точки входа живут здесь

- Route map / URL truth: `docs/route-map.md`
- Workspace routing shell: `frontend/src/RootApp.jsx`
- Org / project / session navigation: `frontend/src/App.jsx`, `frontend/src/features/auth/AuthProvider.jsx`, `frontend/src/lib/api.js`
- Process shell tab orchestration: `frontend/src/features/process/hooks/useProcessOrchestrator.js`, `frontend/src/features/process/hooks/useProcessTabs.js`
- BPMN canvas wiring: `frontend/src/features/process/stage/hooks/useBpmnCanvasController.js`
- Overlay transform / viewbox sync: `frontend/src/features/process/stage/hooks/useDiagramOverlayTransform.js`
- Playback orchestration: `frontend/src/features/process/stage/hooks/usePlaybackController.js`
- Hybrid viewport/layout wiring: `frontend/src/features/process/stage/hooks/useHybridLayerViewportController.js`
- Diagram action popover wiring: `frontend/src/features/process/stage/hooks/useDiagramActionPopovers.js`
- Hybrid renderer / settings entry points: `frontend/src/features/process/stage/renderers/HybridOverlayRenderer.jsx`, `frontend/src/features/process/stage/components/LayersPopover.jsx`, `frontend/src/features/process/hybrid/tools/*`
- Templates orchestration: `frontend/src/features/templates/model/useTemplatesStore.js`, `frontend/src/features/templates/ui/*`, `frontend/src/features/templates/services/*`
- TL;DR derivation / render: `frontend/src/features/tldr/selectors/buildTldrFromSession.js`, `frontend/src/features/tldr/ui/TldrCard.jsx`

Практический смысл для следующих шагов:

- URL-маршруты и session/org/project flow больше не надо восстанавливать по памяти.
- `ProcessStage.jsx` должен рассматриваться как orchestration shell, а не место для новых системных state machine.
- Новый код для Hybrid ghost/create должен входить через существующие stage hooks, а не возвращать poll/listener logic обратно в компонент.
- Новый код для Templates/TL;DR должен входить через `features/templates/*` и `features/tldr/*`, а не добавлять ещё одну business-state machine в `ProcessStage`.
