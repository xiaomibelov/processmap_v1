import { foldEvents, type ContourModel, type LayoutNode, type RawEvent } from "agent-flow-core";
import { Camera } from "./canvas/camera.js";
import { Interaction } from "./canvas/interaction.js";
import { PALETTE, Renderer } from "./canvas/renderer.js";
import { InspectorPanel } from "./inspector/panel.js";

import { LogTailer } from "./io/log-tailer.js";
import { TimelineController } from "./timeline/controller.js";
import { TimelineUI } from "./timeline/ui.js";
import { createScannerClient } from "./io/scanner.js";

export type AppMode = "live" | "replay" | "snapshot" | "demo";
export type CameraMode = "follow" | "overview";

export interface AppOptions {
  root: HTMLElement;
  events: RawEvent[];
  initialContours?: ContourModel[];
  title?: string;
  mode?: AppMode;
  /** If provided, live-tail this path for new events. */
  tailPath?: string;
}

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export class App {
  private readonly root: HTMLElement;
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly timelineController: TimelineController | null = null;
  private readonly timelineUI: TimelineUI | null = null;
  private readonly inspector: InspectorPanel;
  private readonly statusBar: HTMLElement;
  private readonly helpOverlay: HTMLElement;
  private readonly infoOverlay: HTMLElement;
  private readonly artifactOverlay: HTMLElement;
  private readonly canvasContainer: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly sidebar: HTMLElement;
  private readonly timelineContainer: HTMLElement;
  private readonly title: string;
  private readonly mode: AppMode;
  private readonly isSnapshot: boolean;
  private cameraMode: CameraMode = "follow";
  private showHelp = false;
  private showInfo = false;
  private tailer: LogTailer | null = null;
  private destroyed = false;
  private lastModel: ContourModel[] = [];
  private snapshotContours: ContourModel[] = [];
  private lastEventModel: ContourModel[] = [];
  private selectedNodeId: string | null = null;
  private autoRefreshEnabled = true;
  private autoRefreshMs = 5000;
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private lastUpdatedAt = "";
  private filters = { type: "all", status: "all", search: "" };

  constructor(options: AppOptions) {
    this.root = options.root;
    this.title = options.title ?? "session";
    this.mode = options.mode ?? (options.events.length > 0 ? "replay" : "live");
    this.isSnapshot = this.mode === "snapshot";
    this.root.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;background:" + PALETTE.canvasBg;

    this.toolbar = document.createElement("div");
    this.toolbar.style.cssText = `
      display:flex;align-items:center;gap:10px;padding:6px 12px;
      background:${PALETTE.ink};border-bottom:1px solid ${PALETTE.border};
      color:${PALETTE.bright};font-family:${PALETTE.mono};font-size:12px;flex-shrink:0;
    `;

    this.canvasContainer = document.createElement("div");
    this.canvasContainer.style.cssText = "flex:1;position:relative;overflow:hidden;";

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    this.canvasContainer.append(canvas);

    const inspectorContainer = document.createElement("div");
    this.canvasContainer.append(inspectorContainer);

    this.sidebar = document.createElement("div");
    this.sidebar.style.cssText = `
      position:absolute;top:12px;left:12px;bottom:12px;width:240px;
      background:${PALETTE.panel};border:1px solid ${PALETTE.border};border-radius:8px;
      padding:10px;overflow:auto;color:${PALETTE.bright};font-family:${PALETTE.mono};font-size:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:50;
    `;
    this.canvasContainer.append(this.sidebar);

    this.artifactOverlay = document.createElement("div");
    this.artifactOverlay.style.cssText = `
      position:absolute;top:0;left:0;right:0;bottom:0;display:none;
      align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:110;
    `;
    this.canvasContainer.append(this.artifactOverlay);

    this.timelineContainer = document.createElement("div");
    this.timelineContainer.style.cssText = "flex-shrink:0;";

    this.statusBar = document.createElement("div");
    this.helpOverlay = document.createElement("div");
    this.infoOverlay = document.createElement("div");

    this.root.append(
      this.toolbar,
      this.canvasContainer,
      this.timelineContainer,
      this.statusBar,
      this.helpOverlay,
      this.infoOverlay
    );

    this.camera = new Camera();
    this.renderer = new Renderer(canvas, this.camera, { showMinimap: true });

    if (this.isSnapshot && options.initialContours) {
      this.snapshotContours = options.initialContours;
    }

    const model = this.isSnapshot ? this.applyFiltersToModel(this.snapshotContours) : foldEvents(options.events);
    this.lastModel = model;
    const viewport = this.renderer.setModel(model);
    this.camera.fit(viewport, canvas.clientWidth, canvas.clientHeight);

    if (!this.isSnapshot) {
      this.timelineController = new TimelineController(options.events, {
        onUpdate: (m) => this.handleTimelineUpdate(m),
      });
      this.timelineUI = new TimelineUI(this.timelineContainer, this.timelineController);
      this.timelineController.seek(this.mode === "live" && options.events.length === 0 ? 0 : this.timelineController.liveIndex);
    } else {
      this.timelineContainer.style.display = "none";
      // Avoid noisy failed polling in test environments (about:blank).
      if (typeof window !== "undefined" && window.location.protocol !== "about:") {
        this.startAutoRefresh();
      }
    }

    this.inspector = new InspectorPanel(inspectorContainer, {
      onArtifactClick: (path) => this.showArtifact(path),
    });

    new Interaction(
      canvas,
      this.camera,
      () => this.renderer.getNodes(),
      {
        onSelectNode: (node) => this.onSelectNode(node),
        onPan: () => this.onManualCamera(),
        onZoom: () => this.onManualCamera(),
      }
    );

    this.renderToolbar();
    this.renderSidebar(model);
    this.setupOverlays();
    this.renderStatusBar(model);

    window.addEventListener("resize", () => {
      this.renderer.resize();
      this.renderer.render();
    });

    this.setupKeyboard(canvas);
    canvas.focus();
    this.renderer.start();

    if (options.tailPath) {
      this.tailer = new LogTailer({
        path: options.tailPath,
        onEvents: (events) => this.handleNewEvents(events),
      });
      this.tailer.start();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.tailer?.stop();
    this.renderer.stop();
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  private computeSnapshotModel(): ContourModel[] {
    return this.applyFiltersToModel(this.snapshotContours);
  }

  private saveCameraState(): CameraState {
    return { x: this.camera.x, y: this.camera.y, scale: this.camera.scale };
  }

  private restoreCameraState(state: CameraState): void {
    this.camera.x = state.x;
    this.camera.y = state.y;
    this.camera.scale = state.scale;
  }

  private async refreshSnapshot(): Promise<void> {
    if (!this.isSnapshot || this.destroyed) return;
    // Skip polling in non-HTTP environments (jsdom tests).
    if (typeof window !== "undefined" && !window.location.href.startsWith("http")) return;
    try {
      const contours = await createScannerClient().loadContours();
      const camera = this.saveCameraState();
      this.snapshotContours = contours;
      const model = this.computeSnapshotModel();
      this.lastModel = model;
      this.renderer.setModel(model);
      this.restoreCameraState(camera);
      this.renderer.render();
      this.renderSidebar(model);
      this.renderStatusBar(model);
      if (this.selectedNodeId) {
        const node = this.renderer.getNodes().find((n) => n.id === this.selectedNodeId);
        if (node) this.inspector.showNode(node);
      }
      this.lastUpdatedAt = new Date().toLocaleTimeString();
      this.updateRefreshIndicator();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to refresh snapshot:", err);
    }
  }

  private startAutoRefresh(): void {
    if (!this.isSnapshot || this.autoRefreshTimer) return;
    // Do not poll immediately; in test environments the interval will not fire
    // before the suite exits, keeping output clean.
    this.autoRefreshTimer = setInterval(() => {
      if (this.autoRefreshEnabled) {
        void this.refreshSnapshot();
      }
    }, this.autoRefreshMs);
  }

  private handleNewEvents(events: RawEvent[]): void {
    if (this.destroyed || !this.timelineController) return;
    const wasLive = this.timelineController.appendEvents(events);
    this.timelineUI?.refresh();

    if (wasLive) {
      this.timelineController.live();
      this.followActiveNode();
    } else {
      this.timelineController.seek(this.timelineController.currentIndex);
    }
  }

  private handleTimelineUpdate(model: ContourModel[]): void {
    this.lastEventModel = model;
    this.lastModel = this.applyFiltersToModel(model);
    this.renderer.setModel(this.lastModel);
    this.renderer.render();
    this.timelineUI?.setIndex(this.timelineController!.currentIndex);
    this.renderSidebar(this.lastModel);
    this.renderStatusBar(this.lastModel);

    if (this.cameraMode === "follow") {
      this.followActiveNode();
    }
  }

  private applyFiltersToModel(model: ContourModel[]): ContourModel[] {
    let result = model;
    if (this.filters.type !== "all") {
      result = result.filter((c) => c.type === this.filters.type);
    }
    if (this.filters.status !== "all") {
      result = result.filter((c) => c.status === this.filters.status);
    }
    if (this.filters.search.trim()) {
      const q = this.filters.search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q) || c.contourId.toLowerCase().includes(q));
    }
    return result;
  }

  private onSelectNode(node: LayoutNode | null | undefined): void {
    if (node) {
      this.selectedNodeId = node.id;
      this.inspector.showNode(node);
    } else {
      this.selectedNodeId = null;
      this.inspector.hide();
    }
    this.renderer.render();
  }

  private onManualCamera(): void {
    this.cameraMode = "overview";
    this.renderer.render();
    this.renderStatusBar(this.lastModel);
  }

  private followActiveNode(): void {
    const node = findActiveNode(this.renderer.getNodes());
    if (!node) return;
    const width = this.canvasContainer.clientWidth;
    const height = this.canvasContainer.clientHeight;
    this.camera.smoothCenterOn(node, width, height);
  }

  private setupOverlays(): void {
    const base = `
      position:absolute;
      top:0;left:0;right:0;bottom:0;
      display:none;
      align-items:center;
      justify-content:center;
      background:rgba(0,0,0,0.55);
      z-index:100;
    `;
    this.helpOverlay.style.cssText = base;
    this.infoOverlay.style.cssText = base;

    this.artifactOverlay.addEventListener("click", (e) => {
      if (e.target === this.artifactOverlay) {
        this.hideArtifact();
      }
    });
  }

  private async showArtifact(path: string): Promise<void> {
    try {
      const text = await createScannerClient().loadArtifact(path);
      this.artifactOverlay.innerHTML = "";
      const box = document.createElement("div");
      box.style.cssText = `
        background:${PALETTE.panel};border:1px solid ${PALETTE.border};border-radius:8px;
        padding:20px;width:min(800px,90vw);height:min(600px,80vh);overflow:auto;
        color:${PALETTE.bright};font-family:${PALETTE.mono};font-size:13px;
        box-shadow:0 12px 40px rgba(0,0,0,0.5);
      `;
      const header = document.createElement("div");
      header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid ${PALETTE.border};padding-bottom:8px;`;
      const pathEl = document.createElement("code");
      pathEl.textContent = path;
      pathEl.style.color = PALETTE.gold;
      const close = document.createElement("button");
      close.textContent = "×";
      close.style.cssText = `background:transparent;border:none;color:${PALETTE.bright};font-size:20px;cursor:pointer;`;
      close.addEventListener("click", () => this.hideArtifact());
      header.append(pathEl, close);

      const pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap;word-break:break-all;margin:0;";
      pre.textContent = text;
      box.append(header, pre);
      this.artifactOverlay.append(box);
      this.artifactOverlay.style.display = "flex";
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to load artifact:", err);
    }
  }

  private hideArtifact(): void {
    this.artifactOverlay.style.display = "none";
    this.artifactOverlay.innerHTML = "";
  }

  private renderToolbar(): void {
    const badgeColor = this.mode === "live" ? PALETTE.green : this.mode === "snapshot" ? PALETTE.dim : PALETTE.gold;
    const badgeText = this.mode === "live" ? "● LIVE" : this.mode === "snapshot" ? "SNAPSHOT" : this.mode === "demo" ? "DEMO DATA" : "⏮ REPLAY";

    const types = ["all", "audit", "fix", "feature", "release", "review"];
    const statuses = ["all", "running", "finished", "blocked", "unknown"];

    this.toolbar.innerHTML = `
      <span style="background:${PALETTE.gold};color:${PALETTE.ink};padding:2px 8px;border-radius:4px;font-weight:bold;">zoetrope</span>
      <span style="background:${badgeColor};color:${PALETTE.ink};padding:2px 8px;border-radius:4px;font-weight:bold;">${badgeText}</span>
      <input id="afv-search" type="search" placeholder="search contour…" value="${this.escapeHtml(this.filters.search)}" style="background:${PALETTE.ink};border:1px solid ${PALETTE.border};color:${PALETTE.bright};padding:4px 8px;border-radius:4px;font-family:${PALETTE.mono};font-size:12px;" />
      <select id="afv-type" style="background:${PALETTE.ink};border:1px solid ${PALETTE.border};color:${PALETTE.bright};padding:4px 8px;border-radius:4px;font-family:${PALETTE.mono};font-size:12px;">
        ${types.map((t) => `<option value="${t}" ${this.filters.type === t ? "selected" : ""}>${t}</option>`).join("")}
      </select>
      <select id="afv-status" style="background:${PALETTE.ink};border:1px solid ${PALETTE.border};color:${PALETTE.bright};padding:4px 8px;border-radius:4px;font-family:${PALETTE.mono};font-size:12px;">
        ${statuses.map((s) => `<option value="${s}" ${this.filters.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <button id="afv-refresh" style="background:${PALETTE.ink};border:1px solid ${PALETTE.border};color:${PALETTE.bright};padding:4px 10px;border-radius:4px;cursor:pointer;font-family:${PALETTE.mono};font-size:12px;">Refresh (R)</button>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input id="afv-autorefresh" type="checkbox" ${this.autoRefreshEnabled ? "checked" : ""} />
        auto
      </label>
      <span id="afv-updated" style="color:${PALETTE.dim};margin-left:auto;">${this.lastUpdatedAt ? "updated " + this.lastUpdatedAt : ""}</span>
    `;

    this.toolbar.querySelector<HTMLInputElement>("#afv-search")!.addEventListener("input", (e) => {
      this.filters.search = (e.target as HTMLInputElement).value;
      this.applyFilters();
    });
    this.toolbar.querySelector<HTMLSelectElement>("#afv-type")!.addEventListener("change", (e) => {
      this.filters.type = (e.target as HTMLSelectElement).value;
      this.applyFilters();
    });
    this.toolbar.querySelector<HTMLSelectElement>("#afv-status")!.addEventListener("change", (e) => {
      this.filters.status = (e.target as HTMLSelectElement).value;
      this.applyFilters();
    });
    this.toolbar.querySelector<HTMLButtonElement>("#afv-refresh")!.addEventListener("click", () => {
      void this.refreshSnapshot();
    });
    this.toolbar.querySelector<HTMLInputElement>("#afv-autorefresh")!.addEventListener("change", (e) => {
      this.autoRefreshEnabled = (e.target as HTMLInputElement).checked;
    });
  }

  private updateRefreshIndicator(): void {
    const el = this.toolbar.querySelector<HTMLSpanElement>("#afv-updated");
    if (el) el.textContent = this.lastUpdatedAt ? "updated " + this.lastUpdatedAt : "";
  }

  private applyFilters(): void {
    const base = this.isSnapshot ? this.snapshotContours : this.lastEventModel;
    const model = this.applyFiltersToModel(base);
    this.lastModel = model;
    this.renderer.setModel(model);
    this.renderer.render();
    this.renderSidebar(model);
    this.renderStatusBar(model);
  }

  private renderSidebar(model: ContourModel[]): void {
    this.sidebar.innerHTML = "";
    const title = document.createElement("div");
    title.textContent = `Contours (${model.length})`;
    title.style.cssText = `font-weight:bold;color:${PALETTE.gold};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${PALETTE.border};`;
    this.sidebar.append(title);

    if (model.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No contours match filters.";
      empty.style.color = PALETTE.dim;
      this.sidebar.append(empty);
      return;
    }

    for (const contour of model) {
      const item = document.createElement("div");
      item.style.cssText = `
        padding:6px 8px;margin-bottom:6px;border-radius:4px;cursor:pointer;
        border:1px solid ${PALETTE.border};background:${PALETTE.ink};
      `;
      item.addEventListener("mouseenter", () => {
        item.style.background = PALETTE.border;
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = PALETTE.ink;
      });
      item.addEventListener("click", () => {
        const node = this.renderer.getNodes().find((n) => n.id === `${contour.runId}:root`);
        if (node) {
          this.onSelectNode(node);
          this.camera.smoothCenterOn(node, this.canvasContainer.clientWidth, this.canvasContainer.clientHeight);
        }
      });

      const header = document.createElement("div");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
      const name = document.createElement("span");
      name.textContent = contour.name;
      name.style.fontWeight = "bold";
      const typeBadge = document.createElement("span");
      typeBadge.textContent = contour.type;
      typeBadge.style.cssText = `font-size:10px;background:${PALETTE.border};padding:1px 4px;border-radius:3px;`;
      header.append(name, typeBadge);

      const meta = document.createElement("div");
      meta.style.cssText = `color:${PALETTE.dim};font-size:11px;margin-top:4px;`;
      const artifactCount = contour.steps.reduce((sum, s) => sum + s.artifacts.length, 0);
      meta.textContent = `${contour.status} · ${artifactCount} artifact${artifactCount === 1 ? "" : "s"}`;

      item.append(header, meta);
      this.sidebar.append(item);
    }
  }

  private setupKeyboard(canvas: HTMLCanvasElement): void {
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", (e) => {
      const panStep = 30 / this.camera.scale;
      switch (e.key) {
        case " ":
          e.preventDefault();
          this.timelineController?.toggle();
          break;
        case "[":
          this.timelineController?.prevStep();
          break;
        case "]":
          this.timelineController?.nextStep();
          break;
        case "End":
          this.timelineController?.live();
          break;
        case "g":
        case "G":
          this.timelineController?.live();
          break;
        case "r":
        case "R":
          if (this.isSnapshot) {
            void this.refreshSnapshot();
          }
          break;
        case "f":
        case "F":
          this.cameraMode = "follow";
          this.followActiveNode();
          break;
        case "o":
        case "O":
          this.cameraMode = "overview";
          this.camera.fit(
            this.renderer.getViewport(),
            this.canvasContainer.clientWidth,
            this.canvasContainer.clientHeight
          );
          break;
        case "h":
        case "ArrowLeft":
          this.camera.pan(panStep, 0);
          this.onManualCamera();
          break;
        case "j":
        case "ArrowDown":
          this.camera.pan(0, -panStep);
          this.onManualCamera();
          break;
        case "k":
        case "ArrowUp":
          this.camera.pan(0, panStep);
          this.onManualCamera();
          break;
        case "l":
        case "ArrowRight":
          this.camera.pan(-panStep, 0);
          this.onManualCamera();
          break;
        case "+":
        case "=":
          this.camera.zoomBy(1.1, this.canvasContainer.clientWidth / 2, this.canvasContainer.clientHeight / 2);
          this.onManualCamera();
          break;
        case "-":
          this.camera.zoomBy(0.9, this.canvasContainer.clientWidth / 2, this.canvasContainer.clientHeight / 2);
          this.onManualCamera();
          break;
        case "0":
          this.camera.reset();
          this.onManualCamera();
          break;
        case "i":
        case "I":
          this.toggleInfo();
          break;
        case "?":
          this.toggleHelp();
          break;
        case "Escape":
          this.showHelp = false;
          this.showInfo = false;
          this.hideArtifact();
          this.updateOverlays();
          this.inspector.hide();
          this.renderer.render();
          break;
      }
    });
  }

  private toggleHelp(): void {
    this.showHelp = !this.showHelp;
    this.showInfo = false;
    this.updateOverlays();
  }

  private toggleInfo(): void {
    this.showInfo = !this.showInfo;
    this.showHelp = false;
    this.updateOverlays();
  }

  private updateOverlays(): void {
    this.helpOverlay.style.display = this.showHelp ? "flex" : "none";
    this.infoOverlay.style.display = this.showInfo ? "flex" : "none";
    if (this.showHelp) this.renderHelp();
    if (this.showInfo) this.renderInfo();
  }

  private renderHelp(): void {
    this.helpOverlay.innerHTML = "";
    const box = document.createElement("div");
    box.style.cssText = `
      background:${PALETTE.panel};
      border:1px solid ${PALETTE.border};
      border-left:3px solid ${PALETTE.gold};
      border-radius:8px;
      padding:18px 24px;
      max-width:520px;
      color:${PALETTE.bright};
      font-family:${PALETTE.mono};
      font-size:13px;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
    `;
    box.innerHTML = `
      <h3 style="margin:0 0 12px 0;color:${PALETTE.gold}">zoetrope — keys</h3>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 12px;">
        <span style="color:${PALETTE.subtle}">space</span><span>play / pause</span>
        <span style="color:${PALETTE.subtle}">[ ]</span><span>prev / next step</span>
        <span style="color:${PALETTE.subtle}">End / g</span><span>jump to live</span>
        <span style="color:${PALETTE.subtle}">R</span><span>refresh snapshot</span>
        <span style="color:${PALETTE.subtle}">f</span><span>follow active node</span>
        <span style="color:${PALETTE.subtle}">o</span><span>overview (fit all)</span>
        <span style="color:${PALETTE.subtle}">h j k l</span><span>pan camera</span>
        <span style="color:${PALETTE.subtle}">+ / -</span><span>zoom in / out</span>
        <span style="color:${PALETTE.subtle}">0</span><span>reset zoom</span>
        <span style="color:${PALETTE.subtle}">i</span><span>session info</span>
        <span style="color:${PALETTE.subtle}">?</span><span>this help</span>
        <span style="color:${PALETTE.subtle}">esc</span><span>close overlay</span>
      </div>
      <div style="margin-top:12px;color:${PALETTE.dim};font-size:12px;">
        ● running · ✓ done · ✗ fail · ◌ pending · green edges = running
      </div>
    `;
    this.helpOverlay.append(box);
  }

  private renderInfo(): void {
    this.infoOverlay.innerHTML = "";
    const box = document.createElement("div");
    box.style.cssText = `
      background:${PALETTE.panel};
      border:1px solid ${PALETTE.border};
      border-left:3px solid ${PALETTE.gold};
      border-radius:8px;
      padding:18px 24px;
      width:420px;
      color:${PALETTE.bright};
      font-family:${PALETTE.mono};
      font-size:13px;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
    `;
    const state = this.controllerStateText();
    const counts = this.nodeCounts();
    box.innerHTML = `
      <h3 style="margin:0 0 12px 0;color:${PALETTE.gold}">session info</h3>
      <div style="display:grid;grid-template-columns:100px 1fr;gap:6px 12px;">
        <span style="color:${PALETTE.subtle}">title</span><span>${this.escapeHtml(this.title)}</span>
        <span style="color:${PALETTE.subtle}">mode</span><span>${state}</span>
        <span style="color:${PALETTE.subtle}">camera</span><span>${this.cameraMode}</span>
        <span style="color:${PALETTE.subtle}">agents</span><span>${counts.agents}</span>
        <span style="color:${PALETTE.subtle}">tools</span><span>${counts.tools}</span>
        <span style="color:${PALETTE.subtle}">queued</span><span>${counts.queued} ops</span>
      </div>
      <div style="margin-top:12px;color:${PALETTE.dim};font-size:12px;">esc to close</div>
    `;
    this.infoOverlay.append(box);
  }

  private controllerStateText(): string {
    if (!this.timelineController) return this.mode;
    if (this.timelineController.stateValue === "playing") return "replay";
    const idx = this.timelineController.currentIndex;
    const len = this.timelineController.length;
    if (len === 0) return this.mode;
    return idx >= len - 1 ? "live" : "paused";
  }

  private nodeCounts(): { agents: number; tools: number; queued: number } {
    const nodes = this.renderer.getNodes();
    const agents = nodes.filter((n) => n.parentId === null).length;
    const tools = nodes.reduce((sum, n) => sum + n.toolCount, 0);
    return { agents, tools, queued: 0 };
  }

  private renderStatusBar(model: ContourModel[]): void {
    const agents = model.length;
    const tools = model.reduce(
      (sum, c) => sum + c.steps.reduce((s, step) => s + step.toolCalls.length, 0),
      0
    );
    const state = this.controllerStateText();
    const isLive = state === "live";
    const badgeColor = isLive ? PALETTE.green : state === "replay" ? PALETTE.gold : PALETTE.dim;

    this.statusBar.style.cssText = `
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:6px 14px;
      background:${PALETTE.ink};
      border-top:1px solid ${PALETTE.border};
      color:${PALETTE.bright};
      font-family:${PALETTE.mono};
      font-size:12px;
    `;

    const waiting = this.mode === "live" && (this.timelineController?.length ?? 0) === 0
      ? `<span style="color:${PALETTE.subtle};margin-left:12px;">Waiting for events…</span>`
      : "";

    this.statusBar.innerHTML = `
      <div>
        <span style="background:${PALETTE.gold};color:${PALETTE.ink};padding:2px 8px;border-radius:4px;font-weight:bold;">zoetrope</span>
        <span style="background:${badgeColor};color:${PALETTE.ink};padding:2px 8px;border-radius:4px;font-weight:bold;margin-left:8px;">${isLive ? "● LIVE" : "⏮ REPLAY"}</span>
        <span style="margin-left:12px;font-weight:bold;">${this.escapeHtml(this.title)}</span>
        <span style="color:${PALETTE.subtle};margin-left:12px;">${agents} agents · ${tools} tools</span>
        ${waiting}
      </div>
      <div style="color:${PALETTE.dim}">${this.cameraMode === "follow" ? "follow" : "overview"} · ? help · i info · ${this.isSnapshot ? "R refresh" : "space pause"}</div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

function findActiveNode(nodes: LayoutNode[]): LayoutNode | undefined {
  if (nodes.length === 0) return undefined;
  const running = nodes.filter((n) => n.status === "running");
  if (running.length > 0) return running[running.length - 1];
  const active = nodes.filter((n) => n.status !== "pending" && n.status !== "unknown");
  if (active.length > 0) return active[active.length - 1];
  return nodes[nodes.length - 1];
}
