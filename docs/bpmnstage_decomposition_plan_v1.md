# BpmnStage Decomposition Plan v1

Дата: 2026-03-02  
Источник фактов: `frontend/src/components/process/BpmnStage.jsx`, `docs/bpmnstage_factpack*.md`

## 0) Preflight Snapshot (факты)

- Branch: `wip/bpmnstage-decompose-snapshot-20260302_201637`
- HEAD: `1d5834b`
- File size: `6965` lines (`frontend/src/components/process/BpmnStage.jsx`)
- Hook/catch footprint:
  - `useRef`: `72`
  - `useEffect`: `25`
  - `catch` (all): `109`
- Stash присутствует (top-10 зафиксирован скриптом `scripts/bpmnstage_step1_preflight.sh`).

## 1) Current Contract

### 1.1 Входящий контракт (props/callbacks)

`BpmnStage` принимает и использует:
- `sessionId`, `activeProjectId`, `view`, `draft`, `reloadKey`
- callbacks: `onDiagramMutation`, `onElementSelectionChange`, `onElementNotesRemap`, `onAiQuestionsByElementChange`, `onSessionSync`
- feature flags / режимы: `aiQuestionsModeEnabled`, `diagramDisplayMode`, `stepTimeUnit`, `robotMetaOverlayEnabled`, `robotMetaOverlayFilters`, `robotMetaStatusByElementId`

### 1.2 Наружный imperative API (`useImperativeHandle`)

Публичные методы (27):
1. `zoomIn`
2. `zoomOut`
3. `fit`
4. `refreshViewport`
5. `ensureVisible`
6. `whenReady`
7. `seedFromActors`
8. `saveLocal`
9. `isFlushing`
10. `saveXmlDraft`
11. `hasXmlDraftChanges`
12. `getXmlDraft`
13. `resetBackend`
14. `clearLocal`
15. `setBottlenecks`
16. `clearBottlenecks`
17. `focusNode`
18. `preparePlayback`
19. `getPlaybackGraph`
20. `setPlaybackFrame`
21. `clearPlayback`
22. `flashNode`
23. `flashBadge`
24. `captureTemplatePack`
25. `insertTemplatePack`
26. `applyCommandOps`
27. `importXmlText`

## 2) Non-Negotiables / Invariants

1. Никаких изменений поведения в процессе выноса.
2. Критические зоны не трогаются без отдельного шага и тестов:
   - `ensureVisibleOnInstance`
   - `renderModeler`
   - `destroyRuntime`
   - главный render orchestrator effect (`useEffect` в районе `6337+`)
   - `applyInterviewDecor`
3. Один runtime на режим (`viewer`/`editor`), без повторного пересоздания в рамках обычного refresh.
4. Сохранить текущую session/token stale-guard семантику (`loadTokenRef`, `runtimeTokenRef`, `ensureEpochRef`, `renderRunRef`).
5. Не менять политику sync/hydrate RobotMeta (`session-meta-wins`).
6. Не менять текущий imperative API контракт и сигнатуры callbacks.
7. В rollout использовать strangler-подход: старые функции остаются thin wrappers до полного покрытия тестами.

## 3) Modules To Extract (8)

### 3.1 `runtimeLifecycle`
- Входы:
  - `sessionId`, `view`, `draftRef`, контейнеры `viewerEl/editorEl`
  - runtime guards (`runtimeTokenRef`, `modelerImportInFlightRef`, `ensureEpochRef`)
- Выходы:
  - `ensureViewer`, `ensureModeler`, `renderViewer`, `renderModeler`, `destroyRuntime`
  - runtime status snapshot (`ready/defs/token`)
- Читает/пишет:
  - reads: `activeSessionRef`, `prevSessionRef`, `view`, `sessionId`
  - writes: `viewerRef`, `modelerRef`, `viewerReadyRef`, `modelerReadyRef`, `lastModelerXmlHashRef`
- Внешние зависимости:
  - `createBpmnRuntime`, `bpmn-js/lib/NavigatedViewer`, `forceTaskResizeRulesModule`, `pmModdleDescriptor`
- Тесты/гейты:
  - e2e: `frontend/e2e/bpmn-runtime-reliability.spec.mjs`
  - e2e: `frontend/e2e/interview-to-diagram-stability.spec.mjs`

### 3.2 `coordinatorPersistenceBridge`
- Входы:
  - `sessionId`, `draftRef`, refs store/coordinator/persistence
  - callbacks: `onDiagramMutationRef`, `onSessionSyncRef`
- Выходы:
  - `ensureBpmnStore`, `ensureBpmnPersistence`, `ensureBpmnCoordinator`
  - `saveLocalFromModeler`, `saveXmlDraftText`, `persistXmlSnapshot`, `loadFromBackend`
