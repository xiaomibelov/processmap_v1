# BpmnStage Factpack

Файл аудита: `frontend/src/components/process/BpmnStage.jsx`

## 1) Фиксация контекста

- Branch: `feat/paths-polish-v1`
- HEAD: `518744f`
- Размер файла: `6965` строк (`wc -l`)
- Hook footprint: `useRef=71`, `useState=6`, `useMemo=1`, `useCallback=0`, `useEffect=24`
- Количество `catch {}` в файле: `98`

### Ключевые файлы/модули, которые BpmnStage импортирует/использует (топ-20, по коду)

1. `frontend/src/lib/api/bpmnApi.js` (`apiGetBpmnXml/apiPutBpmnXml/apiDeleteBpmnXml`)
2. `frontend/src/features/process/lib/processDebugTrace.js` (`traceProcess`)
3. `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js`
4. `frontend/src/features/process/bpmn/store/createBpmnStore.js`
5. `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js`
6. `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`
7. `frontend/src/features/process/bpmn/runtime/modules/forceTaskResizeRules.js`
8. `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js`
9. `frontend/src/features/process/bpmn/ops/applyOps.js`
10. `frontend/src/features/notes/elementNotes.js`
11. `frontend/src/components/process/interview/perf.js`
12. `frontend/src/features/process/robotmeta/pmModdleDescriptor.js`
13. `frontend/src/features/process/robotmeta/robotMeta.js`
14. `frontend/src/features/process/robotmeta/executionPlan.js`
15. `frontend/src/features/process/playback/buildExecutionGraph.js`
16. dynamic import: `bpmn-js/lib/NavigatedViewer` (line 5148)
17. `bpmn-js/dist/assets/diagram-js.css`
18. `bpmn-js/dist/assets/bpmn-js.css`
19. `bpmn-js/dist/assets/bpmn-font/css/bpmn.css`
20. `bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css`

### Недавние фичи, которые явно отражены в BpmnStage (по коду)

- RobotMeta BPMN integration:
  - moddle extension `pm` подключается в runtime init (`moddleExtensions: { pm: pmModdleDescriptor }`, `1573-1595`)
  - sync перед save (`syncRobotMetaToModeler`, `2100-2106`, используется в `saveLocalFromModeler`, `6203-6209`)
  - hydrate из BPMN после import (`hydrateRobotMetaFromImportedBpmn`, `2107-2177`, вызов в `renderModeler`, `5480`)
  - overlays ready/incomplete (`3964-4100`)
- Playback layer:
  - execution graph export API (`getPlaybackGraph -> buildExecutionGraphFromInstance`, `6841-6843`)
  - playback overlays/camera/gateway decision UI (`4101-4529`)
- AI overlays for per-node questions/comments (`2210-2492`, `3526-3790`)
- Template packs and batch command ops (`2576-2884`)
- Tier/path highlighting (`P0/P1/P2`) через `flow_meta` и `node_path_meta` (`3253-3328`)
- Recovery pipeline для невидимого/сломавшегося canvas (`5843-6120`)

---

## 2) Responsibility Map (ядро)

| Зона | Что делает | Где в файле (line range) | Зависимости | Side-effects |
|---|---|---|---|---|
| Modeler/runtime init (bpmn-js) | Инициализация viewer/modeler, bind eventBus, runtime status | `5140-5323`, `1573-1595` | `createBpmnRuntime`, dynamic `NavigatedViewer`, `forceTaskResizeRules`, `pmModdleDescriptor` | создание экземпляров bpmn-js, event listeners, запись в refs |
| Import/load lifecycle | Session bootstrap, reload, importXML modeler/viewer, stale guards | `6292-6441`, `5088-5139`, `5324-5566` | `createBpmnCoordinator.reload`, runtime `load/importXML`, draft/store state | `setErr/setSrcHint/setXml*`, destroy/reinit runtime, tracing |
| Persistence/save pipeline | Save XML draft, persist snapshot, local/modeler flush save | `6121-6250`, `6251-6270`, `6178-6250` | `createBpmnPersistence`, `createBpmnCoordinator.flushSave`, `apiPutBpmnXml` via persistence | network save, counters, error state updates |
| Coordinator / flushSave / debounce | Связка store+runtime+persistence, runtime change tracking | `1377-1572` | `createBpmnStore`, `createBpmnCoordinator`, `createBpmnPersistence` | подписки store/runtime, dirty/rev updates, trace hooks |
| Overlays/highlighting (robotmeta/quality/selection/playback) | Task/link/happy-flow/interview/notes/time/robotmeta/playback markers & overlays | `3092-4942` | bpmn-js `canvas/overlays/elementRegistry`, robotmeta helpers, interview payload builder | массовые marker add/remove, overlay DOM узлы, event handlers |
| Camera/viewport control | Fit/ensure visible, smooth camera, recovery cycles | `1007-1376`, `4257-4325`, `5843-6120` | bpmn-js `canvas.viewbox/zoom`, runtime import/load | `requestAnimationFrame`, `setTimeout`, repeated viewbox ops |
| Keyboard/mouse bindings | Esc behavior, panel interaction event suppression, selection hooks | `2190-2462`, `5140-5323`, `6597-6618` | DOM events + bpmn-js eventBus | add/remove listeners, UI state mutations |
| Interaction with sidebar / selected node meta | Emit selection payload with insert-between candidate, notes/AI counts | `1838-1910`, `2493-2537`, `6536-6571` | callbacks from props (`onElementSelectionChange`, `onDiagramMutation`) | callback emissions, selection re-sync |
| Events/logging/diagnostics | BPMN/PACK/AI trace logs, runtime/import/ensure traces | `370-449`, `1417-1458`, `423-441`, `6329-6506` | `traceProcess`, `console.*` | extensive console/debug traces |
| Error handling/recovery/local history | Runtime teardown, reimport/hard reset, snapshot/local fallback | `4943-5087`, `5666-6120`, `1500-1520` | runtime destroy/load, persistence snapshot API | destructive resets/rebuilds, failover paths |

