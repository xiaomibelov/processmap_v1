import test from "node:test";
import assert from "node:assert/strict";

import { extractDrawioElementIdsFromSvg } from "./drawioSvg.js";

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
