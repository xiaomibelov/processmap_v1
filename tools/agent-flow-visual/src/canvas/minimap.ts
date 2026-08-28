import type { Camera } from "./camera.js";
import type { LayoutNode, LayoutViewport } from "agent-flow-core";
import { PALETTE } from "./renderer.js";

export interface MinimapRenderContext {
  width: number;
  height: number;
  viewport: LayoutViewport;
  camera: Camera;
  nodes: LayoutNode[];
}

export class Minimap {
  private readonly size = 160;
  private readonly padding = 12;

  render(ctx: CanvasRenderingContext2D, context: MinimapRenderContext): void {
    const { width, height, viewport, camera, nodes } = context;
    if (nodes.length === 0) return;

    const mapW = this.size;
    const mapH = this.size;
    const x = width - mapW - this.padding;
    const y = this.padding;

    const contentW = Math.max(1, viewport.maxX - viewport.minX);
    const contentH = Math.max(1, viewport.maxY - viewport.minY);
    const scale = Math.min(mapW / contentW, mapH / contentH);

    ctx.save();

    // Minimap panel background.
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, mapW, mapH, 6);
    ctx.fill();
    ctx.stroke();

    // Helper to map world coordinates to minimap coordinates.
    const mx = (wx: number) => x + (wx - viewport.minX) * scale;
    const my = (wy: number) => y + (wy - viewport.minY) * scale;

    // Draw all nodes as tiny rectangles.
    for (const node of nodes) {
      const color = this.colorForStatus(node.status);
      ctx.fillStyle = color;
      const nx = mx(node.x);
      const ny = my(node.y);
      const nw = Math.max(2, node.width * scale);
      const nh = Math.max(2, node.height * scale);
      ctx.fillRect(nx, ny, nw, nh);
    }

    // Draw viewport rectangle.
    const vX = (-camera.x / camera.scale - viewport.minX) * scale;
    const vY = (-camera.y / camera.scale - viewport.minY) * scale;
    const vW = (width / camera.scale) * scale;
    const vH = (height / camera.scale) * scale;

    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + vX, y + vY, vW, vH);

    ctx.restore();
  }

  private colorForStatus(status: string): string {
    switch (status) {
      case "ok":
      case "completed":
        return PALETTE.gold;
      case "running":
      case "active":
        return PALETTE.green;
      case "fail":
      case "blocked":
        return PALETTE.error;
      default:
        return PALETTE.dim;
    }
  }
}
