import { normalizeTobeDocument } from "./tobeDocumentModel.js";

// Ephemeral ghost state for placing a new To-Be document on the canvas.
// The ghost is pure UI state ({ url, title, x, y } | null) — nothing is
// persisted until the ghost is fixed (canvas click / Enter). Escape cancels.

function asText(value) {
  return String(value ?? "").trim();
}

// Validates the sidebar payload and builds the ghost. Returns null when the
// URL is empty (same gate as the sidebar submit button).
export function createTobeGhost(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const url = asText(payload.url);
  if (!url) return null;
  return {
    url,
    title: asText(payload.title) || url,
    x: null,
    y: null,
  };
}

// Single-ghost rule: starting while a ghost is active keeps the current one
// (the sidebar add button is disabled meanwhile, this is the safety net).
export function startTobeGhost(current, payload) {
  if (current) return current;
  return createTobeGhost(payload);
}

// Fix: clears the ghost and builds the real document record at the given
// diagram coordinates (default size, visible). Without an active ghost this
// is a no-op.
export function fixTobeGhost(current, pointRaw) {
  if (!current) return { ghost: null, document: null };
  const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
  const x = Number(point.x);
  const y = Number(point.y);
  const doc = normalizeTobeDocument({
    url: current.url,
    title: current.title,
    x: Number.isFinite(x) ? Math.round(x) : 0,
    y: Number.isFinite(y) ? Math.round(y) : 0,
  });
  return { ghost: null, document: doc };
}

// Cancel: drops the ghost, nothing is created.
export function cancelTobeGhost() {
  return null;
}
