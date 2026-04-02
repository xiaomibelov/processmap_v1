import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./useTemplatesStageBridge.js", import.meta.url), "utf8");

test("template apply saveLocal call carries explicit template_apply saveOwner", () => {
  assert.match(
    source,
    /api\.saveLocal\(\{\s*force: true,\s*source: toText\(options\?\.source \|\| "template_apply"\),\s*trigger: "template_apply",\s*saveOwner: "template_apply",\s*\}\)/,
  );
});
