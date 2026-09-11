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

test("version-head effect does NOT refetch on draft identity changes (save-ack) — only on sid change / meta-seed skip", () => {
  const source = readSource();
  const effectMatch = source.match(
    /useEffect\(\(\) => \{\n\s+if \(!sid\) \{\n\s+setLatestBpmnVersionHead\(null\);[\s\S]*?\n  \}, \[sid, refreshLatestBpmnRevisionHead\]\);/,
  );
  assert.notEqual(effectMatch, null, "version-head effect deps must be exactly [sid, refreshLatestBpmnRevisionHead] — no draft-identity deps");
  const effectBody = String(effectMatch?.[0] || "");
  assert.match(effectBody, /const sidChanged = versionHeadSidRef\.current !== sid;/);
  assert.match(effectBody, /if \(sidChanged\) \{\n\s+setLatestBpmnVersionHead\(null\);\n\s+\}/);
  assert.match(effectBody, /setLatestBpmnVersionHeadStatus\("loading"\);\n\s+void refreshLatestBpmnRevisionHead\(\);/);
});

test("manual save path still updates the version chip head straight from the save ack (no refetch needed)", () => {
  const source = readSource();
  assert.match(
    source,
    /setBpmnVersionTruthState\(\{[\s\S]*?hasSessionChangesSinceLatestBpmnVersion:[\s\S]*?\}\);[\s\S]*?setLatestBpmnVersionHead\(nextMeaningfulHead\);/,
    "manual/property save must keep seeding the chip head from the save ack",
  );
});

test("remote poll refreshes the version chip head only when a newer external version is detected", () => {
  const source = readSource();
  const pollMatch = source.match(/const pollRemoteSessionSnapshot = useCallback\(async \(reason = "interval"\) => \{[\s\S]*?\n  \}, \[/);
  assert.notEqual(pollMatch, null, "expected pollRemoteSessionSnapshot callback");
  const pollBody = String(pollMatch?.[0] || "");
  const newerIdx = pollBody.indexOf("head_not_newer");
  const refreshIdx = pollBody.indexOf("refreshHeadRef.current");
  const applyIdx = pollBody.indexOf("applyRemoteSaveHighlightFromVersionHead(latestHead");
  assert.notEqual(refreshIdx, -1, "poll must refresh the chip head via refreshHeadRef.current() on newer-version branch");
  assert.ok(newerIdx !== -1 && refreshIdx > newerIdx, "head refresh must happen after the head_not_newer guard");
  assert.ok(applyIdx === -1 || refreshIdx < applyIdx, "head refresh must precede applyRemoteSaveHighlightFromVersionHead");
  assert.doesNotMatch(pollBody, /refreshHeadRef\.current[^;]*;[\s\S]*?refreshHeadRef\.current/, "head refresh must fire once per newer-version detection, not per tick");
  const depsMatch = source.match(/const pollRemoteSessionSnapshot = useCallback\(async \(reason = "interval"\) => \{[\s\S]*?\n  \}, \[([\s\S]*?)\]\);/);
  const deps = String(depsMatch?.[1] || "");
  assert.doesNotMatch(deps, /refreshLatestBpmnRevisionHead/, "poll deps must NOT include refreshLatestBpmnRevisionHead (avoid interval churn)");
});

test("refreshHeadRef always points at the latest refreshLatestBpmnRevisionHead", () => {
  const source = readSource();
  assert.match(
    source,
    /const refreshHeadRef = useRef\(refreshLatestBpmnRevisionHead\);[\s\S]*?useEffect\(\(\) => \{\s*refreshHeadRef\.current = refreshLatestBpmnRevisionHead;\s*\}, \[refreshLatestBpmnRevisionHead\]\);/,
    "refreshHeadRef must be kept in sync with refreshLatestBpmnRevisionHead",
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
