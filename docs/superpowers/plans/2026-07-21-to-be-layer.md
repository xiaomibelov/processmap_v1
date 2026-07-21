# To-Be Layer (documents on BPMN canvas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a performant "To-Be" layer: document cards (Google Docs links) as overlays on the BPMN canvas with toggle, search-dim, preview modal, and session persistence.

**Architecture:** HTML overlays via bpmn-js `overlays.add()` (same as V2 overlay cards). Minimal DOM (≤2 nodes/doc), viewport culling, chunked mount (12/frame, epoch token), CSS-class toggle (no unmount), dim via existing `fpcSearchOverlayDim` mechanism. Storage: `to_be_documents` array in the session JSON blob (no backend change). Spec: `docs/superpowers/specs/2026-07-21-to-be-layer-spec.md`.

**Tech Stack:** React 18, Vite, bpmn-js overlays API, node:test, FastAPI (untouched).

---

## File Structure

New files:
- `frontend/src/features/process/tobe/tobeDocumentModel.js` — normalize/validate document records, extract `docId` from URL.
- `frontend/src/features/process/tobe/tobeDocumentModel.test.mjs` — unit tests.
- `frontend/src/features/process/tobe/tobeOverlayRenderer.js` — build the card DOM host (icon+title, ≤2 nodes).
- `frontend/src/features/process/tobe/tobeOverlayRenderer.test.mjs` — unit tests (mock DOM pattern from `v2OverlayRenderer.test.mjs`).
- `frontend/src/features/process/tobe/tobeOverlayCoordinator.js` — mount/clear cards on a bpmn-js instance; reuses chunked mount.
- `frontend/src/features/process/tobe/useTobeLayer.js` — React hook: state, toggle, mount lifecycle.
- `frontend/src/features/process/tobe/TobeDocumentPreviewModal.jsx` — preview modal (iframe + actions).
- `frontend/src/features/process/bpmn/stage/utils/tobeLayerToggleStorage.js` — localStorage persist (pattern: `v2OverlayToggleStorage.js`).

Modified:
- `frontend/src/App.jsx` — `toBeLayerEnabled` state + persist effect, pass down.
- `frontend/src/components/sidebar/displaySettings/DisplaySettingsBlock.jsx` — "Документы" toggle button.
- `frontend/src/components/NotesPanel.jsx` + `frontend/src/components/AppShell.jsx` — prop drilling of toggle (same path as v2OverlaysEnabled).
- `frontend/src/components/process/BpmnStage.jsx` — mount/clear toBe cards, dim selector extension, click handler.
- `frontend/src/features/process/save/...` — include `to_be_documents` in draft serialization (find exact spot in Task 5).
- `frontend/src/styles/legacy/legacy_bpmn.css` — `.fpc-tobe-doc` styles, hidden class, dim class.

---

## Task 1: toBe layer toggle (state, persist, sidebar)

- [ ] **Step 1: storage module test**
Create `frontend/src/features/process/bpmn/stage/utils/tobeLayerToggleStorage.test.mjs` mirroring `v2OverlayToggleStorage` behavior (read default false, write+read true). Run: `node --test <file>` — must FAIL (module missing).
- [ ] **Step 2: storage module**
Create `tobeLayerToggleStorage.js` (copy pattern from `v2OverlayToggleStorage.js`, key `processmap_tobe_layer_enabled`). Run test — PASS.
- [ ] **Step 3: App.jsx state + persist**
In `App.jsx` next to `v2OverlaysEnabled` (line ~900): `const [toBeLayerEnabled, setToBeLayerEnabled] = useState(() => readTobeLayerEnabled());` + persist effect. Import from storage module. Pass `toBeLayerEnabled`/`setToBeLayerEnabled` down through `AppShell.jsx` → `NotesPanel.jsx` alongside the existing v2OverlaysEnabled props (grep `v2OverlaysEnabled` for the exact prop chain).
- [ ] **Step 4: sidebar toggle UI**
In `DisplaySettingsBlock.jsx`: add second `ToggleSwitch` label "Документы" below the V2 one (props `toBeEnabled`, `onToBeEnabledChange`). Update `DisplaySettingsBlock.ui-copy.test.mjs` copy list if it asserts labels. Wire in NotesPanel where `v2Enabled` is passed (NotesPanel.jsx:3277 area).
- [ ] **Step 5: build + commit**
`npm run build` → `git commit -m "feat: toBe documents layer toggle with localStorage persist"`

## Task 2: document overlay renderer + model

- [ ] **Step 1: model test**
`tobeDocumentModel.test.mjs`: `normalizeTobeDocument()` fills defaults (id, visible, color null); `extractGoogleDocId(url)` parses `/document/d/{id}/` from edit/preview/export URLs, returns "" for non-Google URLs. Run — FAIL.
- [ ] **Step 2: model**
`tobeDocumentModel.js` implementing the above (pure functions, pattern: `overlayColorModel.js`). Run — PASS.
- [ ] **Step 3: renderer test**
`tobeOverlayRenderer.test.mjs` (mock DOM from `v2OverlayRenderer.test.mjs`): `createTobeDocumentHost(doc)` returns `{ host, position }`; host has classes `fpc-tobe-doc`, `data-fpc-element-id`, `data-fpc-tobe-doc-id`; ≤2 child nodes; title text truncated input handled. Run — FAIL.
- [ ] **Step 4: renderer**
`tobeOverlayRenderer.js`: builds `<div class="fpc-tobe-doc">` with inline SVG icon (background or single element) + `<span class="fpc-tobe-doc-title">`. Position `{ top: doc.y, left: doc.x }` relative to anchor element (if `anchorElementId`) else absolute. Run — PASS.
- [ ] **Step 5: CSS**
`legacy_bpmn.css`: `.fpc-tobe-doc` (120×40px, slate-50 bg, 1px slate-200 border, 3px left accent via `--fpc-tobe-accent`, 9px font, cursor pointer, transition opacity .2s), `.fpc-tobe-hidden .fpc-tobe-doc { display:none }`, `.fpc-tobe-doc.fpcSearchOverlayDim` (reuse dim values).
- [ ] **Step 6: build + commit**
`npm run build` → commit `feat: toBe document overlay renderer (icon+title, minimal DOM)`

