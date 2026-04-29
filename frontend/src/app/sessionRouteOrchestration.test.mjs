import assert from "node:assert/strict";
import test from "node:test";

import {
  readSelectionFromUrl,
  shouldPreserveSelectionRouteDuringRestore,
  shouldSkipDuplicateUrlRestore,
  writeSelectionToUrl,
} from "./useSessionRouteOrchestration.js";

function makeWindow(href = "https://processmap.local/app") {
  const calls = [];
  const win = {
    location: {},
    history: {
      state: { existing: true },
      replaceState(state, title, url) {
        calls.push({ state, title, url });
        this.state = state;
        const next = new URL(url, "https://processmap.local");
        win.location.href = next.href;
        win.location.pathname = next.pathname;
        win.location.search = next.search;
        win.location.hash = next.hash;
      },
    },
  };
  const url = new URL(href, "https://processmap.local");
  win.location.href = url.href;
  win.location.pathname = url.pathname;
  win.location.search = url.search;
  win.location.hash = url.hash;
  win.calls = calls;
  return win;
}

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

test("readSelectionFromUrl preserves old project/session deep-link behavior", () => {
  assert.deepEqual(
    readSelectionFromUrl(makeWindow("https://processmap.local/app?project=p1&session=s1")),
    { projectId: "p1", sessionId: "s1" },
  );
  assert.deepEqual(
    readSelectionFromUrl(makeWindow("https://processmap.local/app?session=s1")),
    { projectId: "", sessionId: "" },
  );
});

test("writeSelectionToUrl preserves replace-only behavior and unrelated query params", () => {
  const win = makeWindow("https://processmap.local/app/org?tab=dictionary#updates");
  writeSelectionToUrl({ projectId: "p1", sessionId: "s1" }, win);

  assert.equal(win.calls.length, 1);
  assert.equal(win.calls[0].url, "/app/org?tab=dictionary&project=p1&session=s1#updates");
  assert.equal(win.location.pathname, "/app/org");
  assert.equal(win.location.search, "?tab=dictionary&project=p1&session=s1");
  assert.equal(win.location.hash, "#updates");
});
