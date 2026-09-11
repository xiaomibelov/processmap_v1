import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPLORER_PAGE_STALE_TIME_MS,
  explorerPageQueryKey,
  explorerPageQueryOptions,
  fetchExplorerPage,
} from "./explorerPageQuery.js";

test("explorerPageQueryKey is stable and normalizes ids to strings", () => {
  assert.deepEqual(explorerPageQueryKey("ws_1", ""), ["explorer-page", "ws_1", "", ""]);
  assert.deepEqual(explorerPageQueryKey("ws_1", "folder_1"), ["explorer-page", "ws_1", "folder_1", ""]);
  assert.deepEqual(explorerPageQueryKey("ws_1"), ["explorer-page", "ws_1", "", ""]);
  assert.deepEqual(explorerPageQueryKey(42, null), ["explorer-page", "42", "", ""]);
});

test("explorerPageQueryKey carries the AS IS/TO BE stage filter key", () => {
  assert.deepEqual(explorerPageQueryKey("ws_1", "", "to_be"), ["explorer-page", "ws_1", "", "to_be"]);
  assert.deepEqual(explorerPageQueryKey("ws_1", "folder_1", "as_is"), ["explorer-page", "ws_1", "folder_1", "as_is"]);
  assert.deepEqual(explorerPageQueryKey("ws_1", "", null), ["explorer-page", "ws_1", "", ""]);
});

test("explorerPageQueryOptions carries staleTime so cached workspaces render instantly", () => {
  const opts = explorerPageQueryOptions("ws_1", "folder_1");
  assert.deepEqual(opts.queryKey, ["explorer-page", "ws_1", "folder_1", ""]);
  assert.equal(typeof opts.queryFn, "function");
  assert.equal(opts.staleTime, EXPLORER_PAGE_STALE_TIME_MS);
  assert.ok(opts.staleTime > 0, "staleTime must be positive to avoid refetch on workspace switch");
});

test("explorerPageQueryOptions forwards the stage key into the query key", () => {
  const opts = explorerPageQueryOptions("ws_1", "", "to_be");
  assert.deepEqual(opts.queryKey, ["explorer-page", "ws_1", "", "to_be"]);
});

test("fetchExplorerPage throws on non-ok responses so react-query surfaces an error", async () => {
  await assert.rejects(
    () => fetchExplorerPage({ queryKey: ["explorer-page", "", "", ""] }),
    /Ошибка|error|fetch|Failed|invalid/i,
  );
});
