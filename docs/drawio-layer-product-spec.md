# Draw.io Layer Product Spec + Editor Lifecycle Spec

**Branch:** `fix/drawio-stability-v2`
**HEAD at time of writing:** `b0a242b`
**Date:** 2026-03-08
**Status:** LOCKED — do not relax any contract below without an explicit, reproducible regression

---

## Overview

This document formalises the product-level contracts for the draw.io overlay layer.
It is the second-layer spec: the technical baseline (file inventory, frozen hooks,
release-gate commands) lives in `docs/drawio-runtime-baseline.md`.

**Model:**

```
┌───────────────────────────────────────────────────────────┐
│  BPMN process canvas  (process truth, always primary)     │
├───────────────────────────────────────────────────────────┤
│  draw.io overlay      (visual annotations, secondary)     │
│   ├── Runtime mode  (quick in-canvas edits)               │
│   └── Full-editor mode  (rich authoring, explicit open)   │
└───────────────────────────────────────────────────────────┘
```

draw.io is an overlay. It annotates the BPMN canvas. It never owns the process.

---

## Contract 1 — BPMN-First

**Rule:** BPMN is the sole process truth. draw.io is a visual overlay and nothing more.

| Allowed | Forbidden |
|---|---|
| draw.io elements anchor visually to the canvas viewport | draw.io creating process nodes (tasks, gateways, etc.) |
| draw.io storing its own document XML and SVG cache | draw.io storing BPMN structure, lanes, or connections |
| draw.io meta living inside `bpmn_meta.drawio` | draw.io replacing or duplicating any BPMN field |
| draw.io read-accessing the BPMN viewport (zoom, pan) | draw.io writing to the BPMN diagram model |
| draw.io elements having offset positions within the viewport | draw.io elements having BPMN element IDs as their own identity |

**Why this matters:** If draw.io ever becomes a second process orchestrator, the
entire session model breaks. BPMN editor is the source of truth. draw.io cannot
"remember" a process or carry state that BPMN should own.

**Enforcement:** `drawioMeta.js`, `drawioEntityKinds.js`, `overlayEntityAdapter.js`.
Any mutation that touches both BPMN model and draw.io overlay in the same call is a
contract violation.

---

## Contract 2 — Entry-Point

**Rule:** Embedded runtime mode and full-editor mode are separate entry points with
separate triggers. Neither auto-activates the other.

```
User action               → Correct entry point
─────────────────────────────────────────────────
Click existing object     → Runtime mode selection (no editor opens)
Press ArrowKey on object  → Runtime mode nudge (no editor opens)
Drag existing object      → Runtime mode move (no editor opens)
Toggle "Draw" mode on     → Runtime mode activated
Click "Edit in draw.io"   → Full editor opens (explicit user intent only)
Import .drawio file       → Full editor opens after import
```

**Forbidden patterns:**
- Any runtime interaction that silently opens the full editor iframe
- Full editor auto-opening on diagram load, page switch, or viewport change
- Runtime mode persisting a draw.io `doc_xml` that was never explicitly saved via
  the full editor

**Enforcement:** `drawioCreateGuard.js` (entry guard), `DrawioEditorModal.jsx`
(explicit trigger only), `drawio-overlay-runtime-entry-contract.spec.mjs` (gate).

---

## Contract 3 — Runtime Capabilities

**What runtime mode CAN do:**

| Capability | How |
|---|---|
| Select a draw.io element | Click on element in edit mode |
| Move a draw.io element | Drag, or ArrowKey nudge (12px / 24px with Shift) |
| Delete a draw.io element | Delete or Backspace key when selected |
| Place a new rect | Select "rect" tool → click-to-place |
| Place a new text | Select "text" tool → click-to-place |
| Place a container | Select "container" tool → click-to-place |
| Toggle draw.io layer visible/hidden | Layers popover toggle |
| Change draw.io opacity | Layers popover opacity slider |
| Switch between view and edit mode | Layers popover mode switch |

**What runtime mode CANNOT do:**

| Forbidden | Reason |
|---|---|
| Complex draw.io shapes beyond rect/text/container | Full editor only |
| Editing element labels inline | Full editor only |
| Creating connectors/edges | Full editor only |
| Changing element styles (colours, borders, fill) | Full editor only |
| Multi-select or group operations | Full editor only |
| Undo/redo within the draw.io doc | Full editor only |
| Copy-paste draw.io elements | Full editor only |

