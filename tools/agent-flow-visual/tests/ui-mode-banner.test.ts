import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { App } from "../src/app.js";
import type { ContourModel } from "agent-flow-core";

let originalCreateElement: typeof document.createElement;

function createMockCanvas(): HTMLCanvasElement {
  const canvas = originalCreateElement("canvas");
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

function makeContour(id: string): ContourModel {
  return {
    contourId: id,
    type: "feature",
    name: id.split("/").pop() ?? id,
    branch: id,
    runId: `scan-${id}`,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: [],
    approvalGates: [],
    files: [],
  };
}

describe("App mode banners", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi
      .spyOn(document, "createElement")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((tagName: string, options?: any) => {
        const el = originalCreateElement(tagName, options);
        if (tagName.toLowerCase() === "canvas") {
          return createMockCanvas();
        }
        return el;
      });
  });

  afterEach(() => {
    createElementSpy?.mockRestore();
  });

  it("shows SNAPSHOT banner in snapshot mode", () => {
    const root = document.createElement("div");
    root.id = "app";
    document.body.append(root);

    const app = new App({
      root,
      events: [],
      initialContours: [makeContour("feature/test")],
      mode: "snapshot",
    });

    expect(root.textContent).toContain("SNAPSHOT");
    expect(root.textContent).toContain("test");

    app.destroy();
    root.remove();
  });

  it("shows DEMO DATA banner when demo mode is requested", () => {
    const root = document.createElement("div");
    root.id = "app";
    document.body.append(root);

    const app = new App({
      root,
      events: [],
      initialContours: [makeContour("feature/demo")],
      mode: "demo",
    });

    expect(root.textContent).toContain("DEMO DATA");

    app.destroy();
    root.remove();
  });
});
