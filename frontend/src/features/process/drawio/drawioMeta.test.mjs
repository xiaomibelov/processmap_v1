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
