import { normalizeTobeDocument } from "./tobeDocumentModel.js";
import { createTobeDocumentHost } from "./tobeOverlayRenderer.js";

// Same chunked-mount budget as the V2 overlay coordinator (load-freeze
// audit): each animation frame only pays for a handful of DOM insertions.
const MOUNT_CHUNK_SIZE = 12;
// Docs slightly outside the viewport stay mounted so small pans do not
// trigger a remount cycle.
const VIEWPORT_MARGIN = 200;

function yieldToFrame() {
  try {
    if (typeof globalThis?.scheduler?.yield === "function") {
      return globalThis.scheduler.yield();
    }
  } catch {
    // Fall through to rAF/timeout.
  }
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export function createTobeOverlayCoordinator({ enabledRef, interactionsRef } = {}) {
  const docOverlayMapRef = { current: { viewer: new Map(), editor: new Map() } };
  // Supersede token for chunked mounts: a newer mount() invalidates the
  // remaining chunks of the previous one.
  let mountEpoch = 0;

  function resolveOverlayTargetId(inst, doc) {
    const anchorId = String(doc?.anchorElementId || "").trim();
    if (anchorId) {
      try {
        const registry = inst.get("elementRegistry");
        if (registry?.get?.(anchorId)) return anchorId;
      } catch {
        // Fall through to the root element.
      }
    }
    // Free-floating documents hang on the diagram root with an absolute
    // offset (same trick as V2 uses per element).
    try {
      const root = inst.get("canvas")?.getRootElement?.();
      if (root?.id) return root.id;
    } catch {
      // No root — caller treats null as "skip".
    }
    return null;
  }

  function isDocInViewport(inst, doc, viewbox) {
    if (!viewbox || !Number.isFinite(viewbox.x)) return true;
    const minX = viewbox.x - VIEWPORT_MARGIN;
    const minY = viewbox.y - VIEWPORT_MARGIN;
    const maxX = viewbox.x + viewbox.width + VIEWPORT_MARGIN;
    const maxY = viewbox.y + viewbox.height + VIEWPORT_MARGIN;

    const anchorId = String(doc?.anchorElementId || "").trim();
    let el = null;
    if (anchorId) {
      try {
        el = inst.get("elementRegistry")?.get?.(anchorId) || null;
      } catch {
        el = null;
      }
    }
    if (el) {
      const ex = Number(el.x || 0);
      const ey = Number(el.y || 0);
      const ew = Number(el.width || 0);
      const eh = Number(el.height || 0);
      return ex + ew >= minX && ex <= maxX && ey + eh >= minY && ey <= maxY;
    }
    const px = Number(doc?.x || 0);
    const py = Number(doc?.y || 0);
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
  }

  function mountOne(inst, kind, doc) {
    const overlays = inst.get("overlays");
    const map = docOverlayMapRef.current[kind];
    const contentSig = JSON.stringify(doc);
    const existing = map.get(doc.id);
    if (existing && existing.contentSig === contentSig) return;

    if (existing) {
      try { overlays.remove(existing.overlayId); } catch {}
      map.delete(doc.id);
    }

    const targetId = resolveOverlayTargetId(inst, doc);
    if (!targetId) return;
    const created = createTobeDocumentHost(doc, {
      getScale: () => {
        try {
          const zoom = Number(inst.get("canvas")?.zoom?.());
          return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
        } catch {
          return 1;
        }
      },
      onCommit: (patch) => {
        try {
          const handler = interactionsRef?.current;
          if (typeof handler === "function") handler(doc.id, patch);
        } catch {
          // Interaction commits are non-critical; the next mount resyncs.
        }
      },
    });
    if (!created) return;
    const overlayId = overlays.add(targetId, { position: created.position, html: created.host });
    map.set(doc.id, { overlayId, contentSig });
  }

  function mount(inst, kind, docsRaw) {
    if (!inst || typeof document === "undefined") return;
    if (!enabledRef?.current) return;

    const map = docOverlayMapRef.current[kind];

    try {
      const overlays = inst.get("overlays");
      const canvas = inst.get("canvas");
      const viewbox = canvas?.viewbox ? canvas.viewbox() : null;

      let docs = (Array.isArray(docsRaw) ? docsRaw : [])
        .map((doc) => normalizeTobeDocument(doc))
        .filter((doc) => doc.visible !== false);
      docs = docs.filter((doc) => isDocInViewport(inst, doc, viewbox));
      const desiredIds = new Set(docs.map((doc) => doc.id));

      // Remove stale overlays.
      for (const [docId, entry] of map.entries()) {
        if (!desiredIds.has(docId)) {
          try { overlays.remove(entry.overlayId); } catch {}
          map.delete(docId);
        }
      }

      const epoch = ++mountEpoch;
      if (docs.length <= MOUNT_CHUNK_SIZE) {
        docs.forEach((doc) => mountOne(inst, kind, doc));
        return;
      }

      // Large mount: render the first chunk synchronously (instant first
      // paint), then spread the rest over animation frames. A newer mount
      // supersedes the remaining chunks via the epoch check.
      const head = docs.slice(0, MOUNT_CHUNK_SIZE);
      const tail = docs.slice(MOUNT_CHUNK_SIZE);
      head.forEach((doc) => mountOne(inst, kind, doc));
      void (async () => {
        for (let idx = 0; idx < tail.length; idx += MOUNT_CHUNK_SIZE) {
          await yieldToFrame();
          if (epoch !== mountEpoch) return;
          tail.slice(idx, idx + MOUNT_CHUNK_SIZE).forEach((doc) => mountOne(inst, kind, doc));
        }
      })();
    } catch {
      // Overlay mount failures are non-critical; keep the diagram usable.
    }
  }

  function clear(inst, kind) {
    if (!inst) return;
    // Invalidate any pending chunks before tearing down.
    mountEpoch += 1;
    try {
      const overlays = inst.get("overlays");
      const map = docOverlayMapRef.current[kind];
      map.forEach((entry) => {
        try { overlays.remove(entry.overlayId); } catch {}
      });
      map.clear();
    } catch {}
  }

  return {
    mount,
    clear,
  };
}
