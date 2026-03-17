import assert from "node:assert/strict";
import test from "node:test";

import { deriveSessionShellTransition } from "./useSessionShellOrchestration.js";

test("shell is preserved across benign same-session restore while draft session is transiently empty", () => {
  assert.deepEqual(
    deriveSessionShellTransition({
      draftSessionId: "",
      activationState: {
        phase: "restoring_session",
        sessionId: "sess_1",
      },
      previousShellSessionId: "sess_1",
    }),
    {
      nextShellSessionId: "sess_1",
      reason: "preserve_during_same_session_restore",
      resetShellState: false,
      preserveShell: true,
    },
  );
});

test("shell resets when a different active session replaces the previous one", () => {
  assert.deepEqual(
    deriveSessionShellTransition({
      draftSessionId: "sess_2",
      activationState: {
        phase: "active",
        sessionId: "sess_2",
      },
      previousShellSessionId: "sess_1",
    }),
    {
      nextShellSessionId: "sess_2",
      reason: "replace_session",
      resetShellState: true,
      preserveShell: true,
    },
  );
});

test("shell clears only when no draft session remains and no same-session restore is active", () => {
  assert.deepEqual(
    deriveSessionShellTransition({
      draftSessionId: "",
      activationState: {
        phase: "idle",
        sessionId: "",
      },
      previousShellSessionId: "sess_1",
    }),
    {
      nextShellSessionId: "",
      reason: "clear_shell",
      resetShellState: true,
      preserveShell: false,
    },
  );
});
