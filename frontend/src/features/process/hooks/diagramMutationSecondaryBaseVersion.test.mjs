import test from "node:test";
import assert from "node:assert/strict";

import { resolveDiagramMutationSecondaryPatchBaseVersion } from "./diagramMutationSecondaryBaseVersion.js";

test("secondary patch base uses canonical context after primary save even when save result carries zero", () => {
  const remembered = [];
  const result = resolveDiagramMutationSecondaryPatchBaseVersion({
    sid: "sid_a4",
    saveResult: { diagramStateVersion: 0 },
    rememberDiagramStateVersion: (version, options = {}) => {
      remembered.push({ version, sessionId: String(options?.sessionId || "") });
      return version;
    },
    getBaseDiagramStateVersion: () => 7,
  });

  assert.equal(result, 7);
  assert.deepEqual(remembered, [{ version: 0, sessionId: "sid_a4" }]);
});

test("secondary patch base falls back to accepted non-zero save version when canonical getter is unavailable", () => {
  const result = resolveDiagramMutationSecondaryPatchBaseVersion({
    sid: "sid_a4",
    saveResult: { diagramStateVersion: 11 },
    rememberDiagramStateVersion: () => null,
    getBaseDiagramStateVersion: () => undefined,
  });

  assert.equal(result, 11);
});

test("secondary patch base keeps canonical zero context and does not synthesize zero from accepted fallback", () => {
  const result = resolveDiagramMutationSecondaryPatchBaseVersion({
    sid: "sid_a4",
    saveResult: { diagramStateVersion: 0 },
    rememberDiagramStateVersion: () => null,
    getBaseDiagramStateVersion: () => 0,
  });

  assert.equal(result, 0);
});
