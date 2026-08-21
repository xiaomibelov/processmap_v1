import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { disableBpmnZoomScroll } from "./zoomScrollLifecycle.js";

test("disableBpmnZoomScroll toggles diagram navigation off", () => {
  const calls = [];
  const instance = {
    get(name) {
      assert.equal(name, "zoomScroll");
      return {
        toggle(value) {
          calls.push(value);
        },
      };
    },
  };

  assert.equal(disableBpmnZoomScroll(instance), true);
  assert.deepEqual(calls, [false]);
});

test("disableBpmnZoomScroll is safe for missing or throwing services", () => {
  assert.equal(disableBpmnZoomScroll(null), false);
  assert.equal(disableBpmnZoomScroll({}), false);
  assert.equal(disableBpmnZoomScroll({ get: () => null }), false);
  assert.equal(disableBpmnZoomScroll({ get: () => ({}) }), false);
  assert.equal(disableBpmnZoomScroll({ get: () => { throw new Error("no service"); } }), false);
});

test("BPMN teardown paths disable zoom-scroll before destroy or container clear", () => {
  const runtimeSource = fs.readFileSync(new URL("./createBpmnRuntime.js", import.meta.url), "utf8");
  const stageSource = fs.readFileSync(
    new URL("../../../../components/process/BpmnStage.jsx", import.meta.url),
    "utf8",
  );
  const recoverySource = fs.readFileSync(
    new URL("../stage/viewport/viewportRecovery.js", import.meta.url),
    "utf8",
  );

  assert.match(
    runtimeSource,
    /disableBpmnZoomScroll\(instance\);\s*try \{\s*instance\?\.destroy\?\.\(\);/,
  );
  assert.match(
    stageSource,
    /disableBpmnZoomScroll\(viewerRef\.current\);[\s\S]*try \{\s*viewerRef\.current\?\.destroy\?\.\(\);/,
  );
  assert.match(
    recoverySource,
    /disableBpmnZoomScroll\(refs\.viewerRef\.current\);\s*try \{\s*refs\.viewerRef\.current\?\.destroy\?\.\(\);/,
  );
});
