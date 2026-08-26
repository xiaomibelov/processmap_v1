import { describe, expect, it } from "vitest";
import { buildLayout } from "../src/layout.js";
import { allStepsOk, contourStarted } from "./fixtures/builders.js";
import { foldEvents } from "../src/fold.js";

describe("buildLayout", () => {
  it("is deterministic", () => {
    const rid = "rid_det";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
    ];
    const model = foldEvents(events);
    const a = buildLayout(model);
    const b = buildLayout(model);
    expect(a).toEqual(b);
  });

  it("assigns positive coordinates to all nodes", () => {
    const rid = "rid_pos";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
    ];
    const model = foldEvents(events);
    const layout = buildLayout(model);
    expect(layout.nodes.every((n) => n.x >= 0 && n.y >= 0)).toBe(true);
  });

  it("edges reference existing node ids", () => {
    const rid = "rid_edges";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
    ];
    const model = foldEvents(events);
    const layout = buildLayout(model);
    const nodeIds = new Set(layout.nodes.map((n) => n.id));
    expect(layout.edges.every((e) => nodeIds.has(e.from) && nodeIds.has(e.to))).toBe(true);
  });

  it("viewport contains all nodes", () => {
    const rid = "rid_vp";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
    ];
    const model = foldEvents(events);
    const layout = buildLayout(model);
    const { viewport } = layout;
    expect(
      layout.nodes.every(
        (n) =>
          n.x >= viewport.minX &&
          n.x + n.width <= viewport.maxX &&
          n.y >= viewport.minY &&
          n.y + n.height <= viewport.maxY
      )
    ).toBe(true);
  });

  it("renders empty model without error", () => {
    const layout = buildLayout([]);
    expect(layout.nodes).toHaveLength(0);
    expect(layout.viewport.maxX).toBeGreaterThan(layout.viewport.minX);
  });
});
