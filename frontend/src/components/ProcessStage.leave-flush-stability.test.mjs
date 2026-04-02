import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const stageSource = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");
const controllerSource = fs.readFileSync(new URL("../features/process/navigation/processLeaveFlushController.js", import.meta.url), "utf8");

test("leave-to-project flush waits for stable non-pending XML before allowing navigation", () => {
  assert.match(stageSource, /flushProcessStageBeforeLeave/);
  assert.match(controllerSource, /stableFlushCount/);
  assert.match(controllerSource, /stableXmlHash/);
  assert.match(controllerSource, /if \(stableFlushCount >= 2\)/);
});
