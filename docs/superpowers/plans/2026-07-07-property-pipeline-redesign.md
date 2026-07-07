# Property Save Pipeline Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make property CRUD go through the live modeler before `saveBpmnState`, eliminating stale XML, missing-XML errors, and property duplication while preserving viewport and existing save flows.

**Architecture:** Caller (`App.jsx`) applies the optimistic extension state to `bpmn-js` via the existing `applyElementCamundaExtensionsToModeler` imperative API, then hands `saveBpmnState` a `getModelerXml` callback. `saveBpmnState` serializes the freshly mutated modeler and merges the canonical extension map to keep preserved fragments (I/O, Zeebe, connectors). The returned sync payload now carries the new XML but skips canvas re-render.

**Tech Stack:** React, bpmn-js, camunda-bpmn-moddle, plain JS modules, Node test runner.

---

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/features/process/camunda/camundaExtensions.js` | `applyCamundaExtensionStateToModeler` — write managed properties **and** listeners back to modeler. |
| `frontend/src/features/process/save/saveBpmnState.js` | Unified save funnel: prefer live modeler XML, keep `bpmn_xml` in property-only sync payload, never re-import canvas for property ops. |
| `frontend/src/App.jsx` | `setElementCamundaExtensions` — apply to modeler first, then call `saveBpmnState` with `getModelerXml`. |
| `frontend/src/features/process/save/saveBpmnState.property-pipeline.test.mjs` | New tests for the modeler-first property branch. |

---

## Task 1: Extend modeler sync to include listeners

**Files:**
- Modify: `frontend/src/features/process/camunda/camundaExtensions.js:1186-1226`

- [ ] **Step 1: Add listener serialization inside `applyCamundaExtensionStateToModeler`**

Find this block:

```js
    const propValues = asArray(normalized?.properties?.extensionProperties).map((item) => (
      moddle.create("camunda:Property", {
        name: String(item?.name ?? ""),
        value: String(item?.value ?? ""),
      })
    ));
    const camundaProperties = propValues.length
      ? [moddle.create("camunda:Properties", { values: propValues })]
      : [];

    const nextValues = [...preserved, ...camundaProperties];
```

Replace with:

```js
    const propValues = asArray(normalized?.properties?.extensionProperties).map((item) => (
      moddle.create("camunda:Property", {
        name: String(item?.name ?? ""),
        value: String(item?.value ?? ""),
      })
    ));
    const camundaProperties = propValues.length
      ? [moddle.create("camunda:Properties", { values: propValues })]
      : [];

    const listenerValues = asArray(normalized?.properties?.extensionListeners).map((item) => {
      const attrs = { event: String(item?.event ?? "") };
      const type = String(item?.type ?? "");
      if (type === "class") attrs.class = String(item?.value ?? "");
      else if (type === "expression") attrs.expression = String(item?.value ?? "");
      else if (type === "delegateExpression") attrs.delegateExpression = String(item?.value ?? "");
      return moddle.create("camunda:ExecutionListener", attrs);
    });
    const camundaListeners = listenerValues.length ? listenerValues : [];

    const nextValues = [...preserved, ...camundaProperties, ...camundaListeners];
```

- [ ] **Step 2: Verify the rest of the function is unchanged**

The function still calls `modeling.updateProperties(el, { extensionElements: nextExt })` and returns `{ ok: true }`.

---

## Task 2: Make `saveBpmnState` consume live modeler XML and keep draft XML in sync

**Files:**
- Modify: `frontend/src/features/process/save/saveBpmnState.js:337-346`
- Modify: `frontend/src/features/process/save/saveBpmnState.js:358-362`
- Modify: `frontend/src/features/process/save/saveBpmnState.js:387-391`

- [ ] **Step 1: Keep `bpmn_xml` for property-only saves**

Replace:

```js
  fallbackPatch._apply_bpmn_xml = !isPropertyOperation;
  if (isPropertyOperation) {
    // Property-only saves already mutated the XML in-place through the Camunda
    // extension state map. Updating draft.bpmn_xml with the server-normalized XML
    // tears down and rebuilds the canvas (viewport reset + flicker), so we keep
    // the local XML untouched. The meta change is enough for the UI, and the next
    // structural save re-syncs extensions from meta into the modeler.
    delete fallbackPatch.bpmn_xml;
    fallbackPatch._skip_bpmn_render = Date.now();
  }
