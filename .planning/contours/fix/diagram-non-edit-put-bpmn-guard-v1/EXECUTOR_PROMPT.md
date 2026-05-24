# Agent 2 / Executor Prompt

## Contour
- **ID**: `fix/diagram-non-edit-put-bpmn-guard-v1`
- **Scope**: Frontend bounded guard preventing `PUT /bpmn` or `PATCH /sessions` from non-edit Diagram interactions.
- **Run ID**: `20260515T094031Z-11870`

## What You Must Do

1. **Read planning artifacts**:
   - `PLAN.md`
   - `RUNTIME_NAVIGATION.md`
   - `RUNTIME_PROOF_CHECKLIST.md`
   - `STATE.json`
   - Previous audit/review reports from:
     - `.planning/contours/audit/diagram-property-overlays-performance-gsd-v1/`
     - `.planning/contours/perf/diagram-property-overlays-viewport-culling-v1/`
     - `.planning/contours/fix/bpmn-versions-head-check-dedupe-v1/`

2. **Baseline before code**:
   - Reproduce or attempt to reproduce non-edit `PUT /bpmn` and `PATCH /sessions`.
   - Record exact scenarios (A–E) and request counts.
   - Capture `source_action`, payload keys, hash/size if safe.
   - If not reproducible, perform source forensic and still fix confirmed risky path if source proof is strong.

3. **Source-level forensic**:
   - Identify ALL frontend callers of `PUT /bpmn` (trace from `apiPutBpmnXml` back to UI events).
   - Identify dirty state sources (`setXmlDirty`, `commandStack.changed`, `emitDiagramMutation`).
   - Identify `commandStack` / import / selection / viewbox effects that trigger save.
   - Identify auto-save / background sync paths (`useDiagramMutationLifecycle`, `useAutosaveQueue`, `useProcessTabs`).

4. **Implement bounded guard**:
   - **A**: In `useDiagramMutationLifecycle.js` (`queueDiagramMutation`), skip autosave for non-edit mutation kinds (`commandStack.changed` without explicit command, init/import sources).
   - **B**: In `useBpmnSync.js` (`saveFromModeler`), add same-XML hash guard: skip `saveLocal` if XML hash identical to last saved and source is `autosave`/`tab_switch`.
   - **C**: In `BpmnStage.jsx`, suppress `emitDiagramMutation` during `ensureModeler` / `renderModeler` / `renderViewer` / import paths.
   - **D**: In `createBpmnCoordinator.js` (`doFlush`), extend `SAVE_PERSIST_SKIPPED_UNCHANGED` to also skip for non-explicit reasons even if `localDirty === true`.
   - **E**: In `BpmnStage.jsx`, review `useEffect` hooks (lines ~1395–1471) to ensure none call `saveLocalFromModeler` or `emitDiagramMutation` from prop changes.
   - **F**: Add or update tests for no-autosave-on-non-edit and no-PUT-on-unchanged-XML.
   - **G**: Preserve explicit save (`manual_save`, `publish_manual_save`, `import_bpmn`, `restore_bpmn_version`, `template_apply`).

5. **Validation**:
   - Run relevant frontend tests: `npm test` or targeted test files.
   - Run `npm run build` to ensure no build errors.
   - Runtime scenarios A–E (see `RUNTIME_NAVIGATION.md`).
   - Explicit save safety check if feasible.
   - Check versions head-check dedupe not regressed.
   - Check overlay viewport-culling not regressed.
   - Create evidence files.

6. **Create deliverables**:
   - `EXEC_REPORT.md`
   - `MUTATION_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `READY_FOR_REVIEW`
   - If blocked: `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

## What You Must NOT Do

- Do NOT change backend code.
- Do NOT change storage schema.
- Do NOT change `package.json` or lock files.
- Do NOT remove save/publish/version functionality.
- Do NOT remove property overlays.
- Do NOT rewrite bpmn-js wrapper.
- Do NOT redesign Diagram UI.
- Do NOT change Product Actions/RAG/AG-UI.
- Do NOT commit/push/PR/deploy.
- Do NOT mutate durable truth from non-edit interactions.

## EXEC_REPORT.md Template

```markdown
# EXEC_REPORT — fix/diagram-non-edit-put-bpmn-guard-v1

## Verdict
READY_FOR_REVIEW / EXEC_BLOCKED

## Source Truth
repo, branch, HEAD, origin/main, git status before/after, runtime health.

## Baseline Mutation Evidence
- scenario
- request count
- request details
- source_action/payload keys/hash if safe
- reproducibility

## Root Cause
Concrete source-level explanation.

## Fix Summary
- files changed
- guard implemented
- why explicit save still works
- why non-edit interactions no longer mutate

## Validation
- commands
- test/build results
- runtime scenarios
- before/after request counts
- evidence paths

## Safety
- no backend/schema changes
- no BPMN XML mutation from non-edit
- no Product Actions/RAG/AG-UI changes
- no deploy/PR/merge
```
