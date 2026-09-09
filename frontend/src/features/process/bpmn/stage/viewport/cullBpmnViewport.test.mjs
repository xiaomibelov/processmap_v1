import assert from "node:assert/strict";
import test from "node:test";

import { collectOperationElementIds } from "./cullBpmnViewport.js";

test("collectOperationElementIds returns only the modeled element dependency closure", () => {
  const incoming = { id: "Flow_In" };
  const outgoing = { id: "Flow_Out" };
  const label = { id: "Task_1_label" };
  const boundary = { id: "Boundary_1" };
  const host = { id: "SubProcess_1" };
  const child = { id: "Child_1" };
  const shape = {
    id: "Task_1",
    incoming: [incoming],
    outgoing: [outgoing],
    label,
    attachers: [boundary],
    host,
    children: [child],
  };

  const ids = collectOperationElementIds({ shape, context: { shape } });

  assert.deepEqual([...ids].sort(), [
    "Boundary_1",
    "Child_1",
    "Flow_In",
    "Flow_Out",
    "SubProcess_1",
    "Task_1",
    "Task_1_label",
  ]);
  assert.equal(ids.has("Unrelated_Offscreen_Task"), false);
});

test("collectOperationElementIds supports connect and replace event payloads", () => {
  const ids = collectOperationElementIds({
    source: { id: "Source" },
    target: { id: "Target" },
    context: {
      oldShape: { id: "Old" },
      newShape: { id: "New" },
      connection: { id: "Flow" },
    },
  });

  assert.deepEqual([...ids].sort(), ["Flow", "New", "Old", "Source", "Target"]);
});
