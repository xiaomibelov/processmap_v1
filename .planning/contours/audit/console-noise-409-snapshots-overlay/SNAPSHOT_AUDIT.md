# Snapshot Persistence Audit

**Scope:** frontend BPMN snapshot subsystem (`SNAPSHOT_TRY`, `SNAPSHOT_DECISION`, `SNAPSHOT_PRUNE`, `SNAPSHOT_SAVED`).

---

## Log Marker Sources

| Marker | File | Lines | Gated? |
|--------|------|-------|--------|
| `SNAPSHOT_TRY` | `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js` | 325–328 | ❌ unconditional `console.debug` |
| `SNAPSHOT_DECISION` | `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js` | 331–365 | ❌ unconditional `console.debug` |
| `SNAPSHOT_DECISION` | `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js` | 441, 469, 499, 531, 568, 599, 650, 703 | ❌ via `logSnapshotDecision` |
| `SNAPSHOT_PRUNE` | `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js` | 667–668 | ❌ unconditional `console.debug` |
| `SNAPSHOT_SAVED` | `frontend/src/features/process/bpmn/snapshots/bpmnSnapshots.js` | 699–702 | ❌ unconditional `console.debug` |

A separate trace helper `logSnapshotTrace` (`bpmnSnapshots.js:38–45`) **is** gated by `localStorage.fpc_debug_snapshots === "1"`, but the markers above are not.

---

## Triggers

All markers flow through `createBpmnPersistence.maybeSaveSnapshot(...)`, called from `saveRaw(...)` (`createBpmnPersistence.js:689`).

`saveRaw` is invoked by:

| Trigger | Reason string | Typical frequency |
|---------|---------------|-------------------|
| Diagram modeler `commandStack.changed` → autosave | `"autosave"` | Continuous while editing |
| Tab switch (diagram ↔ XML) | `"tab_switch"` | On each tab switch |
| Manual save / create version | `"manual_save"` / `"publish_manual_save"` | User action |
| `beforeunload` / `pagehide` / `visibility_hidden` | lifecycle reasons | On navigation/hide |
| Lint autofix | `"lint_autofix"` | On autofix run |
| Pending replay after 409 | `"pending_replay"` | After conflict recovery |

---

## Frequency & Debouncing

- **Primary autosave debounce:** `600 ms` (`createBpmnCoordinator.js:109`).
- **Diagram mutation lifecycle debounce:** `350 ms` (`useDiagramMutationLifecycle.js:225`).
- **Interview sync debounce:** `120 ms` (`useInterviewSyncLifecycle.js`).
- `commandStack.changed` is subscribed **without throttling** (`createBpmnRuntime.js:183`), but the autosave scheduler coalesces rapid changes.
- `useAutosaveQueue` resets its timer on every mutation, so bursts collapse to one flush on the trailing edge.

During active editing, snapshot code runs roughly **every 350–600 ms**.

---

## Storage Target & Record Shape

### Targets

- **Primary:** IndexedDB — `fpc_bpmn_snapshots_db` / object store `session_snapshots` (`bpmnSnapshots.js:20–22`).
- **Fallback:** `localStorage` — key prefix `fpc_bpmn_snapshots:` (`bpmnSnapshots.js:23`, `88–90`).
- **Runtime cache (separate):** `fpc_bpmn_runtime_cache:${sid}` in `localStorage` (`createBpmnPersistence.js:75–81`).

### Record shape

```js
{
  key: "snapshots:<projectId>:<sessionId>",
  updatedAt: Date.now(),
  items: [
    { id, ts, reason, xml, hash, len, rev, pinned, label? },
    ...
  ]
}
```

Each item stores the **full XML string** (`len` field logged, e.g. `len=210144`).

### Serialization cost

- For **localStorage**, the whole record is `JSON.stringify`-ed on every save (`writeRecordToLocalStorage`, `bpmnSnapshots.js:244`).
- For **IndexedDB**, the object is stored directly (`writeRecordToIdb`, `bpmnSnapshots.js:219`).

---

## Pruning Policy

```js
// bpmnSnapshots.js:25
const SNAPSHOT_DEFAULT_LIMIT = 20;

// bpmnSnapshots.js:628–630
const mergedRaw = [nextItem, ...current];
const pruned = mergedRaw.length > limit;
const merged = mergedRaw.slice(0, limit);
```

- **Max count:** 20 snapshots per key.
- **Policy:** keep newest; drop oldest beyond limit.
- **Pinned items:** sorted to top (`normalizeRecord` lines 161–163), protected from pruning.
- **TTL:** none.
- Pruning itself is a synchronous in-memory `slice()`. The subsequent `writeRecord` is async, but `localStorage.setItem` and `JSON.stringify` run synchronously on the main thread.

**Storage estimate:** `210 KB × 20 = ~4.2 MB` per session for localStorage fallback.

---

## Performance Characteristics

| Operation | Sync/Async | Main-thread? | Cost |
|-----------|------------|--------------|------|
| `readMergedRecord` (IDB + localStorage alias reads) | async wrapper, sync parse | yes | reads + `JSON.parse` |
| `JSON.stringify(record)` for localStorage | sync | yes | **O(xml_len × item_count)** |
| `localStorage.setItem` | sync | yes | blocks until write completes |
| IDB put | async | no direct block | but object serialization happens in renderer process |
| Pruning `slice()` | sync | yes | negligible |

No duration measurements (`performance.now()`) were found around snapshot persistence.

---

## Hypotheses Status

| ID | Hypothesis | Status |
|----|------------|--------|
| H1 | Snapshot saves too frequently (every 5–10 s) | **Partially confirmed** — autosave cadence is 350–600 ms, much more frequent than 5–10 s |
| H2 | Pruning blocks the main thread | **Partially refuted** — pruning (`slice()`) is cheap; the synchronous `JSON.stringify` + `localStorage.setItem` can block |
| H3 | 210 KB × 20 = 4.2 MB bloats storage | **Confirmed** for localStorage fallback; IDB stores object directly but still keeps full copies |
| H4 | IDB write conflicts with other async ops | **Unconfirmed** — no evidence of transaction conflicts; localStorage writes are the bigger concern |
