import test from "node:test";
import assert from "node:assert/strict";

import { laneColor, laneLabelShort, laneCellDisplay } from "./utils.js";

test("laneColor: unique color per lane index (no repeats)", () => {
  const seen = new Set();
  for (let i = 1; i <= 200; i += 1) {
    const c = laneColor(`lane_${i}`, i);
    assert.equal(seen.has(c), false, `duplicate color at lane index ${i}: ${c}`);
    seen.add(c);
  }
});

test("laneColor: deterministic for same lane index", () => {
  const a = laneColor("cook_1", 7);
  const b = laneColor("cook_1", 7);
  assert.equal(a, b);
});

test("laneColor: deterministic fallback by key without index", () => {
  const a = laneColor("brigadir");
  const b = laneColor("brigadir");
  const c = laneColor("povar");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

const LANE_PATTERN = /^L\d+$/;
const TRANSITION_PATTERN = /^L\d+\s*→\s*L\d+$/;

test("laneLabelShort: matches L-notation pattern", () => {
  assert.match(laneLabelShort("Цех", 1), LANE_PATTERN);
  assert.match(laneLabelShort("Склад", 2), LANE_PATTERN);
  assert.match(laneLabelShort("Офис", 10), LANE_PATTERN);
  assert.equal(laneLabelShort("Цех", 1), "L1");
  assert.equal(laneLabelShort("Склад", 2), "L2");
});

test("laneCellDisplay: no transitions returns plain L-notation", () => {
  const d = laneCellDisplay(1, "Цех", []);
  assert.match(d.text, LANE_PATTERN);
  assert.equal(d.text, "L1");
  assert.ok(d.tooltip.includes("Цех"));
});

test("laneCellDisplay: null transitions returns plain L-notation", () => {
  const d = laneCellDisplay(3, "Офис", null);
  assert.match(d.text, LANE_PATTERN);
  assert.equal(d.text, "L3");
});

test("laneCellDisplay: outgoing transition shows arrow", () => {
  const links = [{ direction: "out", laneName: "Склад", laneIdx: 2, laneKey: "lane_2" }];
  const d = laneCellDisplay(1, "Цех", links);
  assert.match(d.text, TRANSITION_PATTERN);
  assert.equal(d.text, "L1 → L2");
  assert.ok(d.tooltip.includes("Цех"));
  assert.ok(d.tooltip.includes("Склад"));
});

test("laneCellDisplay: incoming transition shows arrow with source first", () => {
  const links = [{ direction: "in", laneName: "Цех", laneIdx: 1, laneKey: "lane_1" }];
  const d = laneCellDisplay(2, "Склад", links);
  assert.match(d.text, TRANSITION_PATTERN);
  assert.equal(d.text, "L1 → L2");
  assert.ok(d.tooltip.includes("Склад"));
});

test("laneCellDisplay: outgoing preferred over incoming when both present", () => {
  const links = [
    { direction: "in", laneName: "Офис", laneIdx: 3, laneKey: "lane_3" },
    { direction: "out", laneName: "Склад", laneIdx: 2, laneKey: "lane_2" },
  ];
  const d = laneCellDisplay(1, "Цех", links);
  assert.match(d.text, TRANSITION_PATTERN);
  assert.equal(d.text, "L1 → L2");
});

test("laneCellDisplay: row height invariant — no multi-line text", () => {
  const links = [
    { direction: "out", laneName: "Очень длинное название участка", laneIdx: 5, laneKey: "lane_5" },
    { direction: "in", laneName: "Ещё один участок", laneIdx: 3, laneKey: "lane_3" },
    { direction: "out", laneName: "Третий участок", laneIdx: 7, laneKey: "lane_7" },
  ];
  const d = laneCellDisplay(1, "Цех", links);
  assert.ok(!d.text.includes("\n"), "text must be single-line");
  assert.match(d.text, TRANSITION_PATTERN);
});