```

With:

```js
  fallbackPatch._apply_bpmn_xml = !isPropertyOperation;
  if (isPropertyOperation) {
    // Property-only saves mutate the modeler in-place. We still update the
    // authoritative draft XML so subsequent saves do not refetch a stale base,
    // but we skip the canvas re-import to preserve viewport.
    fallbackPatch._skip_bpmn_render = Date.now();
  }
```

- [ ] **Step 2: Preserve server XML during background refresh**

Replace:

```js
            const syncPayload = { ...fresh.session, _sync_source: syncSource };
            if (isPropertyOperation) {
              delete syncPayload.bpmn_xml;
              syncPayload._skip_bpmn_render = Date.now();
            }
```

With:

```js
            const syncPayload = { ...fresh.session, _sync_source: syncSource };
            if (isPropertyOperation) {
              syncPayload._skip_bpmn_render = Date.now();
            }
```

- [ ] **Step 3: Preserve server XML during immediate sync**

Replace:

```js
        const syncPayload = { ...fresh.session, _sync_source: syncSource, _apply_bpmn_xml: !isPropertyOperation };
        if (isPropertyOperation) {
          delete syncPayload.bpmn_xml;
          syncPayload._skip_bpmn_render = Date.now();
        }
```

With:

```js
        const syncPayload = { ...fresh.session, _sync_source: syncSource, _apply_bpmn_xml: !isPropertyOperation };
        if (isPropertyOperation) {
          syncPayload._skip_bpmn_render = Date.now();
        }
```

---

## Task 3: Wire `App.jsx` to apply state to modeler before saving

**Files:**
- Modify: `frontend/src/App.jsx:2628-2689`

- [ ] **Step 1: Remove stale `currentXml` fetch and pass `getModelerXml`**

Find the `setElementCamundaExtensions` body. Replace this section:

```js
    let currentXml = draft?.bpmn_xml;
    if (!currentXml) {
      const xmlRes = await apiGetBpmnXml(sid);
      currentXml = xmlRes?.ok ? xmlRes.xml : "";
    }
    const operation = shouldRemove
      ? "property_delete"
      : (currentCamundaExtensionsByElementId[elementId] ? "property_update" : "property_add");
    emitPropertySaveEvent({ type: "start", operation, elementId, sid });
    const persistResult = await saveBpmnState({
      operation,
      sessionId: sid,
      isLocal: isLocalSessionId(sid),
      baseDiagramStateVersion,
      lastServerDiagramStateVersionRef,
      projectId: draft?.project_id,
      elementId,
      currentCamundaExtensionsByElementId,
      nextCamundaExtensionsByElementId,
      currentMeta,
      nextMeta: optimisticMeta,
      currentXml,
      apiPutBpmnXml,
      apiGetSession,
      onSessionSync,
      overwriteBpmnSnapshot,
      backgroundSessionRefresh: options?.backgroundSessionRefresh === true,
      onDurableSaveAck: options?.onDurableSaveAck,
      onBackgroundSessionSyncStart: options?.onBackgroundSessionSyncStart,
      onBackgroundSessionSyncComplete: options?.onBackgroundSessionSyncComplete,
      onBackgroundSessionSyncError: options?.onBackgroundSessionSyncError,
      syncSource: "saveBpmnState:camunda_extensions",
    });
