// WS1.2 — панель: dock/float режимы, переключение, перетаскивание, localStorage.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import WorkspacePanel from "./WorkspacePanel";

let container;
let root;

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.localStorage.clear();
});

function q(testid) {
  return container.querySelector(`[data-testid="${testid}"]`);
}

describe("WorkspacePanel (WS1.2)", () => {
  it("starts docked; toggle switches to float and persists to localStorage", async () => {
    await act(async () => {
      root.render(React.createElement(WorkspacePanel, { title: "T", tabs: [], children: null }));
    });
    const panel = q("workspace-panel");
    expect(panel.getAttribute("data-mode")).toBe("dock");

    await act(async () => {
      q("panel-mode-toggle").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(panel.getAttribute("data-mode")).toBe("float");
    const saved = JSON.parse(window.localStorage.getItem("fpc_ws1_panel"));
    expect(saved.mode).toBe("float");
  });

  it("drags panel by header in float mode and persists position", async () => {
    window.localStorage.setItem("fpc_ws1_panel", JSON.stringify({ mode: "float", x: 100, y: 100 }));
    await act(async () => {
      root.render(React.createElement(WorkspacePanel, { title: "T", tabs: [], children: null }));
    });
    const panel = q("workspace-panel");
    expect(panel.style.left).toBe("100px");
    expect(panel.style.top).toBe("100px");

    const handle = q("panel-drag-handle");
    await act(async () => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 150, clientY: 150 }));
    });
    await act(async () => {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 220, clientY: 190 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(panel.style.left).toBe("170px");
    expect(panel.style.top).toBe("140px");
    const saved = JSON.parse(window.localStorage.getItem("fpc_ws1_panel"));
    expect(saved.x).toBe(170);
    expect(saved.y).toBe(140);
  });

  it("does not drag in dock mode", async () => {
    await act(async () => {
      root.render(React.createElement(WorkspacePanel, { title: "T", tabs: [], children: null }));
    });
    const panel = q("workspace-panel");
    const handle = q("panel-drag-handle");
    await act(async () => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 150, clientY: 150 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 400, clientY: 400 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(panel.style.left).toBe("");
    expect(panel.getAttribute("data-mode")).toBe("dock");
  });
});