**Tool allowlist (enforced by `drawioCreateGuard.js`):**
```
CANVAS_CREATE_TOOL_IDS = ["rect", "text", "container"]
```
No other tool ID is honoured in runtime placement.

---

## Contract 4 — Anchoring

**Rule:** A draw.io element placed at a given position on the canvas MUST stay at
that position relative to BPMN content across all viewport transformations.

**Anchoring invariants:**

| Scenario | Expected behaviour |
|---|---|
| User zooms in | draw.io elements scale with BPMN elements — same visual relationship |
| User pans | draw.io elements pan with BPMN elements — no drift |
| Zoom + pan combined | No positional error accumulates |
| Page reload | Element appears at the saved offset position — no jump on first render |
| Tab switch (Diagram → Interview → Diagram) | Element stays at same position |
| Fullscreen toggle | No positional jump |

**Shared viewport is mandatory.** draw.io overlay and BPMN canvas use the same
zoom/pan matrix. `useBpmnViewportSource` → `useOverlayViewportSync` form the
locked chain. Any code that applies a separate transform to the draw.io layer
without going through this chain breaks the anchoring contract.

**Offset model:**
- Each draw.io element has `offset_x` and `offset_y` in diagram coordinates.
- These are applied on top of the shared viewport matrix.
- `offset_x = 0, offset_y = 0` means the element sits at the diagram origin.
- Offset mutations are write-once-then-persist: after `applyDrawioMutation`,
  the offset is immediately reflected in `drawioMetaRef.current` and persisted
  through `persistDrawioMetaOrdered`.

**Enforcement:** `drawio-browser-runtime-anchoring.spec.mjs`,
`drawio-visual-scale-parity.spec.mjs`, `drawio-pan-jitter-coupling.spec.mjs`.

---

## Contract 5 — Full Editor Lifecycle

**Rule:** The full editor (draw.io iframe) has a defined lifecycle with explicit
transitions. No implicit transitions are allowed.

```
Lifecycle:
  CLOSED
    │
    ├──[user clicks "Edit in draw.io"]──► OPENED
    │                                         │
    │                                         ├──[user clicks Save]──► SAVED → CLOSED
    │                                         │
    │                                         └──[user clicks Close/×]──► CLOSED (no save)
    │
    └──[user imports .drawio file]──► OPENED (pre-loaded with file content)
```

**At OPENED:**
- The draw.io iframe is shown
- The current `doc_xml` (if any) is loaded into the iframe
- No automatic save occurs
- Runtime mode is paused (not interactive while editor is open)

**At SAVED:**
- `doc_xml` is updated from the editor payload
- `svg_cache` is regenerated from the editor SVG output
- `drawio_elements_v1` is rebuilt from the SVG — **preserving existing offsets**
  for elements whose IDs persist between saves
- The persist is written through the standard ordered-persist queue
- The editor closes

**At CLOSED (no save):**
- No meta changes
- draw.io state returns to pre-open snapshot
- Runtime mode resumes

**Offset preservation rule during save:**
When `handleDrawioEditorSave` calls `buildElementsFromSvg(next, svgCache)`:
- Elements found in both the new SVG and `prev.drawio_elements_v1` retain their `offset_x`/`offset_y`
- New elements (IDs that appear in the new SVG but not in prev) start at `offset_x=0, offset_y=0`
- Deleted elements (IDs removed from the SVG) are dropped from `drawio_elements_v1`

**UX latency contract:**
- Full editor iframe visible: within 2 seconds of user trigger
- Save round-trip (save → editor closes → element visible in overlay): within 3 seconds on localhost
- Reopen (open editor again on same session): doc_xml loaded, same as first open

---

## Contract 6 — Object Lifecycle (author → canvas → persist → reload)

**Complete user flow:**

```
1. [Full editor] User draws shapes → clicks Save
         │
         ▼
2. [handleDrawioEditorSave] doc_xml + svg_cache stored in drawio meta
   drawio_elements_v1 rebuilt with offset_x=0 for new elements
         │
         ▼
3. [persistDrawioMetaOrdered, seq=N] meta written to server
   onOptimistic fires → drawioPersistedMetaRef updated
         │
         ▼
4. [DrawioOverlayRenderer] SVG rendered in overlay at current viewport
   New elements visible on canvas at offset_x=0
         │
         ▼
5. [Runtime mode] User can select element, nudge with ArrowKeys, drag
   Each nudge/drag → applyDrawioMutation → offset_x updated → persist queued
         │
         ▼
6. [Page reload] Session fetched from server
   useDrawioPersistHydrateBoundary applies server state → elements at saved offsets
         │
         ▼
7. All elements visible at correct positions ✓
```