```

With:

```js
    const operation = shouldRemove
      ? "property_delete"
      : (currentCamundaExtensionsByElementId[elementId] ? "property_update" : "property_add");
    emitPropertySaveEvent({ type: "start", operation, elementId, sid });

    // Apply the optimistic extension state to the live modeler first so the
    // serialized XML is always fresh and property duplication cannot happen.
    try {
      bpmnStageRef.current?.applyElementCamundaExtensionsToModeler?.(elementId, extensionStateRaw);
    } catch {
      // Best-effort; the XML merge path below will still apply the state.
    }

    const persistResult = await saveBpmnState({
      operation,
      sessionId: sid,
      isLocal: isLocalSessionId(sid),
      baseDiagramStateVersion,
      lastServerDiagramStateVersionRef,
      projectId: draft?.project_id,
      elementId,
      currentCamundaExtensionsByElementId,
      nextCamundaExtensionsByElementId,
      currentMeta,
      nextMeta: optimisticMeta,
      getModelerXml: async () => {
        const snap = await bpmnStageRef.current?.getRuntimeXmlSnapshot?.();
        return snap?.ok ? snap.xml : "";
      },
      apiPutBpmnXml,
      apiGetSession,
      onSessionSync,
      overwriteBpmnSnapshot,
      backgroundSessionRefresh: options?.backgroundSessionRefresh === true,
      onDurableSaveAck: options?.onDurableSaveAck,
      onBackgroundSessionSyncStart: options?.onBackgroundSessionSyncStart,
      onBackgroundSessionSyncComplete: options?.onBackgroundSessionSyncComplete,
      onBackgroundSessionSyncError: options?.onBackgroundSessionSyncError,
      syncSource: "saveBpmnState:camunda_extensions",
    });
```

- [ ] **Step 2: Remove the post-save best-effort modeler sync**

Delete this block:

```js
    // Keep the in-memory modeler in sync with the saved XML so the sidebar and
    // canvas overlays do not show stale/duplicated property rows after the
    // property-only save intentionally skips a full canvas re-import.
    try {
      const syncRes = bpmnStageRef.current?.applyElementCamundaExtensionsToModeler?.(elementId, extensionStateRaw);
      if (syncRes?.ok) {
        setBpmnModelerSyncEpoch((n) => n + 1);
      }
    } catch {
      // Best-effort sync; the next structural save will reconcile from meta.
    }
