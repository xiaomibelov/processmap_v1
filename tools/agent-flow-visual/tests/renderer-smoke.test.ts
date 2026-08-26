import { describe, expect, it, vi } from "vitest";
import { foldEvents } from "agent-flow-core";
import { Camera } from "../src/canvas/camera.js";
import { Renderer } from "../src/canvas/renderer.js";
import {
  allStepsOk,
  contourStarted,
} from "../../../packages/agent-flow-core/tests/fixtures/builders.js";

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arcTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    clearRect: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn(() => ({ width: 60 })),
    fillText: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    roundRect: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => "",
  });
  return canvas;
}

describe("Renderer smoke", () => {
  it("initializes a canvas renderer", () => {
    const canvas = createMockCanvas();
    const camera = new Camera();
    const renderer = new Renderer(canvas, camera);
    expect(renderer).toBeDefined();
  });

  it("renders a model without throwing", () => {
    const rid = "rid_renderer";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
    ];
    const model = foldEvents(events);

    const canvas = createMockCanvas();
    const camera = new Camera();
    const renderer = new Renderer(canvas, camera);
    const viewport = renderer.setModel(model);
    renderer.render();

    expect(viewport.maxX).toBeGreaterThan(viewport.minX);
    expect(renderer.getNodes().length).toBeGreaterThan(0);
  });
});