---

## 3) Где можно выносить модули без изменения поведения (кандидаты)

### Кандидат A: `bpmnRuntimeLifecycle` (runtime/store/coordinator wiring)
- Почему: блоки `1377-1572`, `5140-5566`, `4943-5139` работают как отдельный lifecycle-адаптер.
- API (черновик):
  - `initViewer(container, options)`
  - `initModeler(container, options)`
  - `loadXml(mode, xml, source)`
  - `destroyAll()`
- Вход/выход: refs runtime, callbacks onTrace/onSelection/onMutation; outputs ready/status/state snapshots.
- Риски: tight-coupling с `useRef` и текущими stale guards (`runtimeTokenRef`, `ensureEpochRef`).

### Кандидат B: `bpmnDecorManager` (all overlays/markers)
- Почему: decorate/clear функции занимают большой contiguous блок `3092-4942`.
- API (черновик):
  - `applyInterviewDecor(inst, payload, options)`
  - `applyRobotMetaDecor(inst, payload, filters)`
  - `applyPlaybackFrame(inst, event, options)`
  - `clearDecor(inst, scope)`
- Вход/выход: `inst`, payload maps, current state refs; output — updated decorator state.
- Риски: current DOM listeners внутри overlay-node builders (AI panel, badges) привязаны к локальным callback refs.

### Кандидат C: `viewportRecoveryController`
- Почему: `ensureCanvasVisibleAndFit` + `ensureVisibleOnInstance` + `recoverBy*` образуют отдельный recovery pipeline.
- API (черновик):
  - `ensureVisible(inst, context)`
  - `recoverByReimport(inst, xml, reason)`
  - `recoverByHardReset(inst, xml, reason)`
- Вход/выход: `inst`, xml candidate, guards/tokens; output `{ok, reason, cycle}`.
- Риски: dependence on runtime token/session guards и callbacks в stage.

### Кандидат D: `robotMetaBridge`
- Почему: sync/hydrate/decor логика robotmeta размазана по `2100-2177` и `3964-4100` + save path.
- API (черновик):
  - `syncToModeler(inst, map)`
  - `hydrateFromImportedBpmn(inst, xml, sessionMap)`
  - `buildDecorPayload(map, statusById, filters)`
- Вход/выход: session map, xml/modeler instance; output hydration result + decor payload.
- Риски: конфликт-политика (`session-meta-wins`) должна остаться идентичной.

### Кандидат E: `playbackAdapter`
- Почему: playback cache + frame renderer + camera находится в отдельном кластере `4101-4529`.
- API (черновик):
  - `prepareCache(inst, timeline)`
  - `applyFrame(inst, payload)`
  - `clear(inst)`
  - `buildGraph(inst)`
- Вход/выход: bpmn-js instance + playback events; output applied markers/overlays.
- Риски: синхронизация с внешним PlaybackEngine и manual gateway callbacks.

### Кандидат F: `aiQuestionOverlayAdapter`
- Почему: `openAiQuestionPanel/persistAiQuestionEntry` имеют отдельный UI state machine.
- API (черновик):
  - `openPanel(inst, kind, elementId, data, handlers)`
  - `closePanel(inst, kind)`
  - `syncWithSelection(inst, kind, element)`
- Вход/выход: questions map + handlers; output panel state.
- Риски: много inline DOM listeners, легко нарушить stopPropagation/selection semantics.

### Кандидат G: `templatePackAdapter`
- Почему: capture/insert/applyOps (`2576-2884`) логически изолированы от core runtime.
- API (черновик):
  - `capturePack(inst, options)`
  - `insertPack(inst, payload)`
  - `applyOps(inst, ops, selectedId)`
- Вход/выход: modeler instance + payload; output result object `{ok, remap, changedIds...}`.
- Риски: side effects в diagram mutation, selection, and connection rewiring.

---

## 4) Hotspots (факты, без предположений)

