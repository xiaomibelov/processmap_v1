import { claude, type LayoutNode } from "agent-flow-core";
import { Camera } from "../canvas/camera.js";
import { Interaction } from "../canvas/interaction.js";
import { PALETTE, Renderer } from "../canvas/renderer.js";
import { buildClaudeLayout } from "./layout.js";
import type { ReplayPackage } from "./loader.js";

export type CameraMode = "follow" | "overview" | "manual";

export interface ClaudeAppOptions {
  root: HTMLElement;
  pkg: ReplayPackage;
  followHead?: boolean;
}

export class ClaudeApp {
  private readonly root: HTMLElement;
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly canvasContainer: HTMLElement;
  private readonly timelineContainer: HTMLElement;
  private readonly statusBar: HTMLElement;
  private readonly helpOverlay: HTMLElement;
  private readonly infoOverlay: HTMLElement;
  private readonly panel: HTMLElement;

  private readonly timeline: claude.Timeline;
  private readonly title: string;

  private cameraMode: CameraMode = "overview";
  private playing = false;
  private showHelp = false;
  private showInfo = false;
  private selectedAgentId: string | null = null;
  private lastFrameTime = 0;
  private rafId: number | null = null;
  private destroyed = false;

  constructor(options: ClaudeAppOptions) {
    this.root = options.root;
    this.title = options.pkg.info.title ?? options.pkg.sessionId;
    this.timeline = new claude.Timeline(options.pkg.items, options.pkg.replay, options.pkg.sessionId);
    if (options.followHead ?? !options.pkg.replay) {
      this.timeline.setFollowHead(true);
    }

    this.root.style.cssText = `display:flex;flex-direction:column;width:100%;height:100%;background:${PALETTE.canvasBg}`;

    this.canvasContainer = document.createElement("div");
    this.canvasContainer.style.cssText = "flex:1;position:relative;overflow:hidden;";

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    this.canvasContainer.append(canvas);

    this.panel = document.createElement("div");
    this.canvasContainer.append(this.panel);

    this.timelineContainer = document.createElement("div");
    this.statusBar = document.createElement("div");
    this.helpOverlay = document.createElement("div");
    this.infoOverlay = document.createElement("div");

    this.root.append(
      this.canvasContainer,
      this.timelineContainer,
      this.statusBar,
      this.helpOverlay,
      this.infoOverlay
    );

    this.camera = new Camera();
    this.renderer = new Renderer(canvas, this.camera, { showMinimap: true });

    this.setupTimelineUI();
    this.setupOverlays();
    this.setupKeyboard(canvas);

    new Interaction(canvas, this.camera, () => this.renderer.getNodes(), {
      onSelectNode: (node) => this.selectNode(node?.id ?? null),
      onPan: () => {
        this.cameraMode = "manual";
        this.renderer.render();
      },
      onZoom: () => {
        this.cameraMode = "manual";
        this.renderer.render();
      },
    });

    window.addEventListener("resize", () => {
      this.renderer.resize();
      this.renderer.render();
    });

    this.renderer.start();
    this.sync();
    this.camera.fit(
      this.renderer.getViewport(),
      this.canvasContainer.clientWidth,
      this.canvasContainer.clientHeight
    );
    this.rafId = requestAnimationFrame((t) => this.loop(t));
    canvas.focus();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.renderer.stop();
  }

