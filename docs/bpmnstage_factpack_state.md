# BpmnStage State & Effects Map

Файл: `frontend/src/components/process/BpmnStage.jsx`

## 4.1 State inventory

### Hook totals (по коду)
- `useState`: 6
- `useRef`: 71
- `useMemo`: 1
- `useCallback`: 0
- `useEffect`: 24

### useState (все)

| State | Line | Что хранит | Кто меняет |
|---|---:|---|---|
| `xml` / `setXml` | 1203 | актуальный XML snapshot в состоянии компонента | `applyXmlSnapshot`, `ensureBpmnStore.subscribe` |
| `xmlDraft` / `setXmlDraft` | 1204 | текст XML в XML-редакторе | `updateXmlDraft`, `applyXmlSnapshot`, `ensureBpmnStore.subscribe`, effect `view===xml` init |
| `xmlDirty` / `setXmlDirty` | 1205 | флаг несохранённых XML изменений | `updateXmlDraft`, `applyXmlSnapshot`, `ensureBpmnStore.subscribe`, `saveXmlDraftText` flow |
| `xmlSaveBusy` / `setXmlSaveBusy` | 1206 | busy-флаг кнопки сохранения XML draft | `saveXmlDraftText` |
| `srcHint` / `setSrcHint` | 1207 | источник текущего XML (`draft/backend/local/...`) | `applyXmlSnapshot`, `loadFromBackend`, `clearLocalOnly` |
| `err` / `setErr` | 1208 | текст ошибки для UI badge | `loadFromBackend`, `persistXmlSnapshot`, `saveLocalFromModeler`, `importXmlText`, render/effect catch blocks |

### useMemo / useCallback

| Hook | Name | Line | Что делает | Кто использует |
|---|---|---:|---|---|
| `useMemo` | `interviewDecorSignature` | 6508 | детерминированная сигнатура Interview decor payload | effect `6522-6528` (`applyInterviewDecor`) |
| `useCallback` | — | — | в файле отсутствует | — |

### useRef inventory (все)

#### Runtime / instance refs

| Ref | Line | Что хранит | Кто меняет |
|---|---:|---|---|
| `viewerEl` | 1185 | DOM-контейнер viewer canvas | React ref binding |
| `editorEl` | 1186 | DOM-контейнер modeler canvas | React ref binding |
| `viewerRef` | 1188 | экземпляр `NavigatedViewer` | `ensureViewer`, `destroyRuntime` |
| `modelerRef` | 1189 | экземпляр modeler runtime instance | `ensureModeler`, `destroyRuntime` |
| `viewerInitPromiseRef` | 1190 | in-flight init promise viewer | `ensureViewer`, `destroyRuntime` |
| `modelerInitPromiseRef` | 1191 | in-flight init promise modeler | `ensureModeler`, `destroyRuntime` |
| `modelerRuntimeRef` | 1192 | runtime wrapper modeler | `ensureModelerRuntime`, `destroyRuntime` |
| `modelerDecorBoundInstanceRef` | 1193 | guard повторной binding eventBus для modeler | `ensureModeler`, `destroyRuntime` |
| `bpmnStoreRef` | 1194 | store XML/rev/dirty | `ensureBpmnStore`, `destroyRuntime` |
| `bpmnCoordinatorRef` | 1195 | coordinator flush/reload/runtime-change | `ensureBpmnCoordinator`, `destroyRuntime` |
| `bpmnPersistenceRef` | 1196 | persistence adapter | `ensureBpmnPersistence` |
| `bpmnStoreUnsubRef` | 1197 | unsubscribe store listener | `ensureBpmnStore`, `destroyRuntime` |
| `activeSessionRef` | 1198 | текущий активный session id | effects `6292`, `6327` |
| `prevSessionRef` | 1199 | предыдущий session id | effect `6292` |
| `loadTokenRef` | 1200 | токен защиты от stale load | effects `6327`, imperative `resetBackend/clearLocal` |
| `draftRef` | 1201 | последний `draft` без re-render зависимостей | effect `1346-1348` |

#### Decor/overlay refs

