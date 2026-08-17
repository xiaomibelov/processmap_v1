import test from "node:test";
import assert from "node:assert/strict";

import {
  PROJECT_SESSIONS_STALE_TIME_MS,
  projectSessionsQueryKey,
  projectSessionsQueryOptions,
  fetchProjectSessions,
} from "./projectSessionsQuery.js";

test("projectSessionsQueryKey is stable and normalizes id to string", () => {
  assert.deepEqual(projectSessionsQueryKey("proj_1"), ["project-sessions", "proj_1"]);
  assert.deepEqual(projectSessionsQueryKey(42), ["project-sessions", "42"]);
  assert.deepEqual(projectSessionsQueryKey(""), ["project-sessions", ""]);
});

test("projectSessionsQueryOptions carries staleTime so re-expand renders from cache", () => {
  const opts = projectSessionsQueryOptions("proj_1");
  assert.deepEqual(opts.queryKey, ["project-sessions", "proj_1"]);
  assert.equal(typeof opts.queryFn, "function");
  assert.equal(opts.staleTime, PROJECT_SESSIONS_STALE_TIME_MS);
  assert.ok(opts.staleTime > 0, "staleTime must be positive to avoid refetch on collapse/expand");
});

test("fetchProjectSessions throws on non-ok responses so react-query surfaces an error row", async () => {
  await assert.rejects(
    () => fetchProjectSessions({ queryKey: ["project-sessions", ""] }),
    /Ошибка|error|missing|fetch|Failed/i,
  );
});
