import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceTree,
  filterSessionsForSelection,
  sortSessionsByUpdatedDesc,
} from "./workspaceDashboardVm.js";

test("sortSessionsByUpdatedDesc keeps deterministic order", () => {
  const sorted = sortSessionsByUpdatedDesc([
    { id: "s2", updated_at: 20 },
    { id: "s1", updated_at: 40 },
    { id: "s3", updated_at: 20 },
  ]);
  assert.deepEqual(sorted.map((row) => row.id), ["s1", "s2", "s3"]);
});

test("buildWorkspaceTree groups sessions by owner and project", () => {
  const tree = buildWorkspaceTree({
    users: [
      { id: "u2", email: "b@local", session_count: 1, project_count: 1 },
      { id: "u1", email: "a@local", session_count: 2, project_count: 1 },
    ],
    projects: [
      { id: "p1", name: "One", owner_id: "u1", updated_at: 100, session_count: 2 },
      { id: "p2", name: "Two", owner_id: "u2", updated_at: 90, session_count: 1 },
    ],
    sessions: [
      { id: "s1", project_id: "p1", owner_id: "u1", updated_at: 100 },
      { id: "s2", project_id: "p1", owner_id: "u1", updated_at: 90 },
      { id: "s3", project_id: "p2", owner_id: "u2", updated_at: 80 },
    ],
  });
  assert.deepEqual(tree.users.map((row) => row.id), ["u1", "u2"]);
  assert.equal((tree.sessionsByUser.get("u1") || []).length, 2);
  assert.equal((tree.sessionsByProject.get("p2") || []).length, 1);
});

test("filterSessionsForSelection applies owner and project filters", () => {
  const source = [
    { id: "s1", project_id: "p1", owner_id: "u1", updated_at: 100 },
    { id: "s2", project_id: "p2", owner_id: "u1", updated_at: 99 },
    { id: "s3", project_id: "p2", owner_id: "u2", updated_at: 98 },
  ];
  const ownerFiltered = filterSessionsForSelection(source, { ownerId: "u1" });
  assert.deepEqual(ownerFiltered.map((row) => row.id), ["s1", "s2"]);
  const projectFiltered = filterSessionsForSelection(source, { projectId: "p2" });
  assert.deepEqual(projectFiltered.map((row) => row.id), ["s2", "s3"]);
  const comboFiltered = filterSessionsForSelection(source, { ownerId: "u1", projectId: "p2" });
  assert.deepEqual(comboFiltered.map((row) => row.id), ["s2"]);
});