**Critical invariant:** Steps 3 and 5 can interleave (user nudges immediately after
save). The persist sequencing guard in `persistDrawioMetaOrdered` ensures only the
latest seq wins. The hydrate guard in `useDrawioPersistHydrateBoundary` ensures
stale server responses do not overwrite locally-committed offsets.

---

## Contract 7 — Visibility / Selection / Opacity

**Visibility:**

| State | Visual | Selectable | Selection cleared |
|---|---|---|---|
| draw.io layer ON | Elements shown at configured opacity | Yes (in edit mode) | No |
| draw.io layer OFF | Layer hidden, `opacity: 0`, `pointer-events: none` | No | Yes — selection cleared on toggle |
| draw.io layer LOCKED | Layer shown | No | No |
| Individual element hidden (`visible: false`) | Element hidden | No | Selection cleared if was selected |

**Opacity:**
- Layer opacity: 0.05 – 1.0 (clamped, enforced by `clampDrawioOpacity`)
- Per-element opacity: 0.05 – 1.0 (clamped)
- Effective opacity = `layer.opacity × element.opacity` in SVG rendering

**Selection:**
- Only one element selectable at a time (no multi-select in runtime)
- Selection is cleared automatically when:
  - Layer toggled OFF
  - Element becomes hidden (`visible: false`)
  - Session changes (`sid` effect)
  - Edit mode switched to VIEW

**Enforcement:** `drawioVisibilitySelectionContract.js`,
`drawio-visibility-selection-contract.test.mjs`,
`drawioVisibility.js` (`clampDrawioOpacity`, `getDrawioOverlayStatus`).

---

## Contract 8 — Materialization

**Rule:** Only well-formed draw.io entities with valid layer assignment are
renderable. Legacy, info, and masquerade entities are blocked at the overlay
boundary.

**Renderable entity:**
- Has a non-empty `id`
- Has a `layer_id` that exists in `drawio_layers_v1`
- Has `deleted !== true`
- Has `visible !== false` (unless layer is also hidden)
- ID appears in the current `svg_cache` (real SVG element)

**Not renderable / blocked:**
- Entities with `deleted: true`
- Entities whose `layer_id` does not match any layer in `drawio_layers_v1`
- Hybrid legacy entities (separate layer, separate renderer — `HybridLegacyRenderer.jsx`)
- Info/meta overlay entities (separate system — `buildHybridLegacySection.js`)
- Ghost/phantom: entities produced by stale or incomplete normalization that do not
  correspond to real SVG shapes

**Bootstrap case:**
When `drawio_elements_v1` is absent but `svg_cache` has shapes, `normalizeDrawioMeta`
bootstraps element rows from the SVG with `offset_x=0, offset_y=0`. This is
intentional for new sessions and import flows. It is NOT a fallback for runtime use.

**Ghost prevention:** `drawio-ghost-materialization-boundary.spec.mjs` and
`drawio-runtime-materialization-boundary.spec.mjs` gate this contract.

---

## Contract 9 — Persist Sequencing

**Rule:** Only the latest persist request wins. Stale requests are dropped and
cannot overwrite newer local state.

**Ordered persist queue (`persistDrawioMetaOrdered`):**
- Each call increments `persistSeqRef.current`
- When the Promise chain executes, it checks `requestSeq === persistSeqRef.current`
- If another request was enqueued after this one, the current request is skipped
- The actual `persistDrawioMeta` call is only made for the winning request

**Hydrate guard (`useDrawioPersistHydrateBoundary`):**
The effect that applies server state to local `drawioMetaRef` has four skip conditions
in order:

| # | Condition | Meaning | Action |
|---|---|---|---|
| 1 | `incomingSig === persistedSig && currentSig !== incomingSig` | Server matches last persist; local is ahead | SKIP |
| 2 | `incomingSig === currentSig` | Already in sync | SKIP, update persistedRef |
| 3 | `!incoming.doc_xml && !incoming.svg_cache && current has payload` | Incoming is empty; local has content | SKIP |
| 4 | `currentSig === persistedSig && incomingSig !== persistedSig && persistedHasPayload` | Incoming is stale behind an optimistic persist | SKIP |

