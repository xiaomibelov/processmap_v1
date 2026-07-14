// Pure active-result navigation math for keyboard search navigation.
// Unit-tested in diagramSearchActiveNav.test.mjs.

export function resolveMoveIndex({ length = 0, activeIndex = -1, step = 1 } = {}) {
  const total = Number.isFinite(Number(length)) ? Math.max(0, Math.trunc(Number(length))) : 0;
  if (!total) return -1;
  const direction = Number(step) < 0 ? -1 : 1;
  const current = Number.isFinite(Number(activeIndex)) ? Math.trunc(Number(activeIndex)) : -1;
  if (current < 0 || current >= total) {
    return direction > 0 ? 0 : total - 1;
  }
  return (current + direction + total) % total;
}

export function resolveBoundaryIndex({ length = 0, edge = "start" } = {}) {
  const total = Number.isFinite(Number(length)) ? Math.max(0, Math.trunc(Number(length))) : 0;
  if (!total) return -1;
  return String(edge).toLowerCase() === "end" ? total - 1 : 0;
}
