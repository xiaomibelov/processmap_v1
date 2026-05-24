# fix/diagram-non-edit-put-bpmn-guard-v1

## GSD Discipline

- **GSD availability check performed**: `2026-05-15T09:42:33Z`
- **Commands executed**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd` (found)
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50 skills found
  - `gsd` without args → shows usage with commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init
- **GSD mode used**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Implementation**: not performed by Agent 1
- **Product files**: not modified by Agent 1
- **Contour**: bounded to frontend save/dirty-state/PUT guard logic only
- **Agent 2 / Agent 3 gates**: prepared in this plan

## Previous Evidence Source Truth

### audit/diagram-property-overlays-performance-gsd-v1
- **Status**: REVIEW_PASS (Agent 3 confirmed)
- **Key finding**: `PUT /api/sessions/{id}/bpmn` succeeded without user pressing explicit Save.
- **Network evidence**: Request 46 during ~4 min observation. User did not press Save.
- **Hypothesis H8**: "Mutation on non-edit interaction" — ranked "likely".
- **Source evidence**: `BpmnStage.jsx` `saveLocalFromModeler()` called from `commandStack.changed` and other eventBus handlers. `emitDiagramMutation` propagates to App which triggers autosave.

### perf/diagram-property-overlays-viewport-culling-v1
- **Status**: REVIEW_PASS
- **Relevance**: Overlay DOM count reduced. Confirmed pan/zoom do NOT trigger PUT /bpmn in that contour.

### fix/bpmn-versions-head-check-dedupe-v1
- **Status**: REVIEW_PASS
- **Relevance**: Versions spam reduced ~80%. Confirmed no new PUT /bpmn or PATCH introduced.

## Source / Runtime Truth

- **Working directory**: `/opt/processmap-test`
- **Host**: `clearvestnic.ru`
- **User**: `root`
- **Branch**: `fix/lockfile-sync-test`
- **HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- **origin/main**: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- **Runtime health**: API `{"ok":true,"status":"ok"}`; Frontend HTTP/1.1 200 OK
- **Pre-existing working tree modifications**: `frontend/src/components/AppShell.jsx`, `ProcessStage.jsx`, `BpmnStage.jsx`, `decorManager.js`, `overlayLayoutModel.js`, `useProcessTabs.js`, `ProductActionsRegistryPanel.jsx`, `tailwind.css`, `.env` — these are from previous contours and are **outside** this contour scope.

## Problem Statement

In the audit contour `audit/diagram-property-overlays-performance-gsd-v1`, Agent 3 independently confirmed:

> `PUT /api/sessions/{id}/bpmn` succeeded (request 46) during a ~4-minute observation where the user **did not** press an explicit Save button.

This is dangerous because:
1. **Performance**: mutation requests trigger cascades (version updates, refetches, sync indicators, toasts, history checks, expensive React state updates).
2. **Data integrity**: non-edit interactions (pan, zoom, hover, selection, overlay visibility, tab switch, UI-only state) must not mutate durable BPMN truth.

We need to understand:
- Who calls `PUT /bpmn`.
- Why dirty/save guard treats non-edit interaction as a change.
- What `source_action` / base version / headers are sent.
- Whether XML is really changed or the request is identical.
- Why the guard does not block identical XML / non-edit states.
- Where to place the minimal safe guard.

## Exact Reproduction Plan

See `RUNTIME_NAVIGATION.md` for navigation instructions.

### Scenario A — Diagram open idle
1. Open runtime at `http://clearvestnic.ru:5180`.
2. Open session `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный`.
3. Open Diagram tab.
4. Do not edit anything.
5. Wait 30 seconds.
6. Track: `PUT /api/sessions/{id}/bpmn`, `PATCH /api/sessions/{id}`, `POST/PUT/PATCH` any diagram/session endpoint, `GET /bpmn/versions?limit=1`, console errors.

### Scenario B — pan/zoom
1. Diagram loaded.
2. Pan canvas.
3. Zoom in/out.
4. Do not edit anything.
5. Track mutation requests.

### Scenario C — selection/hover
1. Hover 5–10 BPMN elements.
2. Select 5–10 BPMN elements.
3. Open/close property overlay/details.
4. Do not change fields.
5. Track mutation requests.

