/**
 * Pure reducer for the diagram load lifecycle state machine.
 */

export const DIAGRAM_LOAD_STATES = {
  IDLE: "idle",
  INITIALIZING: "initializing",
  IMPORTING: "importing",
  CANVAS_READY: "canvas-ready",
  READY: "ready",
  ERROR: "error",
  TIMEOUT: "timeout",
};

export function diagramLoadStateMachineReducer(state, action, payload = {}) {
  const prev = state;
  let next = prev;
  let reason = payload?.reason || "";

  switch (action) {
    case "reset":
      next = DIAGRAM_LOAD_STATES.INITIALIZING;
      break;
    case "init_done":
      if (prev === DIAGRAM_LOAD_STATES.INITIALIZING || prev === DIAGRAM_LOAD_STATES.IDLE) {
        next = DIAGRAM_LOAD_STATES.IMPORTING;
      }
      break;
    case "import_start":
      if (
        prev === DIAGRAM_LOAD_STATES.INITIALIZING ||
        prev === DIAGRAM_LOAD_STATES.IDLE ||
        prev === DIAGRAM_LOAD_STATES.CANVAS_READY
      ) {
        next = DIAGRAM_LOAD_STATES.IMPORTING;
      }
      break;
    case "import_success":
      if (
        prev === DIAGRAM_LOAD_STATES.IMPORTING ||
        prev === DIAGRAM_LOAD_STATES.INITIALIZING ||
        prev === DIAGRAM_LOAD_STATES.IDLE
      ) {
        next = DIAGRAM_LOAD_STATES.READY;
      }
      break;
    case "import_error":
      next = DIAGRAM_LOAD_STATES.ERROR;
      reason = payload?.reason || "import_failed";
      break;
    case "timeout":
      if (prev === DIAGRAM_LOAD_STATES.INITIALIZING || prev === DIAGRAM_LOAD_STATES.IMPORTING) {
        next = DIAGRAM_LOAD_STATES.TIMEOUT;
        reason = payload?.reason || "load_timeout";
      }
      break;
    case "canvas_ready":
      if (prev === DIAGRAM_LOAD_STATES.IMPORTING || prev === DIAGRAM_LOAD_STATES.INITIALIZING) {
        next = DIAGRAM_LOAD_STATES.CANVAS_READY;
      }
      break;
    case "fully_ready":
      if (
        prev === DIAGRAM_LOAD_STATES.CANVAS_READY ||
        prev === DIAGRAM_LOAD_STATES.IMPORTING ||
        prev === DIAGRAM_LOAD_STATES.INITIALIZING
      ) {
        next = DIAGRAM_LOAD_STATES.READY;
      }
      break;
    case "destroy":
      next = DIAGRAM_LOAD_STATES.IDLE;
      break;
    default:
      break;
  }

  return next === prev ? state : { state: next, reason };
}
