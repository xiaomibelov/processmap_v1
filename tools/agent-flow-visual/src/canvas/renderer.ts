import {
  buildLayout,
  type ContourModel,
  type LayoutEdge,
  type LayoutNode,
  type LayoutViewport,
} from "agent-flow-core";
import type { Camera } from "./camera.js";
import { Minimap } from "./minimap.js";

export const PALETTE = {
  canvasBg: "#121212",
  panel: "#1c1c1c",
  ink: "#0f0f0f",
  gold: "#d7af00",
  goldBright: "#f0d56a",
  green: "#87d787",
  dim: "#585858",
  bright: "#e6e6e6",
  subtle: "#9a9a9a",
  border: "#343434",
  error: "#ef4444",
  mono: 'ui-monospace, "SF Mono", "Fira Code", "JetBrains Mono", Menlo, Consolas, monospace',
};

export interface RendererOptions {
  dpr?: number;
  showMinimap?: boolean;
}

export interface ToolChip {
  nodeId: string;
  name: string;
  count: number;
  status: "pending" | "ok" | "fail";
  ageMs: number;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera: Camera;
  private readonly minimap: Minimap;
  private nodes: LayoutNode[] = [];
  private edges: LayoutEdge[] = [];
  private viewport: LayoutViewport = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private animationOffset = 0;
  private rafId: number | null = null;
  private showMinimap: boolean;
  private readonly chips: Map<string, ToolChip> = new Map();
  lastFrameTimeMs = 0;

