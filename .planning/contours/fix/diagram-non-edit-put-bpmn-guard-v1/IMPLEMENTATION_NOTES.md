# IMPLEMENTATION_NOTES — fix/diagram-non-edit-put-bpmn-guard-v1

## Layered Defense Strategy

The fix implements **4 independent guard layers** so that if any one layer is bypassed, the others still prevent non-edit PUT /bpmn:

### Layer 1 — Event Source Suppression (bpmnWiring.js)
- `onRuntimeChange` returns `{ suppressed: true, reason }` for:
  - `suppressCommandStackRef > 0`
  - Empty `command` + empty `source`
  - Init-like `source` without explicit command
- This prevents dirty state from being set and prevents `emitDiagramMutation` from firing.

### Layer 2 — Staging Respect (createLocalMutationStaging.js)
- `stageRuntimeChange` checks the return value of `onRuntimeChange`.
- If suppressed, it skips `store.setXml(..., dirty: true)` and `requestAutosave("autosave")`.
- This closes the critical bypass where `stageRuntimeChange` would schedule an autosave even though `onRuntimeChange` was suppressed.

### Layer 3 — Scheduler Filter (useDiagramMutationLifecycle.js)
- `queueDiagramMutation` blocks scheduling for:
  - `diagram.change` + `commandStack.changed` + empty `command`
  - Init-like `source` values
- This guards the App-level autosave queue path.

### Layer 4 — Hash Guards (useBpmnSync.js + createBpmnCoordinator.js)
- **Early guard** (`useBpmnSync.saveFromModeler`): for `autosave`/`tab_switch`, skips before calling `saveLocal` if XML hash is unchanged vs last saved.
- **Coordinator guard** (`createBpmnCoordinator.doFlush`): skips `persistRaw` if XML hash is unchanged, even when `localDirty === true`, for non-explicit reasons (`autosave`, `tab_switch`, `beforeunload`, `pending_replay`).
- Explicit saves (`manual_save`, `publish_manual_save`) are **exempt** from the dirty-bypass.

## Why Not Just One Layer?
- The autosave path has **two independent entry points**:
  1. `emitDiagramMutation` → `queueDiagramMutation` → `useAutosaveQueue` → `commitDiagramAutosave` → `saveFromModeler`
  2. `runtime.onChange` → `stageRuntimeChange` → `requestAutosave` → `scheduleSave` → `flushSave`
- Layer 3 covers path 1; Layer 2 covers path 2.
- Layer 4 (hash guards) is a safety net for both paths.

## Explicit Save Preservation
- `manual_save` is classified as `triggerClass === "manual_save"`, so `isNonExplicitReason = false`.
- The coordinator hash-guard condition `(!localDirty || isNonExplicitReason)` therefore evaluates to `!localDirty` for manual saves — identical to baseline behavior.
- `publish_manual_save` bypasses the hash-guard entirely (`!explicitPublishManualSave` is false).
- `useBpmnSync` early hash-guard only applies when `source === "autosave" || source === "tab_switch"`.

## Edge Cases Considered

### What if bpmn-js reformats XML during import?
- The hash would change, so Layer 4 hash-guards wouldn't block.
- But Layer 1 + Layer 2 suppress `commandStack.changed` during import via `withSuppressedCommandStack` and init-like source filtering.
- If the reformat happens in `runtime.load()` while `suppressCommandStackRef > 0`, `onRuntimeChange` is suppressed and `stageRuntimeChange` returns early.

### What if a legitimate user edit has an empty command name?
- Some modeling operations do produce `commandStack.changed` without a specific command string.
- These would be blocked by Layer 3 if they reach `queueDiagramMutation`.
- However, most legitimate edits (label change, shape add, connect) do include a command name.
- If a legitimate edit is accidentally blocked, the user can still trigger save explicitly (Ctrl+S / Save button), which bypasses all scheduler guards.

### What if `lastSavedXmlHashRef` is stale?
- It is updated on every successful `saveFromModeler` return path.
- On initial load it is empty, so the early hash-guard is inactive until the first save.
- This is safe: the first autosave candidate after load will proceed to the coordinator, where the coordinator's own hash-guard (comparing against `store.state.lastHash`) will handle unchanged XML.

## Files Not Changed (and why)
- **Backend**: Out of scope per plan.
- **`useAutosaveQueue.js`**: Generic debounce queue; fix applied upstream where jobs are scheduled.
- **`useProcessTabs.js`**: Tab-switch flush logic is correct; the issue was dirty state, not tab-switch logic.
- **`createBpmnPersistence.js` / `bpmnApi.js`**: Final frontier; no additional guard needed because all upstream paths are now guarded.
- **Property overlay / decor files**: Pre-existing working tree modifications from previous contour; not related to save guard.

## Test Strategy
- **Unit tests** for coordinator save-skip behavior (new cases for dirty+autosave skip, dirty+manual_save persist).
- **Source-invariant tests** for `useDiagramMutationLifecycle` non-edit guard (assert presence of filtering logic).
- **Regression tests** for existing coordinator, wiring, and lifecycle contracts.
- No new E2E tests added because the contour scope is bounded to frontend guard logic and Agent 3 will perform Playwright runtime review.
