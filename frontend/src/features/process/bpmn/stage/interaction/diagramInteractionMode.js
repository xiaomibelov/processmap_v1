/**
 * DiagramInteractionMode
 *
 * Toggles a root CSS class (.fpcDiagramInteracting) during active canvas
 * pan or element drag to reduce paint cost and suppress non-essential
 * side effects while the user is interacting with the diagram.
 *
 * Uses native pointer events with a small movement threshold so that
 * simple clicks do not trigger interaction mode.
 */

const ACTIVE_CLASS = "fpcDiagramInteracting";
const MOVE_THRESHOLD_PX = 5;

export function bindDiagramInteractionMode({ canvasContainer, eventBus }) {
  if (!(canvasContainer instanceof Element)) return () => {};

  let state = null;

  function activate() {
    if (!state || state.active) return;
    state.active = true;
    canvasContainer.classList.add(ACTIVE_CLASS);
  }

  function deactivate() {
    if (!state || !state.active) return;
    state.active = false;
    canvasContainer.classList.remove(ACTIVE_CLASS);
  }

  function onPointerDown(event) {
    // Only left or middle button; ignore right-click and modifiers
    if (event.button >= 2) return;
    if (event.ctrlKey || event.shiftKey || event.altKey) return;

    state = {
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
  }

  function onPointerMove(event) {
    if (!state) return;
    const dx = Math.abs(event.clientX - state.startX);
    const dy = Math.abs(event.clientY - state.startY);
    if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
      activate();
    }
  }

  function onPointerUp() {
    deactivate();
    state = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }

  canvasContainer.addEventListener("pointerdown", onPointerDown, { passive: true });

  const unbindDestroy = () => {
    canvasContainer.removeEventListener("pointerdown", onPointerDown);
    onPointerUp();
  };

  if (eventBus) {
    eventBus.on("canvas.destroy", 2200, unbindDestroy);
  }

  return unbindDestroy;
}

export function isDiagramInteracting(container) {
  return container instanceof Element && container.classList.contains(ACTIVE_CLASS);
}