### Scenario D — tab switch
1. Diagram → Analysis → Diagram.
2. Diagram → XML → Diagram.
3. Do not edit anything.
4. Track mutation requests.

### Scenario E — property sidebar non-edit
1. Select BPMN element.
2. Open property panel/sidebar.
3. Focus field but do not change.
4. Blur.
5. Collapse/expand panel.
6. Do not save.
7. Track mutation requests.

### Scenario F — explicit save/edit control
1. Use a safe test session if available.
2. Perform a minimal explicit edit (e.g., change a label).
3. Click Save or press Ctrl+S.
4. Verify `PUT /bpmn` is called with `source_action: manual_save`.
5. If not safe, use source-level proof and skip destructive runtime edit.

## Mutation Network Evidence Plan

Track every mutation request:
- `PUT /api/sessions/{id}/bpmn`
- `PATCH /api/sessions/{id}`
- `POST /api/sessions/{id}/...`
- any `/bpmn` mutation
- any `diagram_state` mutation

For each:
- scenario
- timestamp
- preceding UI action
- URL, method, status
- payload keys, payload size
- `source_action` if present
- `base_diagram_state_version` if present
- `bpmn_xml` hash if present/safe
- response status
- whether request was expected

**Mutation rule**: Non-edit scenarios must produce **0** PUT/PATCH mutation requests.

## Source Map

### 1. BPMN Wiring — commandStack → dirty → emitMutation
- **Path**: `frontend/src/features/process/bpmn/stage/wiring/bpmnWiring.js`
- **Function**: `ensureBpmnCoordinator` → `onRuntimeChange`
- **Lines**: ~200–230
- **Role**: Listens to `commandStack.changed` from bpmn-js modeler. If `suppressCommandStackRef.current > 0`, ignores. Otherwise calls `state.setXmlDirty(true)` and `callbacks.emitDiagramMutation("diagram.change", { eventName: "commandStack.changed", ... })`.
- **Why it may trigger non-edit PUT**: `commandStack.changed` can fire during import/init or from extension syncs that touch moddle properties. `suppressCommandStackRef` exists but may not cover all paths.
- **Safe change area**: Strengthen `suppressCommandStackRef` coverage; add source-filter before `emitDiagramMutation`.
- **Forbidden area**: Do not remove `commandStack.changed` listener entirely (breaks explicit edit detection).

### 2. BPMN Coordinator — flushSave / scheduleSave
- **Path**: `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js`
- **Function**: `flushSave`, `scheduleSave`, `doFlush`
- **Lines**: ~606–750
- **Role**: Receives save reason, gets XML from runtime, compares hash, decides whether to call `persistRaw` → `saveRaw` → `apiPutBpmnXml`.
- **Why it may trigger non-edit PUT**: `flushSave` has a hash-guard (`SAVE_PERSIST_SKIPPED_UNCHANGED`) but it requires `!localDirty && currentXmlHash === localHash`. If `localDirty` was set to `true` by a non-edit `commandStack.changed`, the hash guard is bypassed.
- **Safe change area**: Strengthen hash-guard to apply even when `localDirty === true` if XML is identical and reason is non-explicit (e.g., `autosave`, `tab_switch`).
- **Forbidden area**: Do not change `persistRaw` or `saveRaw` signatures.

### 3. BPMN Persistence — saveRaw → apiPutBpmnXml
- **Path**: `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`
- **Function**: `saveRaw`
- **Lines**: ~594–700
- **Role**: Calls `apiPutBpmnXml(sid, xml, { source_action, base_diagram_state_version, ... })`.
- **Why it may trigger non-edit PUT**: This is the final frontier. If called, it always PUTs. No additional guard here yet.
- **Safe change area**: Add `source_action` whitelist check before calling `apiPutBpmnXml`.
- **Forbidden area**: Do not change backend endpoint or storage schema.

