import test from "node:test";
import assert from "node:assert/strict";
import { diagramLoadStateMachineReducer } from "./diagramLoadStateMachine.js";

function reduceSequence(...actions) {
  let state = "idle";
  let reason = "";
  for (const action of actions) {
    const res = diagramLoadStateMachineReducer(state, action.action || action, action.payload);
    if (typeof res === "string") {
      state = res;
    } else if (res && typeof res === "object") {
      state = res.state;
      reason = res.reason || reason;
    }
  }
  return { state, reason };
}

test("reset moves idle -> initializing", () => {
  assert.equal(reduceSequence("reset").state, "initializing");
});

test("init_done moves initializing -> importing", () => {
  assert.equal(reduceSequence("reset", "init_done").state, "importing");
});

test("import_start moves initializing -> importing", () => {
  assert.equal(reduceSequence("reset", "import_start").state, "importing");
});

test("import_success moves importing -> ready", () => {
  assert.equal(reduceSequence("reset", "import_start", "import_success").state, "ready");
});

test("import_error moves any state -> error with reason", () => {
  const { state, reason } = reduceSequence("reset", "import_start", { action: "import_error", payload: { reason: "boom" } });
  assert.equal(state, "error");
  assert.equal(reason, "boom");
});

test("timeout moves importing -> timeout", () => {
  const { state, reason } = reduceSequence("reset", "import_start", { action: "timeout", payload: { reason: "exceeded_10000ms" } });
  assert.equal(state, "timeout");
  assert.equal(reason, "exceeded_10000ms");
});

test("timeout does not transition from ready", () => {
  assert.equal(reduceSequence("reset", "import_success", "timeout").state, "ready");
});

test("canvas_ready moves importing -> canvas-ready", () => {
  assert.equal(reduceSequence("reset", "import_start", "canvas_ready").state, "canvas-ready");
});

test("fully_ready moves canvas-ready -> ready", () => {
  assert.equal(reduceSequence("reset", "import_start", "canvas_ready", "fully_ready").state, "ready");
});

test("destroy resets to idle", () => {
  assert.equal(reduceSequence("reset", "import_success", "destroy").state, "idle");
});

test("unknown action keeps state", () => {
  assert.equal(reduceSequence("reset", "nonsense").state, "initializing");
});

test("import_success from idle transitions to ready", () => {
  assert.equal(reduceSequence("import_success").state, "ready");
});

test("init_done from idle transitions to importing", () => {
  assert.equal(reduceSequence("init_done").state, "importing");
});