1. `ensureCanvasVisibleAndFit` = 315 строк (`1062-1376`), совмещает layout wait, viewbox ops, fit logic, delayed retries.
2. `ensureVisibleOnInstance` = 278 строк (`5843-6120`), совмещает probing, 3-stage recovery, stale-guard, reimport/hard reset.
3. `applyInterviewDecor` = 265 строк (`3526-3790`), одновременно строит badges, overlays, групповые box-оверлеи, AI panel sync.
4. `buildInterviewDecorPayload` = 197 строк (`3329-3525`), агрегирует steps/nodes/notes/AI/DoD в одном месте.
5. `openAiQuestionPanel` = 188 строк (`2275-2462`) с множеством DOM listener registrations внутри React-компонента.
6. `renderModeler` = 161 строк (`5406-5566`) с dedup in-flight, runtime token sync, import, hydration, decorators.
7. `applyPlaybackFrameOnInstance` = 154 строк (`4376-4529`) смешивает event interpretation, camera, overlay rendering.
8. `destroyRuntime` = 145 строк (`4943-5087`) содержит массовый reset почти всех runtime/decor refs.
9. `insertTemplatePackOnModeler` = 124 строк (`2689-2812`) совмещает create nodes/edges, rewiring, mutation events.
10. В файле 98 пустых `catch {}` блоков — ошибки в большинстве веток подавляются без propagate.
11. В компоненте 71 `useRef`: runtime и UI-decoration state распределены по множеству mutable контейнеров.
12. В одном файле одновременно смешаны runtime init/import/save/recovery + UI overlays + imperative API.
13. `useEffect` `6337-6441` содержит главный render-orchestration со stale guards и многими early-return ветками.
14. Decor refresh effect `6536-6571` зависит сразу от notes/nodes/bpmn_meta/view/display/time/robot filters/status.
15. Imperative API (`6627-6926`) экспонирует широкий набор команд (viewport/save/playback/template/import), увеличивая coupling с внешним orchestrator.

---

## 5) Минимальный черновик декомпозиции (5–8 модулей)

> Это черновой целевой контур, не реализация.

1. **`useBpmnRuntimeLifecycle`**
- Ответственность: init/destroy/load viewer+modeler, session token guards.
- Публичный API: `ensureViewer`, `ensureModeler`, `renderViewer`, `renderModeler`, `destroyRuntime`.
- Данные: `sessionId`, `draftXml`, refs контейнеров, trace callbacks.
- Тесты: runtime init/reinit, stale-guard, in-flight dedup.

2. **`useBpmnPersistenceBridge`**
- Ответственность: store/coordinator/persistence wiring, save/reload.
- API: `loadFromBackend`, `persistXmlSnapshot`, `saveLocalFromModeler`, `saveXmlDraftText`.
- Данные: store state (`xml/rev/dirty`), `sessionId`, persistence adapters.
- Тесты: flushSave pending/fail/success, remote/local fallback.

3. **`createDecorManager`**
- Ответственность: task/link/happy/interview/notes/time/robot markers and overlays.
- API: `applyDecor(scope, inst, payload)`, `clearDecor(scope, inst)`.
- Данные: normalized payloads + element registry.
- Тесты: idempotent apply/clear, no orphan overlays after refresh.

4. **`createPlaybackOverlayAdapter`**
- Ответственность: playback frame rendering + camera smoothing + gateway choice overlay.
- API: `prepareCache`, `applyFrame`, `clear`, `buildGraph`.
- Данные: playback event payload, speed, camera flag.
- Тесты: flow-first order rendering, parallel batch overlay behavior, cleanup timers/raf.

5. **`createViewportRecoveryController`**
- Ответственность: ensure-visible pipeline и recovery steps.
- API: `ensureVisible`, `recoverByReimport`, `recoverByHardReset`.
- Данные: runtime refs, xml candidate, session/token guard values.
- Тесты: invisible canvas recovery, stale guard, forced hard reset path.

6. **`createAiQuestionPanelAdapter`**
- Ответственность: per-node AI panel open/edit/save/sync.
- API: `open`, `close`, `syncWithSelection`, `persistEntry`.
- Данные: ai questions map + callbacks.
- Тесты: toggling panel, save status/comment, close on selection mismatch.

7. **`createTemplatePackAdapter`**
- Ответственность: capture fragment / insert fragment / apply ops.
- API: `capturePack`, `insertPack`, `applyOps`.
- Данные: modeler instance + payload.
- Тесты: remap ids, between-mode rewiring, changedIds highlight.

8. **`useBpmnStageImperativeApi`**
- Ответственность: сборка единого `useImperativeHandle` контракта поверх модулей.
- API: текущие публичные методы (`fit`, `ensureVisible`, `saveLocal`, `getPlaybackGraph`, `setPlaybackFrame`, ...).
- Данные: adapters из пунктов 1-7.
- Тесты: контрактный smoke по всем exposed methods.

---

## Ссылки на вспомогательные артефакты

- Callsites: `docs/bpmnstage_factpack_callsites.md`
- State/effects map: `docs/bpmnstage_factpack_state.md`

