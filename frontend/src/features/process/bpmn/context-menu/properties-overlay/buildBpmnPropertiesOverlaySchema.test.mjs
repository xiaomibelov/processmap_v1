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

test("buildBpmnPropertiesOverlaySchema: RobotMeta operation key adds read-only header rows", () => {
  const schema = buildBpmnPropertiesOverlaySchema({
    payloadRaw: {
      elementId: "Task_2",
      extensionProperties: [
        { key: "0:0:object_ref", name: "object_ref", value: "container_1" },
        { key: "0:1:target_ref", name: "target_ref", value: "microwave_1" },
      ],
      robotMeta: [
        { key: "version", value: "v1" },
        { key: "json", value: JSON.stringify({ exec: { action_key: "move" } }) },
      ],
    },
  });

  const editable = schema.sections.find((section) => section.id === "editable");
  assert.ok(editable);
  assert.equal(editable.rows[0].kind, "operation_key");
  assert.equal(editable.rows[0].label, "Операция");
  assert.equal(editable.rows[0].value, "move");
  assert.equal(editable.rows[0].editable, false);
  assert.equal(editable.rows[1].kind, "operation_display_name");
  assert.equal(editable.rows[1].label, "Название");
  assert.equal(editable.rows[1].value, "Перенести container_1 в microwave_1");
  assert.equal(editable.rows[1].editable, false);
});

test("buildBpmnPropertiesOverlaySchema: manual display_name wins in the popover header", () => {
  const schema = buildBpmnPropertiesOverlaySchema({
    payloadRaw: {
      elementId: "Task_3",
      extensionProperties: [
        { key: "0:0:object_ref", name: "object_ref", value: "container_1" },
        { key: "0:1:display_name", name: "display_name", value: "Ручное имя" },
      ],
      robotMeta: [{ key: "json", value: JSON.stringify({ exec: { action_key: "move" } }) }],
    },
  });

  const editable = schema.sections.find((section) => section.id === "editable");
  const nameRow = editable.rows.find((row) => row.kind === "operation_display_name");
  assert.equal(nameRow.value, "Ручное имя");
});

test("buildBpmnPropertiesOverlaySchema: no operation key → no header rows", () => {
  const schema = buildBpmnPropertiesOverlaySchema({
    payloadRaw: {
      elementId: "Task_4",
      extensionProperties: [{ key: "0:0:priority", name: "priority", value: "high" }],
      robotMeta: [],
    },
  });

  const editable = schema.sections.find((section) => section.id === "editable");
  assert.ok(editable);
  assert.equal(editable.rows.some((row) => row.kind === "operation_key"), false);
  assert.equal(editable.rows.some((row) => row.kind === "operation_display_name"), false);
});
