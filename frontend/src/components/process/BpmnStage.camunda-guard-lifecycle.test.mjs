import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("template-insert camunda clear guard is not cleared when sync is skipped", () => {
  assert.match(source, /const camundaSync = templateInsertSeedInFlight[\s\S]*skipped: true/);
  assert.match(source, /const camundaSyncCompleted = Boolean\(camundaSync\?\.ok\) && !Boolean\(camundaSync\?\.skipped\);/);
  assert.match(
    source,
    /if \(\s*templateInsertClearGuardIds\.length\s*&& camundaSyncCompleted\s*&& Number\(camundaSync\?\.preservedManagedSkips \|\| 0\) === 0\s*\)\s*\{\s*clearTemplateInsertCamundaClearGuard\(\);/,
  );
});

test("template-insert guard ids continue to flow into real camunda sync path", () => {
  assert.match(
    source,
    /syncCamundaExtensionsToModeler\(activeModeler, \{\s*preserveManagedForElementIds: templateInsertClearGuardIds,\s*\}\)/,
  );
});
