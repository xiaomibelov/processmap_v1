import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createNodePathJazzSpikeAdapter } from "./nodePathJazzSpikeAdapter.js";

const notesPanelSource = fs.readFileSync(new URL("../../../components/NotesPanel.jsx", import.meta.url), "utf8");
const contractSource = fs.readFileSync(new URL("./NODEPATH_MODULE_CONTRACT.md", import.meta.url), "utf8");

test("jazz spike adapter stays explicitly gated and does not replace the internal default path", () => {
  assert.match(notesPanelSource, /const nodePathLocalFirstAdapterMode = getNodePathLocalFirstAdapterMode\(\);/);
  assert.match(notesPanelSource, /const nodePathJazzAdapter = useMemo\(\(\) => createNodePathJazzSpikeAdapter\(\{/);
  assert.match(notesPanelSource, /scopeId: sid,/);
  assert.match(notesPanelSource, /const nodePathModuleAdapter = nodePathLocalFirstAdapterMode === "jazz"/);
  assert.match(contractSource, /current internal adapter remains the default path/i);
});

test("jazz spike adapter exposes the same contract surface as the internal adapter", () => {
  const adapter = createNodePathJazzSpikeAdapter();
  assert.equal(adapter.mode, "jazz");
  assert.equal(typeof adapter.readSharedSnapshot, "function");
  assert.equal(typeof adapter.applyDraft, "function");
  assert.equal(typeof adapter.clearSharedSnapshot, "function");
  assert.equal(typeof adapter.subscribe, "function");
});

test("jazz spike adapter reuses persisted Jazz auth when present and keeps shared docs scoped to the current module context", () => {
  const source = fs.readFileSync(new URL("./nodePathJazzSpikeAdapter.js", import.meta.url), "utf8");
  assert.match(source, /defaultProfileName: "NodePath Spike"/);
  assert.match(source, /function readAuthSecretRaw\(\)/);
  assert.match(source, /const hasPersistedAuth = Boolean\(readAuthSecretRaw\(\)\);/);
  assert.doesNotMatch(source, /newAccountProps:/);
  assert.match(source, /new URL\("\.\/jazzTools\.runtime\.js", import\.meta\.url\)\.href/);
  assert.match(source, /new URL\("\.\/jazzToolsBrowser\.runtime\.js", import\.meta\.url\)\.href/);
  assert.ok(source.includes('const importDynamic = new Function("s", "return import(s);");'));
  assert.match(source, /function buildScopedNodeKey\(nodeId\)/);
  assert.match(source, /return normalizedScopeId \? `\$\{normalizedScopeId\}::\$\{normalizedNodeId\}` : normalizedNodeId;/);
  assert.match(source, /if \(!readAuthSecretRaw\(\)\) \{/);
  assert.doesNotMatch(source, /if \(normalizedNodeId && !snapshotByNodeId\.has\(normalizedNodeId\)\)/);
  assert.match(source, /function scheduleSnapshotDelivery\(nodeId, record\)/);
  assert.match(source, /queueMicrotask\(\(\) => \{/);
});

test("jazz spike adapter reports a clear blocker when no peer is configured", async () => {
  const adapter = createNodePathJazzSpikeAdapter({ peer: "" });
  const applyResult = await adapter.applyDraft({
    nodeId: "Task_1",
    draft: { paths: ["P0"], sequence_key: "primary" },
  });
  const resetResult = await adapter.clearSharedSnapshot({ nodeId: "Task_1" });
  assert.equal(applyResult.ok, false);
  assert.equal(resetResult.ok, false);
  assert.match(applyResult.error, /VITE_NODEPATH_JAZZ_PEER|fpc:nodepath-jazz-peer/);
  assert.equal(applyResult.blocked, "runtime_error");
});

test("jazz spike adapter keeps node-path scope narrow", () => {
  const source = fs.readFileSync(new URL("./nodePathJazzSpikeAdapter.js", import.meta.url), "utf8");
  assert.match(source, /nodeId/);
  assert.match(source, /sequence_key/);
  assert.match(source, /p0/);
  assert.match(source, /p1/);
  assert.match(source, /p2/);
  assert.doesNotMatch(source, /RobotMeta|Camunda|AIQuestions|ElementNotes|StepTime/);
});

test("jazz spike adapter refreshes node-scoped truth on subscribe rebinding", () => {
  const source = fs.readFileSync(new URL("./nodePathJazzSpikeAdapter.js", import.meta.url), "utf8");
  assert.match(source, /ensureRecord\(normalizedNodeId, \{ forceReload: true \}\)/);
  assert.match(source, /const forceReload = options\?\.forceReload === true;/);
});

test("jazz spike adapter waits for Jazz sync before reporting shared writes complete", () => {
  const source = fs.readFileSync(new URL("./nodePathJazzSpikeAdapter.js", import.meta.url), "utf8");
  assert.match(source, /async function waitForRecordSync\(record\)/);
  assert.match(source, /await waitForSync\.call\(record\.\$jazz, \{ timeout: 15000 \}\);/);
  assert.match(source, /emitSnapshot\(normalizedNodeId, snapshotFromJazzRecord\(record\)\);\s+await waitForRecordSync\(record\);\s+await ensureSubscription\(normalizedNodeId\);/);
});

test("jazz spike adapter clears corrupt persisted auth and retries bootstrap once", () => {
  const source = fs.readFileSync(new URL("./nodePathJazzSpikeAdapter.js", import.meta.url), "utf8");
  assert.match(source, /function isCorruptPersistedAuthError\(error\)/);
  assert.match(source, /function clearAuthSecretRaw\(\)/);
  assert.match(source, /clearAuthSecretRaw\(\);\s+manager = await createContext\(\);/);
  assert.match(source, /runtimePromise = null;/);
});

test("jazz spike adapter clears stale scoped doc ids when persisted doc loads dead", () => {
  const source = fs.readFileSync(new URL("./nodePathJazzSpikeAdapter.js", import.meta.url), "utf8");
  assert.match(source, /function clearPersistedDocId\(nodeId\)/);
  assert.match(source, /if \(!loaded \|\| loaded\.\$isLoaded === false\) \{/);
  assert.match(source, /clearPersistedDocId\(normalizedNodeId\);/);
  assert.match(source, /emitSnapshot\(normalizedNodeId, buildNodePathComparableSnapshot\(null\)\);/);
});
