import type { LayoutNode, LayoutViewport } from "agent-flow-core";

export interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

export class Camera {
  x = 0;
  y = 0;
  scale = 1;

  private readonly minScale = 0.1;
  private readonly maxScale = 5;
  private target: CameraTransform | null = null;

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  zoomTo(newScale: number, centerX = 0, centerY = 0): void {
    const oldScale = this.scale;
    const clamped = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    const scaleRatio = clamped / oldScale;
    this.x = centerX - (centerX - this.x) * scaleRatio;
    this.y = centerY - (centerY - this.y) * scaleRatio;
    this.scale = clamped;
  }

  zoomBy(factor: number, centerX = 0, centerY = 0): void {
    this.zoomTo(this.scale * factor, centerX, centerY);
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.scale = 1;
  }

  fit(viewport: LayoutViewport, width: number, height: number, padding = 40): void {
    const contentWidth = viewport.maxX - viewport.minX;
    const contentHeight = viewport.maxY - viewport.minY;
    if (contentWidth <= 0 || contentHeight <= 0) {
      this.reset();
      return;
    }
    const scaleX = (width - padding * 2) / contentWidth;
    const scaleY = (height - padding * 2) / contentHeight;
    this.scale = Math.min(scaleX, scaleY, this.maxScale);
    this.x = width / 2 - (viewport.minX + contentWidth / 2) * this.scale;
    this.y = height / 2 - (viewport.minY + contentHeight / 2) * this.scale;
    this.target = null;
  }

  /**
   * Center the camera on a node while preserving the current zoom level.
   */
  centerOn(node: LayoutNode, width: number, height: number): void {
    this.x = width / 2 - (node.x + node.width / 2) * this.scale;
    this.y = height / 2 - (node.y + node.height / 2) * this.scale;
    this.target = null;
  }

  /**
   * Start a smooth interpolation to center on a node.
   */
  smoothCenterOn(node: LayoutNode, width: number, height: number): void {
    const targetX = width / 2 - (node.x + node.width / 2) * this.scale;
    const targetY = height / 2 - (node.y + node.height / 2) * this.scale;
    this.target = { x: targetX, y: targetY, scale: this.scale };
  }

  /**
   * Advance the camera towards its target. Call once per frame.
   */
  update(dt = 16): void {
    if (!this.target) return;
    const t = 1 - Math.exp(-dt / 120);
    this.x += (this.target.x - this.x) * t;
    this.y += (this.target.y - this.y) * t;
    this.scale += (this.target.scale - this.scale) * t;
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      this.x = this.target.x;
      this.y = this.target.y;
      this.scale = this.target.scale;
      this.target = null;
    }
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.scale + this.x,
      y: wy * this.scale + this.y,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.x) / this.scale,
      y: (sy - this.y) / this.scale,
    };
  }
}