  constructor(canvas: HTMLCanvasElement, camera: Camera, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.showMinimap = options.showMinimap ?? true;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
    this.minimap = new Minimap();
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

  setShowMinimap(show: boolean): void {
    this.showMinimap = show;
  }

  setModel(model: ContourModel[]): LayoutViewport {
    const layout = buildLayout(model, {
      width: this.canvas.clientWidth,
      nodeWidth: 180,
      nodeHeight: 90,
      levelGap: 64,
      siblingGap: 32,
      contourGap: 120,
    });
    return this.setLayout(layout);
  }

  setLayout(layout: { nodes: LayoutNode[]; edges: LayoutEdge[]; viewport: LayoutViewport }): LayoutViewport {
    this.nodes = layout.nodes;
    this.edges = layout.edges;
    this.viewport = layout.viewport;
    this.reconcileChips();
    return layout.viewport;
  }

  getNodes(): LayoutNode[] {
    return this.nodes;
  }

  getEdges(): LayoutEdge[] {
    return this.edges;
  }

  getViewport(): LayoutViewport {
    return this.viewport;
  }

  start(): void {
    if (this.rafId !== null) return;
    let lastTime = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;
      this.camera.update(dt);
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

    this.drawBackground(width, height);

    for (const edge of this.edges) {
      this.drawEdge(edge);
    }
    for (const node of this.nodes) {
      this.drawNode(node);
    }

    this.drawChips();

    if (this.showMinimap) {
      this.minimap.render(this.ctx, {
        width,
        height,
        viewport: this.viewport,
        camera: this.camera,
        nodes: this.nodes,
      });
    }
  }

  private drawBackground(width: number, height: number): void {
    this.ctx.fillStyle = PALETTE.canvasBg;
    this.ctx.fillRect(0, 0, width, height);

    // Dot grid: radial-gradient dots, ~22px spacing.
    const spacing = 22;
    const dotSize = 1.5;
    const offsetX = this.camera.x % spacing;
    const offsetY = this.camera.y % spacing;
    this.ctx.fillStyle = "rgba(120, 120, 120, 0.16)";
    for (let x = offsetX; x < width; x += spacing) {
      for (let y = offsetY; y < height; y += spacing) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawNode(node: LayoutNode): void {
    const { x: sx, y: sy } = this.camera.worldToScreen(node.x, node.y);
    const w = node.width * this.camera.scale;
    const h = node.height * this.camera.scale;
    if (w < 2 || h < 2) return;

    const statusColor = this.colorForStatus(node.status);

    this.ctx.save();

    // Card shadow / glow for running nodes.
    if (node.status === "running") {
      this.ctx.shadowColor = statusColor;
      this.ctx.shadowBlur = 10 * this.camera.scale;
    }

    // Card background.
    this.ctx.fillStyle = PALETTE.panel;
    this.roundRect(sx, sy, w, h, 6 * this.camera.scale);
    this.ctx.fill();

    // Left border glow.
    const borderW = Math.max(2, 3 * this.camera.scale);
    this.ctx.fillStyle = statusColor;
    this.roundRect(sx, sy, borderW, h, 2 * this.camera.scale);
    this.ctx.fill();

    // Border stroke.
    this.ctx.strokeStyle = node.status === "running" ? statusColor : PALETTE.border;
    this.ctx.lineWidth = Math.max(1, 1.5 * this.camera.scale);
    this.roundRect(sx, sy, w, h, 6 * this.camera.scale);
    this.ctx.stroke();

    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;

    const padding = Math.max(8, 10 * this.camera.scale);
    const textX = sx + padding + borderW;
    const lineH = Math.max(12, 14 * this.camera.scale);
    const baseFont = Math.max(9, 11 * this.camera.scale);

    // Title row: glyph + name.
    let y = sy + padding;
    this.ctx.font = `${baseFont + 1}px ${PALETTE.mono}`;
    this.ctx.textBaseline = "top";
    this.ctx.fillStyle = statusColor;
    const glyph = this.glyphForStatus(node.status);
    this.ctx.fillText(glyph, textX, y);

    const glyphW = this.ctx.measureText(glyph).width + 4 * this.camera.scale;
    this.ctx.fillStyle = PALETTE.bright;
    this.ctx.font = `bold ${baseFont + 1}px ${PALETTE.mono}`;
    const title = this.truncate(node.title, w - padding * 2 - borderW - glyphW);
    this.ctx.fillText(title, textX + glyphW, y);

    // Description line.
    y += lineH;
    if (node.description && h > lineH * 3) {
      this.ctx.fillStyle = PALETTE.subtle;
      this.ctx.font = `${baseFont}px ${PALETTE.mono}`;
      const desc = this.truncate(node.description, w - padding * 2 - borderW);
      this.ctx.fillText(desc, textX, y);
    }

    // Tools line: ⚒ N · last_tool in gold.
    y += lineH;
    if (h > lineH * 4) {
      this.ctx.fillStyle = PALETTE.gold;
      this.ctx.font = `${baseFont}px ${PALETTE.mono}`;
      const toolsText = node.lastTool
        ? `⚒ ${node.toolCount} · ${node.lastTool}`
        : `⚒ ${node.toolCount}`;
      const tools = this.truncate(toolsText, w - padding * 2 - borderW);
      this.ctx.fillText(tools, textX, y);
    }

    // Footer: status word + token count.
    y += lineH;
    if (h > lineH * 5) {
      this.ctx.fillStyle = statusColor;
      this.ctx.font = `${baseFont}px ${PALETTE.mono}`;
      const word = this.statusWord(node.status);
      this.ctx.fillText(word, textX, y);

      if (node.outputTokens > 0) {
        const tok = `${this.fmtTokens(node.outputTokens)} tok`;
        this.ctx.fillStyle = PALETTE.dim;
        const tokW = this.ctx.measureText(tok).width;
        this.ctx.fillText(tok, sx + w - padding - tokW, y);
      }
    }

    this.ctx.restore();
  }

  private drawChips(): void {
    this.reconcileChips();
    for (const chip of this.chips.values()) {
      this.drawChip(chip);
    }
  }

  private drawChip(chip: ToolChip): void {
    const node = this.nodes.find((n) => n.id === chip.nodeId);
    if (!node) return;

    const { x: sx, y: sy } = this.camera.worldToScreen(node.x, node.y);
    const w = node.width * this.camera.scale;
    const h = node.height * this.camera.scale;
    if (w < 40) return;

    const padding = Math.max(8, 10 * this.camera.scale);
    const chipY = sy + h + 4 * this.camera.scale;
    const chipX = sx + padding;

    let text = `⚒ ${chip.name}`;
    if (chip.count > 1) text += ` ×${chip.count}`;
    if (chip.status === "ok") text += " ✓";
    if (chip.status === "fail") text += " ✗";

    this.ctx.font = `${Math.max(9, 10 * this.camera.scale)}px ${PALETTE.mono}`;
    const textW = this.ctx.measureText(text).width;
    const chipH = Math.max(16, 18 * this.camera.scale);
    const chipW = textW + padding;

    this.ctx.save();
    this.ctx.fillStyle =
      chip.status === "pending" ? PALETTE.gold : chip.status === "fail" ? PALETTE.error : PALETTE.green;
    this.ctx.globalAlpha = Math.max(0.4, 1 - chip.ageMs / 2500);
    this.roundRect(chipX, chipY, chipW, chipH, chipH / 2);
    this.ctx.fill();

    this.ctx.fillStyle = PALETTE.ink;
    this.ctx.globalAlpha = 1;
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, chipX + padding / 2, chipY + chipH / 2);
    this.ctx.restore();
  }

  private reconcileChips(): void {
    // Build aggregated chip state from active/running nodes.
    const next = new Map<string, ToolChip>();
    for (const node of this.nodes) {
      if (node.status !== "running" && node.status !== "active") continue;
      if (node.toolCount === 0 && !node.lastTool) continue;

      const key = `${node.id}:${node.lastTool ?? "tool"}`;
      const existing = this.chips.get(key);
      next.set(key, {
        nodeId: node.id,
        name: node.lastTool ?? "tool",
        count: Math.max(1, node.toolCount),
        status: "pending",
        ageMs: existing ? existing.ageMs + 16 : 0,
      });
    }
    this.chips.clear();
    for (const [k, v] of next) this.chips.set(k, v);
  }

  private drawEdge(edge: LayoutEdge): void {
    const from = this.nodes.find((n) => n.id === edge.from);
    const to = this.nodes.find((n) => n.id === edge.to);
    if (!from || !to) return;

    const start = this.camera.worldToScreen(
      from.x + from.width / 2,
      from.y + from.height
    );
    const end = this.camera.worldToScreen(
      to.x + to.width / 2,
      to.y
    );

    this.ctx.save();
    this.ctx.strokeStyle = this.colorForStatus(edge.status);
    this.ctx.lineWidth = Math.max(1, 2 * this.camera.scale);

    if (edge.animated) {
      const dash = 8 * this.camera.scale;
      const gap = 6 * this.camera.scale;
      this.ctx.setLineDash([dash, gap]);
      this.ctx.lineDashOffset = -this.animationOffset * (dash + gap);
    } else if (edge.status === "blocked") {
      this.ctx.setLineDash([4 * this.camera.scale, 4 * this.camera.scale]);
    }

    // Cubic bezier for parent-child hierarchy.
    const cp1 = { x: start.x, y: start.y + (end.y - start.y) * 0.5 };
    const cp2 = { x: end.x, y: end.y - (end.y - start.y) * 0.5 };
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    this.ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    this.ctx.stroke();

    // Arrowhead at target.
    const angle = Math.atan2(end.y - cp2.y, end.x - cp2.x);
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
    this.ctx.fillStyle = this.colorForStatus(edge.status);
    this.ctx.fill();

    this.ctx.restore();
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
      case "stopped":
        return PALETTE.dim;
      case "idle":
        return PALETTE.subtle;
      case "skipped":
        return PALETTE.dim;
      default:
        return PALETTE.dim;
    }
  }

  private glyphForStatus(status: string): string {
    switch (status) {
      case "running":
      case "active":
        return "●";
      case "ok":
      case "completed":
        return "✓";
      case "fail":
      case "blocked":
        return "✗";
      case "stopped":
        return "■";
      case "idle":
        return "◌";
      default:
        return "◌";
    }
  }

  private statusWord(status: string): string {
    switch (status) {
      case "running":
      case "active":
        return "Running";
      case "ok":
      case "completed":
        return "Done";
      case "fail":
      case "blocked":
        return "Failed";
      case "stopped":
        return "Stopped";
      case "idle":
        return "Idle";
      case "skipped":
        return "Skipped";
      default:
        return "Pending";
    }
  }

  private fmtTokens(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(1)}M`;
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
    this.ctx.font = `${Math.max(9, 11 * this.camera.scale)}px ${PALETTE.mono}`;
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
