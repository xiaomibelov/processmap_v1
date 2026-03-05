import test from "node:test";
import assert from "node:assert/strict";
import { parseDrawioSvgCache } from "./drawioSvg.js";

test("parseDrawioSvgCache decorates elements with drawio testids", () => {
  const parsed = parseDrawioSvgCache(
    "<svg viewBox='0 0 10 10'><g id='layer-main'><rect id='shape-1' x='1' y='1' width='8' height='8'/></g></svg>",
  );
  assert.ok(parsed);
  assert.match(String(parsed.body || ""), /data-testid="drawio-el-layer-main"/);
  assert.match(String(parsed.body || ""), /data-testid="drawio-el-shape-1"/);
});
