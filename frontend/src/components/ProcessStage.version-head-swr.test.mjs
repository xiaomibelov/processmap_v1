import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
}

test("draft-identity effect keeps the version head while refetching and only resets it on a sid switch", () => {
  const source = readSource();
  const effectMatch = source.match(
    /useEffect\(\(\) => \{\n\s+if \(!sid\) \{\n\s+setLatestBpmnVersionHead\(null\);[\s\S]*?\n  \}, \[sid, draft\?\.bpmn_xml_version, draft\?\.updated_at, draft\?\.version, refreshLatestBpmnRevisionHead\]\);/,
  );
  assert.notEqual(effectMatch, null, "expected the version-head effect at ProcessStage.jsx");
  const effectBody = String(effectMatch?.[0] || "");
  assert.match(effectBody, /const sidChanged = versionHeadSidRef\.current !== sid;/);
  assert.match(effectBody, /if \(sidChanged\) \{\n\s+setLatestBpmnVersionHead\(null\);\n\s+\}/);
  assert.match(effectBody, /setLatestBpmnVersionHeadStatus\("loading"\);\n\s+void refreshLatestBpmnRevisionHead\(\);/);
});

test("version head survives save-ack refetch: stale-while-revalidate keeps last-known head until a valid replacement arrives", () => {
  const source = readSource();
  // The draft-identity branch must not null the head; only a sid switch may reset it.
  assert.doesNotMatch(
    source,
    /if \(metaVersionHeadSeededRef\.current\) \{\n\s+metaVersionHeadSeededRef\.current = false;\n\s+return;\n\s+\}\n\s+setLatestBpmnVersionHead\(null\);\n\s+setLatestBpmnVersionHeadStatus\("loading"\);/,
    "save-ack path must not null latestBpmnVersionHead before refetch",
  );
  assert.match(
    source,
    /const sidChanged = versionHeadSidRef\.current !== sid;/,
    "effect must distinguish a sid switch (full reset) from a save-ack (keep head)",
  );
});

test("tracked head refetch keeps the previous head when the response carries no versions", () => {
  const source = readSource();
  assert.match(
    source,
    /setLatestBpmnVersionHead\(\(prevHead\) => asArray\(listWithUserFacingNumbers\)\[0\] \|\| \(trackHeadStatus \? prevHead : null\)\);/,
    "empty tracked refetch must not flash the chip back to V.-",
  );
});
