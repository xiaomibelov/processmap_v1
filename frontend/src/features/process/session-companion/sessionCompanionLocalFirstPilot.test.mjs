import assert from "node:assert/strict";
import test from "node:test";

import { resolveSessionCompanionLocalFirstActivation } from "./sessionCompanionLocalFirstPilot.js";

function localReaderFromMap(map = {}) {
  return (key) => String(map[key] || "");
}

test("env-enabled pilot uses env activation and jazz mode", () => {
  const activation = resolveSessionCompanionLocalFirstActivation({
    envOverride: {
      VITE_SESSION_COMPANION_LOCALFIRST_PILOT: "1",
      VITE_SESSION_COMPANION_LOCALFIRST_ADAPTER: "jazz",
      VITE_SESSION_COMPANION_JAZZ_PEER: "wss://peer.test/",
      DEV: false,
    },
    localReader: localReaderFromMap({}),
  });
  assert.equal(activation.pilotEnabled, true);
  assert.equal(activation.adapterModeEffective, "jazz");
  assert.equal(activation.activationSource, "env");
  assert.equal(activation.unsupportedState, false);
});

test("blocked local override is surfaced as unsupported activation state", () => {
  const activation = resolveSessionCompanionLocalFirstActivation({
    envOverride: { DEV: false },
    localReader: localReaderFromMap({
      "fpc:session-companion-localfirst-pilot": "1",
      "fpc:session-companion-localfirst-adapter": "jazz",
      "fpc:session-companion-jazz-peer": "wss://local.peer/",
    }),
  });
  assert.equal(activation.localOverridePresent, true);
  assert.equal(activation.localOverrideBlocked, true);
  assert.equal(activation.unsupportedState, true);
  assert.equal(activation.unsupportedReason, "local_override_blocked");
  assert.equal(activation.adapterModeEffective, "legacy");
});

test("adapter requested without pilot is marked unsupported", () => {
  const activation = resolveSessionCompanionLocalFirstActivation({
    envOverride: {
      VITE_SESSION_COMPANION_LOCALFIRST_PILOT: "0",
      VITE_SESSION_COMPANION_LOCALFIRST_ADAPTER: "jazz",
      DEV: false,
    },
    localReader: localReaderFromMap({}),
  });
  assert.equal(activation.pilotEnabled, false);
  assert.equal(activation.adapterRequested, "jazz");
  assert.equal(activation.adapterModeEffective, "legacy");
  assert.equal(activation.unsupportedState, true);
  assert.equal(activation.unsupportedReason, "adapter_requested_without_pilot");
});

test("jazz pilot without peer is marked unsupported", () => {
  const activation = resolveSessionCompanionLocalFirstActivation({
    envOverride: {
      VITE_SESSION_COMPANION_LOCALFIRST_PILOT: "1",
      VITE_SESSION_COMPANION_LOCALFIRST_ADAPTER: "jazz",
      DEV: false,
    },
    localReader: localReaderFromMap({}),
  });
  assert.equal(activation.pilotEnabled, true);
  assert.equal(activation.adapterModeEffective, "jazz");
  assert.equal(activation.unsupportedState, true);
  assert.equal(activation.unsupportedReason, "jazz_peer_missing");
});

test("dev runtime allows local override and marks source as local_storage", () => {
  const activation = resolveSessionCompanionLocalFirstActivation({
    envOverride: { DEV: true },
    localReader: localReaderFromMap({
      "fpc:session-companion-localfirst-pilot": "1",
      "fpc:session-companion-localfirst-adapter": "jazz",
      "fpc:session-companion-jazz-peer": "wss://dev.peer/",
    }),
  });
  assert.equal(activation.localOverrideUsed, true);
  assert.equal(activation.activationSource, "local_storage");
  assert.equal(activation.adapterModeEffective, "jazz");
  assert.equal(activation.unsupportedState, false);
});
