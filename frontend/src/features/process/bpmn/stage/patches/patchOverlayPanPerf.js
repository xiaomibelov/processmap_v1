// Patch diagram-js Overlays to keep overlays visible during pan/zoom while
// skipping the expensive per-overlay visibility/scale updates while the viewbox
// is changing. This eliminates the O(n) DOM write storm that drops FPS to <10
// on diagrams with 50+ property overlays, without hiding overlays from the user.

import Overlays from "diagram-js/lib/features/overlays/Overlays";

let patchedGlobal = false;
let showOverlaysDuringPan = false;

export function setOverlaysUpdatePaused(overlays, paused) {
  if (!overlays) return;
  overlays.__fpcOverlayUpdatesPaused = paused === true;
}

export function setShowOverlaysDuringPan(enabled) {
  showOverlaysDuringPan = enabled === true;
}

export function getShowOverlaysDuringPan() {
  return showOverlaysDuringPan === true;
}

const OVERLAY_VISIBILITY_THROTTLE_MS = 16;
const overlayUpdateLastRun = new WeakMap();

function createPatchedUpdate(original) {
  let skipped = 0;
  let total = 0;
  let lastLog = 0;
  return function (viewbox) {
    total += 1;
    // When the viewbox is actively changing, skip the expensive per-overlay
    // visibility/scale pass unless the user explicitly wants overlays visible
    // during pan/zoom. In that case throttle the pass to ~60 fps instead of
    // running it on every micro-event.
    if (this.__fpcOverlayUpdatesPaused) {
      if (!showOverlaysDuringPan) {
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
      const now = performance.now();
      const lastRun = overlayUpdateLastRun.get(this) || 0;
      if (now - lastRun < OVERLAY_VISIBILITY_THROTTLE_MS) {
        skipped += 1;
        return;
      }
      overlayUpdateLastRun.set(this, now);
    }
    return original.call(this, viewbox);
  };
}

function createPatchedToggle(original) {
  return function (...args) {
    // When "show overlays while panning" is enabled, keep the overlay root
    // visible by suppressing diagram-js's hide/show calls during pan/zoom.
    // When disabled, let the original hide/show run so the root is hidden
    // during the gesture for better performance.
    if (this.__fpcOverlayUpdatesPaused && showOverlaysDuringPan) {
      return;
    }
    return original.apply(this, args);
  };
}

export function patchOverlaysPrototype() {
  if (patchedGlobal) return;
  try {
    const originalUpdate = Overlays?.prototype?._updateOverlaysVisibilty;
    if (originalUpdate && !originalUpdate.__overlayPanPatched) {
      Overlays.prototype._updateOverlaysVisibilty = createPatchedUpdate(originalUpdate);
      Overlays.prototype._updateOverlaysVisibilty.__overlayPanPatched = true;
    }
    // _updateRoot is intentionally NOT patched. It is a cheap O(1) CSS
    // transform on the single overlay root container and must stay in sync
    // with the canvas on every frame regardless of the pan-visibility toggle.
    const originalShow = Overlays?.prototype?.show;
    if (originalShow && !originalShow.__overlayPanPatched) {
      Overlays.prototype.show = createPatchedToggle(originalShow);
      Overlays.prototype.show.__overlayPanPatched = true;
    }
    const originalHide = Overlays?.prototype?.hide;
    if (originalHide && !originalHide.__overlayPanPatched) {
      Overlays.prototype.hide = createPatchedToggle(originalHide);
      Overlays.prototype.hide.__overlayPanPatched = true;
    }
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
    if (!overlays) return;
    if (!overlays._updateOverlaysVisibilty?.__overlayPanPatched) {
      const original = overlays._updateOverlaysVisibilty.bind(overlays);
      overlays._updateOverlaysVisibilty = createPatchedUpdate(original);
      overlays._updateOverlaysVisibilty.__overlayPanPatched = true;
    }
    if (!overlays.show?.__overlayPanPatched) {
      const original = overlays.show.bind(overlays);
      overlays.show = createPatchedToggle(original);
      overlays.show.__overlayPanPatched = true;
    }
    if (!overlays.hide?.__overlayPanPatched) {
      const original = overlays.hide.bind(overlays);
      overlays.hide = createPatchedToggle(original);
      overlays.hide.__overlayPanPatched = true;
    }
  } catch {
    // no-op
  }
}
