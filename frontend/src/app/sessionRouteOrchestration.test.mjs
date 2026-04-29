import assert from "node:assert/strict";
import test from "node:test";

import {
  pushSessionSelectionToUrl,
  readSelectionFromUrl,
  seedSessionParentHistoryToUrl,
  shouldPreserveSelectionRouteDuringRestore,
  shouldSkipDuplicateUrlRestore,
  writeSelectionToUrl,
} from "./useSessionRouteOrchestration.js";
import { PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY } from "./processMapRouteModel.js";

function makeWindow(href = "https://processmap.local/app") {
  const calls = [];
  const win = {
    location: {},
    history: {
      state: { existing: true },
      pushState(state, title, url) {
        calls.push({ type: "push", state, title, url });
        this.state = state;
        const next = new URL(url, "https://processmap.local");
        win.location.href = next.href;
        win.location.pathname = next.pathname;
        win.location.search = next.search;
        win.location.hash = next.hash;
      },
      replaceState(state, title, url) {
        calls.push({ type: "replace", state, title, url });
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
  assert.equal(win.calls[0].type, "replace");
  assert.equal(win.calls[0].url, "/app/org?tab=dictionary&project=p1&session=s1#updates");
  assert.equal(win.location.pathname, "/app/org");
  assert.equal(win.location.search, "?tab=dictionary&project=p1&session=s1");
  assert.equal(win.location.hash, "#updates");
});

test("pushSessionSelectionToUrl replaces parent project entry then pushes session entry", () => {
  const win = makeWindow("https://processmap.local/app?workspace=w1&folder=f1");
  const result = pushSessionSelectionToUrl({ projectId: "p1", sessionId: "s1" }, win);

  assert.equal(result.ok, true);
  assert.equal(result.parentAction, "replace");
  assert.equal(result.sessionAction, "push");
  assert.deepEqual(
    win.calls.map((call) => [call.type, call.url]),
    [
      ["replace", "/app?workspace=w1&folder=f1&project=p1"],
      ["push", "/app?workspace=w1&folder=f1&project=p1&session=s1"],
    ],
  );
  assert.equal(win.location.search, "?workspace=w1&folder=f1&project=p1&session=s1");
});

test("pushSessionSelectionToUrl preserves parent breadcrumb context on parent and session entries", () => {
  const win = makeWindow("https://processmap.local/app");
  const projectContext = {
    projectId: "p1",
    workspaceId: "w1",
    folderId: "f2",
    breadcrumbBase: [
      { type: "workspace", id: "w1", name: "ДК" },
      { type: "folder", id: "f1", name: "Суп ДК" },
      { type: "folder", id: "f2", name: "Борщ с говядиной" },
    ],
    projectTitle: "Разогрев супа",
  };

  pushSessionSelectionToUrl({ projectId: "p1", sessionId: "s1", projectContext }, win);

  assert.equal(win.calls[0].type, "replace");
  assert.equal(win.calls[0].url, "/app?project=p1");
  assert.deepEqual(win.calls[0].state[PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY], projectContext);
  assert.equal(win.calls[1].type, "push");
  assert.equal(win.calls[1].url, "/app?project=p1&session=s1");
  assert.deepEqual(win.calls[1].state[PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY], projectContext);
});

test("pushSessionSelectionToUrl updates same parent URL with context without adding a duplicate parent entry", () => {
  const win = makeWindow("https://processmap.local/app?project=p1");
  const projectContext = {
    projectId: "p1",
    workspaceId: "w1",
    folderId: "f1",
    breadcrumbBase: [
      { type: "workspace", id: "w1", name: "ДК" },
      { type: "folder", id: "f1", name: "Суп ДК" },
    ],
    projectTitle: "Разогрев супа",
  };

  pushSessionSelectionToUrl({ projectId: "p1", sessionId: "s1", projectContext }, win);

  assert.deepEqual(
    win.calls.map((call) => [call.type, call.url]),
    [
      ["replace", "/app?project=p1"],
      ["push", "/app?project=p1&session=s1"],
    ],
  );
  assert.deepEqual(win.calls[0].state[PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY], projectContext);
});

test("pushSessionSelectionToUrl still works without breadcrumb context for direct links", () => {
  const win = makeWindow("https://processmap.local/app");

  pushSessionSelectionToUrl({ projectId: "p1", sessionId: "s1" }, win);

  assert.equal(win.calls[0].type, "replace");
  assert.equal(win.calls[0].url, "/app?project=p1");
  assert.equal(win.calls[0].state[PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY], undefined);
  assert.equal(win.calls[1].type, "push");
  assert.equal(win.calls[1].url, "/app?project=p1&session=s1");
  assert.equal(win.calls[1].state[PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY], undefined);
});

test("pushSessionSelectionToUrl skips duplicate current session", () => {
  const win = makeWindow("https://processmap.local/app?project=p1&session=s1");
  const result = pushSessionSelectionToUrl({ projectId: "p1", sessionId: "s1" }, win);

  assert.equal(result.ok, true);
  assert.equal(result.action, "none");
  assert.equal(win.calls.length, 0);
});

test("pushSessionSelectionToUrl requires project and session ids", () => {
  const win = makeWindow("https://processmap.local/app");

  assert.deepEqual(pushSessionSelectionToUrl({ projectId: "", sessionId: "s1" }, win), {
    ok: false,
    action: "none",
    reason: "missing_selection",
  });
  assert.equal(win.calls.length, 0);
});

test("seedSessionParentHistoryToUrl seeds parent when direct session URL has no internal route state", () => {
  const win = makeWindow("https://processmap.local/app?project=p1&session=s1");
  const result = seedSessionParentHistoryToUrl({ projectId: "p1", sessionId: "s1" }, win);

  assert.equal(result.ok, true);
  assert.equal(result.action, "seed");
  assert.deepEqual(
    win.calls.map((call) => [call.type, call.url]),
    [
      ["replace", "/app?project=p1"],
      ["push", "/app?project=p1&session=s1"],
    ],
  );
  assert.equal(win.location.search, "?project=p1&session=s1");
});

test("seedSessionParentHistoryToUrl skips sessions already opened through internal history", () => {
  const win = makeWindow("https://processmap.local/app?project=p1&session=s1");
  win.history.state.processMapRoute = {
    surface: "session",
    workspaceId: "",
    folderId: "",
    projectId: "p1",
    sessionId: "s1",
    source: "internal",
  };
  const result = seedSessionParentHistoryToUrl({ projectId: "p1", sessionId: "s1" }, win);

  assert.equal(result.ok, true);
  assert.equal(result.action, "none");
  assert.equal(result.reason, "already_internal_session");
  assert.equal(win.calls.length, 0);
});
