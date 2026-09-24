import { describe, expect, it } from "vitest";
import {
  compressGap,
  Timeline,
  type ReplayItem,
  type Update,
} from "../../src/claude/timeline.js";

function item(ts: string, id: string): ReplayItem {
  return {
    timing: { kind: "Dated", ts: new Date(ts) },
    update: {
      type: "Entry",
      source: { type: "Main" },
      entry: { type: "ai-title", title: id } as import("../../src/claude/transcript.js").Entry,
    },
  };
}

describe("compressGap", () => {
  it("is faithful below the knee", () => {
    expect(compressGap(500)).toBe(500);
  });

  it("compresses large gaps logarithmically", () => {
    expect(compressGap(80000)).toBeLessThan(80000);
    expect(compressGap(80000)).toBeGreaterThan(800);
  });
});

describe("Timeline", () => {
  it("sorts items by timestamp", () => {
    const items = [item("2026-08-26T10:00:02.000Z", "b"), item("2026-08-26T10:00:01.000Z", "a")];
    const tl = new Timeline(items, true, "s1");
    expect(tl.eventTimes[0]).toBe("2026-08-26T10:00:01.000Z");
  });

  it("advances the cursor during forward playback", () => {
    const items = [
      item("2026-08-26T10:00:00.000Z", "a"),
      item("2026-08-26T10:00:01.000Z", "b"),
      item("2026-08-26T10:00:02.000Z", "c"),
    ];
    const tl = new Timeline(items, true, "s1");
    tl.setFollowHead(false);
    tl.seek(new Date("2026-08-26T10:00:00.000Z"));
    tl.setSpeed(1000);
    const start = tl.cursor!.getTime();
    tl.advance(100);
    expect(tl.cursor!.getTime()).toBeGreaterThan(start);
  });

  it("backward seek rebuilds identical model", () => {
    const items = [
      item("2026-08-26T10:00:00.000Z", "a"),
      item("2026-08-26T10:00:01.000Z", "b"),
      item("2026-08-26T10:00:02.000Z", "c"),
    ];
    const tl = new Timeline(items, true, "s1");
    tl.seek(new Date("2026-08-26T10:00:02.000Z"));
    const full = tl.getModel();
    tl.seek(new Date("2026-08-26T10:00:01.000Z"));
    const partial = tl.getModel();
    tl.seek(new Date("2026-08-26T10:00:02.000Z"));
    expect(tl.getModel()).toEqual(full);
    expect(partial.sessionInfo.title).toBe("b");
  });

  it("appends live items without resetting playhead", () => {
    const items = [item("2026-08-26T10:00:00.000Z", "a")];
    const tl = new Timeline(items, false, "s1");
    tl.setFollowHead(true);
    const before = tl.currentIndex;
    tl.append([item("2026-08-26T10:00:01.000Z", "b")]);
    expect(tl.currentIndex).toBeGreaterThan(before);
    expect(tl.atEdge).toBe(true);
  });
});
