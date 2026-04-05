import test from "node:test";
import assert from "node:assert/strict";
import buildBpmnPropertiesOverlaySchema from "./buildBpmnPropertiesOverlaySchema.js";

test("buildBpmnPropertiesOverlaySchema builds compact editable schema", () => {
  const schema = buildBpmnPropertiesOverlaySchema({
    payloadRaw: {
      elementId: "Task_1",
      elementName: "Проверка сырья",
      bpmnType: "bpmn:UserTask",
      documentation: [
        { text: "Нужно проверить входные параметры", textFormat: "text/html" },
        { text: "Доп. описание", textFormat: "text/markdown" },
      ],
      extensionProperties: [{ key: "0:0:priority", name: "priority", value: "high" }],
      robotMeta: [{ key: "robot", value: "scale_01" }],
    },
  });

  assert.equal(schema.elementId, "Task_1");
  assert.equal(schema.elementName, "Проверка сырья");
  assert.equal(schema.bpmnType, "bpmn:UserTask");

  const editable = schema.sections.find((section) => section.id === "editable");
  assert.ok(editable);
  assert.equal(editable.rows.some((row) => row.id === "name"), true);
  assert.equal(editable.rows.some((row) => row.id === "documentation"), true);
  assert.equal(editable.rows.some((row) => row.kind === "extension"), true);
  const documentationRow = editable.rows.find((row) => row.id === "documentation");
  assert.deepEqual(documentationRow.documentationRows, [
    { text: "Нужно проверить входные параметры", textFormat: "text/html" },
    { text: "Доп. описание", textFormat: "text/markdown" },
  ]);
  const extensionRow = editable.rows.find((row) => row.kind === "extension");
  assert.equal(extensionRow.propertyKey, "0:0:priority");

  const robotSection = schema.sections.find((section) => section.id === "robot_meta");
  assert.ok(robotSection);
  assert.equal(robotSection.rows[0].editable, false);
});
