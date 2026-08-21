import test from "node:test";
import assert from "node:assert/strict";

import {
  extractDrawioElementIdsFromSvg,
  readDrawioElementSnapshot,
  readDrawioTextElementContent,
  updateDrawioElementAttributes,
  updateDrawioTextElementContent,
} from "./drawioSvg.js";

test("extractDrawioElementIdsFromSvg filters technical ids by default", () => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="mxclip-1"><rect x="0" y="0" width="10" height="10"/></clipPath>
      </defs>
      <g id="shape_group">
        <rect id="shape_rect" x="10" y="10" width="20" height="20"/>
      </g>
      <path id="mxmarker-5" d="M0,0"/>
    </svg>
  `;
  const ids = extractDrawioElementIdsFromSvg(svg);
  assert.deepEqual(ids, ["shape_group", "shape_rect"]);
});

test("extractDrawioElementIdsFromSvg can include technical ids for diagnostics", () => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="mxclip-1"/></defs>
      <g id="shape_group"/>
    </svg>
  `;
  const ids = extractDrawioElementIdsFromSvg(svg, { includeTechnical: true });
  assert.deepEqual(ids, ["mxclip-1", "shape_group"]);
});

test("drawio svg text editing reads and updates runtime text node content", () => {
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text id=\"text_runtime_1\" x=\"120\" y=\"80\">Old</text></svg>";
  assert.equal(readDrawioTextElementContent(svg, "text_runtime_1"), "Old");
  const updated = updateDrawioTextElementContent(svg, "text_runtime_1", "New label");
  assert.equal(readDrawioTextElementContent(updated, "text_runtime_1"), "New label");
  assert.equal(String(updated).includes('data-drawio-text-value="New label"'), true);
  assert.equal(String(updated).includes("<tspan"), true);
});

test("drawio svg text editing ignores non-text renderable roots", () => {
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect id=\"shape1\" x=\"0\" y=\"0\" width=\"10\" height=\"10\"/></svg>";
  assert.equal(readDrawioTextElementContent(svg, "shape1"), null);
  assert.equal(updateDrawioTextElementContent(svg, "shape1", "Ignored"), svg);
});

test("drawio svg style editing reads snapshot and updates shape attrs by id", () => {
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect id=\"shape1\" x=\"10\" y=\"10\" width=\"20\" height=\"20\" fill=\"#fff\" stroke=\"#111\"/></svg>";
  const snapshot = readDrawioElementSnapshot(svg, "shape1");
  assert.equal(snapshot?.tagName, "rect");
  assert.equal(snapshot?.attrs?.fill, "#fff");
  const updated = updateDrawioElementAttributes(svg, "shape1", {
    fill: "#dbeafe",
    stroke: "#2563eb",
    "stroke-width": "2",
  });
  const next = readDrawioElementSnapshot(updated, "shape1");
  assert.equal(next?.attrs?.fill, "#dbeafe");
  assert.equal(next?.attrs?.stroke, "#2563eb");
  assert.equal(next?.attrs?.["stroke-width"], "2");
});
