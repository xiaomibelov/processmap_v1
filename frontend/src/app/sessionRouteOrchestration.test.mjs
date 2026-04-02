import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldPreserveSelectionRouteDuringRestore,
  shouldSkipDuplicateUrlRestore,
} from "./useSessionRouteOrchestration.js";

test("selection sync preserves route intent while a requested session is still restoring", () => {
  assert.equal(
    shouldPreserveSelectionRouteDuringRestore({
      projectId: "",
      sessionId: "",
      requestedSessionId: "sess_1",
      urlProjectId: "proj_1",
      urlSessionId: "sess_1",
    }),
    true,
  );
  assert.equal(
    shouldPreserveSelectionRouteDuringRestore({
      projectId: "proj_1",
      sessionId: "sess_1",
      requestedSessionId: "sess_1",
      urlProjectId: "proj_1",
      urlSessionId: "sess_1",
    }),
    false,
  );
});

test("duplicate url_restore is skipped when the same session is already confirmed or was active", () => {
  assert.equal(
    shouldSkipDuplicateUrlRestore({
      currentSessionId: "",
      requestedSessionId: "sess_1",
      activeSessionId: "sess_1",
      confirmedSessionId: "",
      urlSessionId: "sess_1",
      requestedExists: true,
    }),
    true,
  );
  assert.equal(
    shouldSkipDuplicateUrlRestore({
      currentSessionId: "",
      requestedSessionId: "sess_1",
      activeSessionId: "",
      confirmedSessionId: "sess_1",
      urlSessionId: "sess_1",
      requestedExists: true,
    }),
    true,
  );
  assert.equal(
    shouldSkipDuplicateUrlRestore({
      currentSessionId: "",
      requestedSessionId: "sess_1",
      activeSessionId: "",
      confirmedSessionId: "",
      urlSessionId: "sess_1",
      requestedExists: true,
    }),
    false,
  );
});
