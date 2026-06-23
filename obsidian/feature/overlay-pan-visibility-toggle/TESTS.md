# TESTS: Overlay Pan Visibility Toggle

## Manual / UI tests

1. **Toggle visible**
   - Open a BPMN diagram.
   - Toolbar shows "Оверлеи при pan" button next to "Слои".

2. **Default off**
   - On first visit (no `localStorage` key) toggle is inactive.

3. **Toggle on → overlays visible during pan**
   - Enable toggle.
   - Click-drag canvas; overlay badges/icons remain visible and follow elements.

4. **Toggle off → overlays hidden during pan**
   - Disable toggle.
   - Click-drag canvas; overlay badges/icons disappear during motion and reappear after release.

5. **Persistence**
   - Set toggle to on.
   - Press F5 / reload page.
   - Toggle restores to on and behavior matches.

6. **Disabled on non-BPMN tabs**
   - Switch to XML/DOC/DOD tab.
   - "Оверлеи при pan" button is disabled.

## Automated tests to add

- Unit: `patchOverlayPanPerf.js`
  - `setShowOverlaysDuringPan(true)` causes `_updateOverlaysVisibility` to run while paused.
  - `setShowOverlaysDuringPan(false)` causes `_updateOverlaysVisibility` to skip while paused.
  - `show`/`hide` are suppressed while paused only when flag is true.

- Component: `ProcessStageDiagramControls`
  - Renders toggle button.
  - Clicking calls `setShowOverlaysDuringPan`.

## Build verification

- `npm run build` completes without errors.
