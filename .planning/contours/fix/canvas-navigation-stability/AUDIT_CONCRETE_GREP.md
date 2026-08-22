# Concrete Grep & Snippet Audit — `fix/canvas-navigation-stability`

Branch: `fix/canvas-navigation-stability` (PR #399)  
Mode: READ-ONLY  
Date: 2026-06-23

---

## 1. Breadcrumb — render sites

### `components/ProcessStage.jsx:6681`
```jsx
{subprocessBreadcrumbs?.length > 0 ? (
  <div className="subprocessBreadcrumbsBar">
    {subprocessBreadcrumbs.length > 1 ? (
      <button
        type="button"
        onClick={() => onReturnToParent?.(sid)}
        className="subprocessBackButton"
        title="Назад"
        data-testid="subprocess-back-button"
      >
        ←
      </button>
    ) : null}
    <SubprocessBreadcrumbs
      breadcrumbs={subprocessBreadcrumbs}
      onNavigate={onBreadcrumbNavigate}
    />
  </div>
) : null}
```
Parent className: `subprocessBreadcrumbsBar`

### `features/process/SubprocessBreadcrumbs.jsx:8`
```jsx
<div
  className="subprocessBreadcrumbs inline-flex flex-wrap items-center gap-2 px-3 py-1.5 bg-neutral-100/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm text-sm"
  data-testid="subprocess-breadcrumbs"
>
  {list.map((crumb, idx) => { ... })}
</div>
```
Parent className: `subprocessBreadcrumbs ...`

### `components/AppShell.jsx:327`
```jsx
subprocessBreadcrumbs={subprocessBreadcrumbs}
onBreadcrumbNavigate={onBreadcrumbNavigate}
onReturnToParent={onReturnToParent}
```
Parent component: `<ProcessStage ... />` prop pass-through (no own className).

### `App.jsx:3743`
```jsx
subprocessBreadcrumbs={subprocessBreadcrumbs}
onBreadcrumbNavigate={handleBreadcrumbNavigate}
onReturnToParent={returnToParent}
```
Parent component: `<AppShell ... />` prop pass-through.

### 1b. `<.*Breadcrumb` in AppShell.jsx / ProcessStage.jsx / BpmnStage.jsx / TopBar.jsx
**NO MATCHES FOUND** — no literal `<...Breadcrumb` JSX tag in those four files.

---

## 2. Breadcrumb — state mutations

### `App.jsx:889` — initialization
```jsx
const [subprocessBreadcrumbs, setSubprocessBreadcrumbs] = useState([]);
```
Context: component-level state init.

### `App.jsx:1200` — inside `navigateToSubprocess`
```jsx
// Build the breadcrumb stack client-side by pushing the new child crumb.
// This keeps nested navigation stable regardless of whether backend breadcrumbs
// include the full hierarchy.
setSubprocessBreadcrumbs((prev) => {
  const list = Array.isArray(prev) ? prev : [];
  const backendList = Array.isArray(res.breadcrumbs) ? res.breadcrumbs : [];
  if (list.length === 0) {
    return backendList.length > 0
      ? backendList
      : [
          { session_id: String(sessionIdArg || "").trim(), name: draft?.title || "", element_id: elementId },
          { session_id: res.subprocessSessionId, name: "Подпроцесс", element_id: res.targetElementId || elementId },
        ];
  }
  const childCrumb = backendList[backendList.length - 1] || {
    session_id: res.subprocessSessionId,
    name: "Подпроцесс",
    element_id: res.targetElementId || elementId,
  };
  const lastSid = String(list[list.length - 1]?.session_id || "").trim();
  const childSid = String(childCrumb?.session_id || "").trim();
  if (lastSid && childSid && lastSid === childSid) return list;
  return [...list, childCrumb];
});
```
Context: `navigateToSubprocess` callback.

### `App.jsx:1255` — inside `returnToParent`
```jsx
// Keep breadcrumbs in sync with the current hierarchy depth.
setSubprocessBreadcrumbs((prev) => {
  const list = Array.isArray(prev) ? prev : [];
  if (list.length > 1) return list.slice(0, -1);
  return list;
});
```
Context: `returnToParent` callback.

### `App.jsx:3400` — URL/deep-link restore
```jsx
if (loaded.ok && loaded.session?.navigation_stack?.length > 0) {
  setSubprocessBreadcrumbs(
    loaded.session.navigation_stack.map((frame) => ({
      session_id: frame.session_id,
      name: frame.name || "",
      element_id: frame.element_id_in_parent,
    }))
  );
} else if (parentSessionId) {
  setSubprocessBreadcrumbs([
    { session_id: parentSessionId, name: "" },
    { session_id: sid, name: "" },
  ]);
} else if (loaded.ok) {
  // Root process: show a single-item breadcrumb with the current session name.
  setSubprocessBreadcrumbs([
    { session_id: sid, name: loaded.session?.title || "" },
  ]);
}
```
Context: `useEffect` for URL session restore.

---

## 3. Navigation entry points — drilldown from canvas

### `features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js:26`
```jsx
export function bindSubprocessNavigationEvents(inst, onNavigateToSubprocessRef) {
  if (!inst || typeof inst.get !== "function") return () => {};

  // Use the bpmn-js top-level container (.bjs-container) so the delegated
  // listener catches clicks on the default drilldown overlay button.
  const container = inst._container;
  if (!(container instanceof Element)) return () => {};

  const handler = (event) => {
    const button = event?.target?.closest?.(".bjs-drilldown");
    if (!button) return;

    const overlay = findDrilldownOverlayForButton(inst, button);
    if (!overlay) return;

    const element = overlay.element;
    if (!element || !isSubprocessNavigable(element)) return;

    event.stopPropagation();
    event.preventDefault();

    const cb = onNavigateToSubprocessRef?.current;
    if (typeof cb === "function") {
      cb(element.id);
    }
  };

  container.addEventListener("click", handler, true);
  ...
}
```

### `features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js:114`
```jsx
const focusId = String(ctx?.focusElementId || "").trim();
if (focusId) {
  try {
    const canvas = v.get("canvas");
    canvas.scrollToElement(focusId);
    const overlays = v.get("overlays");
    overlays.add(focusId, {
      position: { top: -2, left: -2 },
      html: '<div class="subprocess-focus-highlight"></div>',
    });
  } catch (e) {
    console.warn("focus element not found", focusId, e);
  }
}
```

### `App.jsx:1179` — `navigateToSubprocess` signature and `openSession` call
```jsx
const navigateToSubprocess = useCallback(async (sessionIdArg, elementId, targetElementId = "") => {
  const res = await apiNavigateToSubprocess(sessionIdArg, elementId, targetElementId);
  if (!res.ok) {
    console.error("navigate failed", res.error);
    return;
  }
  ...
  openSession(res.subprocessSessionId);
}, [openSession, projectId, projectRouteContext]);
```
`openSession(res.subprocessSessionId)` is called with **one argument**.

### `App.jsx:3393` — global focus side channel
```jsx
if (typeof window !== "undefined") {
  window.__SUBPROCESS_FOCUS_ELEMENT_ID__ = focusId || "";
}
```

### `grep window.__SUBPROCESS`
Only match: `App.jsx:3393` (write) — **no reads found**.

---

## 4. XML Cache — hit/miss logic in BpmnStage

### `components/process/BpmnStage.jsx:6027` — `useEffect([sessionId, reloadKey])`
```jsx
useEffect(() => {
  const sid = String(sessionId || "");
  activeSessionRef.current = sid;
  userMutationObservedRef.current = false;
  const token = loadTokenRef.current + 1;
  loadTokenRef.current = token;
  if (!sid) return;
  loadFromBackend(sid, token, { reason: "session_reload" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [sessionId, reloadKey]);
```

### `components/process/BpmnStage.jsx:5942` — `useEffect([sessionId])`
```jsx
useEffect(() => {
  const sid = String(sessionId || "");
  const prevSid = String(activeSessionRef.current || "");
  prevSessionRef.current = prevSid;
  ...
  activeSessionRef.current = sid;
  userMutationObservedRef.current = false;
  ensureEpochRef.current += 1;
  loadTransition("reset");
  ...
  destroyRuntime();
  setErr("");
  const draftNow = asObject(draftRef.current);
  const draftSid = String(draftNow?.session_id || draftNow?.id || "").trim();
  const draftXml = sid && draftSid === sid ? String(draftNow?.bpmn_xml || "") : "";
  if (draftXml.trim()) {
    applyXmlSnapshot(draftXml, "draft_bootstrap");
    ...
  } else {
    setSrcHint("");
    applyXmlSnapshot("");
    ...
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [sessionId]);
```

### `components/process/BpmnStage.jsx:4977` — `loadFromBackend` (guard before fetch)
```jsx
async function loadFromBackend(sid, token = 0, options = {}) {
  const s = String(sid || "");
  if (token && token !== loadTokenRef.current) return;
  if (s !== activeSessionRef.current) return;
  if (!s) {
    applyXmlSnapshot("");
    setSrcHint("");
    setErr("");
    return;
  }

  // Use the App-level BPMN XML cache when available to avoid a backend round-trip.
  // This is the key path that makes subprocess return instantaneous.
  const cachedXml = bpmnXmlCacheRef?.current?.get(s);
  if (cachedXml?.trim()) {
    applyXmlSnapshot(cachedXml, "cache");
    setErr("");
    logBpmnTrace("loadSnapshot.cache", cachedXml, {
      sid: s,
      status: 200,
      rev: Number(bpmnStoreRef.current?.getState?.()?.rev || 0),
    });
    return;
  }

  const coordinator = ensureBpmnCoordinator();
  const loaded = await coordinator.reload({ ... });
  ...
}
```
**Guard exists:** `if (cachedXml?.trim())` at line 4991 before `coordinator.reload()` / `apiGetBpmnXml`.

### `features/process/bpmn/coordinator/createBpmnCoordinator.js:332` — `loadRaw` shim
```jsx
async function loadRaw(sid, optionsForLoad = {}) {
  const loadRawFn = persistence?.loadRaw;
  if (typeof loadRawFn !== "function") {
    return { ok: false, error: "loadRaw unavailable", status: 0 };
  }
  return await loadRawFn(sid, optionsForLoad);
}
```

### `features/process/bpmn/persistence/createBpmnPersistence.js:467` — unconditional `apiGetBpmnXml`
```jsx
const loaded = await apiGetBpmnXml(sid, {
  raw: true,
  includeOverlay: false,
  cacheBust: true,
});
```
Called only after local/runtime/snapshot candidates are exhausted and `typeof apiGetBpmnXml === "function"` (line 405). **No subprocess-return guard here** — the guard lives in `BpmnStage.loadFromBackend`.

---

## 5. App.jsx — cache refs & returnToParent / navigateToSubprocess

### Ref initializations
```jsx
// App.jsx:895
const parentViewportSnapshotRef = useRef(new Map());
// App.jsx:896
const sessionCacheRef = useRef(new Map());
// App.jsx:897
const bpmnXmlCacheRef = useRef(new Map());
```

### `App.jsx:1029` — populate XML cache on draft load
```jsx
// Cache the loaded BPMN XML by session id so subprocess return can skip the backend fetch.
useEffect(() => {
  const sid = String(draft?.session_id || draft?.id || "").trim();
  const xml = String(draft?.bpmn_xml || "").trim();
  if (sid && xml) {
    bpmnXmlCacheRef.current.set(sid, xml);
  }
}, [draft?.session_id, draft?.id, draft?.bpmn_xml]);
```

### `App.jsx:1243` — `returnToParent` body
```jsx
const returnToParent = useCallback(async (sessionIdArg) => {
  const res = await apiReturnToParent(sessionIdArg);
  if (!res.ok) {
    console.error("return failed", res.error);
    return;
  }
  const parentSid = String(res.parentSessionId || "").trim();
  const snapshot = parentSid ? parentViewportSnapshotRef.current.get(parentSid) : null;
  if (snapshot) {
    setRestoreViewportSnapshot(snapshot);
  }
  // Keep breadcrumbs in sync with the current hierarchy depth.
  setSubprocessBreadcrumbs((prev) => {
    const list = Array.isArray(prev) ? prev : [];
    if (list.length > 1) return list.slice(0, -1);
    return list;
  });
  setFocusElementId(res.elementIdInParent || "");
  pushSessionSelectionToUrl({
    projectId,
    sessionId: res.parentSessionId,
    focusElementId: res.elementIdInParent || "",
    projectContext: projectRouteContext,
  });
  // Use cached parent session data to avoid an extra API + XML fetch.
  const cachedParentSession = parentSid ? sessionCacheRef.current.get(parentSid) : null;
  openSession(res.parentSessionId, {
    source: "subprocess_return",
    session: cachedParentSession || null,
  });
}, [openSession, projectId, projectRouteContext]);
```
`openSession` called with `{ source: "subprocess_return", session: cachedParentSession || null }`.

### `App.jsx:1179` — `navigateToSubprocess` body
```jsx
const navigateToSubprocess = useCallback(async (sessionIdArg, elementId, targetElementId = "") => {
  const res = await apiNavigateToSubprocess(sessionIdArg, elementId, targetElementId);
  if (!res.ok) {
    console.error("navigate failed", res.error);
    return;
  }
  // Persist the parent viewport and session data so we can restore them instantly when the user returns.
  try {
    const snapshot = bpmnStageRef.current?.getCanvasSnapshot?.();
    if (snapshot) {
      parentViewportSnapshotRef.current.set(String(sessionIdArg || "").trim(), snapshot);
    }
  } catch (e) {
    logNav("subprocess_viewport_snapshot_failed", { sessionId: sessionIdArg, error: String(e?.message || e) });
  }
  if (sessionCacheRef.current && draft?.session_id === String(sessionIdArg || "").trim()) {
    sessionCacheRef.current.set(String(sessionIdArg || "").trim(), draft);
  }
  // Build the breadcrumb stack client-side by pushing the new child crumb.
  ...
  openSession(res.subprocessSessionId);
}, [openSession, projectId, projectRouteContext]);
```
`openSession` called with **one argument** (`res.subprocessSessionId`).

### `app/useSessionActivationOrchestration.js:184` — `openSession` cache path
```jsx
let nextRaw;
if (options?.session && typeof options.session === "object") {
  nextRaw = options.session;
} else if (options?.useCache && sessionCacheRef?.current?.has?.(sid)) {
  nextRaw = sessionCacheRef.current.get(sid);
} else {
  const r = await apiGetSession(sid);
  ...
}
```
`openSession` accepts `options.session` to skip `apiGetSession`; it does **not** accept an `initialBpmnXml` option.

---

## 6. CSS — breadcrumb positioning

### `features/process/bpmn/stage/styles/subprocessNavigation.css`
```css
.subprocessBreadcrumbsBar {
  position: absolute;
  top: 8px;
  left: 124px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 132px);
  pointer-events: none;
}

.subprocessBreadcrumbsBar > * {
  pointer-events: auto;
}

@media (max-width: 768px) {
  .subprocessBreadcrumbsBar {
    top: 6px;
    left: 96px;
    max-width: calc(100% - 104px);
  }

  .subprocessBreadcrumbsBar .subprocessBreadcrumbs {
    flex-wrap: wrap;
  }
}
```
- `position: absolute`
- `z-index: 10`
- `top: 8px` / `left: 124px` (`left: 96px` on mobile)

---

## 7. Global side channels (`window.*`)

| File | Line | Snippet |
|------|------|---------|
| `lib/api.js` | 14 | `if (window.__FPC_TRACE_SESSIONS_FALLBACK__ === true) return true;` |
| `lib/apiCore.js` | 395 | `if (window.__FPC_DEBUG_BPMN__) return true;` |
| `App.jsx` | 160 | `if (window.__FPC_DEBUG_BPMN__) return true;` |
| `App.jsx` | 170 | `if (window.__FPC_DEBUG_CREATE__) return true;` |
| `App.jsx` | 993 | `const isDev = Boolean(import.meta?.env?.DEV) || window.__FPC_DEBUG_NAV__;` |
| `App.jsx` | 1018-1019 | `if (!window.__FPC_E2E__) return; window.__FPC_E2E_DRAFT__ = draft;` |
| `App.jsx` | 1347-1361 | reads `window.__FPC_E2E__`; writes `window.__FPC_E2E_OPEN_SESSION__` and cleanup null |
| `App.jsx` | 1463-1464 | reads `window.__FPC_E2E__`; writes `window.__FPC_E2E_SELECTED_ELEMENT_ID__` |
| `App.jsx` | 1469-1485 | reads `window.__FPC_E2E__`; writes `__FPC_E2E_SESSION_SHELL__`, `__FPC_E2E_GET_SESSION_SHELL__` |
| `App.jsx` | 2836-2852 | reads `window.__FPC_E2E__`, `window.__FPC_NOTES_REMAP_LOG__`; writes `window.__FPC_NOTES_REMAP_LOG__` |
| `App.jsx` | 2885-2900 | reads `window.__FPC_E2E__`, `window.__FPC_NOTES_REMAP_LOG__`; writes `window.__FPC_NOTES_REMAP_LOG__` |
| `App.jsx` | 3393 | writes `window.__SUBPROCESS_FOCUS_ELEMENT_ID__ = focusId || "";` |
| `components/SessionFlowModal.jsx` | 105 | `if (window.__FPC_DEBUG_AI__) return true;` |
| `components/process/BpmnStage.jsx` | 470-472 | reads `window.__FPC_E2E__`, `window.__FPC_E2E_LAST_SAVE_PROBE__`; writes `window.__FPC_E2E_LAST_SAVE_PROBE__` |
| `components/process/BpmnStage.jsx` | 662 | `if (window.__FPC_DEBUG_AI__) return true;` |
| `components/process/BpmnStage.jsx` | 681 | `if (window.__FPC_E2E__) return true;` |
| `components/process/BpmnStage.jsx` | 693-703 | reads/writes `window.__FPC_SELECTION_CONTINUITY_LOG__` |
| `components/process/BpmnStage.jsx` | 858 | `if (window.__FPC_DEBUG_BPMN__) return true;` |
| `components/process/BpmnStage.jsx` | 3989-3993 | reads/writes `window.__FPC_CHANGE_ELEMENT_LOG__` |
| `components/process/BpmnStage.jsx` | 4964-4971 | reads/writes `window.__FPC_E2E_MODELER__`, `window.__FPC_E2E_RUNTIME__` |
| `components/process/BpmnStage.jsx` | 5127 | writes `window.__FPC_E2E_MODELER__` |
| `components/process/BpmnStage.jsx` | 5222 | writes `window.__FPC_E2E_MODELER__` |
| `components/process/BpmnFpsMeter.jsx` | 56-78 | reads `window.__fpcPanProfileSummary` |
| `components/process/InterviewStage.jsx` | 96-119 | reads/writes `window.__FPC_REACT_PROFILE__` |
| `components/process/InterviewStage.jsx` | 337-338 | reads `window.__FPC_E2E__`; writes `window.__FPC_DOD_SNAPSHOT__` |
| `components/process/ProcessStage.jsx` | 1217-1325 | reads/writes `window.__FPC_E2E_SESSION_TRUTH__`, `__FPC_E2E_SESSION_TRUTH_HISTORY__`, `__FPC_E2E_GET_SESSION_TRUTH__` |
| `app/useAppController.js` | 24 | `if (window.__FPC_TRACE_SESSIONS_FALLBACK__ === true) return true;` |
| `features/sessions/hooks/useSessions.js` | 12 | `if (window.__FPC_TRACE_SESSIONS_FALLBACK__ === true) return true;` |
| `features/config/featureFlagsContext.jsx` | 26 | `const legacy = window.__FPC_LIGHTWEIGHT_OVERLAYS__;` |
| `features/process/lib/processDebugTrace.js` | 11-39 | reads/writes `window.__FPC_DEBUG_TRACE__`, `window.__FPC_TRACE_LOG__` |
| `features/process/hybrid/controllers/useHybridPipelineController.js` | 436-439 | writes `window.__FPC_E2E_HYBRID__` and cleanup null |
| `features/process/stage/controllers/usePlaybackController.js` | 158-165 | reads/writes `window.__FPC_PLAYBACK_TRACE__` |
| `features/process/stage/controllers/usePlaybackController.js` | 1210 | writes `window.__FPC_PLAYBACK_RUNTIME_SNAPSHOT__` |
| `features/process/stage/utils/deleteTrace.js` | 28-41 | reads/writes `window.__FPC_DELETE_TRACE_ENABLE__`, `window.__FPC_DELETE_TRACE__` |
| `features/process/stage/utils/processStageHelpers.js` | 362 | reads `window.__FPC_LAST_PERSIST_OK__` |
| `features/process/stage/utils/processStageHelpers.js` | 562 | `if (window.__FPC_DEBUG_ACTORS__) return true;` |
| `features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js` | 304, 452 | writes `window.__FPC_E2E_MODELER__` |
| `features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | 110 | writes `window.__FPC_CTX_DEBUG_LAST_NATIVE__` |
| `features/process/bpmn/stage/fanout/postStagingFanout.js` | 14, 61, 126-127 | reads `__FPC_FORCE_IMMEDIATE_FANOUT_PERF__`, `__FPC_DEBUG_IMMEDIATE_FANOUT__`, `__FPC_FORCE_SETTLED_FANOUT_PERF__`, `__FPC_DEBUG_SETTLED_FANOUT__`, `__FPC_FORCE_IMMEDIATE_REALTIME_OPS__` |
| `features/process/bpmn/stage/patches/patchOverlayPanPerf.js` | 46 | writes `window.__fpcOverlayPanPatchActive = true;` |
| `features/process/bpmn/stage/interaction/elementSelectionEmitter.js` | 3-27 | reads/writes `window.__FPC_E2E__`, `window.__FPC_SELECTION_CONTINUITY_LOG__` |
| `features/process/bpmn/stage/profiling/panProfiler.js` | 274, 288 | writes `window.__fpcPanProfileSummary`, `window.__fpcPanProfile` |
| `features/process/bpmn/stage/wiring/bpmnWiring.js` | 28, 267 | reads/writes `window.__FPC_BPMNWIRING_FANOUT_PERF__`; writes `window.__FPC_E2E_RUNTIME__` |
| `features/process/bpmn/persistence/createBpmnPersistence.js` | 676 | writes `window.__FPC_LAST_PERSIST_OK__` |
| `features/process/bpmn/runtime/createBpmnRuntime.js` | 26 | reads `window.__FPC_E2E_DELAY_IMPORT_MS__` |
| `features/process/bpmn/context-menu/resolveBpmnContextMenuTarget.js` | 305 | writes `window.__FPC_CTX_DEBUG_LAST_RESOLVE__` |
| `features/process/drawio/controllers/useDrawioEditorBridge.js` | 244-248 | writes `window.__FPC_E2E_DRAWIO__` and cleanup null |
| `features/process/drawio/runtime/drawioRuntimeProbes.js` | 34-110 | reads/writes `window.__FPC_DRAWIO_PERF_ENABLE__`, `window.__FPC_DRAWIO_PERF__` |
| `features/process/drawio/runtime/drawioNormalizationDiagnostics.js` | 61-70 | reads/writes `window.__FPC_OVERLAY_NORM_HISTORY__`, `window.__FPC_OVERLAY_NORM_LAST__`, `window.__FPC_REDIS_NORM_PUT__` |
| `features/process/overlay/models/buildOverlayPanelModel.js` | 13-16 | reads/writes `window.__FPC_DRAWIO_PERF_ENABLE__`, `window.__FPC_DRAWIO_PERF__` |
| `features/process/hooks/useBpmnSync.js` | 34, 44 | reads `window.__FPC_DEBUG_BPMN__`, `window.__FPC_DEBUG_ACTORS__` |
| `features/process/hooks/useInterviewSyncLifecycle.js` | 32, 61 | reads `window.__FPC_DEBUG_BPMN__`, `window.__FPC_DEBUG_AI__` |
| `features/process/hooks/useProcessTabs.js` | 23, 53 | reads `window.__FPC_DEBUG_BPMN__`; writes `window.__FPC_LAST_TAB_SWITCH_SAVE_DIAGNOSTICS__` |
| `features/templates/model/useTemplatesStore.js` | 575-576 | reads `window.__FPC_E2E__`; writes `window.__FPC_E2E_TEMPLATE_FRAGMENT_INSERT__` |
| `features/ai/aiExecutor.js` | 83 | `if (window.__FPC_DEBUG_AI__) return true;` |
| `main.jsx` | 13 | writes `window.__DEPLOY_FINGERPRINT__` |

---

## Summary

The single source of truth for the active subprocess hierarchy is `App.jsx`'s `subprocessBreadcrumbs` state. `ProcessStage.jsx` renders the bar (`subprocessBreadcrumbsBar`) and the back button; `SubprocessBreadcrumbs.jsx` renders the crumb list. Drilldown is initiated in `bindSubprocessNavigationEvents.js` via the bpmn-js `.bjs-drilldown` overlay, then delegated to `App.jsx#navigateToSubprocess`, which pushes a new crumb client-side and calls `openSession`. The XML cache is a separate `bpmnXmlCacheRef` populated from `draft.bpmn_xml` and consumed in `BpmnStage#loadFromBackend` as a short-circuit before `coordinator.reload()` → `apiGetBpmnXml`. A global side channel `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` is written but never read inside the codebase, so it is currently dead code.
