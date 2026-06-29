# AUDIT — Canvas element selection lag

**Branch:** `fix/canvas-selection-lag`  
**Base:** `origin/main @ 5de2752f8fd383f97a761ee982fc3be812081f30`  
**Stage URL for testing:** `http://clearvestnic.ru:5177`  
**Audited at:** 2026-06-29T11:00Z  
**Run by:** Agent 2 / Executor, ProcessMap discipline

## Source/runtime truth

```
pwd: /opt/processmap-test
HEAD: 5de2752f8fd383f97a761ee982fc3be812081f30
origin/main: 5de2752f8fd383f97a761ee982fc3be812081f30
branch: fix/canvas-selection-lag
status: clean except untracked .planning contour notes
```

Stage `/version` at audit start:

```json
{"commit":"672b89fd","buildTime":"2026-06-26T22:31:09Z","containerId":"4229df4e2a17","branch":"feature/save-decomposition-v1","env":"stage"}
```

## Reproduction

Profile script: `.planning/contours/fix/canvas-selection-lag/profile_selection_lag.js`

Scenario: login → open session `f1f727aee7` → sidebar open → click 6 different BPMN shapes.

### Baseline metrics

| Metric | Value |
|--------|-------|
| Average selection-to-settle time | **434 ms** |
| Max selection-to-settle time | **507 ms** |
| Long tasks (>50 ms) during whole run | 2 |
| Long tasks (>100 ms) | 0 |
| Network requests fired during selection clicks | 7 |
| `GET /note-threads` fired during selection clicks | 4 |
| `GET /property-dictionary/operations` fired during selection clicks | 2 |

### Network timeline (per click)

```
click 0  → GET /api/sessions/{sid}/note-threads
           GET /api/sessions/{sid}/mentionable-users
click 1  → GET /api/orgs/{org}/property-dictionary/operations
           GET /api/sessions/{sid}/note-threads
click 2  → GET /api/sessions/{sid}/note-threads
click 3  → GET /api/orgs/{org}/property-dictionary/operations
           GET /api/sessions/{sid}/note-threads
click 4  → (no new requests)
click 5  → (no new requests)
```

### Trace analysis

- JavaScript: longest `FunctionCall` slices ~38 ms, minified React render / state-set chain.
- Layout: largest `Layout` / `UpdateLayoutTree` ~12 ms — not the bottleneck.
- Paint: no unusually large paint events.
- FPC-OVERLAY-V2: only one `overlays mounted` log at initial load; no re-mounts per selection.
- `emitElementSelection` fires once per click as expected.

## Root causes

### P1 — `NotesMvpPanel` refetches threads on every selection change

**File:** `frontend/src/components/NotesMvpPanel.jsx`

- `fetchThreads` is recreated when `selectedElementId` changes.
- `useEffect([fetchThreads, open])` therefore reruns on every selection change, even when the current scope filter is `"all"` and the element id does not affect the request parameters.
- The request is blocking: `setLoading(true)` runs immediately, causing a skeleton flash and UI jank.

### P2 — No client-side cache for `GET /note-threads`

- Switching back to a previously selected element repeats the same request.
- No TTL-based cache exists in either the API layer or the component.

### P3 — `useNotesPanelController` refetches property dictionary operations

**File:** `frontend/src/components/notesPanel/useNotesPanelController.js`

- Org-level property-dictionary operations are fetched every time the selection becomes editable.
- The list is org-scoped and changes rarely, so it can be safely cached.

## What was ruled out

- **Camunda extensions reconcile:** `reconcileTemplateInsertCamundaStateFromXml` / `transformPersistedXml` are only called on save/import paths, not on selection change.
- **FPC-OVERLAY-V2:** no per-selection overlay re-mounts observed in console or trace.
- **Canvas full re-render:** `BpmnStage` is memoized; selection only updates the SVG selection highlight.
- **Backend latency:** `/note-threads` response time is the dominant part of the 400 ms+ selection time, not processing.

## Fix direction

1. Remove the unnecessary `selectedElementId` dependency from `fetchThreads` when the current scope filter does not filter by element.
2. Add a 30 s client-side cache for note-thread requests keyed by `(session, scopeFilter, elementFilterKey, statusFilter, notificationMode)`.
3. Debounce selection-driven thread fetches by 100 ms so rapid cycling does not fire a request per click.
4. Add a 30 s client-side cache for org property-dictionary operations keyed by `(orgId, revision)`.
5. Force-refresh from cache after note-thread mutations (create / delete / status / etc.).

## Open decisions

- Should the note-thread cache TTL be shorter (5–10 s) for very active collaborators?  
  **Recommendation:** keep 30 s; mutations force-refresh, so user-owned changes are visible immediately.
- Should we also cache `GET /mentionable-users`?  
  **Recommendation:** not needed — it fires once per panel open in the baseline.
