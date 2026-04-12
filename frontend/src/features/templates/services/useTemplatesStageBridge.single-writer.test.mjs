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

test("template apply bridge keeps persist gate explicit and does not force success before persist outcome", () => {
  assert.match(
    source,
    /if \(!inserted\?\.ok \|\| options\?\.persistImmediately !== true\) \{\s*return inserted;\s*\}/,
  );
  assert.match(
    source,
    /if \(!saved\?\.ok\) \{\s*return \{ ok: false, error: toText\(saved\?\.error \|\| "persist_failed"\), inserted \};\s*\}/,
  );
  assert.match(
    source,
    /if \(saved\?\.pending === true\) \{\s*return \{ ok: false, error: "persist_pending_timeout", inserted \};\s*\}/,
  );
});

test("template apply bridge marks success as persisted only after saveLocal success", () => {
  assert.match(
    source,
    /return \{\s*\.\.\.inserted,\s*persisted: true,\s*persistedSource: toText\(saved\?\.source \|\| "backend"\),\s*\};/,
  );
});

test("non-interactive immediate insert keeps existing persistImmediately default contract", () => {
  assert.match(
    source,
    /persistImmediately: options\?\.persistImmediately !== false,/,
  );
});
