# Templates BPMN Fragment Cross-Session Factpack

Updated: 2026-03-05

## 0) Repo Snapshot

- Branch / HEAD: `feat/d6-ci-critical-smoke-v1` @ `1acb257`
- `git status -sb`:
  - `M docker-compose.yml`
  - `M frontend/src/features/templates/model/useTemplatesStore.js`
  - `M frontend/src/lib/api.js`
- Latest `cp/*` tags (10):
  - `cp/d6_smoke_done_20260305_134027`
  - `cp/d6_smoke_start_20260305_133740`
  - `cp/decompose_d5_3_done_20260305_133646`
  - `cp/decompose_d5_3_start_20260305_133201`
  - `cp/templates_fix_align_done_20260305_132849`
  - `cp/decompose_d5_2_done_20260305_123306`
  - `cp/templates_fix_align_start_20260305_132232`
  - `cp/decompose_d5_1_done_20260305_121706`
  - `cp/decompose_d5_2_start_20260305_122140`
  - `cp/decompose_d5_1_start_20260305_120228`

## 1) Templates Entry Points (UX → Store → Services → API)

| Action | Function | File:line | Notes |
|---|---|---|---|
| Open Add Template modal | `openCreateTemplateModal` prop wiring | `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx:226` | Button `data-testid="btn-add-template"` |
| Open Templates picker | `openTemplatesPicker` prop wiring | `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx:237` | Button `data-testid="btn-templates"` |
| Render Create modal | `<CreateTemplateModal />` | `frontend/src/features/process/stage/ui/ProcessDialogs.jsx:193` | Modal mounting in stage dialogs |
| Render Templates picker | `<TemplatesPicker />` | `frontend/src/features/process/stage/ui/ProcessDialogs.jsx:212` | Picker mounting in stage dialogs |
| Stage bridge init | `useTemplatesStageBridge(...)` | `frontend/src/components/ProcessStage.jsx:1085` | Stage gives bridge only |
| Store init | `useTemplatesStore(...)` | `frontend/src/components/ProcessStage.jsx:1103` | Stage passes bridge fns + callbacks |
| Load templates (both scopes) | `loadTemplatesForScopes` | `frontend/src/features/templates/model/useTemplatesStore.js:36` | Calls API adapter for personal/org |
| Save from selection | `saveCurrentSelectionAsTemplate` | `frontend/src/features/templates/model/useTemplatesStore.js:165` | Branch by `createType` |
| Apply template | `applyTemplate` | `frontend/src/features/templates/model/useTemplatesStore.js:258` | Branch by `template_type` |
| Build BPMN payload | `buildTemplateFromSelection` | `frontend/src/features/templates/services/buildTemplateFromSelection.js:13` | Current `bpmn_selection_v1` |
| Build hybrid stencil payload | `buildHybridStencilTemplate` | `frontend/src/features/templates/services/buildHybridStencilTemplate.js:17` | Current `hybrid_stencil_v1` |
| Apply BPMN selection | `applyTemplateToDiagram` | `frontend/src/features/templates/services/applyTemplateToDiagram.js:9` | Uses `bpmnApi.selectElements(...)` |
| API adapter list/create/patch/delete | `listTemplates/createTemplate/...` | `frontend/src/features/templates/api/index.js:43` | Fallback to local storage on 404/405/501 |
| Canonical FE routes | `apiRoutes.templates.*` | `frontend/src/lib/apiRoutes.js:56` | Canonical `/api/templates...` |
| FE API request methods | `apiListTemplates/apiCreateTemplate/...` | `frontend/src/lib/api.js:398` | Concrete fetch wrappers |

## 2) Current Placement Mode + Ghost Pipeline (hybrid_stencil_v1)

