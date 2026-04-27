import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("selected BPMN element metadata does not use technical id as readable name", () => {
  assert.match(source, /normalizeTechnicalBpmnLabelsInXml[\s\S]*readableBpmnText[\s\S]*from "\.\.\/\.\.\/features\/process\/bpmn\/bpmnIdentity"/);
  assert.match(source, /const resolvedXml = normalizeTechnicalBpmnLabelsInXml\(resolvedXmlRaw, draft\?\.nodes\);/);
  assert.match(source, /const name = readableBpmnText\([\s\S]*bo\?\.name[\s\S]*el\?\.label\?\.businessObject\?\.name/);
  assert.doesNotMatch(source, /const name = String\(bo\?\.name \|\| elementId\)/);
});