### 4. BpmnStage — saveLocalFromModeler / emitDiagramMutation
- **Path**: `frontend/src/components/process/BpmnStage.jsx`
- **Functions**: `saveLocalFromModeler`, `emitDiagramMutation`, `withSuppressedCommandStack`
- **Lines**: `saveLocalFromModeler` ~4861; `emitDiagramMutation` ~1761; `withSuppressedCommandStack` nearby
- **Role**: `emitDiagramMutation` is called from:
  - `commandStack.changed` (via bpmnWiring `onRuntimeChange`)
  - `ensureModeler` / `renderModeler` / `renderViewer` (~3796, 3871, 3884, 3897, 3903)
  - `updateXmlDraft` (~1789)
- **Why it may trigger non-edit PUT**: `ensureModeler` and `renderModeler` call `emitDiagramMutation("diagram.change", ...)` during modeler initialization/import. This schedules an autosave even though no user edit occurred.
- **Safe change area**: Suppress `emitDiagramMutation` during init/import; add source-action filter.
- **Forbidden area**: Do not change `apiPutBpmnXml` call signature; do not remove explicit save paths.

### 5. Diagram Mutation Lifecycle — autosave queue
- **Path**: `frontend/src/features/process/hooks/useDiagramMutationLifecycle.js`
- **Function**: `queueDiagramMutation`, `commitDiagramAutosave`
- **Lines**: ~80–220
- **Role**: Receives mutation from `queueDiagramMutation`, schedules autosave via `useAutosaveQueue` (350ms debounce), then calls `bpmnSync.saveFromModeler()` or `saveFromXmlDraft()`.
- **Why it may trigger non-edit PUT**: Any mutation kind starting with `diagram.` or `xml.` schedules an autosave. There is no check whether the mutation represents an actual user edit vs. init/import/UI-only state.
- **Safe change area**: Add mutation-kind filter: skip autosave for `commandStack.changed` without explicit user action; skip for init/import reasons.
- **Forbidden area**: Do not change `useAutosaveQueue` internals.

### 6. Autosave Queue
- **Path**: `frontend/src/features/process/hooks/useAutosaveQueue.js`
- **Function**: `schedule`, `flush`, `runOne`
- **Role**: Generic debounced queue (380ms default). Flushes on `beforeunload` and `visibilitychange`.
- **Why it may trigger non-edit PUT**: It faithfully executes whatever is scheduled. The problem is upstream scheduling.
- **Safe change area**: None needed here; fix upstream.
- **Forbidden area**: Do not change generic queue behavior.

### 7. Process Tabs — tab switch flush
- **Path**: `frontend/src/features/process/hooks/useProcessTabs.js`
- **Function**: `flushBpmnTab`, `flushFromActiveTab`
- **Lines**: ~348, 491, 959, 972
- **Role**: Calls `bpmnSync.flushFromActiveTab(current, { force: true, source: "tab_switch", reason })` when switching tabs.
- **Why it may trigger non-edit PUT**: Tab switch forces a save with `force: true`. If dirty flag is set from a non-edit interaction, this flushes it.
- **Safe change area**: Ensure `flushFromActiveTab` uses `lifecycleFlushGuardSignal` (already present in `useBpmnSync.js`) to skip when no dirty delta.
- **Forbidden area**: Do not remove tab-switch flush entirely (needed for explicit edits).

### 8. useBpmnSync — saveFromModeler / flushFromActiveTab
- **Path**: `frontend/src/features/process/hooks/useBpmnSync.js`
- **Function**: `saveFromModeler`, `flushFromActiveTab`
- **Lines**: `saveFromModeler` ~235; `flushFromActiveTab` ~512
- **Role**: `saveFromModeler` calls `bpmnRef.current?.saveLocal` (which is `saveLocalFromModeler`). Already has `lifecycleFlushGuardSignal` for lifecycle sources.
- **Why it may trigger non-edit PUT**: `saveFromModeler` only applies lifecycle guard when `isLifecycleFlushSource(source)` is true. `autosave` is NOT a lifecycle flush source, so the guard is bypassed.
- **Safe change area**: Extend lifecycle guard to `autosave` source, or add hash-guard in `saveFromModeler` directly.
- **Forbidden area**: Do not change `flushFromActiveTab` contract.

