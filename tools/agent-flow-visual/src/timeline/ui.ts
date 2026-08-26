import { PALETTE } from "../canvas/renderer.js";
import { TimelineController } from "./controller.js";

export class TimelineUI {
  private readonly container: HTMLElement;
  private readonly controller: TimelineController;
  private readonly playBtn: HTMLButtonElement;
  private readonly scrubber: HTMLInputElement;
  private readonly indexLabel: HTMLElement;
  private readonly infoLine: HTMLElement;
  private readonly badge: HTMLElement;

  constructor(container: HTMLElement, controller: TimelineController) {
    this.container = container;
    this.controller = controller;

    this.container.style.cssText = `
      display:flex;
      flex-direction:column;
      gap:6px;
      padding:10px 14px;
      background:${PALETTE.panel};
      border-top:1px solid ${PALETTE.border};
      color:${PALETTE.bright};
      font-family:${PALETTE.mono};
      font-size:12px;
    `;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;";

    this.playBtn = document.createElement("button");
    this.playBtn.textContent = "▶";
    this.applyButtonStyle(this.playBtn, "36px");
    this.playBtn.addEventListener("click", () => this.controller.toggle());

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹";
    this.applyButtonStyle(prevBtn, "36px");
    prevBtn.addEventListener("click", () => this.controller.prevStep());

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "›";
    this.applyButtonStyle(nextBtn, "36px");
    nextBtn.addEventListener("click", () => this.controller.nextStep());

    const liveBtn = document.createElement("button");
    liveBtn.textContent = "Live";
    this.applyButtonStyle(liveBtn, "36px", "0 12px");
    liveBtn.addEventListener("click", () => this.controller.live());

    this.scrubber = document.createElement("input");
    this.scrubber.type = "range";
    this.scrubber.min = "0";
    this.scrubber.max = String(this.controller.length - 1);
    this.scrubber.value = "0";
    this.scrubber.style.cssText = `
      flex:1;
      accent-color:${PALETTE.gold};
      background:${PALETTE.ink};
      height:4px;
      border-radius:2px;
    `;
    this.scrubber.addEventListener("input", () => {
      this.controller.seek(parseInt(this.scrubber.value, 10));
    });

    this.badge = document.createElement("span");
    this.badge.style.cssText = `
      padding:2px 8px;
      border-radius:4px;
      background:${PALETTE.ink};
      color:${PALETTE.green};
      font-weight:bold;
    `;
    this.badge.textContent = "● LIVE";

    this.indexLabel = document.createElement("span");
    this.indexLabel.style.cssText = "min-width:80px;text-align:right;color:" + PALETTE.subtle;
    this.updateLabel(0);

    row.append(prevBtn, this.playBtn, nextBtn, liveBtn, this.scrubber, this.badge, this.indexLabel);

    this.infoLine = document.createElement("div");
    this.infoLine.style.cssText = `color:${PALETTE.subtle};display:flex;justify-content:space-between;`;
    this.infoLine.innerHTML = `<span>event 0</span><span>press ? for keys</span>`;

    this.container.append(row, this.infoLine);
  }

  setIndex(index: number): void {
    this.scrubber.value = String(index);
    this.updateLabel(index);
    this.playBtn.textContent = this.controller.stateValue === "playing" ? "⏸" : "▶";
    this.badge.textContent = index >= this.controller.length - 1 ? "● LIVE" : "⏮ REPLAY";
    this.badge.style.color = index >= this.controller.length - 1 ? PALETTE.green : PALETTE.gold;
    this.infoLine.innerHTML = `<span>event ${index + 1}</span><span>${
      this.controller.stateValue === "playing" ? "playing" : "paused"
    } · ? keys</span>`;
  }

  private updateLabel(index: number): void {
    this.indexLabel.textContent = `${index + 1} / ${this.controller.length}`;
  }

  private applyButtonStyle(
    btn: HTMLButtonElement,
    height: string,
    padding = "0"
  ): void {
    btn.style.cssText = `
      width:${height};
      height:${height};
      padding:${padding};
      border:1px solid ${PALETTE.border};
      border-radius:6px;
      background:${PALETTE.ink};
      color:${PALETTE.bright};
      cursor:pointer;
      font-family:${PALETTE.mono};
      font-size:14px;
    `;
  }
}