## Task 3: coordinator with chunked mount + BpmnStage integration

- [ ] **Step 1: coordinator test**
`tobeOverlayCoordinator.test.mjs`: `createTobeOverlayCoordinator({ enabledRef })` with fake bpmn-js instance (overlays.add/remove spies, elementRegistry stub — pattern from `v2OverlayCoordinator.test.mjs`). `mount(inst, docs)` adds overlays for visible docs only; `clear(inst)` removes them; >12 docs → chunked (first 12 sync, rest after yield — assert via fake rAF). Run — FAIL.
- [ ] **Step 2: coordinator**
`tobeOverlayCoordinator.js`: `mount(inst, kind, docs)` — filter `visible !== false`, viewport culling via same viewbox logic (import `applyViewportCulling`-equivalent or replicate minimal bounds check), first 12 sync then `scheduler.yield()`/rAF chunks with epoch token (copy pattern from PR #580 `v2OverlayCoordinator.js` — factor the chunk helper into `tobe` module to avoid touching V2 code). `clear(inst, kind)` removes all doc overlays. Run — PASS.
- [ ] **Step 3: BpmnStage wiring**
In `BpmnStage.jsx`: accept `toBeLayerEnabled`, `toBeDocuments` props (add to props drilling from ProcessStage; default `[]`). New effect: when `toBeLayerEnabled` and definitions loaded → `tobeCoordinator.mount(modelerRef.current, "editor", toBeDocuments)`; on disable → toggle `fpc-tobe-hidden` class on canvas container instead of clear. Click handling: reuse existing overlay click delegation — in `overlayLifecycleManager.js` `handleV2OverlayClick` extend selector to also match `.fpc-tobe-doc` and route to `onTobeDocumentClick` callback prop.
- [ ] **Step 4: build + test + commit**
`npm run build`, overlay tests pass → commit `feat: toBe overlay coordinator with chunked mount and BpmnStage integration`

## Task 4: preview modal

- [ ] **Step 1: modal component**
`TobeDocumentPreviewModal.jsx` (shell pattern from `DrawioEditorModal.jsx`): props `{ doc, onClose }`. Shows title, iframe `https://docs.google.com/document/d/{docId}/preview` only when `docId` present; else placeholder "Превью недоступно". Buttons: «Открыть в Google Docs» (`/edit`, target _blank), «Скачать PDF» (`/export?format=pdf`), «Копировать ссылку» (navigator.clipboard), «Закрыть» (Escape + backdrop click).
- [ ] **Step 2: wire open state**
BpmnStage/ProcessStage: `activeTobeDocument` state set by `onTobeDocumentClick`; render modal when set.
- [ ] **Step 3: build + commit**
`npm run build` → commit `feat: toBe document preview modal with actions`

## Task 5: search dim integration

- [ ] **Step 1: extend dim selector**
In `BpmnStage.jsx` `applySearchOverlayDimOnInstance` (added in #579): selector `.fpc-overlay-v2-host` → `.fpc-overlay-v2-host, .fpc-tobe-doc`; match by `data-fpc-element-id`. Docs without anchor stay bright.
- [ ] **Step 2: test + build + commit**
Manual reasoning + existing search tests pass → commit `feat: dim toBe documents outside search matches`

## Task 6: persist to_be_documents in save pipeline

- [ ] **Step 1: find serialization spot**
`grep -rn "drawio_elements_v1" frontend/src/features/process/save/` to find where drawio elements enter the draft payload; add `to_be_documents` alongside (read from a ref populated by `useTobeLayer`; hydrate back on session load).
- [ ] **Step 2: hydrate on load**
On session load, pass `draft.to_be_documents` into BpmnStage as `toBeDocuments` (through the existing overlay layers props builder `buildProcessDiagramOverlayLayersProps.js`).
- [ ] **Step 3: build + test + commit**
`npm run build`, save-pipeline tests pass → commit `feat: persist to_be_documents in session save pipeline`

## Task 7: add-document form (Phase 1 minimal)

- [ ] **Step 1: panel + form**
Small "Документы" section: list current docs + add form (URL, title, anchor = currently selected element or none). On submit → `normalizeTobeDocument` → append to state → remount.
- [ ] **Step 2: build + commit**
`npm run build` → commit `feat: add toBe document via form`

## Task 8: final verification

- [ ] `npm run build` ✅
- [ ] `node --test` on all touched modules ✅
- [ ] Push branch `feat/to-be-layer`, open PR to `main` with the report. **Do NOT merge.**
