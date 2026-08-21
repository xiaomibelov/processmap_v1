import assert from "node:assert/strict";
import test from "node:test";

import extractCamundaZeebePropertyEntriesFromBusinessObject from "./extractCamundaZeebePropertyEntries.js";

function readPairSet(entries) {
  return new Set(entries.map((row) => `${String(row?.propertyName || "")}::${String(row?.propertyValue || "")}`));
}

test("extractCamundaZeebePropertyEntriesFromBusinessObject includes direct zeebe:property entries", () => {
  const bo = {
    extensionElements: {
      values: [
        {
          $type: "zeebe:Property",
          name: "container_tara",
          value: "Кастрюля",
        },
      ],
    },
  };

  const rows = extractCamundaZeebePropertyEntriesFromBusinessObject(bo);
  const pairSet = readPairSet(rows);

  assert.ok(pairSet.has("container_tara::Кастрюля"));
  assert.ok(rows.some((row) => String(row?.sourcePath || "").includes("extensionElements.values[0]")));
});

test("extractCamundaZeebePropertyEntriesFromBusinessObject includes wrapped properties and scalar property-like entries", () => {
  const bo = {
    "zeebe:taskDefinitionType": "worker_type",
    extensionElements: {
      values: [
        {
          $type: "camunda:Properties",
          values: [
            { $type: "camunda:Property", name: "topic", value: "inventory" },
          ],
        },
        {
          $type: "zeebe:TaskDefinition",
          type: "external_job",
          retries: "5",
        },
      ],
    },
  };

  const rows = extractCamundaZeebePropertyEntriesFromBusinessObject(bo);
  const pairSet = readPairSet(rows);

  assert.ok(pairSet.has("topic::inventory"));
  assert.ok(pairSet.has("TaskDefinition.type::external_job"));
  assert.ok(pairSet.has("TaskDefinition.retries::5"));
  assert.ok(pairSet.has("zeebe:taskDefinitionType::worker_type"));
});

test("extractCamundaZeebePropertyEntriesFromBusinessObject ignores non-camunda/zeebe noise", () => {
  const bo = {
    extensionElements: {
      values: [
        {
          $type: "pm:RobotMeta",
          values: [
            { key: "rtier", value: "P0" },
          ],
        },
      ],
    },
  };

  const rows = extractCamundaZeebePropertyEntriesFromBusinessObject(bo);
  assert.deepEqual(rows, []);
});
