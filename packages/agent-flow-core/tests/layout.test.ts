import { describe, expect, it } from "vitest";
import { buildLayout } from "../src/layout.js";
import { allStepsOk, contourStarted, stepFinished, stepStarted } from "./fixtures/builders.js";
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

  it("populates zoetrope-style node fields", () => {
    const rid = "rid_fields";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      stepStarted("feature/x", "plan", undefined, {
        run_id: rid,
        description: "Plan it",
      }),
      { ts: new Date().toISOString(), event: "tool.started", contour_id: "feature/x", run_id: rid, step: "plan", tool: "Read" },
      { ts: new Date().toISOString(), event: "tool.finished", contour_id: "feature/x", run_id: rid, step: "plan", tool: "Read", result: "ok" },
      { ts: new Date().toISOString(), event: "tokens.used", contour_id: "feature/x", run_id: rid, step: "plan", tokens: 120 },
      stepFinished("feature/x", "plan", "ok", undefined, { run_id: rid }),
    ];
    const model = foldEvents(events);
    const layout = buildLayout(model);
    const stepNode = layout.nodes.find((n) => n.title === "plan");
    expect(stepNode).toBeDefined();
    expect(stepNode?.description).toBe("Plan it");
    expect(stepNode?.toolCount).toBe(1);
    expect(stepNode?.lastTool).toBe("Read");
    expect(stepNode?.outputTokens).toBe(120);
    expect(stepNode?.parentId).toMatch(/:root$/);
  });

  it("places root above children in hierarchical layout", () => {
    const rid = "rid_hierarchy";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
    ];
    const model = foldEvents(events);
    const layout = buildLayout(model);
    const root = layout.nodes.find((n) => n.parentId === null);
    const children = layout.nodes.filter((n) => n.parentId === root?.id);
    expect(root).toBeDefined();
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((c) => c.y > root!.y)).toBe(true);
  });
});
