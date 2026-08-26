import { foldEvents, type ContourModel, type LayoutNode, type RawEvent } from "agent-flow-core";
import { Camera } from "./canvas/camera.js";
import { Interaction } from "./canvas/interaction.js";
import { PALETTE, Renderer } from "./canvas/renderer.js";
import { InspectorPanel } from "./inspector/panel.js";

import { LogTailer } from "./io/log-tailer.js";
import { TimelineController } from "./timeline/controller.js";
import { TimelineUI } from "./timeline/ui.js";

export type AppMode = "live" | "replay";
export type CameraMode = "follow" | "overview";

export interface AppOptions {
  root: HTMLElement;
  events: RawEvent[];
  title?: string;
  mode?: AppMode;
  /** If provided, live-tail this path for new events. */
  tailPath?: string;
}

export class App {
  private readonly root: HTMLElement;
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly timelineController: TimelineController;
  private readonly timelineUI: TimelineUI;
  private readonly inspector: InspectorPanel;
  private readonly statusBar: HTMLElement;
  private readonly helpOverlay: HTMLElement;
  private readonly infoOverlay: HTMLElement;
  private readonly canvasContainer: HTMLElement;
  private readonly title: string;
  private readonly mode: AppMode;
  private cameraMode: CameraMode = "follow";
  private showHelp = false;
  private showInfo = false;
  private tailer: LogTailer | null = null;
  private destroyed = false;
  private lastModel: ContourModel[] = [];

  constructor(options: AppOptions) {
    this.root = options.root;
    this.title = options.title ?? "session";
    this.mode = options.mode ?? (options.events.length > 0 ? "replay" : "live");
    this.root.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;background:" + PALETTE.canvasBg;

    this.canvasContainer = document.createElement("div");
    this.canvasContainer.style.cssText = "flex:1;position:relative;overflow:hidden;";

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    this.canvasContainer.append(canvas);

    const inspectorContainer = document.createElement("div");
    this.canvasContainer.append(inspectorContainer);

    const timelineContainer = document.createElement("div");
    this.statusBar = document.createElement("div");
    this.helpOverlay = document.createElement("div");
    this.infoOverlay = document.createElement("div");

    this.root.append(
      this.canvasContainer,
      timelineContainer,
      this.statusBar,
      this.helpOverlay,
      this.infoOverlay
    );

    this.camera = new Camera();
    this.renderer = new Renderer(canvas, this.camera, { showMinimap: true });

    const model = foldEvents(options.events);
    this.lastModel = model;
    const viewport = this.renderer.setModel(model);
    this.camera.fit(viewport, canvas.clientWidth, canvas.clientHeight);

    this.timelineController = new TimelineController(options.events, {
      onUpdate: (m) => this.handleTimelineUpdate(m),
    });

    this.timelineUI = new TimelineUI(timelineContainer, this.timelineController);
    this.timelineController.seek(this.mode === "live" && options.events.length === 0 ? 0 : this.timelineController.liveIndex);

    this.inspector = new InspectorPanel(inspectorContainer);

    new Interaction(
      canvas,
      this.camera,
      () => this.renderer.getNodes(),
      {
        onSelectNode: (node) => {
          if (node) this.inspector.showNode(node);
          else this.inspector.hide();
          this.renderer.render();
        },
        onPan: () => this.onManualCamera(),
        onZoom: () => this.onManualCamera(),
      }
    );

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
  }

  private handleNewEvents(events: RawEvent[]): void {
    if (this.destroyed) return;
    const wasLive = this.timelineController.appendEvents(events);
    this.timelineUI.refresh();

    if (wasLive) {
      this.timelineController.live();
      this.followActiveNode();
    } else {
      // User is scrubbing history; just refresh the current view so the
      // timeline grows at the live edge.
      this.timelineController.seek(this.timelineController.currentIndex);
    }
  }

  private handleTimelineUpdate(model: ContourModel[]): void {
    this.lastModel = model;
    this.renderer.setModel(model);
    this.renderer.render();
    this.timelineUI.setIndex(this.timelineController.currentIndex);
    this.renderStatusBar(model);

    if (this.cameraMode === "follow") {
      this.followActiveNode();
    }
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
  }

  private setupKeyboard(canvas: HTMLCanvasElement): void {
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", (e) => {
      const panStep = 30 / this.camera.scale;
      switch (e.key) {
        case " ":
          e.preventDefault();
          this.timelineController.toggle();
          break;
        case "[":
          this.timelineController.prevStep();
          break;
        case "]":
          this.timelineController.nextStep();
          break;
        case "End":
          this.timelineController.live();
          break;
        case "g":
        case "G":
          this.timelineController.live();
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

    const waiting = this.mode === "live" && this.timelineController.length === 0
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
      <div style="color:${PALETTE.dim}">${this.cameraMode === "follow" ? "follow" : "overview"} · ? help · i info · space pause</div>
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
  const active = nodes.filter((n) => n.status !== "pending");
  if (active.length > 0) return active[active.length - 1];
  return nodes[nodes.length - 1];
}