### 9. ProcessStage — queueDiagramMutation wrapper
- **Path**: `frontend/src/components/ProcessStage.jsx`
- **Function**: `queueDiagramMutation`
- **Lines**: ~1767
- **Role**: Sets `saveDirtyHint(true)`, refreshes undo/redo state, builds owner snapshot, then calls `queueDiagramMutationRaw` (from `useDiagramMutationLifecycle`).
- **Why it may trigger non-edit PUT**: It propagates every mutation downstream without filtering.
- **Safe change area**: Add filter before calling `queueDiagramMutationRaw`.
- **Forbidden area**: Do not remove `saveDirtyHint` or owner snapshot logic for legitimate edits.

## Root-Cause Hypotheses

### H1. `commandStack.changed` fires during modeler import/init and marks dirty
- **Rank**: **High**
- **Evidence**: `bpmnWiring.js` `onRuntimeChange` has `suppressCommandStackRef` guard, but `BpmnStage.jsx` `ensureModeler` / `renderModeler` also call `emitDiagramMutation("diagram.change", ...)` directly (~3796, 3871, 3884, 3897, 3903). These paths may not suppress commandStack consistently.
- **Verification needed**: Check if `emitDiagramMutation` is called during Diagram tab open without any user edit.

### H2. Canvas viewbox/pan/zoom stored in BPMN XML save path
- **Rank**: **Low**
- **Evidence**: `canvas.viewbox.changed` listener in `wireBpmnStageRuntimeEvents.js` does NOT call `emitDiagramMutation`. It only calls `applyPropertiesOverlayDecorForZoomChange`. Pan/zoom was verified safe in previous contour.
- **Verification needed**: Re-confirm in runtime.

### H3. Selection/hover/property overlay updates mutate extension state or model properties
- **Rank**: **Medium**
- **Evidence**: `syncCamundaExtensionsToModeler` is called inside `saveLocalFromModeler` before serializing XML. If overlay visibility triggers extension sync, the modeler may register a commandStack change.
- **Verification needed**: Check if overlay open/close causes `commandStack.changed`.

### H4. Property sidebar focus/blur writes draft/property state through BPMN save path
- **Rank**: **Medium**
- **Evidence**: Property overlay uses `useBpmnSettledDecorFanout` which calls `syncCamundaExtensionsToModeler`. This could touch moddle properties.
- **Verification needed**: Check if property panel focus/blur triggers `commandStack.changed`.

### H5. XML tab transition normalizes/reformats XML and marks it changed
- **Rank**: **Medium**
- **Evidence**: Switching XML ↔ Diagram calls `flushFromActiveTab` with `force: true`. If the XML draft differs from modeler XML due to formatting, it may trigger a save.
- **Verification needed**: Compare XML hash before and after tab switch.

### H6. Dirty check compares object identity / formatted XML rather than normalized hash
- **Rank**: **High**
- **Evidence**: `createBpmnCoordinator.js` `doFlush` compares `fnv1aHex(xml)` to `localHash`, but only skips if `!localDirty`. If `localDirty` is true (set by any `commandStack.changed`), identical XML still goes through.
- **Verification needed**: Check if `localDirty` is true after non-edit interactions.

### H7. Auto-save/background sync lacks explicit user-action source guard
- **Rank**: **High**
- **Evidence**: `useDiagramMutationLifecycle.js` `queueDiagramMutation` schedules autosave for ANY `diagram.` or `xml.` mutation kind. There is no whitelist of user-action kinds.
- **Verification needed**: Check mutation kinds that reach `queueDiagramMutation` during non-edit scenarios.

### H8. Effect dependencies unstable and trigger save on tab/ready signal
- **Rank**: **Medium**
- **Evidence**: `useBpmnSettledDecorFanout.js` uses `readySignal` but it is now stabilized. Other effects in `BpmnStage.jsx` (lines 1395–1471) sync props to refs and may trigger callbacks.
- **Verification needed**: Check if `saveLocalFromModeler` is called from effects other than autosave queue.

### H9. Base version/session state update triggers save replay
- **Rank**: **Low**
- **Evidence**: `createBpmnCoordinator.js` has `pendingReplay` logic, but this requires an explicit prior save failure.
- **Verification needed**: Check if pending replay fires without prior save.

