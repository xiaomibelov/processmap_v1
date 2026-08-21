import assert from "node:assert/strict";
import test from "node:test";

import { DISPLAY_NAME_TEMPLATES, resolveDisplayName } from "./displayNameModel.js";

test("DISPLAY_NAME_TEMPLATES: covers the approved RU operation set", () => {
  assert.equal(DISPLAY_NAME_TEMPLATES.move, "Перенести {object_ref} в {target_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.transfer, "Перетарить {source_container_ref} в {target_container_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.open_container, "Открыть {container_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.close_container, "Закрыть {container_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.start_equipment, "Запустить {equipment_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.open_equipment, "Открыть {equipment_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.close_equipment, "Закрыть {equipment_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.set_equipment, "Настроить {equipment_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.measure_temperature, "Измерить температуру {container_ref}");
  assert.equal(DISPLAY_NAME_TEMPLATES.check, "Проверить {object_ref}");
});

test("resolveDisplayName: fills template when all placeholders are present", () => {
  const result = resolveDisplayName({
    operationKey: "move",
    rows: [
      { name: "object_ref", value: "container_1" },
      { name: "target_ref", value: "microwave_1" },
    ],
  });
  assert.equal(result, "Перенести container_1 в microwave_1");
});

test("resolveDisplayName: template lookup is case-insensitive; params trimmed/lowercased by name", () => {
  const result = resolveDisplayName({
    operationKey: "Move",
    rows: [
      { name: "Object_Ref", value: "  container_1 " },
      { name: "TARGET_REF", value: "microwave_1" },
      { name: "empty_param", value: "   " },
    ],
  });
  assert.equal(result, "Перенести container_1 в microwave_1");
});

test("resolveDisplayName: partial template falls back to label + present placeholder params", () => {
  const result = resolveDisplayName({
    operationKey: "move",
    operationLabel: "Перенос",
    rows: [{ name: "object_ref", value: "container_1" }],
  });
  assert.equal(result, "Перенос (object_ref: container_1)");
});

test("resolveDisplayName: partial template without label falls back to operationKey as base", () => {
  const result = resolveDisplayName({
    operationKey: "move",
    rows: [{ name: "object_ref", value: "container_1" }],
  });
  assert.equal(result, "move (object_ref: container_1)");
});

test("resolveDisplayName: manual display_name always wins and is returned as-is", () => {
  const result = resolveDisplayName({
    operationKey: "move",
    operationLabel: "Перенос",
    rows: [
      { name: "object_ref", value: "container_1" },
      { name: "target_ref", value: "microwave_1" },
      { name: "Display_Name", value: "Ручное имя" },
    ],
  });
  assert.equal(result, "Ручное имя");
});

test("resolveDisplayName: empty display_name value does not override", () => {
  const result = resolveDisplayName({
    operationKey: "move",
    rows: [
      { name: "object_ref", value: "container_1" },
      { name: "target_ref", value: "microwave_1" },
      { name: "display_name", value: "  " },
    ],
  });
  assert.equal(result, "Перенести container_1 в microwave_1");
});

test("resolveDisplayName: unknown operation with label → label (first 3 params, display_name skipped)", () => {
  const result = resolveDisplayName({
    operationKey: "custom_op",
    operationLabel: "Моя операция",
    rows: [
      { name: "p1", value: "v1" },
      { name: "p2", value: "v2" },
      { name: "p3", value: "v3" },
      { name: "p4", value: "v4" },
    ],
  });
  assert.equal(result, "Моя операция (p1: v1, p2: v2, p3: v3)");
});

test("resolveDisplayName: unknown operation without label → operationKey as-is as base", () => {
  const result = resolveDisplayName({
    operationKey: "custom_op",
    rows: [{ name: "p1", value: "v1" }],
  });
  assert.equal(result, "custom_op (p1: v1)");
});

test("resolveDisplayName: unknown operation, no label, no params → operationKey", () => {
  assert.equal(resolveDisplayName({ operationKey: "custom_op" }), "custom_op");
});

test("resolveDisplayName: label without params → label only", () => {
  assert.equal(resolveDisplayName({ operationKey: "move", operationLabel: "Перенос" }), "Перенос");
});

test("resolveDisplayName: params without key/label → bare param list without parens", () => {
  const result = resolveDisplayName({
    rows: [
      { name: "p1", value: "v1" },
      { name: "p2", value: "v2" },
    ],
  });
  assert.equal(result, "p1: v1, p2: v2");
});

test("resolveDisplayName: empty everything → empty string", () => {
  assert.equal(resolveDisplayName(), "");
  assert.equal(resolveDisplayName({}), "");
  assert.equal(resolveDisplayName({ operationKey: "", operationLabel: "", rows: [] }), "");
  assert.equal(resolveDisplayName({ rows: null }), "");
  assert.equal(resolveDisplayName({ rows: [{ name: "", value: "" }, null] }), "");
});
