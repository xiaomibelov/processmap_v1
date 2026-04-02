import assert from "node:assert/strict";
import test from "node:test";

import { shouldAttemptRequestedSessionRestore } from "./useSessionActivationOrchestration.js";

test("requested session restore runs only when a requested backend session still needs activation", () => {
  assert.equal(
    shouldAttemptRequestedSessionRestore({
      requestedSessionId: "sess_1",
      currentSessionId: "",
      activeSessionId: "",
      confirmedSessionId: "",
      urlSessionId: "sess_1",
      requestedExists: true,
      isLocalSessionId: () => false,
    }),
    true,
  );

  assert.equal(
    shouldAttemptRequestedSessionRestore({
      requestedSessionId: "sess_1",
      currentSessionId: "sess_1",
      activeSessionId: "sess_1",
      confirmedSessionId: "sess_1",
      urlSessionId: "sess_1",
      requestedExists: true,
      isLocalSessionId: () => false,
    }),
    false,
  );

  assert.equal(
    shouldAttemptRequestedSessionRestore({
      requestedSessionId: "local_1",
      currentSessionId: "",
      activeSessionId: "",
      confirmedSessionId: "",
      urlSessionId: "local_1",
      requestedExists: true,
      isLocalSessionId: (sid) => String(sid || "").startsWith("local_"),
    }),
    false,
  );
});
