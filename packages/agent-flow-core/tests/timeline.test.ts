import { describe, expect, it } from "vitest";
import { Timeline } from "../src/timeline.js";
import {
  contourStarted,
  stepFinished,
  stepStarted,
} from "./fixtures/builders.js";

describe("Timeline", () => {
  const rid = "rid_timeline";
  const events = [
    contourStarted("feature/x", undefined, { run_id: rid }),
    stepStarted("feature/x", "plan", undefined, { run_id: rid }),
    stepFinished("feature/x", "plan", "ok", undefined, { run_id: rid }),
    stepStarted("feature/x", "api", undefined, { run_id: rid }),
  ];

  it("reports live index at last event", () => {
    const tl = new Timeline(events);
    expect(tl.liveIndex).toBe(events.length - 1);
  });

  it("modelAt respects index", () => {
    const tl = new Timeline(events);
    const atStart = tl.modelAt(0);
    expect(atStart[0].steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("nextStepIndex skips non-step events", () => {
    const tl = new Timeline(events);
    expect(tl.nextStepIndex(0)).toBe(1);
    expect(tl.nextStepIndex(1)).toBe(2);
    expect(tl.nextStepIndex(2)).toBe(3);
  });

  it("prevStepIndex does not go below 0", () => {
    const tl = new Timeline(events);
    expect(tl.prevStepIndex(0)).toBe(0);
    expect(tl.prevStepIndex(3)).toBe(2);
  });

  it("seekToEventId finds first event of a run", () => {
    const tl = new Timeline(events);
    expect(tl.seekToEventId(events[0].run_id)).toBe(0);
  });

  it("seekToEventId finds specific step", () => {
    const tl = new Timeline(events);
    expect(tl.seekToEventId(events[0].run_id, "plan")).toBe(1);
  });
});