| Stage | Function | File:line | Reuse for BPMN fragment placement |
|---|---|---|---|
| Start placement from template apply | `startHybridStencilPlacement` | `frontend/src/features/process/hybrid/controllers/useHybridPipelineController.js:628` | Pattern for entering placement mode |
| Stage bridge to hybrid placement | `applyHybridStencilTemplate` | `frontend/src/components/ProcessStage.jsx:1100` | Existing bridge callback from templates |
| Placement state + ghost | `ghostPreview` state | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:156` | Same UX pattern (ghost + click confirm) |
| Activate stencil tool mode | `startStencilPlacement` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:484` | Switches tool to `template_stencil` |
| Place by click | `placeStencilAt` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:504` | Clones with new ids + inserts |
| Placement click handler | `onOverlayPointerDown` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:858` | Calls place when tool is stencil |
| Ghost move handler | `onOverlayPointerMove` | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:898` | Updates ghost position |
| Ghost rendering | `HybridGhostRenderer` | `frontend/src/features/process/hybrid/renderers/HybridGhostRenderer.jsx:10` | Already supports group ghost |
| Persist after placement | `persistHybridV2Doc(...)` inside place | `frontend/src/features/process/hybrid/tools/useHybridToolsController.js:544` | Persist entrypoint pattern |
| Redis lock-busy handling | `useHybridPersistController` (`LOCK_BUSY`) | `frontend/src/features/process/hybrid/controllers/useHybridPersistController.js:71` | Retry/toast behavior can be mirrored if BPMN insert persists through session save |

## 3) BPMN Modeler API Availability (runtime facts)

### 3.1 Public imperative API reachable via `bpmnRef.current`

| API | File:line | Capability |
|---|---|---|
| `getSelectedElementIds(options)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:405` | Read current BPMN selection ids |
| `selectElements(ids, options)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:410` | Programmatic selection/focus |
| `captureTemplatePack(options)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:442` | Capture selected nodes + internal sequence flows |
| `insertTemplatePack(payload)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:454` | Insert captured fragment into current modeler |
| `applyCommandOps(payload)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:464` | Apply BPMN command ops |
| `getCanvasSnapshot(options)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:511` | Viewbox snapshot |
| `getElementBounds(id, options)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:516` | Element bbox |
| `onCanvasViewboxChanged(listener)` | `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js:521` | Viewbox subscription |

### 3.2 Existing fragment capture/insert implementation internals

| Internal service | File:line | Notes |
|---|---|---|
| `selection` | `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:51` | Reads selected nodes |
| `elementRegistry` | `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:124` | Enumerates shapes + edges |
| `modeling` | `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:231` | `createShape`, `connect`, `updateLabel` |
| `elementFactory` | `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:232` | Creates BPMN shapes |
| `canvas` | `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:233` | Root/parent access |
| Lane map by name | `readLaneMap` + laneHint | `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:63` | Reparent to lane when hint exists |
| Internal flow filtering | sequence-only and both ends selected | `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js:126` | Exactly required for fragment payload |

### 3.3 Where this API is mounted

- `BpmnStage` exposes imperative api via ref: `frontend/src/components/process/BpmnStage.jsx:4290`
- Ready sentinel exists: `data-testid="diagram-ready"` at `frontend/src/components/process/BpmnStage.jsx:4314`
- `ProcessStage` already passes `bpmnRef` into templates bridge/store: `frontend/src/components/ProcessStage.jsx:1089`

## 4) Implementation Analysis: BPMN Fragment Template without UI changes

### 4.1 Builder location (save template)

Recommendation (P0): implement builder in templates services, but delegate extraction to existing modeler capture API.

- Best place:
  - `useTemplatesStore.saveCurrentSelectionAsTemplate(...)` branch by new `template_type`.
  - New service (suggested): `frontend/src/features/templates/services/buildBpmnFragmentTemplate.js`
- Capture source:
  - `bpmnRef.current.captureTemplatePack(...)` (already exists and tested via adapter).
- Payload shape target:
  - New `template_type = "bpmn_fragment_v1"`
  - `payload.fragment.nodes[]`, `payload.fragment.edges[]`, `payload.entryNodeId`, `payload.exitNodeId`, `payload.hints`.
- Why this is lowest-risk:
  - Internal flows/entries/exits/lane hints are already computed in `templatePackAdapter` (`:126..205`).
  - Avoids reimplementing graph extraction inside templates UI/store.

### 4.2 Insert location (apply in Session B with placement mode)

Recommendation (P0): keep apply entry in templates store, add new branch for `bpmn_fragment_v1`, reuse placement UX pattern, but execute insertion through BPMN insert API.

- Best place:
  - `useTemplatesStore.applyTemplate(...)` add branch:
    - `bpmn_selection_v1` -> keep current select behavior
    - `hybrid_stencil_v1` -> keep current hybrid placement behavior
    - `bpmn_fragment_v1` -> new BPMN placement mode
- Insert execution:
  - call `bpmnRef.current.insertTemplatePack({ pack, mode, ... })`.
- Placement click mechanics:
  - Reuse current “placement mode + ghost + ESC cancel” orchestration pattern from hybrid tools (`useHybridToolsController`).
  - For target lane/pool by click, extend insert path to resolve anchor-by-point:
    - Option A (minimal change): on click select anchor BPMN element under cursor, then call existing `insertTemplatePack`.
    - Option B (cleaner): extend insert API to accept `anchorPoint`/`anchorId` and resolve parent in adapter.

## 5) Contracts and Risks (must not break)

### 5.1 Contracts to preserve

1. Redis lock-busy semantics on session save (`409/423`) for any BPMN mutation path.
2. E2E readiness anchor `data-testid="diagram-ready"` must remain stable.
3. Canonical API routes from D4 (`/api/templates` family), no new alias fanout.
4. Backward compatibility for existing template types:
   - `bpmn_selection_v1`
   - `hybrid_stencil_v1`
5. Performance constraint: no heavy graph recomputation on every mouse move in placement.

### 5.2 P0 scope risks and guardrails

| Risk | Impact | P0 guardrail |
|---|---|---|
| Nested/expanded subprocess boundaries | Wrong parenting/invalid insert | Restrict P0 to task/event/gateway + sequence flows; reject unsupported node types with explicit warning |
| Boundary events/message flows | Broken semantics on clone | Do not include these in P0 fragment capture; skip with warning |
| Lane/pool mismatch in target session | Elements inserted to wrong parent | Use lane hints best-effort; fallback to anchor parent; return warnings |
| Layout collisions | Overlap inserted nodes with existing shapes | Keep offset placement and allow manual move; collision-avoidance as P1 |
| Silent save failure after insert | User sees inserted nodes then loses after reload | Keep existing persist + lock-busy retry semantics, surface error/toast on failure |

## 6) Touch List (files-candidates)

### 6.1 Mandatory files

| File | Why | What to change |
|---|---|---|
| `frontend/src/features/templates/model/types.js` | New type normalization | Add `bpmn_fragment_v1` into `TEMPLATE_TYPES` and normalize flow |
| `frontend/src/features/templates/model/useTemplatesStore.js` | Save/apply orchestration lives here | Add create/apply branches for `bpmn_fragment_v1`; wire placement mode start/apply |
| `frontend/src/features/templates/services/` (new builder/apply files) | Keep business logic out of stage | Add `buildBpmnFragmentTemplate` and `applyBpmnFragmentTemplate` service layer |
| `frontend/src/features/templates/services/useTemplatesStageBridge.js` | Bridge to bpmnRef | Expose capture/insert helpers for fragment path (through imperative API) |
| `backend/app/routers/templates.py` | Accept new template type | Extend `_normalize_template_type` + payload validation for `bpmn_fragment_v1` |
| `backend/app/storage.py` | Persist/normalize new type | Extend `_normalize_template_type` to keep `bpmn_fragment_v1` |

### 6.2 Optional / likely needed

| File | Why | What to change |
|---|---|---|
| `frontend/src/features/process/bpmn/stage/template/templatePackAdapter.js` | Already does capture/insert | Optional: add anchor-by-point API for true click placement into lane/pool |
| `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js` | Public imperative surface | Optional: expose `insertTemplatePackAtPoint` if adapter extended |
| `frontend/src/components/ProcessStage.jsx` | Stage bridge only | Minimal wiring only if store requires extra callbacks |
| `frontend/e2e/template-packs-save-insert.spec.mjs` | Existing near-identical flow | Reuse/extend as cross-session acceptance spec |
| `frontend/e2e/templates-basic-add-apply.spec.mjs` | Existing templates smoke | Add assertion for new type path once enabled |

## 7) Draft Implementation Plan (no code, D0–D7)

1. **D0 — Type + payload contract**
   - Introduce `bpmn_fragment_v1` in FE/BE normalizers and API DTO validation.
2. **D1 — Capture builder service**
   - Add service calling `bpmnApi.captureTemplatePack`; map result to template payload.
3. **D2 — Save flow integration**
   - Extend create modal/store save path to emit `bpmn_fragment_v1` without UI redesign.
4. **D3 — Apply placement mode integration**
   - Add `applyTemplate` branch for `bpmn_fragment_v1`, enter placement mode and show ghost.
5. **D4 — Insert execution**
   - On click, resolve anchor/target parent and call `insertTemplatePack`; persist + feedback.
6. **D5 — Error handling**
   - Handle unsupported nodes, missing lane, and lock-busy save paths deterministically.
7. **D6 — Cross-session e2e**
   - Reuse `template-packs-save-insert.spec.mjs` path as canonical test for new type.
8. **D7 — Gates + rollout guard**
   - Build + enterprise baseline + hybrid/templates smoke + new fragment smoke.

## 8) Existing test evidence already close to requested scenario

- `frontend/e2e/template-packs-save-insert.spec.mjs` already validates:
  - save selected BPMN fragment in Session A
  - switch to Session B
  - apply and verify inserted tasks/flows in XML
- Current gap: this flow is not fully integrated into canonical templates type/store path (`bpmn_fragment_v1`) and placement UX is not unified under templates store contract.

