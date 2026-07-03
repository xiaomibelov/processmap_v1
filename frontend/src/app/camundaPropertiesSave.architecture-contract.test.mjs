import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("setElementCamundaExtensions is routed to canonical XML boundary (no primary PATCH /sessions path)", () => {
  const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const start = appSource.indexOf("async function setElementCamundaExtensions(");
  const end = appSource.indexOf("async function setElementCamundaPresentation(", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const block = appSource.slice(start, end);

  assert.match(block, /persistCamundaExtensionsViaCanonicalXmlBoundary\(/);
  assert.doesNotMatch(block, /persistSessionMetaBoundary\(/);
  assert.doesNotMatch(block, /apiPatchSession\(/);
});

