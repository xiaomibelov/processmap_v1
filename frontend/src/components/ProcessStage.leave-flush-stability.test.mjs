import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const stageSource = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");
const controllerSource = fs.readFileSync(new URL("../features/process/navigation/processLeaveFlushController.js", import.meta.url), "utf8");

test("leave-to-project flush waits for stable non-pending XML before allowing navigation", () => {
  assert.match(stageSource, /flushProcessStageBeforeLeave/);
  assert.match(stageSource, /deriveLeaveNavigationRisk/);
  assert.match(stageSource, /leaveNavigationRisk/);
  assert.match(controllerSource, /stableFlushCount/);
  assert.match(controllerSource, /stableXmlHash/);
  assert.match(controllerSource, /if \(stableFlushCount >= 2\)/);
});

test("ProcessStage registers app safe refresh without replacing leave flush", () => {
  assert.match(stageSource, /import \{ registerAppSafeRefreshHandler \}/);
  assert.match(stageSource, /attachProcessStageFlushBeforeLeaveListener/);
  assert.match(stageSource, /registerAppSafeRefreshHandler\(\{/);
  assert.match(stageSource, /status: "dirty"/);
  assert.match(stageSource, /source: "app_update_refresh"/);
  assert.match(stageSource, /flush\?\.skipped === true \? "clean" : "saved"/);
});
