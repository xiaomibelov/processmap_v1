import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createDrawioJazzSpikeAdapter } from "./drawioJazzSpikeAdapter.js";

const storeSource = fs.readFileSync(new URL("../hybrid/controllers/useHybridStore.js", import.meta.url), "utf8");
const persistSource = fs.readFileSync(new URL("../stage/controllers/useSessionMetaPersist.js", import.meta.url), "utf8");
const adapterSource = fs.readFileSync(new URL("./drawioJazzSpikeAdapter.js", import.meta.url), "utf8");

test("drawio jazz spike adapter exposes a narrow whole-snapshot contract", () => {
  const adapter = createDrawioJazzSpikeAdapter();
  assert.equal(adapter.mode, "jazz");
  assert.equal(typeof adapter.readSharedSnapshot, "function");
  assert.equal(typeof adapter.applySnapshot, "function");
  assert.equal(typeof adapter.clearSharedSnapshot, "function");
  assert.equal(typeof adapter.subscribe, "function");
  assert.equal(typeof adapter.hasPersistedDoc, "function");
  assert.equal(typeof adapter.hasPayload, "function");
});

test("drawio jazz pilot stays explicitly gated and scoped to the session", () => {
  assert.match(storeSource, /const drawioLocalFirstAdapterMode = useMemo/);
  assert.match(storeSource, /const drawioJazzScopeId = useMemo/);
  assert.match(storeSource, /buildDrawioJazzScopeId\(projectId, sid\)/);
  assert.match(storeSource, /createDrawioJazzSpikeAdapter\(\{/);
  assert.match(storeSource, /scopeId: drawioJazzScopeId,/);
  assert.match(adapterSource, /const DOC_IDS_STORAGE_KEY = "fpc:drawio-jazz-docids";/);
});

test("drawio jazz adapter uses whole-snapshot payload_json semantics", () => {
  assert.match(adapterSource, /payload_json/);
  assert.match(adapterSource, /payload_hash/);
  assert.doesNotMatch(adapterSource, /drawio_elements_v1:[\s\S]*subscribe\(/);
  assert.match(adapterSource, /function snapshotFromJazzRecord\(record\)/);
  assert.match(adapterSource, /JSON\.parse\(payloadJson\)/);
});

test("drawio jazz adapter hardens corrupt auth and stale doc lifecycle", () => {
  assert.match(adapterSource, /function isCorruptPersistedAuthError\(error\)/);
  assert.match(adapterSource, /clearAuthSecretRaw\(\);\s+manager = await createContext\(\);/);
  assert.match(adapterSource, /clearPersistedDocId\(\);/);
  assert.match(adapterSource, /code: "auth_drift"/);
  assert.match(adapterSource, /runtimePromise = null;/);
});

test("drawio jazz bridge reads from Jazz with legacy fallback and dual-write persistence", () => {
  assert.match(storeSource, /resolvePreferredDrawioSnapshot\(drawioJazzMeta, legacyDrawioFromDraft\)/);
  assert.match(persistSource, /const needsLegacyWrite = nextSig !== legacyPrevSig;/);
  assert.match(persistSource, /const needsJazzWrite = drawioLocalFirstAdapterMode === "jazz"/);
  assert.match(persistSource, /await drawioJazzAdapter\.applySnapshot\(\{ snapshot: nextMeta \}\);/);
});
