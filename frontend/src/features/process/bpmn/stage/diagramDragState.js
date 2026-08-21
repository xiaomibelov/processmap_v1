const dragStartSubscribers = new Set();
const dragEndSubscribers = new Set();

export const isDiagramDraggingRef = { current: false };

export function isDiagramDragging() {
  return isDiagramDraggingRef.current === true;
}

export function onDiagramDragStart(cb) {
  if (typeof cb !== "function") return () => {};
  dragStartSubscribers.add(cb);
  return () => {
    dragStartSubscribers.delete(cb);
  };
}

export function onDiagramDragEnd(cb) {
  if (typeof cb !== "function") return () => {};
  dragEndSubscribers.add(cb);
  return () => {
    dragEndSubscribers.delete(cb);
  };
}

export function setDiagramDragging(active) {
  const next = active === true;
  const prev = isDiagramDraggingRef.current;
  if (prev === next) return;
  isDiagramDraggingRef.current = next;
  const subs = next ? dragStartSubscribers : dragEndSubscribers;
  subs.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}
