import assert from "node:assert/strict";
import test from "node:test";

import {
  PROCESS_MAP_ROUTE_STATE_KEY,
  buildProcessMapUrl,
  normalizeProcessMapRoute,
  parseProcessMapRoute,
  pushProcessMapHistory,
  replaceProcessMapHistory,
  routesEqual,
} from "./processMapRouteModel.js";

function makeWindow(href = "https://processmap.local/app") {
  const calls = [];
  const win = {
    location: {},
    history: {
      state: { existing: true },
      pushState(state, title, url) {
        calls.push({ type: "push", state, title, url });
        this.state = state;
        assignLocation(url);
      },
      replaceState(state, title, url) {
        calls.push({ type: "replace", state, title, url });
        this.state = state;
        assignLocation(url);
      },
    },
  };

  function assignLocation(nextHref) {
    const url = new URL(nextHref, "https://processmap.local");
    win.location.href = url.href;
    win.location.pathname = url.pathname;
    win.location.search = url.search;
    win.location.hash = url.hash;
  }

  assignLocation(href);
  win.calls = calls;
  return win;
}

test("parseProcessMapRoute parses /app as workspace root", () => {
  assert.deepEqual(parseProcessMapRoute("https://processmap.local/app"), {
    surface: "workspace",
    workspaceId: "",
    folderId: "",
    projectId: "",
    sessionId: "",
    source: "direct",
  });
});

test("parseProcessMapRoute parses workspace and folder routes", () => {
  assert.deepEqual(parseProcessMapRoute("/app?workspace=w1", { source: "popstate" }), {
    surface: "workspace",
    workspaceId: "w1",
    folderId: "",
    projectId: "",
    sessionId: "",
    source: "popstate",
  });
  assert.deepEqual(parseProcessMapRoute("/app?workspace=w1&folder=f1"), {
    surface: "workspace",
    workspaceId: "w1",
    folderId: "f1",
    projectId: "",
    sessionId: "",
    source: "direct",
  });
});

test("parseProcessMapRoute parses project and session routes including old links", () => {
  assert.deepEqual(parseProcessMapRoute("/app?workspace=w1&folder=f1&project=p1"), {
    surface: "project",
    workspaceId: "w1",
    folderId: "f1",
    projectId: "p1",
    sessionId: "",
    source: "direct",
  });
  assert.deepEqual(parseProcessMapRoute("/app?project=p1"), {
    surface: "project",
    workspaceId: "",
    folderId: "",
    projectId: "p1",
    sessionId: "",
    source: "direct",
  });
  assert.deepEqual(parseProcessMapRoute("/app?project=p1&session=s1"), {
    surface: "session",
    workspaceId: "",
    folderId: "",
    projectId: "p1",
    sessionId: "s1",
    source: "direct",
  });
});

test("buildProcessMapUrl keeps project/session URLs backward-compatible", () => {
  assert.equal(buildProcessMapUrl({}), "/app");
  assert.equal(buildProcessMapUrl({ workspaceId: "w1" }), "/app?workspace=w1");
  assert.equal(buildProcessMapUrl({ workspaceId: "w1", folderId: "f1" }), "/app?workspace=w1&folder=f1");
  assert.equal(buildProcessMapUrl({ workspaceId: "w1", folderId: "f1", projectId: "p1" }), "/app?workspace=w1&folder=f1&project=p1");
  assert.equal(buildProcessMapUrl({ projectId: "p1" }), "/app?project=p1");
  assert.equal(buildProcessMapUrl({ projectId: "p1", sessionId: "s1" }), "/app?project=p1&session=s1");
});

test("sessionId without projectId normalizes safely", () => {
  assert.deepEqual(normalizeProcessMapRoute({ sessionId: "s1" }), {
    surface: "workspace",
    workspaceId: "",
    folderId: "",
    projectId: "",
    sessionId: "",
    source: "direct",
  });
  assert.equal(buildProcessMapUrl({ sessionId: "s1" }), "/app");
});

test("routesEqual ignores source and query ordering", () => {
  const left = parseProcessMapRoute("/app?session=s1&project=p1", { source: "direct" });
  const right = parseProcessMapRoute("/app?project=p1&session=s1", { source: "popstate" });
  assert.equal(routesEqual(left, right), true);
});

test("pushProcessMapHistory writes URL and route state", () => {
  const win = makeWindow("https://processmap.local/app");
  const result = pushProcessMapHistory({ workspaceId: "w1", folderId: "f1", source: "internal" }, { win });

  assert.equal(result.ok, true);
  assert.equal(result.action, "push");
  assert.equal(result.url, "/app?workspace=w1&folder=f1");
  assert.equal(win.location.pathname, "/app");
  assert.equal(win.location.search, "?workspace=w1&folder=f1");
  assert.equal(win.calls.length, 1);
  assert.equal(win.calls[0].type, "push");
  assert.equal(win.history.state.existing, true);
  assert.deepEqual(win.history.state[PROCESS_MAP_ROUTE_STATE_KEY], {
    surface: "workspace",
    workspaceId: "w1",
    folderId: "f1",
    projectId: "",
    sessionId: "",
    source: "internal",
  });
});

test("replaceProcessMapHistory preserves unrelated search params when requested", () => {
  const win = makeWindow("https://processmap.local/app/org?tab=dictionary#updates");
  const result = replaceProcessMapHistory({ projectId: "p1", sessionId: "s1" }, {
    win,
    baseSearch: win.location.search,
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "replace");
  assert.equal(result.url, "/app/org?tab=dictionary&project=p1&session=s1#updates");
  assert.equal(win.location.pathname, "/app/org");
  assert.equal(win.location.search, "?tab=dictionary&project=p1&session=s1");
  assert.equal(win.location.hash, "#updates");
  assert.equal(win.calls[0].type, "replace");
});

test("replaceProcessMapHistory preserves existing workspace/folder context when not overwritten", () => {
  const win = makeWindow("https://processmap.local/app?workspace=w1&folder=f1");
  const result = replaceProcessMapHistory({ projectId: "p1" }, {
    win,
    baseSearch: win.location.search,
  });

  assert.equal(result.ok, true);
  assert.equal(result.url, "/app?workspace=w1&folder=f1&project=p1");
  assert.equal(win.location.search, "?workspace=w1&folder=f1&project=p1");
});

test("pushProcessMapHistory skips duplicate current URL by default", () => {
  const win = makeWindow("https://processmap.local/app?project=p1");
  const result = pushProcessMapHistory({ projectId: "p1" }, { win });

  assert.equal(result.ok, true);
  assert.equal(result.action, "none");
  assert.equal(win.calls.length, 0);
});
