import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("org settings popstate keeps dictionaryOnly when tab=dictionary", () => {
  assert.match(source, /setOrgSettingsDictionaryOnly\(\(prev\) => \(nextTab === "dictionary" \? prev : false\)\)/);
});
