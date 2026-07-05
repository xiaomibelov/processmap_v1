import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./RecipeSidebar.jsx", import.meta.url), "utf8");

test("RecipeSidebar renders for bpmn:Task and bpmn:UserTask", () => {
  assert.match(source, /bpmn:task/);
  assert.match(source, /bpmn:usertask/);
  assert.match(source, /normalizedType\s*===\s*["']bpmn:task["']\s*\|\|\s*normalizedType\s*===\s*["']bpmn:usertask["']/);
});

test("RecipeSidebar keeps the property panel test id", () => {
  assert.match(source, /data-testid=\{?["']recipe-sidebar["']\}?/);
});
