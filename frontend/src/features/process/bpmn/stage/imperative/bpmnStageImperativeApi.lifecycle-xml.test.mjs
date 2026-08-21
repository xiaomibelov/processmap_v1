import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./bpmnStageImperativeApi.js", import.meta.url), "utf8");

test("getRuntimeXmlSnapshot prefers live modeler saveXML before runtime.getXml fallback", () => {
  assert.match(source, /const modeler = refs\.modelerRef\?\.current \|\| refs\.modelerRuntimeRef\?\.current\?\.getInstance\?\.?\(\);/);
  assert.match(source, /if \(modeler && typeof modeler\.saveXML === "function"\) \{/);
  assert.match(source, /const out = await modeler\.saveXML\(\{ format: options\?\.format !== false \}\);/);
  assert.match(source, /source: "modeler_saveXML"/);
  assert.match(source, /source: "runtime_getXml"/);
});
