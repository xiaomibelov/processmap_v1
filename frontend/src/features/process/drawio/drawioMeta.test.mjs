import test from "node:test";
import assert from "node:assert/strict";

import { mergeDrawioMeta, normalizeDrawioMeta } from "./drawioMeta.js";

test("mergeDrawioMeta uses fallback when primary is empty and fallback has svg cache", () => {
  const merged = mergeDrawioMeta(
    normalizeDrawioMeta({}),
    normalizeDrawioMeta({
      enabled: true,
      svg_cache: "<svg><rect id='shape1' x='10' y='10' width='20' height='20'/></svg>",
      transform: { x: 120, y: 70 },
    }),
  );

  assert.equal(merged.enabled, true);
  assert.equal(String(merged.svg_cache || "").includes("<svg"), true);
  assert.equal(Number(merged.transform?.x || 0), 120);
  assert.equal(Number(merged.transform?.y || 0), 70);
});

test("mergeDrawioMeta keeps primary payload when it already has svg cache", () => {
  const merged = mergeDrawioMeta(
    normalizeDrawioMeta({
      enabled: true,
      svg_cache: "<svg><circle id='local' cx='5' cy='5' r='5'/></svg>",
    }),
    normalizeDrawioMeta({
      enabled: true,
      svg_cache: "<svg><rect id='server' x='1' y='1' width='2' height='2'/></svg>",
    }),
  );

  assert.equal(String(merged.svg_cache || "").includes("local"), true);
  assert.equal(String(merged.svg_cache || "").includes("server"), false);
});

test("normalizeDrawioMeta creates Default layer and assigns svg elements to layer", () => {
  const meta = normalizeDrawioMeta({
    enabled: true,
    svg_cache: "<svg><rect id='rect_1' x='10' y='10' width='20' height='20'/><circle id='c1' cx='6' cy='6' r='3'/></svg>",
  });
  assert.equal(Array.isArray(meta.drawio_layers_v1), true);
  assert.equal(meta.drawio_layers_v1.length >= 1, true);
  assert.equal(String(meta.drawio_layers_v1[0]?.name || ""), "Default");
  assert.equal(Array.isArray(meta.drawio_elements_v1), true);
  assert.equal(meta.drawio_elements_v1.some((row) => String(row?.id) === "rect_1"), true);
  assert.equal(meta.drawio_elements_v1.some((row) => String(row?.id) === "c1"), true);
  assert.equal(
    meta.drawio_elements_v1.every((row) => String(row?.layer_id || "").trim().length > 0),
    true,
  );
});
