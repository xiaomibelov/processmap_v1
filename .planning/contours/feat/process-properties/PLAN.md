# Plan: Process-level properties (Camunda Modeler parity)

**Contour:** `feat/process-properties` · branch from `origin/main` · PR → approval → merge (no self-merge)
**Workspace:** `.planning/contours/feat/process-properties/{PLAN.md,STATE.json}` + Obsidian mirror via `tools/pm-agent-mirror-report.sh`

## Why canvas click deselects today

- Selection is driven **only** by bpmn `selection.changed` (`wireBpmnStageRuntimeEvents.js` L444-472 viewer / L649-677 editor). Empty-canvas click → `newSelection=[]` → branch emits `emitElementSelectionChange(null)` → `App.handleBpmnElementSelect` (`App.jsx` L2090) → `setSelectedBpmnElement(null)` → NotesPanel `isElementMode=false` (L1236) → empty sidebar.
- `isSelectableElement` (`BpmnStage.jsx` L1689-1694, duplicated in `selectionFocusDecor.js` L9-28) excludes lane/participant/process/collaboration/laneset **by design**.
- Good news: the whole property machinery is **id-generic** — draft cache key `"<sid>::<elementId>"`, modeler read `getElementCamundaExtensionsFromModeler(id)` → `registry.get(id)`, executor `applyCamundaExtensionStateToModeler(id,…)` → `registry.get(id)` + `modeling.updateProperties(el,{extensionElements})`, save `setElementCamundaExtensions(id,…)` → `saveBpmnState` → coordinator `flushSave` → `saveXML`. The bpmn:Process root **is** in the elementRegistry, so process id works end-to-end with **zero changes** to the property/save core.
- Backend stores XML as-is (no schema validation); `extract_camunda_extensions_from_bpmn_xml` (backend) and `extractCamundaExtensionsMapFromBpmnXml` (frontend) already walk **every** node with an id → process-level `camunda:properties` are picked up on reload automatically.

## Design (single approach — Option A: "process as a selection")

Make the canvas-empty click select the root process-like element and let it flow through the **existing** selection → sidebar → save pipeline. No changes to the property draft/executor/save code; work is confined to selection routing, sidebar presentation, and overlay guards.

Root resolution: `canvas.getRootElement()`; process-like = `bo.$type` ∈ {`bpmn:Process`, `bpmn:Collaboration`} (subprocess drill-down root is **not** process-like → keeps current deselect behavior; noted limitation).

## File-by-file changes

**1. NEW `frontend/src/features/process/bpmn/stage/interaction/processRootSelection.js`** (pure, unit-tested)
- `isProcessLikeType(type)` — regex for process/collaboration.
- `resolveProcessLikeRootElement(inst)` — `canvas.getRootElement()`; returns the element only when its `$type` is process-like; fallback: `definitions.rootElements[0]` when it is a `bpmn:Process`.

**2. `wireBpmnStageRuntimeEvents.js`** — in **both** `selection.changed` handlers, replace the empty-selection branch (keep import-guard first):
- resolve root via `resolveProcessLikeRootElement(inst)`; if found → `clearSelectedDecor` (drop previous marker, **no** focus-dimming) + add subtle `fpcProcessSelected` class on the canvas container + `selectedMarkerStateRef.current[kind]=root.id` + `emitElementSelection(rootEl, "<kind>.canvas_process_select")`.
- else → current null path.
- Add `element.hover` / `element.out` listeners (both bindings): when `event.element` is the root → toggle `fpcCanvasProcessHoverHint` class on the canvas container (hover hint requirement).

**3. `BpmnStage.jsx`**
- Extend `isSelectableElement` (L1689-1694): allow `bpmn:Participant` and `bpmn:Lane` (still exclude label/process/collaboration/laneset — process enters only via the canvas-click branch above).
- `setSelectedDecor` stays guarded; the process branch in #2 does its own lightweight marker (no `applySelectionFocusDecor` dimming for root — would dim the whole diagram).

