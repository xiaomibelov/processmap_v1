import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./OrgPropertyDictionaryPanel.jsx", import.meta.url), "utf8");

test("Dictionary manager exposes operation -> property -> values workflow in Russian", () => {
  assert.match(source, /Операции/);
  assert.match(source, /Свойства операции/);
  assert.match(source, /Допустимые значения/);
  assert.match(source, /Добавить значение/);
  assert.match(source, /можно своё значение/);
});
