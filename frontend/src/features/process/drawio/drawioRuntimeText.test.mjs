import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRuntimeWrappedTextMarkup,
  normalizeRuntimeTextWidth,
  readRuntimeTextState,
  updateRuntimeTextLayout,
} from "./drawioRuntimeText.js";

test("drawio runtime text: runtime markup carries width/value continuity attrs", () => {
  const markup = buildRuntimeWrappedTextMarkup({
    elementIdRaw: "text_runtime_1",
    textRaw: "Alpha Beta",
    xRaw: 120,
    yRaw: 80,
    widthRaw: 140,
  });
  assert.equal(String(markup).includes('data-drawio-text-width="140"'), true);
  assert.equal(String(markup).includes('data-drawio-text-value="Alpha Beta"'), true);
  assert.equal(String(markup).includes("<tspan"), true);
});

test("drawio runtime text: width update wraps text and recomputes auto height on same id", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${buildRuntimeWrappedTextMarkup({
    elementIdRaw: "text_runtime_2",
    textRaw: "Long session first text label",
    xRaw: 120,
    yRaw: 80,
    widthRaw: 160,
  })}</svg>`;
  const before = readRuntimeTextState(svg, "text_runtime_2");
  const updated = updateRuntimeTextLayout(svg, "text_runtime_2", { widthRaw: 80 });
  const after = readRuntimeTextState(updated.svg, "text_runtime_2");
  assert.equal(before?.width, 160);
  assert.equal(after?.width, 80);
  assert.equal(String(updated.svg).includes('id="text_runtime_2"'), true);
  assert.equal(after?.height > before?.height, true);
});

test("drawio runtime text: normalize width keeps safe numeric range", () => {
  assert.equal(normalizeRuntimeTextWidth("", 120), 120);
  assert.equal(normalizeRuntimeTextWidth("72", 120), 80);
  assert.equal(normalizeRuntimeTextWidth("240", 120), 240);
  assert.equal(normalizeRuntimeTextWidth("9999", 120), 800);
});