```

The modeler was already updated before the save call.

---

## Task 4: Add tests for the modeler-first property branch

**Files:**
- Create: `frontend/src/features/process/save/saveBpmnState.property-pipeline.test.mjs`

- [ ] **Step 1: Write the test file**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { saveBpmnState } from "./saveBpmnState.js";

function createFakeModeler(xml) {
  return {
    async saveXML() {
      return { xml };
    },
  };
}

function createFakeApiPut(ok = true, overrides = {}) {
  return async () => ({
    ok,
    status: ok ? 200 : 409,
    diagramStateVersion: 7,
    storedRev: 5,
    ...overrides,
  });
}

test("property save uses getModelerXml and keeps bpmn_xml in sync payload", async () => {
  const calls = [];
  const onSessionSync = (patch) => calls.push(patch);

  const result = await saveBpmnState({
    operation: "property_update",
    sessionId: "sid-123",
    elementId: "Task_1",
    baseDiagramStateVersion: 6,
    currentCamundaExtensionsByElementId: {},
    nextCamundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "p1", name: "key", value: "value" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
    currentMeta: {},
    nextMeta: { camunda_extensions_by_element_id: {} },
    getModelerXml: async () => "<xml>from-modeler</xml>",
    apiPutBpmnXml: createFakeApiPut(),
    onSessionSync,
  });

  assert.equal(result?.ok, true);
  const patch = calls.find((c) => c?._sync_source?.includes("saveBpmnState"));
  assert.ok(patch, "sync patch emitted");
  assert.equal(patch.bpmn_xml?.includes("from-modeler"), true, "patch carries modeler XML");
  assert.equal(patch._apply_bpmn_xml, false, "does not trigger canvas re-import");
  assert.ok(Number(patch._skip_bpmn_render) > 0, "sets skip render token");
});

test("property save without XML source returns missing-XML error", async () => {
  const result = await saveBpmnState({
    operation: "property_update",
    sessionId: "sid-123",
    elementId: "Task_1",
    baseDiagramStateVersion: 6,
    currentCamundaExtensionsByElementId: {},
    nextCamundaExtensionsByElementId: {
      Task_1: {
        properties: {
          extensionProperties: [{ id: "p1", name: "key", value: "value" }],
          extensionListeners: [],
        },
        preservedExtensionElements: [],
      },
    },
    apiPutBpmnXml: createFakeApiPut(),
  });

  assert.equal(result?.ok, false);
  assert.match(String(result?.error || ""), /Отсутствует BPMN XML/);
});

test("session_save is unaffected by property-only skip-render flag", async () => {
  const calls = [];
  const result = await saveBpmnState({
    operation: "session_save",
    sessionId: "sid-123",
    baseDiagramStateVersion: 6,
    xml: "<xml>session</xml>",
    nextMeta: {},
    apiPutBpmnXml: createFakeApiPut(),
    onSessionSync: (patch) => calls.push(patch),
  });

  assert.equal(result?.ok, true);
  const patch = calls.find((c) => c?._sync_source?.includes("saveBpmnState"));
  assert.equal(patch?._apply_bpmn_xml, true, "session save still applies XML");
  assert.equal(patch?._skip_bpmn_render, undefined, "no skip token for session save");
});
```

- [ ] **Step 2: Run the new tests**

```bash
cd /opt/processmap-test/frontend
node --test src/features/process/save/saveBpmnState.property-pipeline.test.mjs
```

Expected: 3 tests pass.

---

## Task 5: (Optional follow-up) Overlay / context-menu property update persistence

**Files:**
- Modify: `frontend/src/components/App.jsx` — expose `onPropertyExtensionChange` through `AppShell`.
- Modify: `frontend/src/components/AppShell.jsx` — forward prop to `ProcessStage`.
- Modify: `frontend/src/components/ProcessStage.jsx` — pass callback into `bpmnStageProps`.
- Modify: `frontend/src/components/process/BpmnStage.jsx` — wire `onPropertyExtensionChange` into `createBpmnContextMenuActionExecutor`.
- Modify: `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js` — for `properties_overlay_update_extension_property`, call the callback instead of mutating modeler directly.

This phase is **out of scope for the initial PR** unless time permits. The current plan already fixes the documented bugs: missing XML, duplication, and stale XML for sidebar property saves.

---

## Task 6: Run the full frontend test suite

- [ ] **Step 1: Run all .test.mjs tests**

```bash
cd /opt/processmap-test/frontend
npm test
```

Expected: existing tests still pass; new tests pass.

- [ ] **Step 2: Run a production build smoke test**

```bash
cd /opt/processmap-test/frontend
npm run build
```

Expected: build completes without errors.

---

## Self-review

| Requirement | Task |
|-------------|------|
| Modeler is the source of truth for property saves | Task 3 applies state to modeler before save. |
| No missing-XML error | Task 3 always provides `getModelerXml`; Task 2 keeps XML in sync. |
| No property duplication | Task 1 atomically replaces the `camunda:properties` block; Task 3 serializes the modeler after replacement. |
| Viewport preserved | Task 2 keeps `_skip_bpmn_render` and `_apply_bpmn_xml = false` for property ops. |
| Backward compatibility for `session_save` / `version_create` | Task 2 only changes behavior for `isPropertyOperation`; `session_save` path unchanged. |
| Tests cover new behavior | Task 4 adds unit tests. |

**Gaps:** Overlay/context-menu property edits still mutate modeler directly and are not persisted. Covered as optional Task 5.