Condition 4 is the anti-flake guard added in `b0a242b`. It protects against the
race window where `syncPersistedRefs` updates `drawioPersistedMetaRef` synchronously
but a concurrent `onSessionSync` (e.g. from a BPMN save response) propagates a
stale `drawioFromDraft` through React.

**Apply only when:** All four conditions fail (incoming is genuinely newer than
both local and persisted state).

---

## Contract 10 — Regression Gate

The following e2e specs are the regression gate for this entire spec. All must pass
before any new draw.io work is committed:

```bash
# Core entry + placement
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-overlay-runtime-entry-contract.spec.mjs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-runtime-tool-placement.spec.mjs

# Anchoring + parity
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-browser-runtime-anchoring.spec.mjs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-visual-scale-parity.spec.mjs

# Materialization
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-runtime-materialization-boundary.spec.mjs

# Full lifecycle (smoke)
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-stage1-boundary-smoke.spec.mjs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs
```

Additional (run 3x for anti-flake):
```bash
# Must pass 3/3 consecutive runs
E2E_DRAWIO_SMOKE=1 npm run test:e2e -- e2e/drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs
```

Unit tests (no browser, run first):
```bash
cd frontend && node --test \
  src/features/process/drawio/runtime/useDrawioPointerDrag.test.mjs \
  src/features/process/drawio/runtime/useDrawioSelection.test.mjs \
  src/features/process/drawio/runtime/useDrawioKeyboardActions.test.mjs \
  src/features/process/drawio/runtime/useDrawioInteractionGate.test.mjs \
  src/features/process/drawio/runtime/drawioCreateGuard.test.mjs \
  src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs \
  src/features/process/drawio/runtime/drawioOverlayState.test.mjs \
  src/features/process/drawio/domain/drawioVisibilitySelectionContract.test.mjs
```

---

## What NOT to do (locked)

These patterns are explicitly forbidden. Each was previously a real regression:

| Pattern | Why forbidden |
|---|---|
| Runtime mode silently opens full editor | Breaks entry-point contract; was a real bug |
| Calling `setDrawioMeta` or `drawioMetaRef.current =` outside the two hydrate effects and `applyDrawioMutation` | Creates untracked state mutations |
| Passing a full session row object to `onOpenSession` | Passes `"[object Object]"` to `openSession`; was a live bug in WorkspaceDashboard |
| Using `drawioFromDraft` as primary state for runtime decisions | `drawioFromDraft` can lag behind due to React batching; `drawioMetaRef.current` is the authoritative runtime source |
| Applying incoming hydrate without checking all 4 skip conditions | Causes stale-offset persist flake |
| Mounting draw.io overlay before BPMN viewport is ready | Breaks initial anchoring |
| Sharing a single `persistBpmnMeta` call for both BPMN and draw.io without ordered sequencing | Causes seq-race dropping |
| Expanding Redis to own any overlay/mode/selection state | Redis is helper only |
| Merging draw.io and hybrid layer semantics | They have separate lifecycles, separate renderers, separate mutation paths |

---

## Ownership map

| Layer | Owner contract | Key files |
|---|---|---|
| draw.io meta model | `drawioMeta.js` + `normalizeDrawioMeta` | Entry point for all schema normalization |
| draw.io overlay render | `DrawioOverlayRenderer.jsx` + `drawioOverlayState.js` | SVG render + element state |
| draw.io runtime interaction | `useDrawioOverlayInteraction.js` + sub-hooks | Selection, drag, keyboard, gate |
| draw.io persist boundary | `useOverlayPersistBoundary.js` + `useDrawioPersistHydrateBoundary.js` | All write/read to session |
| draw.io full editor | `DrawioEditorModal.jsx` + `useDrawioEditorBridge.js` | iframe open/save/close |
| draw.io visibility contract | `drawioVisibilitySelectionContract.js` | Toggle/opacity/selection rules |
| BPMN viewport (shared) | `useBpmnViewportSource.js` + `useOverlayViewportSync.js` | Zoom/pan matrix |
| BPMN process model | `ProcessStage.jsx` → bpmn-js | Process truth, DO NOT touch from draw.io layer |

---

*This spec is a product-level document. For code-level inventory, frozen file list,
and release-gate command reference, see `docs/drawio-runtime-baseline.md`.*