| Ref | Line | Что хранит | Кто меняет |
|---|---:|---|---|
| `bottlenecksRef` | 1209 | текущий список bottleneck hints | imperative `setBottlenecks/clearBottlenecks` |
| `markerStateRef` | 1210 | bottleneck markers по `viewer/editor` | `applyBottleneckDecor`, `clearBottleneckDecor`, `destroyRuntime` |
| `overlayStateRef` | 1211 | bottleneck overlays ids | `applyBottleneckDecor`, `clearBottleneckDecor`, `destroyRuntime` |
| `interviewMarkerStateRef` | 1212 | interview mode markers | `applyInterviewDecor`, `clearInterviewDecor`, `destroyRuntime` |
| `interviewOverlayStateRef` | 1213 | interview overlays ids | `applyInterviewDecor`, `clearInterviewDecor`, `destroyRuntime` |
| `interviewDecorSignatureRef` | 1214 | applied signature для dedup decor | `applyInterviewDecor`, `clearInterviewDecor`, `destroyRuntime` |
| `taskTypeMarkerStateRef` | 1215 | task type markers | `applyTaskTypeDecor`, `clearTaskTypeDecor`, `destroyRuntime` |
| `linkEventMarkerStateRef` | 1216 | link-event markers | `applyLinkEventDecor`, `clearLinkEventDecor` |
| `linkEventStyledStateRef` | 1217 | styled link-event node ids | `applyLinkEventDecor`, `clearLinkEventDecor` |
| `happyFlowMarkerStateRef` | 1218 | P0/P1/P2 markers | `applyHappyFlowDecor`, `clearHappyFlowDecor`, `destroyRuntime` |
| `happyFlowStyledStateRef` | 1219 | styled flow/node ids for happy/path tiers | `applyHappyFlowDecor`, `clearHappyFlowDecor`, `destroyRuntime` |
| `userNotesMarkerStateRef` | 1220 | notes markers | `applyUserNotesDecor`, `clearUserNotesDecor`, `destroyRuntime` |
| `userNotesOverlayStateRef` | 1221 | notes overlay ids | `applyUserNotesDecor`, `clearUserNotesDecor`, `destroyRuntime` |
| `stepTimeOverlayStateRef` | 1222 | step-time overlay ids | `applyStepTimeDecor`, `clearStepTimeDecor`, `destroyRuntime` |
| `robotMetaDecorStateRef` | 1223 | robot-meta markers/overlay/signatures | `applyRobotMetaDecor`, `clearRobotMetaDecor`, `destroyRuntime` |
| `playbackDecorStateRef` | 1224 | playback runtime decor state (markers, overlays, raf timers) | `applyPlaybackFrameOnInstance`, `centerPlaybackCamera`, `clearPlaybackDecor`, `destroyRuntime` |
| `playbackBboxCacheRef` | 1228 | bbox cache playback элементов | `preparePlaybackCache`, `readElementBounds`, `destroyRuntime` |
| `focusMarkerStateRef` | 1229 | focus marker ids | `focusNodeOnInstance`, `clearFocusDecor`, `destroyRuntime` |
| `aiQuestionPanelStateRef` | 1230 | overlay id + element id AI panel (viewer/editor) | `openAiQuestionPanel`, `clearAiQuestionPanel`, `destroyRuntime` |
| `aiQuestionPanelTargetRef` | 1234 | target element id для panel reopen после decor refresh | `openAiQuestionPanel`, `clearAiQuestionPanel`, `applyInterviewDecor`, `destroyRuntime` |
| `selectedMarkerStateRef` | 1235 | selected element id per mode | `setSelectedDecor`, `clearSelectedDecor`, `destroyRuntime` |

#### Callback mirrors / prop mirrors

| Ref | Line | Что хранит | Кто меняет |
|---|---:|---|---|
| `onDiagramMutationRef` | 1236 | актуальный callback `onDiagramMutation` | effect `1302-1304` |
| `onElementSelectionChangeRef` | 1237 | актуальный callback выбора | effect `1306-1308` |
| `onElementNotesRemapRef` | 1238 | callback remap notes | effect `1310-1312` |
| `onAiQuestionsByElementChangeRef` | 1239 | callback изменения AI questions | effect `1314-1316` |
| `onSessionSyncRef` | 1240 | callback session sync | effect `1318-1320` |
| `aiQuestionsModeEnabledRef` | 1241 | mirror флага AI-question mode | effect `1322-1324` |
| `diagramDisplayModeRef` | 1242 | mirror display mode (`normal/interview/...`) | effect `1326-1328` |
| `stepTimeUnitRef` | 1243 | mirror единицы времени (`min/sec`) | effect `1330-1332` |
| `robotMetaOverlayEnabledRef` | 1244 | mirror toggle robot-meta overlays | effect `1334-1336` |
| `robotMetaOverlayFiltersRef` | 1245 | mirror filters ready/incomplete | effect `1338-1340` |
| `robotMetaStatusByElementIdRef` | 1246 | mirror derived status map по element id | effect `1342-1344` |

