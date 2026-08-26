import type { LayoutNode } from "agent-flow-core";
import type { Camera } from "./camera.js";

export interface InteractionOptions {
  onSelectNode?: (node: LayoutNode | null) => void;
  onPan?: () => void;
  onZoom?: () => void;
}

export class Interaction {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private readonly nodes: () => LayoutNode[];
  private readonly options: InteractionOptions;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera,
    nodes: () => LayoutNode[],
    options: InteractionOptions = {}
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.nodes = nodes;
    this.options = options;

    canvas.addEventListener("mousedown", this.handleMouseDown);
    canvas.addEventListener("mousemove", this.handleMouseMove);
    canvas.addEventListener("mouseup", this.handleMouseUp);
    canvas.addEventListener("mouseleave", this.handleMouseUp);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  destroy(): void {
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("mouseup", this.handleMouseUp);
    this.canvas.removeEventListener("mouseleave", this.handleMouseUp);
    this.canvas.removeEventListener("wheel", this.handleWheel);
  }

  private handleMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (!e.shiftKey) {
      const node = this.hitTest(e.clientX, e.clientY);
      this.options.onSelectNode?.(node ?? null);
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.camera.pan(dx, dy);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.options.onPan?.();
  };

  private handleMouseUp = (): void => {
    this.isDragging = false;
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const centerX = e.clientX - rect.left;
    const centerY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.camera.zoomBy(factor, centerX, centerY);
    this.options.onZoom?.();
  };

  private hitTest(screenX: number, screenY: number): LayoutNode | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const x = screenX - rect.left;
    const y = screenY - rect.top;
    // Iterate in reverse to hit top-most first.
    for (let i = this.nodes().length - 1; i >= 0; i--) {
      const node = this.nodes()[i];
      const { x: sx, y: sy } = this.camera.worldToScreen(node.x, node.y);
      const sw = node.width * this.camera.scale;
      const sh = node.height * this.camera.scale;
      if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) {
        return node;
      }
    }
    return undefined;
  }
}