  private loop(time: number): void {
    if (this.destroyed) return;
    const dt = this.lastFrameTime ? time - this.lastFrameTime : 0;
    this.lastFrameTime = time;

    if (this.playing && !this.timeline.atEdge) {
      this.timeline.advance(dt);
      this.sync();
    }

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private sync(): void {
    const model = this.timeline.getModel();
    const layout = buildClaudeLayout(model);
    this.renderer.setLayout(layout);
    this.renderer.render();
    this.updateTimelineUI();
    this.renderStatusBar(model);
    if (this.selectedAgentId) this.renderPanel(model);
    if (this.cameraMode === "follow") this.followActiveNode(layout.nodes);
  }

  private selectNode(id: string | null): void {
    this.selectedAgentId = id;
    this.renderPanel(this.timeline.getModel());
    this.renderer.render();
  }

  private followActiveNode(nodes: LayoutNode[]): void {
    const active = nodes
      .filter((n) => n.status === "running" || n.status === "active")
      .pop();
    const target = active ?? nodes[nodes.length - 1];
    if (!target) return;
    const w = this.canvasContainer.clientWidth;
    const h = this.canvasContainer.clientHeight;
    this.camera.smoothCenterOn(target, w, h);
  }

  // -------------------------------------------------------------------------
  // Timeline UI
  // -------------------------------------------------------------------------
  private scrubber!: HTMLInputElement;
  private playBtn!: HTMLButtonElement;
  private indexLabel!: HTMLElement;

  private setupTimelineUI(): void {
    this.timelineContainer.style.cssText = `
      display:flex;flex-direction:column;gap:6px;padding:10px 14px;
      background:${PALETTE.panel};border-top:1px solid ${PALETTE.border};
      color:${PALETTE.bright};font-family:${PALETTE.mono};font-size:12px;
    `;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;";

    this.playBtn = document.createElement("button");
    this.playBtn.textContent = "▶";
    this.styleButton(this.playBtn, "36px");
    this.playBtn.addEventListener("click", () => this.togglePlay());

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹";
    this.styleButton(prevBtn, "36px");
    prevBtn.addEventListener("click", () => this.prevEvent());

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "›";
    this.styleButton(nextBtn, "36px");
    nextBtn.addEventListener("click", () => this.nextEvent());

    const liveBtn = document.createElement("button");
    liveBtn.textContent = "Live";
    this.styleButton(liveBtn, "36px", "0 12px");
    liveBtn.addEventListener("click", () => this.goLive());

    this.scrubber = document.createElement("input");
    this.scrubber.type = "range";
    this.scrubber.min = "0";
    this.scrubber.max = String(Math.max(0, this.timeline.length - 1));
    this.scrubber.value = String(this.timeline.currentIndex);
    this.scrubber.style.cssText = `
      flex:1;accent-color:${PALETTE.gold};background:${PALETTE.ink};height:4px;border-radius:2px;
    `;
    this.scrubber.addEventListener("input", () => {
      this.pause();
      this.seekToIndex(parseInt(this.scrubber.value, 10));
    });

    this.indexLabel = document.createElement("span");
    this.indexLabel.style.cssText = `min-width:100px;text-align:right;color:${PALETTE.subtle}`;

    row.append(prevBtn, this.playBtn, nextBtn, liveBtn, this.scrubber, this.indexLabel);
    this.timelineContainer.append(row);
    this.updateTimelineUI();
  }

  private styleButton(btn: HTMLButtonElement, height: string, padding = "0"): void {
    btn.style.cssText = `
      width:${height};height:${height};padding:${padding};border:1px solid ${PALETTE.border};
      border-radius:6px;background:${PALETTE.ink};color:${PALETTE.bright};cursor:pointer;
      font-family:${PALETTE.mono};font-size:14px;
    `;
  }

  private updateTimelineUI(): void {
    this.scrubber.max = String(Math.max(0, this.timeline.length - 1));
    this.scrubber.value = String(this.timeline.currentIndex);
    this.playBtn.textContent = this.playing ? "⏸" : "▶";
    this.indexLabel.textContent = `${this.timeline.currentIndex + 1} / ${this.timeline.length}`;
  }

  private togglePlay(): void {
    this.playing = !this.playing;
    if (this.playing && this.timeline.atEdge) {
      this.timeline.setFollowHead(false);
    }
    this.updateTimelineUI();
  }

  private pause(): void {
    this.playing = false;
  }

  private goLive(): void {
    this.timeline.setFollowHead(true);
    this.sync();
  }

  private seekToIndex(index: number): void {
    const clamped = Math.max(0, Math.min(this.timeline.length - 1, index));
    const ts = this.timeline.timestampAt(clamped);
    if (ts) this.timeline.seek(ts);
    else this.timeline.seek(new Date(0));
    this.sync();
  }

  private prevEvent(): void {
    this.pause();
    this.seekToIndex(this.timeline.currentIndex - 1);
  }

  private nextEvent(): void {
    this.pause();
    this.seekToIndex(this.timeline.currentIndex + 1);
  }

  // -------------------------------------------------------------------------
  // Overlays
  // -------------------------------------------------------------------------
  private setupOverlays(): void {
    const base = `
      position:absolute;top:0;left:0;right:0;bottom:0;display:none;
      align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:100;
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
          this.togglePlay();
          break;
        case "[":
          this.prevEvent();
          break;
        case "]":
          this.nextEvent();
          break;
        case "End":
        case "g":
        case "G":
          this.goLive();
          break;
        case "f":
        case "F":
          this.cameraMode = "follow";
          this.followActiveNode(this.renderer.getNodes());
          break;
        case "o":
        case "O":
          this.cameraMode = "overview";
          this.camera.fit(
            this.renderer.getViewport(),
            this.canvasContainer.clientWidth,
            this.canvasContainer.clientHeight
          );
          this.renderer.render();
          break;
        case "h":
        case "ArrowLeft":
          this.camera.pan(panStep, 0);
          this.cameraMode = "manual";
          this.renderer.render();
          break;
        case "j":
        case "ArrowDown":
          this.camera.pan(0, -panStep);
          this.cameraMode = "manual";
          this.renderer.render();
          break;
        case "k":
        case "ArrowUp":
          this.camera.pan(0, panStep);
          this.cameraMode = "manual";
          this.renderer.render();
          break;
        case "l":
        case "ArrowRight":
          this.camera.pan(-panStep, 0);
          this.cameraMode = "manual";
          this.renderer.render();
          break;
        case "+":
        case "=":
          this.camera.zoomBy(1.1, this.canvasContainer.clientWidth / 2, this.canvasContainer.clientHeight / 2);
          this.cameraMode = "manual";
          this.renderer.render();
          break;
        case "-":
          this.camera.zoomBy(0.9, this.canvasContainer.clientWidth / 2, this.canvasContainer.clientHeight / 2);
          this.cameraMode = "manual";
          this.renderer.render();
          break;
        case "0":
          this.camera.reset();
          this.cameraMode = "manual";
          this.renderer.render();
          break;
        case "r":
        case "R":
          this.sync();
          break;
        case "i":
        case "I":
          this.showInfo = !this.showInfo;
          this.showHelp = false;
          this.updateOverlays();
          break;
        case "?":
          this.showHelp = !this.showHelp;
          this.showInfo = false;
          this.updateOverlays();
          break;
        case "Escape":
          this.showHelp = false;
          this.showInfo = false;
          this.selectedAgentId = null;
          this.panel.innerHTML = "";
          this.panel.style.transform = "translateX(100%)";
          this.updateOverlays();
          this.renderer.render();
          break;
      }
    });
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
      background:${PALETTE.panel};border:1px solid ${PALETTE.border};border-left:3px solid ${PALETTE.gold};
      border-radius:8px;padding:18px 24px;max-width:520px;color:${PALETTE.bright};
      font-family:${PALETTE.mono};font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.4);
    `;
    box.innerHTML = `
      <h3 style="margin:0 0 12px 0;color:${PALETTE.gold}">zoetrope — keys</h3>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 12px;">
        <span style="color:${PALETTE.subtle}">space</span><span>play / pause</span>
        <span style="color:${PALETTE.subtle}">[ ]</span><span>prev / next event</span>
        <span style="color:${PALETTE.subtle}">End / g</span><span>jump to live</span>
        <span style="color:${PALETTE.subtle}">f</span><span>follow active node</span>
        <span style="color:${PALETTE.subtle}">o</span><span>overview (fit all)</span>
        <span style="color:${PALETTE.subtle}">h j k l</span><span>pan camera</span>
        <span style="color:${PALETTE.subtle}">+ / -</span><span>zoom in / out</span>
        <span style="color:${PALETTE.subtle}">0</span><span>reset zoom</span>
        <span style="color:${PALETTE.subtle}">i</span><span>session info</span>
        <span style="color:${PALETTE.subtle}">?</span><span>this help</span>
        <span style="color:${PALETTE.subtle}">esc</span><span>close overlay / panel</span>
      </div>
      <div style="margin-top:12px;color:${PALETTE.dim};font-size:12px;">
        ● running · ◌ idle · ✓ done · ✗ failed · ■ stopped
      </div>
    `;
    this.helpOverlay.append(box);
  }

  private renderInfo(): void {
    this.infoOverlay.innerHTML = "";
    const box = document.createElement("div");
    box.style.cssText = `
      background:${PALETTE.panel};border:1px solid ${PALETTE.border};border-left:3px solid ${PALETTE.gold};
      border-radius:8px;padding:18px 24px;width:420px;color:${PALETTE.bright};
      font-family:${PALETTE.mono};font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.4);
    `;
    const info = this.timeline.getModel().sessionInfo;
    box.innerHTML = `
      <h3 style="margin:0 0 12px 0;color:${PALETTE.gold}">session info</h3>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 12px;">
        <span style="color:${PALETTE.subtle}">title</span><span>${this.escapeHtml(info.title ?? "—")}</span>
        <span style="color:${PALETTE.subtle}">mode</span><span>${this.escapeHtml(info.mode ?? "—")}</span>
        <span style="color:${PALETTE.subtle}">permission</span><span>${this.escapeHtml(info.permissionMode ?? "—")}</span>
        <span style="color:${PALETTE.subtle}">last prompt</span><span>${this.escapeHtml(info.lastPrompt ?? "—")}</span>
        <span style="color:${PALETTE.subtle}">queued ops</span><span>${info.queuedOps}</span>
        <span style="color:${PALETTE.subtle}">file edits</span><span>${info.fileEdits}</span>
      </div>
      <div style="margin-top:12px;color:${PALETTE.dim};font-size:12px;">esc to close</div>
    `;
    this.infoOverlay.append(box);
  }

  private renderPanel(model: claude.SessionModel): void {
    const agent = this.selectedAgentId ? model.agents.get(this.selectedAgentId) : undefined;
    if (!agent) {
      this.panel.style.transform = "translateX(100%)";
      return;
    }
    this.panel.style.cssText = `
      position:absolute;top:0;right:0;width:320px;height:100%;background:${PALETTE.panel};
      border-left:1px solid ${PALETTE.border};padding:16px;box-sizing:border-box;overflow:auto;
      transform:translateX(0);transition:transform 0.2s ease;color:${PALETTE.bright};
      font-family:${PALETTE.mono};font-size:13px;
    `;

    const toolsHtml = agent.toolCalls
      .slice(-20)
      .reverse()
      .map((t) => {
        const icon = t.status === "pending" ? "⏳" : t.status === "ok" ? "✓" : "✗";
        const time = t.ts ? t.ts.toLocaleTimeString() : "";
        return `<div style="padding:6px 8px;background:${PALETTE.ink};border:1px solid ${PALETTE.border};border-radius:4px;margin-bottom:6px;">
          <div>${icon} <strong>${this.escapeHtml(t.name)}</strong> <span style="color:${PALETTE.dim};float:right;">${time}</span></div>
          ${t.summary ? `<div style="color:${PALETTE.subtle};font-size:12px;margin-top:4px;">${this.escapeHtml(t.summary)}</div>` : ""}
        </div>`;
      })
      .join("");

    this.panel.innerHTML = `
      <h3 style="margin:0 0 12px 0;color:${PALETTE.gold}">${this.escapeHtml(agent.agentType ?? agent.id)}</h3>
      <p style="color:${PALETTE.subtle};margin:0 0 12px 0;">status: ${agent.status}</p>
      ${agent.description ? `<p style="color:${PALETTE.bright};margin:0 0 12px 0;">${this.escapeHtml(agent.description)}</p>` : ""}
      ${agent.model ? `<p style="color:${PALETTE.dim};margin:0 0 12px 0;">model: ${this.escapeHtml(agent.model)}</p>` : ""}
      <p style="color:${PALETTE.gold};margin:0 0 12px 0;">tools: ${agent.toolCalls.length} · tokens: ${agent.outputTokens}</p>
      <h4 style="margin:16px 0 8px 0;color:${PALETTE.bright}">recent tool calls</h4>
      ${toolsHtml || `<p style="color:${PALETTE.dim}">none</p>`}
    `;
  }

  private renderStatusBar(model: claude.SessionModel): void {
    const agents = [...model.agents.values()].length;
    const tools = [...model.agents.values()].reduce((s, a) => s + a.toolCalls.length, 0);
    const live = this.timeline.atEdge && !this.timeline.isReplay;
    const badgeColor = live ? PALETTE.green : this.playing ? PALETTE.gold : PALETTE.dim;
    const badge = live ? "● LIVE" : this.playing ? "▶ PLAY" : "⏸ PAUSE";

    this.statusBar.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding:6px 14px;background:${PALETTE.ink};border-top:1px solid ${PALETTE.border};
      color:${PALETTE.bright};font-family:${PALETTE.mono};font-size:12px;
    `;
    this.statusBar.innerHTML = `
      <div>
        <span style="background:${PALETTE.gold};color:${PALETTE.ink};padding:2px 8px;border-radius:4px;font-weight:bold;">zoetrope</span>
        <span style="background:${badgeColor};color:${PALETTE.ink};padding:2px 8px;border-radius:4px;font-weight:bold;margin-left:8px;">${badge}</span>
        <span style="margin-left:12px;font-weight:bold;">${this.escapeHtml(this.title)}</span>
        <span style="color:${PALETTE.subtle};margin-left:12px;">${agents} agents · ${tools} tools</span>
      </div>
      <div style="color:${PALETTE.dim}">${this.cameraMode} · ? help · i info · space pause</div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