- Читает/пишет:
  - reads: `bpmnStoreRef`, `bpmnPersistenceRef`, `bpmnCoordinatorRef`
  - writes: `xml/xmlDraft/xmlDirty/xmlSaveBusy/srcHint/err`, `saveCountersRef`
- Внешние зависимости:
  - `createBpmnStore`, `createBpmnPersistence`, `createBpmnCoordinator`, `apiGet/Put/DeleteBpmnXml`, snapshots API
- Тесты/гейты:
  - unit: `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.test.mjs`
  - e2e: `frontend/e2e/diagram-save-hard-refresh.spec.mjs`
  - e2e: `frontend/e2e/snapshot-versions-accumulate.spec.mjs`

### 3.3 `decorManager`
- Входы:
  - `draftRef`, `diagramDisplayModeRef`, `stepTimeUnitRef`
  - `robotMetaOverlayEnabledRef`, `robotMetaOverlayFiltersRef`, `robotMetaStatusByElementIdRef`
- Выходы:
  - `applyTaskTypeDecor`, `applyLinkEventDecor`, `applyHappyFlowDecor`
  - `applyUserNotesDecor`, `applyStepTimeDecor`, `applyRobotMetaDecor`
  - `clear*Decor` семейство
- Читает/пишет:
  - reads: `draft` maps (`flow_meta`, `node_path_meta`, notes, nodes)
  - writes: marker/overlay refs (`*MarkerStateRef`, `*OverlayStateRef`, `robotMetaDecorStateRef`)
- Внешние зависимости:
  - bpmn-js `canvas/overlays/elementRegistry`, robotmeta helpers (`getRobotMetaStatus`, `robotMetaMissingFields`)
- Тесты/гейты:
  - unit: `frontend/src/features/process/robotmeta/robotMeta.test.mjs`
  - unit: `frontend/src/components/process/interview/paths/scenarioMetrics.test.mjs`
  - e2e: `frontend/e2e/interview-paths-route-layout.spec.mjs`

### 3.4 `viewportRecoveryController`
- Входы:
  - `view/sessionId`, runtime guards и refs (`ensureVisiblePromiseRef`, `ensureVisibleCycleRef`, `ensureEpochRef`, `runtimeTokenRef`)
  - `modelerRef/viewerRef`
- Выходы:
  - `ensureCanvasVisibleAndFit`, `ensureVisibleOnInstance`
  - recovery paths (`recoverByReimport`, `recoverByHardReset`)
- Читает/пишет:
  - writes: `ensureVisible*` refs, canvas/viewbox state
- Внешние зависимости:
  - bpmn-js `canvas`, runtime load/import APIs
- Тесты/гейты:
  - e2e: `frontend/e2e/interview-to-diagram-keeps-visible-and-actors.spec.mjs`
  - e2e: `frontend/e2e/tab-transition-matrix-big.spec.mjs`

### 3.5 `playbackOverlayAdapter`
- Входы:
  - playback payload (`eventType`, `flowId`, `nodeId`, `batch`)
  - toggles (`autoCamera`, `speed`) + bbox cache refs
- Выходы:
  - `preparePlaybackCache`, `applyPlaybackFrameOnInstance`, `clearPlaybackDecor`, `buildExecutionGraphFromInstance`
- Читает/пишет:
  - reads/writes: `playbackDecorStateRef`, `playbackBboxCacheRef`
- Внешние зависимости:
  - bpmn-js canvas/overlays/elementRegistry, playback graph builder
- Тесты/гейты:
  - unit: `frontend/src/features/process/playback/playbackEngine.test.mjs`
  - unit: `frontend/src/features/process/playback/buildPlaybackTimeline.test.mjs`
  - e2e: `frontend/e2e/diagram-playback-route.spec.mjs`

### 3.6 `aiQuestionOverlayAdapter`
- Входы:
  - AI payload from `draftRef`, `aiQuestionsModeEnabledRef`, selected node
  - callbacks: `onAiQuestionsByElementChangeRef`, `onElementSelectionChangeRef`
- Выходы:
  - `openAiQuestionPanel`, `clearAiQuestionPanel`, `persistAiQuestionEntry`
- Читает/пишет:
  - writes: `aiQuestionPanelStateRef`, `aiQuestionPanelTargetRef`
- Внешние зависимости:
  - bpmn-js overlays + DOM listeners
- Тесты/гейты:
  - e2e: `frontend/e2e/ai-questions-attach-to-node-and-show-badge.spec.mjs`
  - e2e: `frontend/e2e/ai-questions-diagram-badge.spec.mjs`

### 3.7 `templatePackAdapter`
- Входы:
  - modeler instance + payload (`capture/insert/apply ops`)
  - selected element context and note remap callbacks