#### Flags / counters / guards

| Ref | Line | Что хранит | Кто меняет |
|---|---:|---|---|
| `replaceCommandStateRef` | 1247 | pre/post shape-replace state | `captureShapeReplacePre`, `applyShapeReplacePost` |
| `suppressCommandStackRef` | 1256 | suppress counter commandStack side effects | `withSuppressedCommandStack` |
| `suppressViewboxEventRef` | 1257 | suppress counter `canvas.viewbox.changed` | `suppressViewboxEvents`, `destroyRuntime` |
| `modelerReadyRef` | 1258 | ready flag modeler defs | runtime status callbacks, `renderModeler`, `destroyRuntime` |
| `viewerReadyRef` | 1259 | ready flag viewer defs | `renderViewer`, `destroyRuntime` |
| `userViewportTouchedRef` | 1260 | флаг пользовательского движения viewport | eventBus `canvas.viewbox.changed`, render pipeline |
| `lastStoreEventRef` | 1261 | last store update metadata | `ensureBpmnStore.subscribe` |
| `lastModelerXmlHashRef` | 1267 | hash последнего modeler XML | `renderModeler`, render effect short-circuit, `destroyRuntime` |
| `modelerInstanceMetaRef` | 1268 | instance id + container key modeler | `ensureModeler`, `destroyRuntime` |
| `viewerInstanceMetaRef` | 1269 | instance id + container key viewer | `ensureViewer`, `destroyRuntime` |
| `ensureVisiblePromiseRef` | 1270 | текущий in-flight ensureVisible | `ensureVisibleOnInstance`, `destroyRuntime` |
| `ensureVisibleCycleRef` | 1271 | cycle counter ensureVisible | `ensureVisibleOnInstance`, `destroyRuntime` |
| `ensureEpochRef` | 1272 | epoch guard against stale async | effects `6292`, `destroyRuntime`, `ensureVisibleOnInstance` |
| `renderRunRef` | 1273 | render run-id stale guard | effect `6337-6441` |
| `modelerImportInFlightRef` | 1274 | dedup in-flight modeler import | `renderModeler`, `destroyRuntime` |
| `robotMetaHydrateStateRef` | 1275 | dedup key для BPMN->session robot meta hydration | `hydrateRobotMetaFromImportedBpmn`, effect `6292` |
| `prevViewRef` | 1276 | previous view for transition logic | effect `6450-6506` |
| `runtimeTokenRef` | 1277 | runtime token (stale/recovery/import guard) | render/import/recovery/runtime callbacks |
| `runtimeStatusRef` | 1278 | snapshot runtime status (token/ready/destroyed) | `trackRuntimeStatus` |
| `saveCountersRef` | 1283 | counters save/persist/store events | `bumpSaveCounter`, trace points |
| `focusStateRef` | 1292 | timers + element for focus pulse | `focusNodeOnInstance`, `clearFocusDecor`, `destroyRuntime` |
| `flashStateRef` | 1296 | node/badge flash timers + overlays | `flashNodeOnInstance`, `flashBadgeOnInstance`, `clearFlashDecor`, `destroyRuntime` |
| `prefersReducedMotionRef` | 1300 | prefers-reduced-motion runtime flag | effect `1350-1375` |

---

## 4.2 Effects inventory

