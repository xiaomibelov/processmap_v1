# Solution Plan — Canvas element selection lag

## Implemented fixes

### F1 — Stop refetching note threads on every selection change

**File:** `frontend/src/components/NotesMvpPanel.jsx`

- Introduced `elementFilterKey = scopeFilter === "selected_element" ? selectedElementId : ""`.
- Replaced `selectedElementId` in the `fetchThreads` dependency array with `elementFilterKey`.
- Result: when the scope filter is `"all"`, `"diagram"`, `"session"` or `"diagram_element"`, changing the selected BPMN element no longer recreates `fetchThreads` and no request is fired.

### F2 — 30 s client-side cache for note threads

**File:** `frontend/src/components/NotesMvpPanel.jsx`

- Added module-level `noteThreadsCache` with TTL `30_000` ms.
- Cache key: `(sessionId, scopeFilter, elementFilterKey, statusFilter, notificationMode)`.
- `fetchThreads` returns cached data on a hit, skipping network and `setLoading(true)`.
- Mutations force a refresh by calling `fetchThreads({ force: true, ... })`.

### F3 — Debounce selection-driven thread fetches

**File:** `frontend/src/components/NotesMvpPanel.jsx`

- The auto-fetch `useEffect` now schedules `fetchThreads` via a 100 ms `setTimeout`.
- Rapid selection changes cancel the previous timeout, so only the last element triggers a request.
- Manual refresh buttons and mutation callbacks bypass the debounce.

### F4 — 30 s client-side cache for property-dictionary operations

**File:** `frontend/src/components/notesPanel/useNotesPanelController.js`

- Added module-level `dictionaryCache` with TTL `30_000` ms.
- Operations cache key: `(orgId, "operations", revision)`.
- Bundle cache key: `(orgId, "bundle", operationKey:revision)`.
- Result: switching between elements no longer refetches the org-level operations list.

## Verification commands

```bash
# Build
cd /opt/processmap-test/frontend && npm run build

# Relevant tests
cd /opt/processmap-test/frontend
node --test src/lib/api.noteThreads.test.mjs
node --test src/components/NotesMvpPanel.discussions-surface-polish.test.mjs

# Runtime smoke (after local stage deploy)
NODE_PATH=/root/node_modules node .planning/contours/fix/canvas-selection-lag/profile_selection_lag.js
```

## Expected after-fix metrics

- Selection-to-settle time < 100 ms when switching back to a recently selected element.
- No repeated `GET /note-threads` when the scope filter does not depend on the selected element.
- No repeated `GET /property-dictionary/operations` within 30 s.
- Note-thread create/delete still refreshes the list immediately.

## Checkpoint policy

1. ✅ Profile baseline recorded.
2. ✅ Code changes applied.
3. ✅ `npm run build` passed.
4. ✅ Targeted tests passed.
5. ⏳ Local stage deploy + after-fix profile.
6. ⏳ Final review gate before merge/deploy to production.
