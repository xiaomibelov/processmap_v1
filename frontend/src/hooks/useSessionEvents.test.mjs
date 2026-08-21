import assert from "node:assert/strict";
import test from "node:test";

import { setAccessToken } from "../lib/apiCore.js";
import { eventsUrl } from "./useSessionEvents.js";

test("eventsUrl appends access_token query param when a token is present", () => {
  setAccessToken("test.jwt.token", { persist: false });
  try {
    assert.equal(
      eventsUrl("abc123"),
      "/api/sessions/abc123/events?access_token=test.jwt.token"
    );
  } finally {
    setAccessToken("", { persist: false });
  }
});

test("eventsUrl encodes special characters in the token", () => {
  setAccessToken("tok+with/special=chars", { persist: false });
  try {
    const url = eventsUrl("abc123");
    assert.match(url, /\?access_token=tok%2Bwith%2Fspecial%3Dchars$/);
  } finally {
    setAccessToken("", { persist: false });
  }
});

test("eventsUrl falls back to the bare URL when there is no token", () => {
  setAccessToken("", { persist: false });
  assert.equal(eventsUrl("abc123"), "/api/sessions/abc123/events");
});

test("eventsUrl returns empty string for empty session id", () => {
  assert.equal(eventsUrl(""), "");
  assert.equal(eventsUrl("   "), "");
});