### H10. Property overlay culling/decor updates trigger commandStack indirectly
- **Rank**: **Low**
- **Evidence**: Overlay viewport culling was fixed in previous contour. No overlay code was found to call modeler commands.
- **Verification needed**: Confirm no regression.

### H11. Development StrictMode exposes non-idempotent import/save effect
- **Rank**: **Low**
- **Evidence**: Production build; StrictMode irrelevant.

### H12. Save path lacks identical XML hash guard at autosave entry
- **Rank**: **High**
- **Evidence**: `useBpmnSync.js` `saveFromModeler` does NOT compare XML hash before calling `saveLocal`. It only uses `lifecycleFlushGuardSignal` for lifecycle sources. `autosave` bypasses this.
- **Verification needed**: Check XML hash before `saveLocal` call during autosave.

## Bounded Fix Strategy

### A. Explicit source-action / mutation-kind guard in autosave scheduler
**File**: `frontend/src/features/process/hooks/useDiagramMutationLifecycle.js`
**Change**: In `queueDiagramMutation`, before calling `scheduleDiagramAutosave`, check the mutation kind and payload:
- Skip autosave if `mutationKind === "diagram.change"` and `payload.eventName === "commandStack.changed"` and `payload.command` is empty or unknown.
- Skip autosave if `mutation.source` indicates init/import (`"stage_init"`, `"import"`, `"render"`, `"ensure_modeler"`).
- Allow autosave for explicit kinds: `xml.edit` with `source === "xml_editor"`, `diagram.change` with a known user command.

### B. Same-XML hash guard in `saveFromModeler`
**File**: `frontend/src/features/process/hooks/useBpmnSync.js`
**Change**: In `saveFromModeler`, before calling `saveLocal`, compute hash of `fallbackXml` and compare with last known saved hash (from `draftRef.current?.bpmn_xml_version` or a cached hash ref). If identical AND source is `autosave` or `tab_switch`, skip the save and return `{ ok: true, skipped: true, unchanged: true }`.

### C. Import/init guard in BpmnStage
**File**: `frontend/src/components/process/BpmnStage.jsx`
**Change**: Wrap `emitDiagramMutation` calls inside `ensureModeler`, `renderModeler`, `renderViewer`, and any import path with `withSuppressedCommandStack` or a new `suppressEmitDiagramMutationRef` guard. Ensure that modeler initialization does not emit mutation events.

### D. Strengthen coordinator hash-guard
**File**: `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js`
**Change**: In `doFlush`, extend the `SAVE_PERSIST_SKIPPED_UNCHANGED` condition:
- Also skip if `currentXmlHash === localHash` AND reason is non-explicit (e.g., `autosave`, `tab_switch`, `pending_replay`) even if `localDirty === true`.
- Explicit saves (`manual_save`, `publish_manual_save`) must still proceed if dirty is true (product requirement).

### E. Effect dependency stabilization
**File**: `frontend/src/components/process/BpmnStage.jsx`
**Change**: Review `useEffect` hooks around lines 1395–1471 that sync props to refs. Ensure none of them call `saveLocalFromModeler` or `emitDiagramMutation` as a side effect of prop changes.

### F. Non-edit mutation test guard
**File**: Add or update tests in:
- `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.save-skip.test.mjs`
- `frontend/src/features/process/hooks/useDiagramMutationLifecycle.test.mjs` (if exists)
**Change**: Add tests that assert no autosave is scheduled for `commandStack.changed` without a command, and no PUT occurs when XML hash is unchanged.

### G. Preserve explicit save
- Ensure `manual_save`, `publish_manual_save`, `import_bpmn`, `restore_bpmn_version`, `template_apply` still call `PUT /bpmn`.
- Ensure `ctrl+S`, Save button, Publish button, Version creation still work.

## Acceptance Criteria

Agent 3 should pass only if:

