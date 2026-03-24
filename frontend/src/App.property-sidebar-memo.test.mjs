import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("left sidebar memo depends on property overlay and dictionary state", () => {
  const start = source.indexOf("const left = useMemo(() => {");
  const end = source.indexOf("\n\n  useEffect(() => {", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = source.slice(start, end);
  assert.match(block, /activeOrgId,/);
  assert.match(block, /orgPropertyDictionaryRevision,/);
  assert.match(block, /showPropertiesOverlayAlways,/);
});