| # | Line range | Purpose | Deps | Side effects | Cleanup | Риск дублирования/утечки |
|---|---|---|---|---|---|---|
| 1 | 1302-1304 | mirror `onDiagramMutation` callback в ref | `[onDiagramMutation]` | запись `onDiagramMutationRef.current` | нет | низкий |
| 2 | 1306-1308 | mirror `onElementSelectionChange` | `[onElementSelectionChange]` | запись ref | нет | низкий |
| 3 | 1310-1312 | mirror `onElementNotesRemap` | `[onElementNotesRemap]` | запись ref | нет | низкий |
| 4 | 1314-1316 | mirror `onAiQuestionsByElementChange` | `[onAiQuestionsByElementChange]` | запись ref | нет | низкий |
| 5 | 1318-1320 | mirror `onSessionSync` | `[onSessionSync]` | запись ref | нет | низкий |
| 6 | 1322-1324 | mirror `aiQuestionsModeEnabled` | `[aiQuestionsModeEnabled]` | запись ref | нет | низкий |
| 7 | 1326-1328 | mirror `diagramDisplayMode` | `[diagramDisplayMode]` | запись ref | нет | низкий |
| 8 | 1330-1332 | mirror `stepTimeUnit` | `[stepTimeUnit]` | запись ref | нет | низкий |
| 9 | 1334-1336 | mirror `robotMetaOverlayEnabled` | `[robotMetaOverlayEnabled]` | запись ref | нет | низкий |
|10| 1338-1340 | mirror `robotMetaOverlayFilters` | `[robotMetaOverlayFilters]` | запись ref | нет | низкий |
|11| 1342-1344 | mirror `robotMetaStatusByElementId` | `[robotMetaStatusByElementId]` | запись ref | нет | низкий |
|12| 1346-1348 | mirror `draft` в `draftRef` | `[draft]` | запись ref | нет | низкий |
|13| 1350-1375 | sync prefers-reduced-motion | `[]` | `window.matchMedia`, listener `change` | да (`removeEventListener/removeListener`) | средний (браузер ветки API) |
|14| 6292-6325 | session activation bootstrap + runtime reset | `[sessionId]` | `destroyRuntime`, `setErr`, `applyXmlSnapshot`, `setSrcHint`, trace logs | нет отдельного cleanup | высокий (затрагивает весь runtime) |
|15| 6327-6335 | trigger backend reload on session/reloadKey | `[sessionId, reloadKey]` | `loadFromBackend` async | нет | средний (race mitigated token guard) |
|16| 6337-6441 | main render orchestrator for modeler path | `[view, xml, sessionId, draft?.bpmn_xml, draft?.title, srcHint]` | async `renderModeler/renderNewDiagramInModeler/ensureCanvasVisibleAndFit`; `setErr`; stale guard | да (`cancelled=true`) | высокий (сложная ветвистость + async race) |
|17| 6443-6448 | fallback xml <- draft when not dirty | `[draft?.bpmn_xml, xml, srcHint, xmlDirty]` | `applyXmlSnapshot` | нет | средний |
|18| 6450-6506 | view transition logging + XML tab draft init | `[view, xmlDraft, xml, sessionId]` | `setXmlDraft`, `setXmlDirty`, trace logs | нет | средний |
|19| 6522-6528 | re-apply interview decorations by signature | `[interviewDecorSignature]` | `applyInterviewDecor` on viewer/modeler | нет | средний (heavy overlay rebuild) |
|20| 6530-6534 | re-apply happy flow decorations | `[draft?.bpmn_meta, view]` | `applyHappyFlowDecor` | нет | средний |
|21| 6536-6571 | notes/time/robotmeta decor refresh + selected panel sync | `[draft?.notes_by_element, draft?.notesByElementId, draft?.nodes, draft?.bpmn_meta, view, diagramDisplayMode, stepTimeUnit, robotMetaOverlayEnabled, robotMetaOverlayFilters, robotMetaStatusByElementId]` | clear/apply notes, step-time, robot-meta overlays; reselection sync | нет | высокий (много зависимостей + overlay churn) |
|22| 6573-6595 | flash event bus integration | `[sessionId]` | `window.addEventListener(DIAGRAM_FLASH_EVENT)`; `flashNode/flashBadge` | да (`removeEventListener`) | средний |
|23| 6597-6618 | global Escape handler (clear selection/panel) | `[]` | `window.addEventListener('keydown')` | да (`removeEventListener`) | средний |
|24| 6620-6625 | unmount cleanup runtime | `[]` | `destroyRuntime()` | n/a | высокий (critical teardown path) |