1. Non-edit Diagram idle produces **0** `PUT /bpmn` and **0** `PATCH /sessions` over 30-second observation.
2. Pan/zoom produces **0** `PUT /bpmn` and **0** `PATCH /sessions`.
3. Hover/selection/overlay visibility produces **0** `PUT /bpmn` and **0** `PATCH /sessions`.
4. Tab switch Analysis ↔ Diagram and XML ↔ Diagram produces **0** `PUT /bpmn` and **0** `PATCH /sessions` unless user explicitly edited/saved.
5. Property sidebar open/focus/blur without value change produces **0** durable mutation requests.
6. Explicit save/edit path is preserved: either runtime verified on safe test session, or source-level proof with no destructive runtime edit.
7. Same XML hash guard or equivalent proof exists: identical XML does not PUT.
8. Import/init does not mark dirty as user edit.
9. No backend/schema changes.
10. No BPMN XML mutation from non-edit interactions.
11. No Product Actions/RAG/AG-UI changes.
12. No regression to overlay viewport-culling, versions head-check dedupe, or history modal.
13. Console/network has no new relevant errors.

## Non-goals

- Do not fix versions head-check spam here.
- Do not change history modal/version list behavior.
- Do not alter backend BPMN save endpoint.
- Do not change storage schema.
- Do not remove save/publish/version functionality.
- Do not remove property overlays.
- Do not rewrite bpmn-js wrapper.
- Do not redesign Diagram UI.
- Do not change Product Actions/RAG/AG-UI.
- Do not introduce new dependencies.
- Do not hide mutation requests in logs; prevent them at source.
- Do not disable explicit save.

## Agent 2 Execution Plan

1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`, previous audit/review reports.
2. Baseline before code: reproduce or attempt to reproduce non-edit PUT/PATCH; record exact scenarios and request counts.
3. Source-level forensic: identify all frontend callers of `PUT /bpmn`, dirty state sources, commandStack/import/selection/viewbox effects, auto-save/background sync paths.
4. Implement bounded guards per "Bounded Fix Strategy" section.
5. Validation: run relevant frontend tests/build, runtime non-edit scenarios A–E, explicit save safety check.
6. Create `EXEC_REPORT.md`, `MUTATION_BEFORE_AFTER.md`, `IMPLEMENTATION_NOTES.md`, `READY_FOR_REVIEW`.
7. If blocked: `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

## Agent 3 Review Plan

1. Read `PLAN.md`, `EXEC_REPORT.md`, `MUTATION_BEFORE_AFTER.md`, `IMPLEMENTATION_NOTES.md`, `RUNTIME_PROOF_CHECKLIST.md`.
2. Use Playwright/browser review against `http://clearvestnic.ru:5180`.
3. Verify all acceptance criteria (1–13).
4. If even minor issue remains: `CHANGES_REQUESTED`, `REWORK_REQUEST.md`, no `REVIEW_PASS`.
5. If pass: `REVIEW_REPORT.md`, `REVIEW_PASS`.

## Risks

1. **Plausible floating bug**: The observed PUT in audit may not reproduce every time. Agent 2 must still fix confirmed risky paths with source proof.
2. **Pre-existing working tree**: Multiple frontend files are already modified from previous contours. Agent 2 must stay bounded and not mix changes.
3. **Autosave is by design**: The product may intentionally autosave some changes. Any suppression must not break legitimate explicit-save flows.
4. **Hash comparison cost**: Computing XML hash on every autosave candidate adds CPU. FNV-1a is fast; acceptable for bounded guard.
5. **commandStack.changed ambiguity**: Some legitimate user edits also come through `commandStack.changed` without a specific command name. Guard must not over-suppress.

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Previous audit/review evidence read
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Exact non-edit PUT/PATCH reproduction plan defined
- [x] Gate 5 — Network mutation evidence plan defined
- [x] Gate 6 — Source map captured
- [x] Gate 7 — Root-cause hypotheses ranked
- [x] Gate 8 — Bounded fix strategy defined
- [x] Gate 9 — Non-goals locked
- [x] Gate 10 — Acceptance criteria defined
- [x] Gate 11 — Agent 2 executor prompt ready (EXECUTOR_PROMPT.md)
- [x] Gate 12 — Agent 3 reviewer prompt ready (REVIEWER_PROMPT.md)
- [ ] Gate 13 — READY_FOR_EXECUTION marker created
