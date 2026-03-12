import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");

test("leave-to-project flush waits for stable non-pending XML before allowing navigation", () => {
  assert.match(source, /stableFlushCount/);
  assert.match(source, /stableXmlHash/);
  assert.match(source, /if \(stableFlushCount >= 2\)/);
});

