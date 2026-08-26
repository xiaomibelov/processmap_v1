import { describe, expect, it } from "vitest";
import { parseEventLine, parseEventLog } from "../src/parser.js";
import { contourStarted } from "./fixtures/builders.js";

describe("parseEventLine", () => {
  it("parses a valid line", () => {
    const line = JSON.stringify(
      contourStarted("feature/x", "2026-08-26T13:33:28.010Z")
    );
    const event = parseEventLine(line);
    expect(event).not.toBeNull();
    expect(event?.event).toBe("contour.started");
    expect(event?.contour_id).toBe("feature/x");
  });

  it("returns null for blank lines", () => {
    expect(parseEventLine("   ")).toBeNull();
    expect(parseEventLine("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseEventLine("{not json")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(parseEventLine(JSON.stringify({ event: "contour.started" }))).toBeNull();
  });

  it("returns null for unknown event version", () => {
    const line = JSON.stringify({
      v: 999,
      ts: "2026-08-26T13:33:28.010Z",
      event: "contour.started",
      contour_id: "feature/x",
      run_id: "a".repeat(32),
    });
    expect(parseEventLine(line)).toBeNull();
  });

  it("returns null for unknown event type", () => {
    const line = JSON.stringify({
      ts: "2026-08-26T13:33:28.010Z",
      event: "contour.unknown",
      contour_id: "feature/x",
      run_id: "a".repeat(32),
    });
    expect(parseEventLine(line)).toBeNull();
  });

  it("preserves unknown payload fields", () => {
    const line = JSON.stringify({
      ...contourStarted("feature/x"),
      extra: "value",
    });
    const event = parseEventLine(line);
    expect(event?.extra).toBe("value");
  });
});

describe("parseEventLog", () => {
  it("parses mixed valid and invalid lines", () => {
    const valid = contourStarted("feature/x");
    const text = [
      JSON.stringify(valid),
      "{broken",
      "   ",
      JSON.stringify(contourStarted("feature/y")),
    ].join("\n");
    const events = parseEventLog(text);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.contour_id)).toEqual(["feature/x", "feature/y"]);
  });
});
