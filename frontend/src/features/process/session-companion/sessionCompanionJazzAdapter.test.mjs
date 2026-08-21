import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createSessionCompanionJazzAdapter } from "./sessionCompanionJazzAdapter.js";

const processStageSource = fs.readFileSync(new URL("../../../components/ProcessStage.jsx", import.meta.url), "utf8");
const persistSource = fs.readFileSync(new URL("../stage/controllers/useSessionMetaPersist.js", import.meta.url), "utf8");
const adapterSource = fs.readFileSync(new URL("./sessionCompanionJazzAdapter.js", import.meta.url), "utf8");

test("session companion jazz adapter exposes a narrow whole-snapshot contract", () => {
  const adapter = createSessionCompanionJazzAdapter();
  assert.equal(adapter.mode, "jazz");
  assert.equal(typeof adapter.readSharedSnapshot, "function");
  assert.equal(typeof adapter.applySnapshot, "function");
  assert.equal(typeof adapter.subscribe, "function");
  assert.equal(typeof adapter.hasPersistedDoc, "function");
});

test("session companion jazz pilot stays explicitly gated and scoped to the session", () => {
  assert.match(processStageSource, /const sessionCompanionLocalFirstAdapterMode = useMemo/);
  assert.match(processStageSource, /buildSessionCompanionJazzScopeId\(draft\?\.project_id \|\| draft\?\.projectId \|\| activeProjectId, sid\)/);
  assert.match(processStageSource, /createSessionCompanionJazzAdapter\(\{/);
  assert.match(processStageSource, /scopeId: sessionCompanionJazzScopeId,/);
  assert.match(adapterSource, /const DOC_IDS_STORAGE_KEY = "fpc:session-companion-jazz-docids";/);
});

test("session companion jazz bridge dual-writes legacy session meta plus Jazz snapshot", () => {
  assert.match(persistSource, /const persistSessionCompanion = useCallback\(async \(nextRaw, options = \{\}\) => \{/);
  assert.match(persistSource, /const needsJazzWrite = \(\s*sessionCompanionLocalFirstAdapterMode === "jazz"/);
  assert.match(persistSource, /await sessionCompanionJazzAdapter\.applySnapshot\(\{ snapshot: nextCompanion \}\);/);
});

test("session companion jazz adapter hardens corrupt auth and stale doc lifecycle", () => {
  assert.match(adapterSource, /function isCorruptPersistedAuthError\(error\)/);
  assert.match(adapterSource, /clearAuthSecretRaw\(\);\s+manager = await createContext\(\);/);
  assert.match(adapterSource, /clearPersistedDocId\(\);/);
  assert.match(adapterSource, /code: "auth_drift"/);
  assert.match(adapterSource, /runtimePromise = null;/);
});
