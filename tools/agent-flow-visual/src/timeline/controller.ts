import { Timeline, type ContourModel, type RawEvent } from "agent-flow-core";

export type TimelineState = "playing" | "paused";

export interface TimelineControllerOptions {
  onUpdate: (model: ContourModel[], index: number) => void;
  speed?: number;
}

export class TimelineController {
  private readonly timeline: Timeline;
  private readonly onUpdate: (model: ContourModel[], index: number) => void;
  private index = 0;
  private state: TimelineState = "paused";
  private speed: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(events: RawEvent[], options: TimelineControllerOptions) {
    this.timeline = new Timeline(events);
    this.onUpdate = options.onUpdate;
    this.speed = options.speed ?? 1;
  }

  get currentIndex(): number {
    return this.index;
  }

  get length(): number {
    return this.timeline.length;
  }

  get liveIndex(): number {
    return this.timeline.liveIndex;
  }

  get stateValue(): TimelineState {
    return this.state;
  }

  play(): void {
    if (this.state === "playing") return;
    this.state = "playing";
    this.intervalId = setInterval(() => {
      if (this.index >= this.timeline.liveIndex) {
        this.pause();
        return;
      }
      this.index++;
      this.update();
    }, 1000 / this.speed);
  }

  pause(): void {
    this.state = "paused";
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  toggle(): void {
    if (this.state === "playing") this.pause();
    else this.play();
  }

  seek(index: number): void {
    this.index = Math.max(0, Math.min(this.timeline.liveIndex, index));
    this.update();
  }

  nextStep(): void {
    this.index = this.timeline.nextStepIndex(this.index);
    this.update();
  }

  prevStep(): void {
    this.index = this.timeline.prevStepIndex(this.index);
    this.update();
  }

  live(): void {
    this.index = this.timeline.liveIndex;
    this.update();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.state === "playing") {
      this.pause();
      this.play();
    }
  }

  destroy(): void {
    this.pause();
  }

  /**
   * Append new events to the timeline and keep the playhead position stable.
   * Returns true if the playhead was at the live edge before the append.
   */
  appendEvents(events: RawEvent[]): boolean {
    const wasLive = this.index >= this.timeline.liveIndex;
    this.timeline.append(events);
    // Clamp index to the new live edge; do not auto-seek here — callers decide.
    this.index = Math.min(this.index, this.timeline.liveIndex);
    return wasLive;
  }

  private update(): void {
    const model = this.timeline.modelAt(this.index);
    this.onUpdate(model, this.index);
  }
}
