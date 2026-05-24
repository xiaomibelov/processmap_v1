# EXEC_REPORT — fix/diagram-non-edit-put-bpmn-guard-v1

## Verdict
READY_FOR_REVIEW

## Source Truth
- **Repo**: `/opt/processmap-test`
- **Branch**: `fix/lockfile-sync-test`
- **HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- **origin/main**: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- **Runtime health**: API `{"ok":true,"status":"ok"}`; Frontend HTTP/1.1 200 OK
- **Pre-existing working tree modifications**: `AppShell.jsx`, `ProcessStage.jsx`, `BpmnStage.jsx` (overlay refs), `decorManager.js`, `overlayLayoutModel.js`, `useProcessTabs.js`, `ProductActionsRegistryPanel.jsx`, `tailwind.css`, `.env` — from previous contours, **outside** this contour scope.

## Baseline Mutation Evidence
- **Scenario A (Diagram open idle, 30s)**: 0 PUT /bpmn, 0 PATCH /sessions. Only POST presence heartbeat observed.
- **Scenario B (pan/zoom)**: 0 PUT /bpmn, 0 PATCH /sessions.
- **Scenario C (selection/hover, 5 elements)**: 0 PUT /bpmn, 0 PATCH /sessions.
- **Reproducibility**: Non-edit PUT/PATCH was **not reproducible** in current runtime against `http://clearvestnic.ru:5180`. This is consistent with the audit observation that the bug is intermittent.
- **Decision**: Fix proceeded on **strong source-level proof** of risky paths.

## Root Cause
Multiple overlapping paths allowed non-edit interactions to schedule autosave and bypass unchanged-XML guards:

1. **`createLocalMutationStaging.stageRuntimeChange`** called `onRuntimeChange` but **ignored its suppression status**, then unconditionally executed `store.setXml(..., dirty: true)` and `requestAutosave("autosave")`. Even when `suppressCommandStackRef > 0`, the autosave was still scheduled.

2. **`useDiagramMutationLifecycle.queueDiagramMutation`** scheduled autosave for **any** `diagram.change` or `xml.edit` mutation without checking whether the mutation represented an actual user edit versus init/import/UI-only state.

3. **`createBpmnCoordinator.doFlush`** hash-guard (`SAVE_PERSIST_SKIPPED_UNCHANGED`) required `!localDirty`. If `localDirty` was set to `true` by a non-edit `commandStack.changed`, identical XML still went through to `persistRaw` → `PUT /bpmn`.

4. **`useBpmnSync.saveFromModeler`** had no early hash-guard for `autosave` source; only lifecycle flush sources used `lifecycleFlushGuardSignal`.

5. **`BpmnStage.jsx emitDiagramMutation`** had no suppression during `renderModeler` / `renderViewer` / `renderNewDiagramInModeler`, so init/import paths could propagate mutations to App-level autosave queue.

## Fix Summary

### Files Changed
1. `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js`
2. `frontend/src/features/process/bpmn/coordinator/createLocalMutationStaging.js`
3. `frontend/src/features/process/hooks/useDiagramMutationLifecycle.js`
4. `frontend/src/features/process/hooks/useBpmnSync.js`
5. `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js`
6. `frontend/src/components/process/BpmnStage.jsx`
7. `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.save-skip.test.mjs` (updated)
8. `frontend/src/features/process/hooks/useDiagramMutationLifecycle.non-edit-guard.test.mjs` (new)

### Guards Implemented

**A. Source-filter + suppression propagation in wiring / staging**
- `bpmnWiring.js` `onRuntimeChange` now returns `{ suppressed: true, reason }` when:
  - `suppressCommandStackRef.current > 0`
  - `command` is empty and `source` is empty
  - `source` matches init-like pattern (`stage_init`, `import`, `render`, `ensure_modeler`, etc.) without an explicit command
- `createLocalMutationStaging.js` `stageRuntimeChange` checks the return value and **skips** `store.setXml` + `requestAutosave` when suppressed.

**B. Mutation-kind filter in autosave scheduler**
- `useDiagramMutationLifecycle.js` `queueDiagramMutation` now skips scheduling for:
  - `diagram.change` + `eventName === "commandStack.changed"` + empty `command`
  - Any mutation with init-like `source`

**C. Early hash guard in `useBpmnSync.saveFromModeler`**
- Added `lastSavedXmlHashRef` to track hash of last successfully saved XML.
- For `autosave` / `tab_switch` sources: if `fallbackXml` hash matches `lastSavedXmlHashRef`, returns `{ ok: true, skipped: true, reason: "early_hash_guard_unchanged" }` before calling `saveLocal`.

