import { TimelineController } from "./controller.js";

export class TimelineUI {
  private readonly container: HTMLElement;
  private readonly controller: TimelineController;
  private readonly playBtn: HTMLButtonElement;
  private readonly scrubber: HTMLInputElement;
  private readonly indexLabel: HTMLElement;

  constructor(container: HTMLElement, controller: TimelineController) {
    this.container = container;
    this.controller = controller;

    this.container.style.cssText =
      "display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fff;border-top:1px solid #E2E8F0;";

    this.playBtn = document.createElement("button");
    this.playBtn.textContent = "▶";
    this.playBtn.style.cssText =
      "width:36px;height:36px;border:1px solid #E2E8F0;border-radius:6px;background:#fff;cursor:pointer;";
    this.playBtn.addEventListener("click", () => this.controller.toggle());

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹";
    prevBtn.style.cssText = this.playBtn.style.cssText;
    prevBtn.addEventListener("click", () => this.controller.prevStep());

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "›";
    nextBtn.style.cssText = this.playBtn.style.cssText;
    nextBtn.addEventListener("click", () => this.controller.nextStep());

    const liveBtn = document.createElement("button");
    liveBtn.textContent = "Live";
    liveBtn.style.cssText =
      "height:36px;padding:0 12px;border:1px solid #E2E8F0;border-radius:6px;background:#fff;cursor:pointer;";
    liveBtn.addEventListener("click", () => this.controller.live());

    this.scrubber = document.createElement("input");
    this.scrubber.type = "range";
    this.scrubber.min = "0";
    this.scrubber.max = String(this.controller.length - 1);
    this.scrubber.value = "0";
    this.scrubber.style.cssText = "flex:1;";
    this.scrubber.addEventListener("input", () => {
      this.controller.seek(parseInt(this.scrubber.value, 10));
    });

    this.indexLabel = document.createElement("span");
    this.indexLabel.style.cssText = "font-size:12px;color:#64748B;min-width:80px;text-align:right;";
    this.updateLabel(0);

    this.container.append(prevBtn, this.playBtn, nextBtn, liveBtn, this.scrubber, this.indexLabel);
  }

  setIndex(index: number): void {
    this.scrubber.value = String(index);
    this.updateLabel(index);
    this.playBtn.textContent = this.controller.stateValue === "playing" ? "⏸" : "▶";
  }

  private updateLabel(index: number): void {
    this.indexLabel.textContent = `${index + 1} / ${this.controller.length}`;
  }
}
