# PLAN: V2 overlay decomposition + deleted-properties fix

**Contour:** architecture/v2-overlay-decomposition-deleted-properties  
**Branch:** architecture/v2-overlay-decompose-deleted-props  
**Base:** origin/main (includes FK-472 / V2 preview-map merge)  
**Worktree:** /opt/processmap-test/.worktrees/arch-v2-overlay-decompose  
**Design doc:** docs/superpowers/specs/2026-07-07-v2-overlay-decomposition-design.md

---

## Root cause summary

1. **V2 overlay fallback bug:** `BpmnStage.jsx` drops empty/disabled preview entries, so `mergeV2OverlaysWithPropertyPreview` falls back to modeler/XML overlays after the last property is deleted.
2. **Sidebar duplicate-name bug:** `propertyDeleteSemantics.js` deletes only one row by `id`; duplicate-name rows survive.
3. **Meta hydration bug:** `hydrateCamundaExtensionsFromBpmn` re-adds managed BPMN properties missing from session meta, resurrecting deleted properties on sync/save.

---

## Task 1: Bootstrap module structure + preserve facade

**Files:**
- Create: `frontend/src/features/process/bpmn/stage/overlay/v2OverlayContentResolver.js`
- Create: `frontend/src/features/process/bpmn/stage/overlay/v2OverlayVisibilityController.js`
- Create: `frontend/src/features/process/bpmn/stage/overlay/v2OverlayRenderer.js`
- Create: `frontend/src/features/process/bpmn/stage/overlay/v2OverlayCoordinator.js`
- Modify: `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js`

**Steps:**
1. Move helpers `asObject`, `asText`, `asArray` into a shared `overlayUtils.js` or keep local in each module to avoid cross-import entanglement.
2. Move `computeSequenceFlowMidpoint` to renderer module (only DOM positioning needs it).
3. Keep `overlayLifecycleManager.js` as a facade exporting `createOverlayLifecycleManager` and `mergeV2OverlaysWithPropertyPreview`.
4. Run existing `overlayLifecycleManager.test.mjs` to ensure facade contract holds.

---

## Task 2: Implement V2OverlayContentResolver

**File:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayContentResolver.js`

**Interface:**
```js
export function resolveV2OverlayContent({ elementId, inst, previewMap, forceShow = false })
```

**Behavior:**
- If preview map has entry for `elementId` (regardless of `enabled`/`items`), use it.
- Empty preview items → `{ source: "preview", properties: [], title: "" }`.
- No preview entry → fallback to `extractOverlaysFromBpmn` for that element.

**Test:** `v2OverlayContentResolver.test.mjs`

---

## Task 3: Implement V2OverlayVisibilityController

**File:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayVisibilityController.js`

**Interface:**
```js
export function shouldRenderV2Overlay({ elementId, globalEnabled, elementState, content })
```

**Behavior:**
- `false` if `globalEnabled === false`.
- `false` if non-sequence element < 20px.
- `false` if `elementState.hasLegacyOverlay === true`.
- `false` if `content.properties.length === 0 && !content.title`.

**Test:** `v2OverlayVisibilityController.test.mjs`

---

## Task 4: Implement V2OverlayRenderer

**File:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayRenderer.js`

**Interface:**
```js
export function renderV2Overlay({ element, content, expanded = false })
export function removeV2OverlayById(inst, overlayId)
```

**Behavior:**
- Build `fpc-overlay-v2-host` DOM.
- Position for shapes (top-left offset) and sequence flows (midpoint).
- Return `{ host, position, overlayId }`.
- Attach hover/expand listeners.

**Test:** `v2OverlayRenderer.test.mjs` (use jsdom if project supports it; otherwise lightweight DOM mocks).

---

## Task 5: Implement V2OverlayCoordinator

**File:** `frontend/src/features/process/bpmn/stage/overlay/v2OverlayCoordinator.js`

**Interface:**
```js
export function createV2OverlayCoordinator({ enabledRef, expandedRef, previewMapRef, selectedElementRef })
```

**Behavior:**
- Subscribe to `canvas.viewbox.changed` and `element.changed`.
- For each element in registry: resolve content → check visibility → diff against current map → render/remove.
- Keep `Map<elementId, { overlayId, contentSig, host, expanded }>`.

**Test:** `v2OverlayCoordinator.test.mjs` with mock bpmn-js instance.

---

## Task 6: Fix preview-map cleanup in BpmnStage.jsx

**File:** `frontend/src/components/process/BpmnStage.jsx`

**Change:** In the effect building `v2PropertyPreviewMapRef`, include `selectedPropertiesOverlayPreview` when `selectedElementId` exists, even if `items` is empty.

Before:
```js
if (selectedElementId && selected?.enabled === true && asArray(selected?.items).length) {
  combined[selectedElementId] = selected;
}
```

After:
```js
if (selectedElementId) {
  combined[selectedElementId] = selected;
}
```

Then ContentResolver will see the empty preview and suppress overlay.

---

## Task 7: Fix property delete semantics

**File:** `frontend/src/components/sidebar/propertyDeleteSemantics.js`

**Change:** When the target row has a non-empty logical name, delete all rows with the same logical name. Keep single-row deletion only for unnamed rows.

```js
const targetKey = String(rows[targetIndex]?.name || "").trim().toLowerCase();
if (!targetKey) {
  return rows.filter((_, i) => i !== targetIndex);
}
return rows.filter((row) => String(row?.name || "").trim().toLowerCase() !== targetKey);
```

**Test:** extend `propertyDeleteSemantics.test.mjs`.

---

## Task 8: Fix hydrateCamundaExtensionsFromBpmn managed merge

**File:** `frontend/src/features/process/camunda/camundaExtensions.js`

**Change:** Remove the `if (shouldMergeManagedFromBpmn) { ... push extracted properties/listeners ... }` block. Session meta is authoritative for managed data; only `preservedExtensionElements` continue to merge from BPMN.

**Test:** add/extend test that passing session data + extracted BPMN with extra property does not resurrect it.

---

## Task 9: Integration + regression tests

**Files:**
- `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.test.mjs` — update to test through facade.
- `frontend/e2e/bpmn-property-pipeline-smoke.spec.mjs`
- `frontend/e2e/audit-property-duplication.spec.mjs`

**Steps:**
1. Run unit tests: `node --test src/**/*.test.mjs`.
2. Run build: `npm run build`.
3. Run targeted E2E against local stack.

---

## Task 10: Commit and PR

**Commit sequence:**
1. `refactor(overlay): decompose overlayLifecycleManager into resolver/visibility/renderer/coordinator`
2. `fix(overlay): use empty preview map entry to suppress V2 overlay fallback`
3. `fix(sidebar): delete all rows sharing the same logical property name`
4. `fix(camunda): session meta wins over BPMN XML for managed properties`
5. `test(overlay): unit tests for V2 overlay modules`

**PR target:** origin/main  
**Handoff:** mirror report to Obsidian.
