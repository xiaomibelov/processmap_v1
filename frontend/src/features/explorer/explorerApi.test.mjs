import test, { before, after } from "node:test";
import assert from "node:assert/strict";

import { apiGetProjectPage } from "./explorerApi.js";

// Behavioral coverage for apiGetProjectPage query params (s0): the lazy-tree /
// tree-view contour pins used to be source-regex pins in
// workspaceAutoExpandSteps.source.test.mjs and workspaceSubprocessTreeView.source.test.mjs.
// Fetch-mock style follows features/notes/useElementThreads.cache-dedup.test.mjs.

let originalFetch;
const requestedUrls = [];

before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({}),
      text: async () => "",
    };
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("apiGetProjectPage sends tree=true when the tree flag is set", async () => {
  await apiGetProjectPage("ws-1", "prj-1", { tree: true });
  const url = requestedUrls.at(-1);
  assert.match(url, /\/api\/projects\/prj-1\/explorer\?/);
  assert.match(url, /tree=true/);
});

test("apiGetProjectPage sends root_only / include_children_meta only when requested", async () => {
  await apiGetProjectPage("ws-1", "prj-1", { rootOnly: true, includeChildrenMeta: true });
  const url = requestedUrls.at(-1);
  assert.match(url, /workspace_id=ws-1/);
  assert.match(url, /root_only=true/);
  assert.match(url, /include_children_meta=true/);
  assert.doesNotMatch(url, /tree=/);
});

test("apiGetProjectPage omits empty optional flags by default", async () => {
  await apiGetProjectPage("ws-1", "prj-1");
  const url = requestedUrls.at(-1);
  assert.match(url, /workspace_id=ws-1/);
  assert.doesNotMatch(url, /root_only|include_children_meta|tree/);
});
