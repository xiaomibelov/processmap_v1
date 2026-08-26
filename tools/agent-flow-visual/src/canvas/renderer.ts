import {
  buildLayout,
  type ContourModel,
  type LayoutEdge,
  type LayoutNode,
  type LayoutViewport,
} from "agent-flow-core";
import type { Camera } from "./camera.js";

const COLORS = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  fg: "#0F172A",
  muted: "#64748B",
  primary: "#1E3A5F",
  accent: "#059669",
  error: "#DC2626",
  warning: "#F59E0B",
  border: "#E2E8F0",
};

export interface RendererOptions {
  dpr?: number;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera: Camera;
  private nodes: LayoutNode[] = [];
  private edges: LayoutEdge[] = [];
  private animationOffset = 0;
  private rafId: number | null = null;
  lastFrameTimeMs = 0;

  constructor(canvas: HTMLCanvasElement, camera: Camera, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.camera = camera;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
    const dpr = options.dpr ?? window.devicePixelRatio ?? 1;
    this.resize();
    this.ctx.scale(dpr, dpr);
  }

  resize(): void {
    const dpr = window.devicePixelRatio ?? 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  }

  setModel(model: ContourModel[]): LayoutViewport {
    const layout = buildLayout(model, {
      width: this.canvas.clientWidth,
      nodeWidth: 180,
      nodeHeight: 72,
      levelGap: 48,
      siblingGap: 28,
      contourGap: 80,
    });
    this.nodes = layout.nodes;
    this.edges = layout.edges;
    return layout.viewport;
  }

  getNodes(): LayoutNode[] {
    return this.nodes;
  }

  getEdges(): LayoutEdge[] {
    return this.edges;
  }

  start(): void {
    if (this.rafId !== null) return;
    const loop = () => {
      const start = performance.now();
      this.render();
      this.lastFrameTimeMs = performance.now() - start;
      this.animationOffset = (this.animationOffset + 0.05) % 1;
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  render(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, width, height);

    for (const edge of this.edges) {
      this.drawEdge(edge);
    }
    for (const node of this.nodes) {
      this.drawNode(node);
    }
  }

  private drawNode(node: LayoutNode): void {
    const { x: sx, y: sy } = this.camera.worldToScreen(node.x, node.y);
    const w = node.width * this.camera.scale;
    const h = node.height * this.camera.scale;

    this.ctx.save();
    this.ctx.fillStyle = COLORS.surface;
    this.ctx.strokeStyle = this.strokeForStatus(node.status);
    this.ctx.lineWidth = Math.max(1, 2 * this.camera.scale);
    this.roundRect(sx, sy, w, h, 6 * this.camera.scale);
    this.ctx.fill();
    this.ctx.stroke();

    // Label
    this.ctx.fillStyle = COLORS.fg;
    this.ctx.font = `${Math.max(10, 12 * this.camera.scale)}px system-ui`;
    this.ctx.textBaseline = "top";
    const label = this.truncate(node.label, w - 12 * this.camera.scale);
    this.ctx.fillText(label, sx + 8 * this.camera.scale, sy + 8 * this.camera.scale);

    // Status text
    this.ctx.fillStyle = COLORS.muted;
    this.ctx.font = `${Math.max(9, 10 * this.camera.scale)}px system-ui`;
    this.ctx.fillText(
      node.status,
      sx + 8 * this.camera.scale,
      sy + 26 * this.camera.scale
    );

    // Chips
    let chipX = sx + 8 * this.camera.scale;
    const chipY = sy + h - 20 * this.camera.scale;
    for (const chip of node.chips) {
      const chipWidth = this.drawChip(chipX, chipY, chip, this.camera.scale);
      chipX += chipWidth + 4 * this.camera.scale;
    }

    this.ctx.restore();
  }

  private drawChip(x: number, y: number, chip: LayoutNode["chips"][number], scale: number): number {
    const padding = 6 * scale;
    const text = chip.kind;
    this.ctx.font = `${Math.max(8, 9 * scale)}px system-ui`;
    const metrics = this.ctx.measureText(text);
    const w = metrics.width + padding * 2;
    const h = 14 * scale;

    this.ctx.fillStyle = "#E2E8F0";
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, h / 2);
    this.ctx.fill();

    this.ctx.fillStyle = COLORS.fg;
    this.ctx.fillText(text, x + padding, y + 2 * scale);

    return w;
  }

  private drawEdge(edge: LayoutEdge): void {
    const from = this.nodes.find((n) => n.id === edge.from);
    const to = this.nodes.find((n) => n.id === edge.to);
    if (!from || !to) return;

    const start = this.camera.worldToScreen(
      from.x + from.width,
      from.y + from.height / 2
    );
    const end = this.camera.worldToScreen(to.x, to.y + to.height / 2);

    this.ctx.save();
    this.ctx.strokeStyle = this.strokeForStatus(edge.status);
    this.ctx.lineWidth = Math.max(1, 1.5 * this.camera.scale);

    if (edge.animated) {
      this.ctx.setLineDash([8 * this.camera.scale, 6 * this.camera.scale]);
      this.ctx.lineDashOffset = -this.animationOffset * 14 * this.camera.scale;
    } else if (edge.status === "blocked") {
      this.ctx.setLineDash([4 * this.camera.scale, 4 * this.camera.scale]);
    }

    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    this.ctx.lineTo(end.x, end.y);
    this.ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowSize = 6 * this.camera.scale;
    this.ctx.beginPath();
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(
      end.x - arrowSize * Math.cos(angle - Math.PI / 6),
      end.y - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      end.x - arrowSize * Math.cos(angle + Math.PI / 6),
      end.y - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fillStyle = this.strokeForStatus(edge.status);
    this.ctx.fill();

    this.ctx.restore();
  }

  private strokeForStatus(status: string): string {
    switch (status) {
      case "ok":
      case "completed":
        return COLORS.accent;
      case "running":
      case "active":
        return COLORS.primary;
      case "fail":
      case "blocked":
        return COLORS.error;
      case "skipped":
        return COLORS.muted;
      default:
        return COLORS.border;
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.min(r, w / 2, h / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.arcTo(x + w, y, x + w, y + h, radius);
    this.ctx.arcTo(x + w, y + h, x, y + h, radius);
    this.ctx.arcTo(x, y + h, x, y, radius);
    this.ctx.arcTo(x, y, x + w, y, radius);
    this.ctx.closePath();
  }

  private truncate(text: string, maxWidth: number): string {
    let width = this.ctx.measureText(text).width;
    if (width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && width > maxWidth) {
      truncated = truncated.slice(0, -1);
      width = this.ctx.measureText(`${truncated}…`).width;
    }
    return `${truncated}…`;
  }
}
