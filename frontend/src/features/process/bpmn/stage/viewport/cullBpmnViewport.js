/**
 * Viewport culling for bpmn-js canvas.
 * Reduces rendered SVG node count by detaching off-screen element gfx groups.
 *
 * Contour: fix/canvas-viewport-culling-v1
 */

const BUFFER_PX = 200;

function getElementBounds(el) {
  if (!el) return null;
  if (Array.isArray(el.waypoints)) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    el.waypoints.forEach((wp) => {
      const x = Number(wp?.x ?? wp?.original?.x ?? 0);
      const y = Number(wp?.y ?? wp?.original?.y ?? 0);
      if (Number.isFinite(x)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      if (Number.isFinite(y)) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    });
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  const x = Number(el.x || 0);
  const y = Number(el.y || 0);
  const w = Number(el.width || 0);
  const h = Number(el.height || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null;
  }
  return { x, y, width: w, height: h };
}

function intersects(bounds, viewport) {
  return !(
    bounds.x + bounds.width < viewport.left
    || bounds.x > viewport.right
    || bounds.y + bounds.height < viewport.top
    || bounds.y > viewport.bottom
  );
}

function getShapeLayer(canvas) {
  const container = canvas?._container || canvas?.getContainer?.();
  if (!container) return null;
  return (
    container.querySelector(".djs-layer-shape")
    || container.querySelector("g[data-layer=\"shape\"]")
    || container.querySelector(".djs-layer[data-layer=\"shape\"]")
    || null
  );
}

function getConnectionLayer(canvas) {
  const container = canvas?._container || canvas?.getContainer?.();
  if (!container) return null;
  return (
    container.querySelector(".djs-layer-connection")
    || container.querySelector("g[data-layer=\"connection\"]")
    || container.querySelector(".djs-layer[data-layer=\"connection\"]")
    || null
  );
}

function isShapeLike(el) {
  if (!el) return false;
  return (
    !Array.isArray(el.waypoints)
    && String(el.type || "").toLowerCase() !== "label"
    && String(el.type || "").toLowerCase() !== "root"
  );
}

function isConnectionLike(el) {
  if (!el) return false;
  return Array.isArray(el.waypoints);
}

function simplifyShapeGfx(gfx, scale) {
  if (!gfx) return;
  const visual = gfx.querySelector(".djs-visual");
  if (!visual) return;
  const children = Array.from(visual.children);
  const rects = children.filter((c) => String(c.tagName).toLowerCase() === "rect");
  const nonRects = children.filter((c) => {
    const tag = String(c.tagName).toLowerCase();
    return tag === "path" || tag === "circle" || tag === "polygon" || tag === "ellipse" || tag === "g";
  });

  if (scale < 0.2) {
    nonRects.forEach((c) => {
      c.style.display = "none";
    });
    rects.forEach((c, i) => {
      c.style.display = i === 0 ? "" : "none";
    });
  } else if (scale < 0.5) {
    nonRects.forEach((c) => {
      c.style.display = "none";
    });
    rects.forEach((c) => {
      c.style.display = "";
    });
  } else {
    children.forEach((c) => {
      c.style.display = "";
    });
  }
}

export function createViewportCuller(inst, options = {}) {
  if (!inst) return null;

  const canvas = inst.get("canvas");
  const registry = inst.get("elementRegistry");
  if (!canvas || !registry) return null;

  const useDetach = options?.useDetach !== false;
  const bufferPx = Number(options?.bufferPx || BUFFER_PX);

  const detachedMap = new Map();
  const visibilityMap = new Map();
  let rafId = null;
  let disposed = false;
  let lastScale = 1;

  function computeViewport() {
    const vb = canvas.viewbox() || {};
    const scale = Number(vb.scale || 1);
    const bufferModel = bufferPx / Math.max(scale, 0.001);
    return {
      left: Number(vb.x || 0) - bufferModel,
      top: Number(vb.y || 0) - bufferModel,
      right: Number(vb.x || 0) + Number(vb.width || 0) + bufferModel,
      bottom: Number(vb.y || 0) + Number(vb.height || 0) + bufferModel,
      scale,
    };
  }

  function getCorrectParent(element, isShape) {
    if (useDetach) {
      const layer = isShape ? getShapeLayer(canvas) : getConnectionLayer(canvas);
      if (layer) return layer;
    }
    const gfx = registry.getGraphics(element);
    if (gfx && gfx.parentNode) return gfx.parentNode;
    return null;
  }

  function getDetachedGfx(elementId) {
    const record = detachedMap.get(elementId);
    return record?.gfx || record || null;
  }

  function runCulling() {
    if (disposed) return;
    const viewport = computeViewport();
    lastScale = viewport.scale;
    const all = Array.isArray(registry?.getAll?.()) ? registry.getAll() : [];
    const shapeLayer = useDetach ? getShapeLayer(canvas) : null;
    const connectionLayer = useDetach ? getConnectionLayer(canvas) : null;

    let detachedCount = 0;
    let attachedCount = 0;
    let simplifiedCount = 0;
    all.forEach((el) => {
      if (!el || !el.id) return;
      const bounds = getElementBounds(el);
      if (!bounds) return;

      const visible = intersects(bounds, viewport);
      const wasVisible = visibilityMap.get(el.id) !== false;
      const gfx = registry.getGraphics(el);
      if (!gfx) return;

      if (visible) {
        if (!wasVisible || detachedMap.has(el.id)) {
          if (useDetach && detachedMap.has(el.id)) {
            const record = detachedMap.get(el.id);
            const parent = record?.parent || (isShapeLike(el)
              ? shapeLayer
              : (isConnectionLike(el) ? connectionLayer : null));
            if (parent) {
              if (record?.nextSibling && record.nextSibling.parentNode === parent) {
                parent.insertBefore(gfx, record.nextSibling);
              } else {
                parent.appendChild(gfx);
              }
            } else if (gfx.parentNode !== getCorrectParent(el, isShapeLike(el))) {
              const fallbackParent = getCorrectParent(el, isShapeLike(el));
              if (fallbackParent) fallbackParent.appendChild(gfx);
            }
            detachedMap.delete(el.id);
            attachedCount += 1;
          } else if (!useDetach && gfx.style.display === "none") {
            gfx.style.display = "";
          }
        }
        visibilityMap.set(el.id, true);

        // Zoom simplification for shapes
        if (isShapeLike(el)) {
          simplifyShapeGfx(gfx, viewport.scale);
          simplifiedCount += 1;
        }
      } else {
        if (wasVisible || !detachedMap.has(el.id)) {
          if (useDetach) {
            if (gfx.parentNode) {
              const parent = gfx.parentNode;
              const nextSibling = gfx.nextSibling;
              gfx.remove();
              detachedMap.set(el.id, { gfx, parent, nextSibling });
              detachedCount += 1;
            }
          } else {
            gfx.style.display = "none";
          }
        }
        visibilityMap.set(el.id, false);
      }
    });

    if (typeof options?.onCull === "function") {
      options.onCull({
        detachedCount,
        attachedCount,
        simplifiedCount,
        detachedTotal: detachedMap.size,
        scale: viewport.scale,
      });
    }

  }

  function scheduleCull() {
    if (disposed) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      runCulling();
      rafId = null;
    });
  }

  function forceCull() {
    if (disposed) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    runCulling();
  }

  function restoreAll() {
    if (disposed) return;
    if (useDetach) {
      const shapeLayer = getShapeLayer(canvas);
      const connectionLayer = getConnectionLayer(canvas);
      detachedMap.forEach((record, elementId) => {
        const gfx = record?.gfx || record;
        const el = registry.get(elementId);
        if (!el || !gfx) return;
        const parent = record?.parent || (isShapeLike(el) ? shapeLayer : (isConnectionLike(el) ? connectionLayer : null));
        if (parent) {
          if (record?.nextSibling && record.nextSibling.parentNode === parent) {
            parent.insertBefore(gfx, record.nextSibling);
          } else {
            parent.appendChild(gfx);
          }
        } else {
          const fallback = getCorrectParent(el, isShapeLike(el));
          if (fallback) fallback.appendChild(gfx);
        }
        const visual = gfx.querySelector(".djs-visual");
        if (visual) {
          Array.from(visual.children).forEach((c) => {
            c.style.display = "";
          });
        }
      });
    }
    detachedMap.clear();
    visibilityMap.clear();
  }

  function dispose() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    // Re-attach all detached elements on dispose
    if (useDetach) {
      const shapeLayer = getShapeLayer(canvas);
      const connectionLayer = getConnectionLayer(canvas);
      detachedMap.forEach((record, elementId) => {
        const gfx = record?.gfx || record;
        const el = registry.get(elementId);
        if (!el || !gfx) return;
        const parent = record?.parent || (isShapeLike(el) ? shapeLayer : (isConnectionLike(el) ? connectionLayer : null));
        if (parent) {
          if (record?.nextSibling && record.nextSibling.parentNode === parent) {
            parent.insertBefore(gfx, record.nextSibling);
          } else {
            parent.appendChild(gfx);
          }
        } else {
          const fallback = getCorrectParent(el, isShapeLike(el));
          if (fallback) fallback.appendChild(gfx);
        }
        // Restore zoom simplification
        const visual = gfx.querySelector(".djs-visual");
        if (visual) {
          Array.from(visual.children).forEach((c) => {
            c.style.display = "";
          });
        }
      });
    } else {
      detachedMap.forEach((record) => {
        const gfx = record?.gfx || record;
        if (gfx && gfx.style) gfx.style.display = "";
      });
    }
    detachedMap.clear();
    visibilityMap.clear();
  }

  function isElementVisible(elementId) {
    return visibilityMap.get(elementId) === true;
  }

  function getDetachedCount() {
    return detachedMap.size;
  }

  function getLastScale() {
    return lastScale;
  }

  return {
    scheduleCull,
    forceCull,
    restoreAll,
    dispose,
    isElementVisible,
    getDetachedCount,
    getLastScale,
    _runCulling: runCulling,
  };
}

