# GSD Audit: Subprocess Navigation Reload Root Cause

**Branch:** `fix/canvas-navigation-stability` (PR #399)  
**Test stand:** `http://clearvestnic.ru:5177`  
**Mode:** AUDIT ONLY — no code changes, no commits, no deploy, no tests.  
**Date:** 2026-06-23  

---

## 1. Executive Summary

The subprocess “return to parent” flow always re-fetches the parent BPMN XML because `BpmnStage` unconditionally triggers `loadFromBackend` on every `sessionId` change. Even when `App.jsx` passes a cached parent session object into `openSession` (skipping `apiGetSession`), the resulting `draft`/`sessionId` change still reaches `BpmnStage` and fires `useEffect([sessionId, reloadKey])` → `loadFromBackend` → `coordinator.reload()` → `apiGetBpmnXml`. The persistence layer reads a runtime cache first but **still calls the backend** whenever `apiGetBpmnXml` is available, so the cache never actually prevents the fetch.

For nested subprocess “jumps,” the local breadcrumb stack is usually correct because `navigateToSubprocess` replaces the whole stack with the backend-returned `breadcrumbs`. The fragility comes from `returnToParent`, which uses a client-side `slice(0, -1)` instead of trusting backend state, and from the fact that deep-linking into a subprocess reconstructs the stack from `navigation_stack` (which can be stale or empty), so subsequent pops can produce the wrong hierarchy.

---

## 2. Root Cause #1 — `returnToParent` re-fetches parent XML

### 2.1 Call graph (child → parent)

```
returnToParent(childSessionId)                          App.jsx:1210
  └─ apiReturnToParent(childSessionId)                  App.jsx:1211
  └─ cachedParentSession = sessionCacheRef.get(parentId) App.jsx:1235
  └─ openSession(parentId, { session: cachedParentSession, source: "subprocess_return" })
                                                        App.jsx:1236
       └─ options.session is an object → nextRaw = cachedParentSession
                                                        useSessionActivationOrchestration.js:184
       └─ setDraftPersisted(sessionToDraft(parentId, nextRaw))
                                                        useSessionActivationOrchestration.js:279
       └─ draft/sessionId props change downstream
            └─ AppShell.jsx:221 / ProcessStage.jsx:6161
                 └─ BpmnStage props: sid, draft, reloadKey
                 └─ useEffect([sessionId, reloadKey])   BpmnStage.jsx:6012
                      └─ loadFromBackend(sid, token, { reason: "session_reload" })
                                                        BpmnStage.jsx:6019
                      └─ coordinator.reload({ preferStore: false })
                                                        BpmnStage.jsx:4988
                      └─ loadRaw(sid)                   createBpmnCoordinator.js:927
                      └─ apiGetBpmnXml(sid, { raw: true, includeOverlay: false, cacheBust: true })
                                                        createBpmnPersistence.js:467
```

### 2.2 Code evidence

**`App.jsx` — `returnToParent` passes the cached session but does not prevent the downstream XML reload**

```jsx
// frontend/src/App.jsx:1210-1240
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

The comment says “avoid an extra API + XML fetch,” but only the `apiGetSession` call is skipped. The XML fetch is not skipped.

**`useSessionActivationOrchestration.js` — `openSession` sets the draft, which propagates to `BpmnStage`**

```jsx
// frontend/src/app/useSessionActivationOrchestration.js:183-225
let nextRaw;
if (options?.session && typeof options.session === "object") {
  nextRaw = options.session;
} else if (options?.useCache && sessionCacheRef?.current?.has?.(sid)) {
  nextRaw = sessionCacheRef.current.get(sid);
} else {
  const r = await apiGetSession(sid);
  // ...
  nextRaw = r.session || ensureDraftShape(sid);
  if (sessionCacheRef?.current) {
    sessionCacheRef.current.set(sid, nextRaw);
  }
}
// ...
setDraftPersisted(sessionToDraft(sid, next));
```

`setDraftPersisted` changes `draft`, which changes `sessionId` prop downstream.

**`BpmnStage.jsx` — `useEffect([sessionId, reloadKey])` always calls `loadFromBackend`**

```jsx
// frontend/src/components/process/BpmnStage.jsx:6012-6021
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

There is no guard like `if (draftAlreadyHasXmlFor(sid)) return;`.

**`BpmnStage.jsx` — `loadFromBackend` calls `coordinator.reload()` with `preferStore: false` by default**

```jsx
// frontend/src/components/process/BpmnStage.jsx:4976-5026
async function loadFromBackend(sid, token = 0, options = {}) {
  // ...
  const coordinator = ensureBpmnCoordinator();
  const loaded = await coordinator.reload({
    reason: options?.reason || "stage_load",
    preferStore: options?.forceRemote === true ? false : options?.preferStore === true,
    rev: Number(bpmnStoreRef.current?.getState?.()?.rev || 0),
  });
  // ...
}
```

Because `preferStore` defaults to `false`, the coordinator does **not** short-circuit on the in-memory store.

**`createBpmnCoordinator.js` — `reload()` issues `loadRaw()`**

```js
// frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js:896-927
async function reload(optionsForReload = {}) {
  const sid = currentSid();
  if (!sid || !store) return { ok: false, error: "missing session", applied: false };
  // ...
  if (preferStore && localXml.trim()) {
    // short-circuit only when explicitly asked
    return { ok: true, applied: false, reason: "store_priority", source: "store", ... };
  }
  // ...
  const loaded = await loadRaw(sid, optionsForReload);
  // ...
}
```

**`createBpmnPersistence.js` — `loadRaw()` reads the runtime cache but still calls the backend**

```js
// frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js:371-467
async function loadRaw(sessionId, optionsForLoad = {}) {
  const sid = asText(sessionId).trim();
  // ...
  const runtimeCache = forceRemote ? null : readRuntimeCache(sid);
  const draftCandidate = (!forceRemote && draftXml.trim())
    ? { source: "draft", xml: draftXml, rev, hash: fnv1aHex(draftXml), ts: 0 }
    : null;
  const localWinner = forceRemote ? null : pickFreshestCandidate([draftCandidate, runtimeCache]);

  if (typeof apiGetBpmnXml !== "function") {
    // only here the local winner is used without a backend call
    // ...
  }
  const loaded = await apiGetBpmnXml(sid, {
    raw: true,
    includeOverlay: false,
    cacheBust: true,
  });
  // ...
}
```

The local winner is returned only when `apiGetBpmnXml` is unavailable. In production it is always available, so the backend is always hit.

### 2.3 Why this feels like a “full reload”

After `loadFromBackend` updates the BPMN store, the big render `useEffect` fires:

```jsx
// frontend/src/components/process/BpmnStage.jsx:6023-6149
useEffect(() => {
  // ...
  async function run() {
    // ...
    if (view === "editor" || view === "diagram") {
      // ...
      if (modelerHasDefinitions && lastModelerXmlHashRef.current === resolvedHash) {
        // same-hash fast path
        return;
      }
      // ...
      await renderModeler(resolvedXml);   // <- bpmn-js importXML
      // ...
    }
  }
  run();
  // ...
}, [view, xml, sessionId, draft?.bpmn_xml, draft?.nodes, draft?.title, srcHint]);
```

Even if the cached parent XML is byte-identical to the backend response, `renderModeler` calls `runtime.load(nextXml)` / `importXML`, which rebuilds the diagram from scratch. The viewport snapshot restores the zoom/pan, but the user sees a flash/re-layout because the modeler re-imports the XML.

---

## 3. Root Cause #2 — nested subprocess jumps

### 3.1 Stack management in drill-in and return

**`App.jsx` — `navigateToSubprocess` replaces the breadcrumb stack from the backend response**

```jsx
// frontend/src/App.jsx:1165-1208
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
  } catch (e) { /* ... */ }
  if (sessionCacheRef.current && draft?.session_id === String(sessionIdArg || "").trim()) {
    sessionCacheRef.current.set(String(sessionIdArg || "").trim(), draft);
  }
  setSubprocessBreadcrumbs(res.breadcrumbs || []);   // <-- whole stack from API
  setFocusElementId(res.targetElementId || "");
  pushSessionSelectionToUrl({ ... });
  // ...
  openSession(res.subprocessSessionId);
}, [openSession, projectId, projectRouteContext]);
```

`res.breadcrumbs` is the **full** stack returned by `/api/sessions/{sid}/subprocess/{el}/navigate`. In the test stand this returned `[root, child]` for a single drill-in, so the stack is correct after drill-in.

**`App.jsx` — `returnToParent` pops the last crumb locally**

```jsx
// frontend/src/App.jsx:1221-1226
setSubprocessBreadcrumbs((prev) => {
  const list = Array.isArray(prev) ? prev : [];
  if (list.length > 1) return list.slice(0, -1);
  return list;
});
```

This is correct **if and only if** `prev` is the true full stack. If `prev` has been truncated, the pop is wrong.

### 3.2 How the stack can become truncated / wrong

**Deep-link initialization uses `navigation_stack` from `apiGetSession`**

```jsx
// frontend/src/App.jsx:3352-3379
useEffect(() => {
  const { parentSessionId, focusElementId: focusId, sessionId: sid } = initialSelectionRef.current || {};
  if (focusId) {
    setFocusElementId(focusId);
    if (typeof window !== "undefined") {
      window.__SUBPROCESS_FOCUS_ELEMENT_ID__ = focusId || "";
    }
  }
  if (!sid) return;
  void (async () => {
    const loaded = await apiGetSession(sid);
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
  })();
}, [ /* ... */ ]);
```

If the user opens a subprocess session by URL and `navigation_stack` is empty or stale, the initial stack becomes `[parent, child]` (fallback) or `[child]` (root case). From that point on:

- `returnToParent` will `slice(0, -1)` and may leave a single wrong crumb or drop ancestors.
- `navigateToSubprocess` from that subprocess will replace the stack with whatever the backend returns for the *current* subprocess, which may or may not include the original root ancestors depending on backend state.

### 3.3 Why nested drill-in can “jump”

At depth 2+ the scenario is:

1. User is at `[A, B, C]`.
2. User drills into `D` from `C`.
3. `navigateToSubprocess(C, el)` calls backend `/api/sessions/C/subprocess/el/navigate`.
4. Backend returns `breadcrumbs: [A, B, C, D]` → stack is correct.
5. User returns from `D`.
6. `returnToParent(D)` calls backend `/api/sessions/D/return` and gets `parentSessionId = C`.
7. `setSubprocessBreadcrumbs(prev => prev.slice(0, -1))` → `[A, B, C]` — still correct.

The jump happens when step 4 returns a **non-full** stack (e.g. `[C, D]`). This can occur if the backend `navigation_stack` for `C` is incomplete, or if the API builds breadcrumbs only from the immediate parent. After step 7 the stack would become `[C]`, losing `A` and `B`. The UI would appear to “jump” to the wrong level.

Another source of jumps is the viewport snapshot map. Each drill-in stores a snapshot keyed by the **parent** session id:

```jsx
// frontend/src/App.jsx:1176-1179
const snapshot = bpmnStageRef.current?.getCanvasSnapshot?.();
if (snapshot) {
  parentViewportSnapshotRef.current.set(String(sessionIdArg || "").trim(), snapshot);
}
```

On return the snapshot is restored:

```jsx
// frontend/src/App.jsx:1217-1219
const snapshot = parentSid ? parentViewportSnapshotRef.current.get(parentSid) : null;
if (snapshot) {
  setRestoreViewportSnapshot(snapshot);
}
```

This works for depth N → N-1, but the snapshots are taken at drill-in time. If the parent diagram was changed while the user was in the child, the snapshot is stale and the restore may visibly jump.

---

## 4. Secondary findings

### 4.1 `setReloadKey` triggers an XML reload on every status change

```jsx
// frontend/src/App.jsx:2946-2950
onSessionSync(r.result || {});
setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
setReloadKey((x) => x + 1);
markOk("API OK");
```

`reloadKey` is a dependency of `BpmnStage`'s `useEffect([sessionId, reloadKey])`. Incrementing it re-runs `loadFromBackend` and therefore re-fetches XML even though the session id did not change. This is unrelated to subprocess navigation but contributes to the “everything reloads” feeling.

### 4.2 Drilldown arrow listener is wired but the arrow is never rendered

```js
// frontend/src/features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js:34-50
const handler = (event) => {
  const button = event?.target?.closest?.(".bjs-drilldown");
  if (!button) return;
  // ...
  cb(element.id);
};
```

The runtime in `BpmnStage` is created as a `Modeler` for the editor/diagram tab:

```js
// frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js:195-202
async function importCtor(runtimeMode) {
  if (runtimeMode === "viewer") {
    const mod = await import("bpmn-js/lib/NavigatedViewer");
    return mod.default || mod;
  }
  const mod = await import("bpmn-js/lib/Modeler");
  return mod.default || mod;
}
```

`bpmn-js/lib/Modeler` does **not** render the `.bjs-drilldown` overlay. Therefore the dedicated drilldown click handler never fires; users must use the context menu item “Перейти в подпроцесс”.

### 4.3 `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` is a write-only global side channel

```jsx
// frontend/src/App.jsx:3354-3358
if (focusId) {
  setFocusElementId(focusId);
  if (typeof window !== "undefined") {
    window.__SUBPROCESS_FOCUS_ELEMENT_ID__ = focusId || "";
  }
}
```

No production code reads this variable back. It appears to be an E2E/debugging probe.

### 4.4 `openSession` may still fetch a BPMN snapshot even with a cached session

```jsx
// frontend/src/app/useSessionActivationOrchestration.js:236-270
const latestSnapshot = await getLatestBpmnSnapshot({ projectId: sidProject, sessionId: sid });
// ...
if (restoreDecision.restore) {
  restoredFromSnapshot = true;
  restoredSnapshot = latestSnapshot;
  next = { ...nextRaw, bpmn_xml: snapshotXml };
}
```

When `openSession` receives `options.session`, it skips `apiGetSession` but still calls `getLatestBpmnSnapshot`. If that helper performs a network request, it is another background fetch during subprocess return.

### 4.5 `onSessionSync` invalidates `sessionCacheRef` aggressively

```jsx
// frontend/src/App.jsx:1619-1626
function onSessionSync(session) {
  const sid = String(session?.id || session?.session_id || draft?.session_id || "").trim();
  if (sid) sessionCacheRef.current.delete(sid);
  // ...
}
```

If `onSessionSync` fires concurrently with `returnToParent`, the cached parent session may be deleted before `returnToParent` reads it, causing an `apiGetSession` miss in addition to the XML fetch.

---

## 5. Fix hypotheses

### 5.1 Skip `loadFromBackend` when returning to a cached parent session

**What:** In `BpmnStage`'s `useEffect([sessionId, reloadKey])`, do not call `loadFromBackend` if the new `sessionId` matches a draft/session object that already has `bpmn_xml` and we are in a subprocess-return context.

**Files touched:** `BpmnStage.jsx`, possibly `useSessionActivationOrchestration.js` to pass a flag.

**Risk:** If the cached `bpmn_xml` is stale relative to the backend, the user will see old data. Need a rev/hash comparison or a short TTL.

### 5.2 Make `createBpmnPersistence.loadRaw` respect the runtime cache / draft as authoritative

**What:** Add an option (e.g. `preferLocal: true`) that returns the runtime-cache or draft XML without calling `apiGetBpmnXml` when the caller explicitly has a fresh cached object. Use it from `loadFromBackend` during subprocess return.

**Files touched:** `createBpmnPersistence.js`, `createBpmnCoordinator.js`, `BpmnStage.jsx`.

**Risk:** Same staleness concern; must only be used when the caller is sure the local copy is current (e.g. it was just cached before drill-in).

### 5.3 Replace client-side breadcrumb pop with backend-returned stack

**What:** Modify `apiReturnToParent` (backend) to return the full remaining `navigation_stack` / `breadcrumbs`, and have `returnToParent` call `setSubprocessBreadcrumbs(res.breadcrumbs)` instead of `slice(0, -1)`.

**Files touched:** backend `session_status.py` / sessions router, `App.jsx`, `lib/api.js`.

**Risk:** Requires backend change; larger scope. Eliminates client-side desync.

### 5.4 Cache parent sessions/snapshots in a persistent keyed store

**What:** Move `sessionCacheRef` and `parentViewportSnapshotRef` out of a per-render `useRef` into a module-level store or `localStorage` so they survive React remounts and direct URL navigation.

**Files touched:** `App.jsx`, possibly a new cache module.

**Risk:** Memory growth; need eviction. Also need invalidation logic when the parent session is mutated elsewhere.

### 5.5 Do not increment `reloadKey` on status transitions unless the session id changed

**What:** Remove or guard `setReloadKey((x) => x + 1)` in `changeCurrentSessionStatus`.

**Files touched:** `App.jsx`.

**Risk:** Low; but verify that status-dependent UI still refreshes via `draft` update alone.

### 5.6 Re-render the existing modeler instead of re-importing when XML hash is unchanged

**What:** Strengthen the `lastModelerXmlHashRef.current === resolvedHash` fast path so it is taken after a subprocess return when the cached parent XML is identical to the backend response.

**Files touched:** `BpmnStage.jsx`.

**Risk:** If the hash matches but the runtime instance was destroyed (or attached to a different session), the fast path must not be taken. Need a session-id guard on the hash cache.

---

## 6. Files analyzed

| # | File | Lines inspected | Purpose |
|---|------|-----------------|---------|
| 1 | `frontend/src/App.jsx` | 896, 1017-1031, 1165-1240, 1619-1626, 2946-2950, 3352-3379 | `returnToParent`, `navigateToSubprocess`, `sessionCacheRef`, `subprocessBreadcrumbs`, `reloadKey`, `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` |
| 2 | `frontend/src/app/useSessionActivationOrchestration.js` | 130-341 | `openSession`, cache hit/miss logic, snapshot fetch |
| 3 | `frontend/src/app/useSessionRouteOrchestration.js` | 51-78 | `pushSessionSelectionToUrl`, history behavior |
| 4 | `frontend/src/components/AppShell.jsx` | 96, 111, 149, 158, 221, 285-328 | prop drilling to `ProcessStage` |
| 5 | `frontend/src/components/ProcessStage.jsx` | 338-381, 6161, 6951 | receives `sessionId`, `reloadKey`, `subprocessBreadcrumbs`, renders `ProcessDiagramOverlayLayers` |
| 6 | `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js` | 70-113, 259-298 | memoization of `BpmnStage` inputs (`sid`, `draft`, `reloadKey`) |
| 7 | `frontend/src/components/process/BpmnStage.jsx` | 1820-1829, 5940-5965, 6010-6021, 6023-6149, 6151-6156, 6214, 4976-5026 | `useEffect` dependencies, `loadFromBackend`, render loop |
| 8 | `frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js` | 3-144, 146-358 | `renderViewerDiagram`, `renderModelerDiagram`, `importXML`, `focusElementId` |
| 9 | `frontend/src/features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js` | 26-61 | drilldown click handler |
| 10 | `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js` | 195-202 | `Modeler` vs `NavigatedViewer` selection |
| 11 | `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js` | 896-1013 | `reload()` → `loadRaw()` |
| 12 | `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js` | 371-467 | `loadRaw()` always calls `apiGetBpmnXml` |
| 13 | `frontend/src/features/workspace/sessionStatus.js` | 1-55 | transition matrix; no direct impact on reload |

*(Note: requested `useSubprocessNavigation.js` does not exist in the codebase.)*
