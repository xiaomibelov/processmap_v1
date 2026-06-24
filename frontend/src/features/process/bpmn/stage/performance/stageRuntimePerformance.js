/**
 * Stage runtime performance tuning.
 *
 * These knobs were extracted from wireBpmnStageRuntimeEvents so pan/zoom
 * handling can be tuned without touching the event wiring itself.
 */

export const OVERLAY_PAN_DEBOUNCE_MS = 150;
export const VIEWBOX_EMIT_THROTTLE_MS = 250;

/**
 * Property overlay rebuild is expensive because it walks the element registry
 * and recreates DOM overlay nodes. We only run it after the viewbox settles,
 * not while the user is actively panning.
 */
export function shouldSkipOverlayRebuildDuringPan(eventBus) {
  if (!eventBus) return false;
  // The overlay pan debouncer sets this flag while viewbox.changing is firing.
  const inst = eventBus?.__fpcOverlayUpdatesPaused;
  return Boolean(inst);
}
