// Shared jsdom environment fixes for characterization tests (vitest.config.char.js).
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom lacks ResizeObserver (used by ExplorerMarqueeText / table layout).
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom lacks scrollIntoView (focus management in dialogs/menus).
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom lacks window.matchMedia (useViewportBelow in WorkspaceSidebar counters).
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query) => ({
    matches: false,
    media: String(query || ""),
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

// The codebase still uses window.confirm in one delete path (WorkspaceExplorer.jsx).
// Characterization tests stub it explicitly; default keeps current behavior.
if (!window.__charConfirmStub) {
  window.confirm = vi.fn(() => true);
  window.__charConfirmStub = true;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
