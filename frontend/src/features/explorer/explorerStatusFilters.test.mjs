import test from "node:test";
import assert from "node:assert/strict";

import {
  STATUS_FILTER_KEYS,
  filterExplorerTreeByStatus,
  hiddenStatusKeysFromPreferences,
  statusHiddenWithKeys,
  visibleStatusFilterOptions,
} from "./explorerStatusFilters.js";

test("status filter keeps matches with ancestors and loaded descendants", () => {
  const rootItems = [
    { id: "root-active", type: "folder", name: "Root active", context_status: "active", child_folder_count: 1 },
    { id: "root-draft", type: "folder", name: "Root draft", context_status: "draft", child_folder_count: 1 },
    { id: "root-empty", type: "folder", name: "Root empty", context_status: "done" },
  ];
  const childItemsByFolder = {
    "root-active": [
      { id: "active-child-done", type: "folder", parent_id: "root-active", context_status: "done" },
      { id: "active-project", type: "project", parent_id: "root-active", status: "draft" },
    ],
    "root-draft": [
      { id: "draft-child-active", type: "folder", parent_id: "root-draft", context_status: "active" },
    ],
  };

  const out = filterExplorerTreeByStatus({
    rootItems,
    childItemsByFolder,
    statusFilter: "active",
  });

  assert.deepEqual(out.rootItems.map((item) => item.id), ["root-active", "root-draft"]);
  assert.deepEqual(out.childItemsByFolder["root-active"].map((item) => item.id), ["active-child-done", "active-project"]);
  assert.deepEqual(out.childItemsByFolder["root-draft"].map((item) => item.id), ["draft-child-active"]);
});

test("hidden status keys remove facets but do not hide rows in all mode", () => {
  const prefs = {
    "explorer.status_filters.hidden": {
      "org1::ws1": ["done", "draft", "unknown", "done"],
      ws1: ["active"],
    },
  };

  assert.deepEqual(hiddenStatusKeysFromPreferences(prefs, "ws1", "org1"), ["done", "draft"]);
  assert.deepEqual(visibleStatusFilterOptions(["done", "draft"]).map((option) => option.key), ["all", "active", "as_is"]);

  const all = filterExplorerTreeByStatus({
    rootItems: [{ id: "done", type: "folder", context_status: "done" }],
    childItemsByFolder: {},
    statusFilter: "all",
    hiddenStatusKeys: ["done"],
  });
  assert.deepEqual(all.rootItems.map((item) => item.id), ["done"]);
});

test("statusHiddenWithKeys scopes hidden chip settings by org and workspace", () => {
  const next = statusHiddenWithKeys({ "org2::ws1": ["active"] }, "ws1", ["draft", "as_is"], "org1");
  assert.deepEqual(next, { "org2::ws1": ["active"], "org1::ws1": ["draft", "as_is"] });

  const cleared = statusHiddenWithKeys(next, "ws1", [], "org1");
  assert.deepEqual(cleared, { "org2::ws1": ["active"] });
  assert.deepEqual(STATUS_FILTER_KEYS, ["active", "done", "draft", "as_is"]);
});