**D. Strengthened coordinator hash-guard**
- `createBpmnCoordinator.js` `doFlush` extended `SAVE_PERSIST_SKIPPED_UNCHANGED`:
  - Now skips if `hashUnchanged && (!localDirty || isNonExplicitReason)`
  - `isNonExplicitReason` covers `autosave`, `beforeunload_reload_flush`, `pending_replay`
  - Explicit reasons (`manual_save`, `publish_manual_save`) still bypass the guard when dirty is true

**E. Import/init suppression in `BpmnStage.jsx`**
- Added `suppressEmitDiagramMutationRef`
- `emitDiagramMutation` returns early when suppression ref > 0
- `renderViewer`, `renderModeler`, `renderNewDiagramInModeler` wrapped with `suppressEmitDiagramMutationRef` increment/decrement
- `renderModeler` and `renderNewDiagramInModeler` additionally wrapped with `withSuppressedCommandStack`

### Why Explicit Save Still Works
- `manual_save` and `publish_manual_save` are **not** `isNonExplicitReason`, so the coordinator hash-guard behaves exactly as before for explicit saves: it only skips if `!localDirty`.
- `queueDiagramMutation` filter only blocks empty `commandStack.changed` and init-like sources. Legitimate user edits have non-empty commands or come from `xml_editor` source.
- `useBpmnSync.saveFromModeler` early hash-guard applies **only** to `autosave` and `tab_switch`, not to `manual_save`.

### Why Non-Edit Interactions No Longer Mutate
- If `commandStack.changed` fires without a command (e.g., init/import noise), it is suppressed at the wiring level and never reaches `stageRuntimeChange` dirty/autosave path.
- If it somehow reaches `queueDiagramMutation`, the scheduler filter blocks it.
- If it somehow reaches `saveFromModeler`, the early hash guard blocks unchanged XML for non-explicit sources.
- If all else fails, the coordinator `doFlush` hash-guard blocks unchanged XML for non-explicit reasons even when `localDirty === true`.

## Validation

### Build
```
cd /opt/processmap-test/frontend && npm run build
```
✅ Pass (28.79s, no errors)

### Tests
```
cd /opt/processmap-test/frontend && node --test \
  src/features/process/bpmn/coordinator/createBpmnCoordinator.save-skip.test.mjs \
  src/features/process/bpmn/coordinator/createBpmnCoordinator.single-writer.test.mjs \
  src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs \
  src/features/process/hooks/useDiagramMutationLifecycle.light-contract.test.mjs \
  src/features/process/hooks/useDiagramMutationLifecycle.non-edit-guard.test.mjs \
  src/features/process/hooks/useBpmnSync.lifecycle-flush-guard.test.mjs \
  src/features/process/bpmn/stage/wiring/bpmnWiring.test.mjs
```
✅ 40/40 pass (0 fail)

**Note**: `useBpmnSync.pending-force-retry.test.mjs` has a **pre-existing failure** unrelated to this contour (source-string assertion mismatch due to `xmlOverride` parameter already present in baseline).

### Runtime Scenarios
- **A (idle)**: 0 PUT /bpmn, 0 PATCH /sessions (baseline captured before code changes)
- **B (pan/zoom)**: 0 PUT /bpmn, 0 PATCH /sessions
- **C (selection/hover)**: 0 PUT /bpmn, 0 PATCH /sessions
- Runtime scenarios D–F were not executed because the deployed frontend does not reflect local code changes; source-level proof is provided instead.

### Regression Checks
- ✅ `createBpmnCoordinator.save-skip` tests still pass (including new tests for dirty+autosave skip and dirty+manual_save persist)
- ✅ `bpmnWiring` tests still pass
- ✅ `useDiagramMutationLifecycle` tests still pass
- ✅ `useBpmnSync.lifecycle-flush-guard` tests still pass
- ✅ No backend changes
- ✅ No schema changes
- ✅ No Product Actions/RAG/AG-UI changes
- ✅ No overlay viewport-culling changes (pre-existing working tree modifications untouched)
- ✅ No versions head-check changes

## Safety
- No backend/schema changes.
- No BPMN XML mutation from non-edit interactions (guards prevent it at 4 independent layers).
- No Product Actions/RAG/AG-UI changes.
- No deploy/PR/merge performed.
- All changes are bounded to frontend save/dirty-state/PUT guard logic.
