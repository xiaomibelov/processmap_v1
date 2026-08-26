import { foldEventsTo } from "./fold.js";
import type { ContourModel, RawEvent } from "./types.js";

const STEP_EVENTS = new Set(["step.started", "step.finished"]);

/**
 * Time-travel index over a sequence of raw events.
 */
export class Timeline {
  private readonly events: RawEvent[];

  constructor(events: RawEvent[] = []) {
    this.events = events;
  }

  /**
   * Append new events to the live edge.
   */
  append(events: RawEvent[]): void {
    this.events.push(...events);
  }

  /**
   * Total number of events.
   */
  get length(): number {
    return this.events.length;
  }

  /**
   * ISO timestamps of all events.
   */
  get eventTimes(): string[] {
    return this.events.map((e) => e.ts);
  }

  /**
   * Index of the live edge (last event).
   */
  get liveIndex(): number {
    return Math.max(0, this.events.length - 1);
  }

  /**
   * Compute the contour model at a specific event index.
   */
  modelAt(index: number): ContourModel[] {
    return foldEventsTo(this.events, index);
  }

  /**
   * Find the index of the next step-related event after the given index.
   * Returns the same index if none found.
   */
  nextStepIndex(current: number): number {
    for (let i = current + 1; i < this.events.length; i++) {
      if (STEP_EVENTS.has(this.events[i].event)) return i;
    }
    return Math.min(current, this.liveIndex);
  }

  /**
   * Find the index of the previous step-related event before the given index.
   * Returns 0 if none found.
   */
  prevStepIndex(current: number): number {
    for (let i = current - 1; i >= 0; i--) {
      if (STEP_EVENTS.has(this.events[i].event)) return i;
    }
    return 0;
  }

  /**
   * Find the first event index for a specific run and optional step.
   */
  seekToEventId(runId: string, step?: string): number {
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.run_id !== runId) continue;
      if (step === undefined) return i;
      if (
        (e.event === "step.started" || e.event === "step.finished") &&
        e.step === step
      ) {
        return i;
      }
    }
    return 0;
  }
}
