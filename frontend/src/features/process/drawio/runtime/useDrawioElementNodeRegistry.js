import { useCallback, useEffect, useRef } from "react";

/**
 * Builds and maintains a Map<elementId → DOMNode> for all draw.io elements
 * currently in the DOM. Replaces querySelectorAll("[data-drawio-el-id]") lookups
 * (O(n) per call) with O(1) Map lookups.
 *
 * The registry is rebuilt once after renderedBody changes (one O(n) scan),
 * then all subsequent lookups by any hook are O(1).
 *
 * Returns:
 *   - registryRef: RefObject<Map<string, Element>> — always current, safe to read in event handlers
 *   - getNode(elementId): Element | null — O(1) lookup
 *   - rebuildRegistry(): void — force rebuild (call after DOM mutations if needed)
 */
export default function useDrawioElementNodeRegistry({ rootRef, renderedBody }) {
  const registryRef = useRef(/** @type {Map<string, Element>} */ (new Map()));

  const rebuildRegistry = useCallback(() => {
    const root = rootRef.current;
    const map = registryRef.current;
    map.clear();
    if (!(root instanceof Element)) return;
    const nodes = root.querySelectorAll("[data-drawio-el-id]");
    for (const node of nodes) {
      const id = node.getAttribute("data-drawio-el-id");
      if (id) map.set(id, node);
    }
  }, [rootRef]);

  // Rebuild after every renderedBody change (SVG re-render).
  // Use rAF so the DOM has been updated before we scan.
  useEffect(() => {
    let rafId = requestAnimationFrame(rebuildRegistry);
    return () => cancelAnimationFrame(rafId);
  }, [renderedBody, rebuildRegistry]);

  const getNode = useCallback((elementId) => {
    const id = String(elementId || "").trim();
    if (!id) return null;
    const cached = registryRef.current.get(id);
    if (cached instanceof Element) return cached;
    // Fallback: re-scan once in case registry is stale
    rebuildRegistry();
    return registryRef.current.get(id) ?? null;
  }, [rebuildRegistry]);

  return { registryRef, getNode, rebuildRegistry };
}
