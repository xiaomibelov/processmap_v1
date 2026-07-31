// @vitest-environment jsdom
// OL1 — компонентный тест OverlayGraphCanvas: слои, z-order, hit-priority,
// read-only AS IS (нет drag), подсветка трассировки, переключение связей.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import OverlayGraphCanvas from "./OverlayGraphCanvas.jsx";
import { buildTraceIndex } from "./overlay";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ASIS = {
  nodes: [
    { id: "A", bpmn_type: "task", name: "AS IS A", x: 100, y: 100, width: 120, height: 80 },
    { id: "B", bpmn_type: "task", name: "AS IS B", x: 300, y: 100, width: 120, height: 80 },
  ],
  flows: [{ id: "F_as", source_ref: "A", target_ref: "B", condition: "" }],
  lanes: [],
};
const TOBE = {
  nodes: [
    // A' намеренно ПЕРЕКРЫВАЕТ AS IS A (hit-testing пересечения)
    { id: "A", bpmn_type: "task", name: "TO BE A", x: 100, y: 220, width: 120, height: 80, derived_from: ["A"] },
    { id: "D2", bpmn_type: "task", name: "TO BE D2", x: 300, y: 220, width: 120, height: 80, derived_from: ["B"] },
  ],
  flows: [{ id: "F_tb", source_ref: "A", target_ref: "D2", condition: "" }],
  lanes: [],
};
const TRACE = buildTraceIndex([{ element_id: "A", draft_node_ids: ["A"] }, { element_id: "B", draft_node_ids: ["D2"] }], TOBE);

let container;
let root;

function render(props = {}) {
  act(() => {
    root.render(
      React.createElement(OverlayGraphCanvas, {
        asIsModel: ASIS,
        tobeModel: TOBE,
        traceIndex: TRACE,
        ...props,
      }),
    );
  });
  return container;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OL1.1: слои и z-order", () => {
  it("один svg, группа TO BE ПОСЛЕ AS IS (hit-priority верхнего слоя)", () => {
    render();
    const svg = container.querySelector("svg.graph-canvas--overlay");
    expect(svg).toBeTruthy();
    const layers = [...svg.children].filter((el) => el.tagName === "g" && el.dataset.layer);
    expect(layers.map((el) => el.dataset.layer)).toEqual(["asis", "tobe"]);
  });

  it("AS IS-слой приглушён через CSS-переменную темы (не хардкод)", () => {
    render();
    const asis = container.querySelector('[data-layer="asis"]');
    expect(asis.classList.contains("graph-canvas__layer--asis")).toBe(true);
    // сама группа не несёт inline-стиля opacity — только класс с var()
    expect(asis.getAttribute("style") || "").not.toContain("opacity");
  });

  it("без asIsModel — только слой TO BE («с чистого листа»)", () => {
    render({ asIsModel: null });
    expect(container.querySelector('[data-layer="asis"]')).toBeNull();
    expect(container.querySelector('[data-layer="tobe"]')).toBeTruthy();
  });
});

describe("OL1.5: выделение и read-only AS IS", () => {
  it("клик по TO BE-узлу → onSelectTobeNode; по AS IS → onSelectAsisNode", () => {
    const onTobe = vi.fn();
    const onAsis = vi.fn();
    render({ onSelectTobeNode: onTobe, onSelectAsisNode: onAsis });
    const tobeNode = container.querySelector('[data-layer="tobe"] g[data-element-id="D2"]');
    act(() => { tobeNode.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onTobe).toHaveBeenCalledWith("D2");
    expect(onAsis).not.toHaveBeenCalled();
    const asisNode = container.querySelector('[data-layer="asis"] g[data-element-id="A"]');
    act(() => { asisNode.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onAsis).toHaveBeenCalledWith("A");
  });

  it("AS IS-узлы БЕЗ pointerdown-drag (read-only инвариант)", () => {
    const onMove = vi.fn();
    render({ onNodeMove: onMove });
    const asisNode = container.querySelector('[data-layer="asis"] g[data-element-id="A"]');
    // у AS IS-узла не должно быть обработчика pointerdown (drag не начинается)
    act(() => { asisNode.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 })); });
    act(() => {
      container.querySelector("svg").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 60 }));
      container.querySelector("svg").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("TO BE-узел: pointerdown включает drag (onNodeMove вызывается)", () => {
    const onMove = vi.fn();
    render({ onNodeMove: onMove });
    const tobeNode = container.querySelector('[data-layer="tobe"] g[data-element-id="D2"]');
    act(() => { tobeNode.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 })); });
    act(() => {
      container.querySelector("svg").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 60 }));
      container.querySelector("svg").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(onMove).toHaveBeenCalledWith("D2", expect.any(Number), expect.any(Number));
  });
});

describe("OL1.3/OL1.4: подсветка и связи происхождения", () => {
  it("выделение TO BE → ореол на AS IS-источнике + пунктир при selection-режиме", () => {
    render({ selectedTobeId: "D2" });
    const asisB = container.querySelector('[data-layer="asis"] g[data-element-id="B"]');
    expect(asisB.classList.contains("graph-canvas__node--trace-highlight")).toBe(true);
    const links = container.querySelectorAll('[data-testid="trace-link"]');
    expect(links).toHaveLength(1);
    expect(links[0].dataset.tobe).toBe("D2");
    expect(links[0].dataset.asis).toBe("B");
  });

  it("выделение AS IS → ореол на TO BE-потомках", () => {
    render({ selectedAsisId: "B" });
    const tobeD2 = container.querySelector('[data-layer="tobe"] g[data-element-id="D2"]');
    expect(tobeD2.classList.contains("graph-canvas__node--trace-highlight")).toBe(true);
  });

  it("режим always — все связи происхождения", () => {
    render({ traceLinksMode: "always" });
    expect(container.querySelectorAll('[data-testid="trace-link"]').length).toBe(2);
  });

  it("бейджи решений — только на TO BE-слое (OL1.6)", () => {
    render({ nodeBadges: { A: { text: "✓", className: "graph-canvas__badge--accepted" } } });
    const badges = container.querySelectorAll("[data-badge-for]");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest('[data-layer="tobe"]')).toBeTruthy();
  });
});