- Выходы:
  - `captureTemplatePackOnModeler`, `insertTemplatePackOnModeler`, `applyCommandOpsOnModeler`
- Читает/пишет:
  - writes: diagram elements and mutation events
- Внешние зависимости:
  - `applyOpsToModeler`, bpmn-js `modeling/elementFactory/selection`
- Тесты/гейты:
  - unit: `frontend/src/features/process/bpmn/ops/applyOps.insert-between.test.mjs`
  - e2e: `frontend/e2e/template-packs-save-insert.spec.mjs`

### 3.8 `imperativeApiAssembler`
- Входы:
  - adapters из модулей выше + текущие refs (`view`, runtime refs, `sessionId`)
- Выходы:
  - единый объект `useImperativeHandle` (без изменения сигнатур)
- Читает/пишет:
  - reads: весь набор refs для операций API
  - writes: только через вызовы адаптеров
- Внешние зависимости:
  - React `useImperativeHandle` + интеграционные adapters
- Тесты/гейты:
  - e2e smoke: `frontend/e2e/diagram-save-tab-switch.spec.mjs`
  - e2e smoke: `frontend/e2e/interview-to-diagram-stability.spec.mjs`

## 4) Extraction Order (минимальный риск -> максимальный риск)

1. `decorManager` (только безопасный strangler-ввод: экспорт обёрток без изменения `applyInterviewDecor` тела)
2. `aiQuestionOverlayAdapter`
3. `playbackOverlayAdapter`
4. `templatePackAdapter`
5. `coordinatorPersistenceBridge`
6. `viewportRecoveryController`
7. `runtimeLifecycle`
8. `imperativeApiAssembler` (последним, когда адаптеры стабилизированы)

## 5) Rollout Strategy (Strangler)

1. На каждом шаге: новый модуль получает текущую функцию как thin-wrapper export.
2. В `BpmnStage.jsx` остаются старые имена и вызовы; внутри они проксируют в новый модуль.
3. После каждого шага: пройти test gate и оставить fallback path.
4. Только после 2 стабильных шагов подряд разрешается “очистка дублей”.
5. Критические функции из раздела Non-Negotiables не перемещать до отдельного шага с расширенным e2e gate.

## 6) Test Gates Per Step

Команды (минимум):

```bash
cd "$(git rev-parse --show-toplevel)"
cd frontend
node --test \
  src/features/process/playback/playbackEngine.test.mjs \
  src/features/process/playback/buildPlaybackTimeline.test.mjs \
  src/features/process/robotmeta/robotMeta.test.mjs \
  src/features/process/bpmn/snapshots/bpmnSnapshots.test.mjs \
  src/features/process/bpmn/ops/applyOps.insert-between.test.mjs
```

```bash
cd "$(git rev-parse --show-toplevel)"
cd frontend
npx playwright test \
  e2e/interview-paths-route-layout.spec.mjs \
  e2e/diagram-playback-route.spec.mjs \
  e2e/template-packs-save-insert.spec.mjs \
  e2e/diagram-save-hard-refresh.spec.mjs \
  e2e/bpmn-runtime-reliability.spec.mjs
```

## 7) Risk List (конкретные точки)

1. `ensureVisibleOnInstance` (`~5843-6120`): сложный recovery pipeline с guard/token; высокий риск регрессий viewport.
2. `renderModeler` (`~5406-5566`): dedup in-flight import + hydration + decor; риск race и “empty canvas”.
3. `destroyRuntime` (`~4943-5087`): глобальный teardown refs/listeners; риск утечек и dangling listeners.
4. Главный orchestrator effect (`~6337-6441`): многоветочный async control flow со stale-guards.
5. `applyInterviewDecor` (`~3526-3790`): heavy overlay path + sync AI panel.
6. `openAiQuestionPanel` (`~2275-2462`): вручную управляет DOM/listeners; риск двойных подписок.
7. `saveLocalFromModeler` (`~6178-6250`): sync RobotMeta + flush coordinator + snapshot fallback.
8. `hydrateRobotMetaFromImportedBpmn` (`~2107-2177`): политика конфликтов `session-meta-wins` должна быть неизменной.
9. `applyPlaybackFrameOnInstance` (`~4376-4529`): комбинация camera + overlays + gateway prompt.
10. Декор-refresh effect (`~6536-6571`): широкие deps; риск чрезмерного overlay churn/perf regressions.

## 8) Границы шага v1

- В рамках текущего шага: только план/подготовка (`docs + script`), без изменений логики BpmnStage.
- Следующий безопасный шаг: **вынос `decorManager` (strangler-обёртки, без изменения алгоритмов).**