export function isGfxInDom(inst, elementOrId) {
  if (!inst) return false;
  try {
    const registry = inst.get("elementRegistry");
    const el = typeof elementOrId === "string" ? registry?.get?.(elementOrId) : elementOrId;
    if (!el) return false;
    const gfx = registry?.getGraphics?.(el);
    if (!gfx) return false;
    return !!gfx.parentNode;
  } catch {
    return false;
  }
}

export function isElementVisibleInViewport(inst, elementOrId) {
  if (!inst) return false;
  try {
    const canvas = inst.get("canvas");
    const registry = inst.get("elementRegistry");
    const el = typeof elementOrId === "string" ? registry?.get?.(elementOrId) : elementOrId;
    if (!el) return false;
    const vb = canvas?.viewbox?.() || {};
    const scale = Number(vb.scale || 1);
    const bufferModel = BUFFER_PX / Math.max(scale, 0.001);
    const viewport = {
      left: Number(vb.x || 0) - bufferModel,
      top: Number(vb.y || 0) - bufferModel,
      right: Number(vb.x || 0) + Number(vb.width || 0) + bufferModel,
      bottom: Number(vb.y || 0) + Number(vb.height || 0) + bufferModel,
    };
    const bounds = getElementBounds(el);
    if (!bounds) return false;
    return intersects(bounds, viewport);
  } catch {
    return false;
  }
}
