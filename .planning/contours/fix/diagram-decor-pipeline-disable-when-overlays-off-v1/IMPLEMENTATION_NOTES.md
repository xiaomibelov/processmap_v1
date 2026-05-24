# IMPLEMENTATION_NOTES — fix/diagram-decor-pipeline-disable-when-overlays-off-v1

## File Changed

### `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`

#### Change 1 — Add guard ref (line 77)
```js
// ── Guard ref: skip redundant Properties fanout when overlays are off ──
const propertiesOverlayDidClearRef = useRef(false);
```
Placed immediately after the `cbRef` synchronization block and before `readySignal`.

#### Change 2 — Guard the Properties effect (lines 157–170)
Replaced the unconditional `runSettledPropertiesFanout` call with:

```js
useEffect(() => {
  const overlaysOff = !propertiesOverlayAlwaysEnabled && !selectedPropertiesOverlayPreview;
  if (overlaysOff && propertiesOverlayDidClearRef.current) {
    // Already cleared; skip redundant fanout
    return;
  }
  runSettledPropertiesFanout({
    viewerInst: viewerRef.current,
    modelerInst: modelerRef.current,
    view,
    applyPropertiesOverlayDecor: cbRef.current.applyPropertiesOverlayDecor,
    clearPropertiesOverlayDecor: cbRef.current.clearPropertiesOverlayDecor,
  });
  propertiesOverlayDidClearRef.current = overlaysOff;
}, [
  propertiesOverlayAlwaysEnabled,
  propertiesOverlayAlwaysPreviewByElementId,
  selectedPropertiesOverlayPreview,
  readySignal,
  view,
]);
```

**Reasoning**:
- `overlaysOff` is true when both `propertiesOverlayAlwaysEnabled` is false and no `selectedPropertiesOverlayPreview` is active.
- The first time the effect fires with `overlaysOff === true`, `propertiesOverlayDidClearRef.current` is `false` (initial value), so the fanout runs once to clear any stale overlays.
- On subsequent effect fires (e.g., tab switch, `readySignal` change), if `overlaysOff` is still true and the ref is now `true`, the effect returns early — skipping the entire `runSettledPropertiesFanout` call chain.
- When overlays are toggled ON (`overlaysOff === false`), the guard falls through, runs the fanout, and resets the ref to `false`.
- When `selectedPropertiesOverlayPreview` appears or disappears, `overlaysOff` flips, so the ref resets appropriately.

**Why a ref instead of state?**
- The guard is purely an internal optimization. Using state would trigger additional React renders. A ref is the correct tool for tracking "have we already done the clear?" without affecting the component's output.

**Why place the guard in the caller (`useBpmnSettledDecorFanout`) instead of `postStagingFanout.js`?**
- Keeps the change minimal. `runSettledPropertiesFanout` signature and tests remain untouched.
- The guard is specific to the React lifecycle (effect re-fires on `view` change), so it belongs in the hook.

---

### `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.test.mjs`

#### Change 1 — Fix pre-existing broken test
The original first test (`"re-applies user notes/docs decor..."`) was broken by two prior code changes:
1. `postStagingFanout.js` now guards null instances (commit `71b5fb1`).
2. `readySignal` now depends on `viewerInstanceKey` / `modelerInstanceKey` (commit `85dde1a`).

Fixes applied:
- Added `viewerInstanceKey: 0` and `modelerInstanceKey: 0` to `baseProps`.
- Changed second render to pass `viewerInstanceKey: 1, modelerInstanceKey: 1` to trigger `readySignal` change.
- Updated first assertion to expect `[]` (no instances ready → no notes fanout calls).
- Updated final assertion to expect only viewer notes call (in `"viewer"` mode, modelerInst is nulled out by view logic).

#### Change 2 — Add new guard test
Added test: `"skips redundant Properties fanout when overlays are off and already cleared"`

Scenario:
1. Render with `propertiesOverlayAlwaysEnabled: false`, `selectedPropertiesOverlayPreview: null`, `view: "viewer"`.
   - Expect `applyPropertiesOverlayDecor` called once with `[null, "viewer"]`.
   - Expect `clearPropertiesOverlayDecor` called once with `[null, "editor"]`.
2. Re-render with `view: "editor"` (overlays still off).
   - Expect no additional calls to either callback (guard skips).
3. Re-render with `propertiesOverlayAlwaysEnabled: true`.
   - Expect both callbacks called again (guard resets).
   - `applyPropertiesOverlayDecor` called with `[null, "editor"]`.
   - `clearPropertiesOverlayDecor` called with `[null, "viewer"]`.

Uses spies (`applyCalls`, `clearCalls`) to verify exact call counts and arguments.

---

### `frontend/package.json` + `package-lock.json`

Downgraded `jsdom` `^28.1.0` → `^24.1.3`.

**Why**: jsdom 28 depends on `html-encoding-sniffer` which `require()`s `@exodus/bytes/encoding-lite.js`, an ESM-only package. Node 18.19.1 does not support `require()` of ESM modules. This caused `node --test` to fail at module load time for any test importing `jsdom`.

**Impact**: Restores test execution. No runtime product impact (jsdom is a devDependency).
