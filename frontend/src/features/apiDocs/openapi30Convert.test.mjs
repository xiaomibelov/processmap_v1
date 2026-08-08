// Конвертер OpenAPI 3.1 → 3.0 (для swagger-ui@4): unit-тесты правил.
// Запуск: node --test src/features/apiDocs/openapi30Convert.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { convertOpenApi31to30 } from "./openapi30Convert.js";

test("openapi-версия → 3.0.3, документ без схем не ломается", () => {
  const out = convertOpenApi31to30({ openapi: "3.1.0", info: { title: "t" }, paths: {} });
  assert.equal(out.openapi, "3.0.3");
  assert.deepEqual(out.paths, {});
});

test("anyOf [X, null] → X + nullable (type:'null' удаляется)", () => {
  const out = convertOpenApi31to30({ schema: { anyOf: [{ type: "string" }, { type: "null" }], title: "T" } });
  assert.deepEqual(out.schema, { type: "string", title: "T", nullable: true });
});

test("anyOf [A, B, null] → anyOf [A, B] (+nullable на родителе при type)", () => {
  const out = convertOpenApi31to30({
    schema: { type: "object", anyOf: [{ type: "string" }, { type: "integer" }, { type: "null" }] },
  });
  assert.deepEqual(out.schema.anyOf, [{ type: "string" }, { type: "integer" }]);
  assert.equal(out.schema.nullable, true);
});

test("type:'null' standalone → пустая схема (допускает всё)", () => {
  const out = convertOpenApi31to30({ schema: { type: "null" } });
  assert.deepEqual(out.schema, {});
});

test("const → enum: [const]", () => {
  const out = convertOpenApi31to30({ schema: { const: "source" } });
  assert.deepEqual(out.schema, { enum: ["source"] });
});

test("examples → example (первое значение), example не перезаписывается", () => {
  const a = convertOpenApi31to30({ schema: { type: "string", examples: ["e1", "e2"] } });
  assert.equal(a.schema.example, "e1");
  assert.equal(a.schema.examples, undefined);
  const b = convertOpenApi31to30({ schema: { type: "string", example: "keep", examples: ["x"] } });
  assert.equal(b.schema.example, "keep");
});

test("$ref + siblings → allOf[$ref] + siblings (глубокая конверсия siblings)", () => {
  const out = convertOpenApi31to30({
    schema: { $ref: "#/components/schemas/A", title: "Inp", items: { type: "null" } },
  });
  assert.deepEqual(out.schema.allOf, [{ $ref: "#/components/schemas/A" }]);
  assert.equal(out.schema.title, "Inp");
  assert.deepEqual(out.schema.items, {});
});

test("anyOf [$ref, null] → $ref без лишних обёрток", () => {
  const out = convertOpenApi31to30({
    schema: { anyOf: [{ $ref: "#/components/schemas/A" }, { type: "null" }], title: "Inp" },
  });
  // фолдинг → $ref + title; $ref+siblings обработан повторно → allOf
  assert.deepEqual(out.schema.allOf, [{ $ref: "#/components/schemas/A" }]);
  assert.equal(out.schema.title, "Inp");
});