**4. `selectionFocusDecor.js`** — mirror the `isSelectableElement` change (L9-28) so participant/lane selections get the standard marker/focus treatment like any task.

**5. `NotesPanel.jsx`**
- `isProcessLikeSelection = isProcessLikeType(selectedElementType)` next to L1236.
- **Header:** when process-like → «Процесс: {name || id}» instead of element name (header spot: `selectedElementName` consumer ~L2942; exact JSX located during implementation).
- **Section gating:** process-like → render only the «Свойства» accordion with the camunda properties group (titled «Свойства процесса»); hide flow-node-only sections (operation/robotMeta, sequence paths, time, notes/docs stay in their current global mode). The group itself needs **no changes** — it is id-generic; operation/dictionary UI already self-gates on task-like types.
- **Overlay preview gate:** suppress `selectedPropertiesOverlayPreview` dispatch for process-like selection (no legacy overlay card for the root — it has no geometry).

**6. `decorManager.js`** (`applyPropertiesOverlayDecor`, ~L1758) — after building `previewByElementId`, drop entries whose registry element is process-like root (defense for "always" mode: a process id in the always-map would otherwise render a legacy card at 0,0).

**7. `bpmnOverlayParser.js`** (`extractOverlaysFromBpmn`, L336) — exclude process-like roots from the shape filter so global V2 mode never mounts a card for the root (V2 auto-mode already culls it via the 20px size gate; the list path has no gate).

**8. CSS `05-02-bpmn-text-contrast.css`** — `.fpcCanvasProcessHoverHint .djs-container` subtle background tint (hover hint) + `.fpcProcessSelected` subtle inner outline (selected-process marker). No existing canvas-hover rules conflict.

**9. Tests**
- Pure-node: `processRootSelection.test.mjs` (resolver: process/collaboration/subprocess/no-defs cases); `bpmnOverlayParser` test — process element with properties excluded from `extractOverlaysFromBpmn`.
- E2E `frontend/e2e/process-properties.spec.mjs` (stage-reusable, boot pattern from `v2-overlay-persistence.spec.mjs`):
  1. click empty canvas → sidebar «Процесс: …» + `camunda-properties-group` visible;
  2. add property → Сохранить всё → `GET /api/sessions/{id}/bpmn` contains `<camunda:property …>` under `<bpmn:process>` extensionElements;
  3. reload → click canvas → property row restored;
  4. edit + delete → save → XML reflects both;
  5. regression: click task → element properties add/save still works; Escape → empty sidebar; no console errors.

**10. Verification & release**
- `node --test` full sweep vs `/tmp/fails_main.txt` baseline (must stay 53=53); foundation guard 10/10; `npm run build`.
- Deploy branch to stage (frontend-only image rebuild, as in the v2-overlay contour) → run new spec on stage → PASS gate.
- `git push` → `gh pr create` (feat/process-properties → main). **No merge without explicit approval.**

## Workspace persistence (per request)

- `.planning/contours/feat/process-properties/PLAN.md` (this plan) + `STATE.json` (state machine: planned → in-progress → stage-verified → pr-open).
- Obsidian mirror: `tools/pm-agent-mirror-report.sh "feat/process-properties" planner` after PLAN.md exists; handoff note at the end (§8 proof).

## Risks / limitations

- **Participant/lane selectability** touches the shared `isSelectableElement` — mitigated: changes are additive, decor paths are geometry-safe (verified: no NaN/crash; focus-dim treats them like tasks).
- **Drill-down (subprocess) canvas click** keeps old deselect behavior (subprocess root not treated as process-like).
- Process properties appear **only** in the sidebar (no overlay card for the root — by design).
- Stage currently serves the v2-overlay-persistence branch (PR #522, awaiting approval); deploying this branch replaces it — both PRs stay open for your approval; branch provenance will be stated in the final report.
- No backend changes; no AGENTS.md changes (no workflow change).
