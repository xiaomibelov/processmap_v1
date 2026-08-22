# 'message' Handler Violation Audit

**Scope:** browser `message` event handlers, `postMessage`, MessageChannel, BroadcastChannel, WebSocket, and Web Worker usage in the frontend source.

---

## Inventory

| Pattern | Count in `frontend/src` | Notes |
|---------|------------------------|-------|
| `window.addEventListener('message', ...)` | **1** | `DrawioEditorModal.jsx` only |
| `postMessage` outgoing | **1 file** | Same file, to draw.io iframe |
| `MessageChannel` / `BroadcastChannel` | **0** | None in source |
| WebSocket / `EventSource` message handlers | **0** | None in product source (Vite HMR WS is dev-only in `node_modules`) |
| Web Workers / Service Workers | **0** | None in source |

React scheduler internally uses `MessageChannel` in `node_modules`, but that is not product code.

---

## The Single `message` Handler

**File:** `frontend/src/features/process/drawio/DrawioEditorModal.jsx:69–118`

```jsx
const onMessage = (event) => {
  if (event.source !== iframeRef.current?.contentWindow) return;
  const msg = parseEditorMessage(event.data);          // JSON.parse
  if (!msg) return;
  const evtName = toText(msg.event || msg.action).toLowerCase();
  if (evtName === "configure") { /* postMessage configure */ return; }
  if (evtName === "init") { setReady(true); loadDocument(); return; }
  if (evtName === "load") { setStatus("Редактор готов."); return; }
  if (evtName === "save") {
    pendingSaveXmlRef.current = toText(msg.xml || msg.data) || loadedXmlRef.current || EMPTY_DRAWIO_DOC;
    setSaving(true);
    setStatus("Экспортируем SVG…");
    postMessageToEditor({ action: "export", format: "svg", xml: pendingSaveXmlRef.current, spinKey: "saving" });
    return;
  }
  if (evtName === "export") {
    const nextXml = toText(pendingSaveXmlRef.current) || loadedXmlRef.current || EMPTY_DRAWIO_DOC;
    const svgCache = toText(msg.data);
    loadedXmlRef.current = nextXml;
    pendingSaveXmlRef.current = "";
    setSaving(false);
    setStatus("Сохранено и применено.");
    onSave?.({ docXml: nextXml, svgCache });
    return;
  }
  if (evtName === "exit") { onClose?.(); }
};

// Line 119
window.addEventListener("message", onMessage);
```

**Outgoing `postMessage` calls (same file):**

- `postMessageToEditor({ action: "load", xml, ... })` — line 48
- `postMessageToEditor({ action: "configure", config: {} })` — line 75
- `postMessageToEditor({ action: "export", format: "svg", xml: ..., spinKey: "saving" })` — line 94
- `postMessageToEditor({ action: "save" })` — line 142 (user click)

**Protocol:** draw.io embedded editor JSON protocol: `configure` → `init` → `load` → `save` → `export` → `exit`.

---

## Synchronous Work Inside the Handler

The handler executes synchronously and:

1. Validates `event.source`.
2. `JSON.parse` the payload (`parseEditorMessage`).
3. On `save`: stores large XML string, updates React state (`setSaving`, `setStatus`), and sends an `export` postMessage.
4. On `export`: stores large XML + SVG strings, updates React state, and calls `onSave` callback.

The `onSave` callback can cascade into:
- React state updates.
- Snapshot persistence (IDB / localStorage).
- Autosave coordinator chain.

All of this runs in the same task if not explicitly deferred.

---

## Other Heavy Main-Thread Paths That May Follow a Message

| Candidate | Where | Sync? | Size risk |
|-----------|-------|-------|-----------|
| Draw.io `load` / `save` / `export` payload | `DrawioEditorModal.jsx:48, 75, 94, 142` | Handler sync; sends/receives large XML/SVG | **High** |
| BPMN `importXML` | `BpmnViewer.jsx:75`; `createBpmnRuntime.js:262`; `viewportRecovery.js:246,356`; `bpmnRenderRuntimeLifecycle.js:63,250` | Async wrapper, but parse/layout/render runs on main thread | **High** |
| Overlay mount/update | `overlayLifecycleManager.js:355`; `DrawioOverlayRenderer.jsx:329` | Sync DOM creation after import | Medium |
| Snapshot persistence | `bpmnSnapshots.js:212–249`, `358–365`, `631–635` | Async wrapper, but `JSON.stringify(record)` for localStorage fallback is sync | **High** |
| Autosave coordinator | `createBpmnCoordinator.js:606–649`; `createBpmnPersistence.js:314–369` | `setTimeout` debounce; flush is async but snapshot serialization sync | Medium |

---

## Offloading Patterns

| Pattern | Where | How used |
|---------|-------|----------|
| `requestIdleCallback` | `useDeferredDecorFanout.js:5–6` | Defers non-critical BPMN decoration fanouts |
| `requestIdleCallback` | `src/components/process/interview/perf.js:153–156` | Generic idle scheduler |
| `setTimeout` | `createBpmnCoordinator.js:645–648` | Autosave debounce timer |
| `requestAnimationFrame` | `DrawioOverlayRenderer.jsx:336`; `useDrawioElementNodeRegistry.js:34` | DOM patching scheduled, but callback runs sync on main thread |
| Web Workers | None | No offloading |

The draw.io message handler does **not** use `requestIdleCallback`, `setTimeout`, or a worker.

---

## Hypotheses Status

| ID | Hypothesis | Status |
|----|------------|--------|
| H1 | Snapshot save callback (indexedDB) in `postMessage` | **Refuted** — no `postMessage` for snapshots; snapshot runs from autosave coordinator, not a message handler |
| H2 | Overlay update via message channel (bpmn-js event bus) | **Refuted** — no MessageChannel usage in source; overlay updates are direct event-bus calls |
| H3 | Browser extension (React DevTools, etc.) intercepts messages | **Possible but unverified** — extensions can add global `message` listeners; not visible in source |
| H4 | Draw.io iframe handler processes large payloads synchronously | **Confirmed** — the only `window.addEventListener('message')` handler in source; parses large XML/SVG and triggers save chain synchronously |

---

## Likely Culprit

The **draw.io iframe `message` handler** is the only explicit `message` event handler in the frontend source and the most plausible source of long `message` handler tasks in DevTools. When the iframe returns a full SVG export or XML save, the handler parses the payload and immediately invokes `onSave`, which can cascade into snapshot persistence and React state updates within the same task.

BPMN `importXML` and snapshot serialization are the main contributing blockers that often run immediately after the message handler triggers a save, amplifying the observed handler duration.

---

## Non-Code Verification Suggestions

1. Record a Chrome DevTools Performance trace while opening/saving the draw.io editor.
2. Filter for `Event: message` long tasks; the initiator should point to `DrawioEditorModal.jsx:119`.
3. Enable `window.localStorage.setItem("fpc_debug_snapshots", "1")` and observe `SNAPSHOT_SAVED` timings relative to the `message` task.
