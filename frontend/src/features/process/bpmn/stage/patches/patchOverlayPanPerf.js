// Patch diagram-js Overlays to keep overlays visible during pan/zoom while
// skipping the expensive per-overlay visibility/scale updates while the viewbox
// is changing. This eliminates the O(n) DOM write storm that drops FPS to <10
// on diagrams with 50+ property overlays, without hiding overlays from the user.

import Overlays from "diagram-js/lib/features/overlays/Overlays";

let patchedGlobal = false;

export function setOverlaysUpdatePaused(overlays, paused) {
  if (!overlays) return;
  overlays.__fpcOverlayUpdatesPaused = paused === true;
}

function createPatchedUpdate(original) {
  let skipped = 0;
  let total = 0;
  let lastLog = 0;
  return function (viewbox) {
    total += 1;
    if (this.__fpcOverlayUpdatesPaused) {
      skipped += 1;
      const now = performance.now();
      if (now - lastLog > 5000) {
        // eslint-disable-next-line no-console
        console.debug(`[OverlayPanPatch] skipped ${skipped}/${total} _updateOverlaysVisibilty calls in last 5s`);
        skipped = 0;
        total = 0;
        lastLog = now;
      }
      return;
    }
    return original.call(this, viewbox);
  };
}

export function patchOverlaysPrototype() {
  if (patchedGlobal) return;
  try {
    const original = Overlays?.prototype?._updateOverlaysVisibilty;
    if (!original || original.__overlayPanPatched) return;
    Overlays.prototype._updateOverlaysVisibilty = createPatchedUpdate(original);
    Overlays.prototype._updateOverlaysVisibilty.__overlayPanPatched = true;
    patchedGlobal = true;
    if (typeof window !== "undefined") {
      window.__fpcOverlayPanPatchActive = true;
    }
  } catch {
    // silently fail if diagram-js internals change
  }
}

// Instance-level fallback if prototype patch didn't land (e.g. bundler hoisting)
export function patchOverlaysInstance(inst) {
  if (!inst) return;
  try {
    const overlays = inst.get("overlays");
    if (!overlays || overlays._updateOverlaysVisibilty?.__overlayPanPatched) return;
    const original = overlays._updateOverlaysVisibilty.bind(overlays);
    overlays._updateOverlaysVisibilty = createPatchedUpdate(original);
    overlays._updateOverlaysVisibilty.__overlayPanPatched = true;
  } catch {
    // no-op
  }
}
