import test from "node:test";
import assert from "node:assert/strict";

import { resolveDiagramMutationSecondaryPatchBaseVersion } from "./diagramMutationSecondaryBaseVersion.js";
import { rememberMonotonicDiagramStateVersion } from "../stage/utils/diagramVersionContext.js";

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

test("template-apply-style sequence keeps secondary PATCH base at accepted PUT version after stale draft echo", () => {
  let context = { sessionId: "sid_tpl", version: 23 };
  const remember = (version, options = {}) => {
    const next = rememberMonotonicDiagramStateVersion({
      activeSessionId: "sid_tpl",
      storedSessionId: context.sessionId,
      storedVersion: context.version,
      incomingSessionId: options.sessionId,
      incomingVersion: version,
    });
    context = { sessionId: next.sessionId, version: next.version };
    return context.version;
  };

  remember(24, { sessionId: "sid_tpl" });
  assert.equal(context.version, 24);

  const result = resolveDiagramMutationSecondaryPatchBaseVersion({
    sid: "sid_tpl",
    saveResult: { diagramStateVersion: 25 },
    rememberDiagramStateVersion: remember,
    getBaseDiagramStateVersion: () => context.version,
  });

  remember(24, { sessionId: "sid_tpl" });

  assert.equal(result, 25);
  assert.equal(context.version, 25);
});

test("external conflict protection keeps lower local base when no newer server ack is known", () => {
  const result = resolveDiagramMutationSecondaryPatchBaseVersion({
    sid: "sid_conflict",
    saveResult: {},
    rememberDiagramStateVersion: () => null,
    getBaseDiagramStateVersion: () => 24,
  });

  assert.equal(result, 24);
});
