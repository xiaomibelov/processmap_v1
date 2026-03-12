import test from "node:test";
import assert from "node:assert/strict";

import {
  canRestoreRequestedProject,
  normalizeRequestedProjectWorkspace,
  resolveExplorerWorkspaceId,
} from "./workspaceRestore.js";

test("resolveExplorerWorkspaceId prefers the requested project workspace", () => {
  const workspaces = [
    { id: "ws_org_default_main", name: "Main Workspace" },
    { id: "ws_other", name: "Other" },
  ];

  const resolved = resolveExplorerWorkspaceId({
    workspaces,
    activeWorkspaceId: "org_default",
    requestProjectWorkspaceId: "ws_org_default_main",
  });

  assert.equal(resolved, "ws_org_default_main");
});

test("canRestoreRequestedProject blocks project restore until the matching workspace is active", () => {
  assert.equal(
    canRestoreRequestedProject({
      requestProjectId: "000090b6ab",
      requestProjectWorkspaceId: "ws_org_default_main",
      activeWorkspaceId: "org_default",
    }),
    false,
  );

  assert.equal(
    canRestoreRequestedProject({
      requestProjectId: "000090b6ab",
      requestProjectWorkspaceId: "ws_org_default_main",
      activeWorkspaceId: "ws_org_default_main",
    }),
    true,
  );
});

test("normalizeRequestedProjectWorkspace prefers resolved workspace when project metadata is missing", () => {
  assert.equal(
    normalizeRequestedProjectWorkspace({
      requestProjectId: "proj_1",
      requestProjectWorkspaceId: "",
      resolvedWorkspaceId: "ws_nondefault",
      activeWorkspaceId: "ws_org_default_main",
    }),
    "ws_nondefault",
  );
});
