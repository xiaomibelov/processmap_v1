# 5-Plane Analysis — Canvas element selection lag

## 1. Code plane

**What the repo actually contains:**

- `NotesMvpPanel.jsx` `fetchThreads` depends on `selectedElementId`, causing a network request whenever the user selects a different BPMN element, regardless of whether the current scope filter uses that id.
- `NotesMvpPanel.jsx` has no client-side cache for `apiListNoteThreads`.
- `useNotesPanelController.js` has no client-side cache for `apiListOrgPropertyDictionaryOperations`.
- `BpmnStage.jsx` selection handling emits one event per click; no expensive reconcile/transform is triggered.

**Intent vs. served mismatch:**

- User expects selection change to be fast (<100 ms). Code currently waits for a fresh `/note-threads` round-trip before settling the sidebar.
- User expects no redundant requests. Code refetches threads and property-dictionary operations on each selection change.

## 2. Workspace plane

**Branch/checkout:**

- Fix branch: `fix/canvas-selection-lag`.
- Base equals `origin/main` at `5de2752f...`.
- Working tree is clean except for untracked `.planning` contour notes from unrelated contours.

**Isolation:**

- The fix touches only `NotesMvpPanel.jsx` and `useNotesPanelController.js`.
- No overlap with the previously deployed `fix/camunda-import-hydrate-stage` contour.

## 3. Data plane

- `/note-threads` is read-only; caching does not change durable state.
- `/property-dictionary/operations` is read-only; caching does not change durable state.
- Note-thread mutations (create, delete, status change) explicitly force-refresh the cache, so user actions remain immediately visible.
- No data migration needed.

## 4. Environment / compose plane

- Stage stack: `processmap_stage` on `clearvestnic.ru:5177`.
- No compose/env changes required.
- After fix: frontend build must succeed (`npm run build`).

## 5. Serving plane

**Stage runtime at audit start:**

- `/version` returned commit `672b89fd`, branch `feature/save-decomposition-v1`.
- The local stage is served by Docker compose on `clearvestnic.ru:5177`.

**What to verify after deploy:**

- `/version` shows the new fix commit.
- Selection-to-settle time on `clearvestnic.ru:5177` < 100 ms.
- No `GET /note-threads` when switching back to a recently selected element within 30 s.
- No `GET /property-dictionary/operations` when switching between elements within 30 s.
- Note-thread create/delete still refreshes the list.

## Risk matrix

| Change | Risk | Mitigation |
|--------|------|------------|
| Remove `selectedElementId` from `fetchThreads` deps for non-element scopes | Low | Only affects scope filter `"all"`/`"diagram"`/`"session"`; `"selected_element"` still refetches via `elementFilterKey`. |
| 30 s note-threads cache | Low | Mutations force-refresh; stale data only visible if another user changes threads, which is acceptable for 30 s. |
| 100 ms debounce on selection-driven fetches | Low | Skeleton appears after debounce; UI selection highlight is immediate. |
| 30 s property-dictionary operations cache | Low | Revision key invalidates cache on dictionary edits. |

## Go/no-go

- **Code plane:** GO — minimal targeted changes, no broad refactor.
- **Workspace plane:** GO — isolated branch.
- **Data plane:** GO — no durable side effects.
- **Env/compose plane:** GO — no infra changes.
- **Serving plane:** GO — will verify on `clearvestnic.ru:5177` after local deploy.
