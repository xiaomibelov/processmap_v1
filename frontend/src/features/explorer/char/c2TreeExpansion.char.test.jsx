/**
 * C2 — characterization tests: tree expansion & persistence (Шаг 0).
 * Pins CURRENT behavior of WorkspaceExplorer.jsx expansion state:
 * prefs restore, explicit toggle precedence, lazy children load dedup,
 * transient bulk expansion, per-workspace state isolation.
 */
import React from "react";
import { beforeEach, describe, expect, test } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  installExplorerMocks,
  resetCharConfig,
  charConfig,
  renderExplorer,
  makeQueryClient,
  setExplorerPage,
  setProjectPage,
  folderItem,
  projectItem,
  sessionItem,
  explorerPageCallsFor,
  libApiMocks,
} from "../../../test-utils/explorerChar.jsx";
import {
  EXPLORER_TREE_EXPANDED_KEY,
  USER_PREFERENCES_QUERY_KEY,
} from "../explorerTreePersistence.js";

installExplorerMocks();

beforeEach(() => {
  resetCharConfig();
});

function prefsWithExpanded(expandedIds, version = 1) {
  return {
    version,
    preferences: { [EXPLORER_TREE_EXPANDED_KEY]: { "org_1::ws_1": expandedIds } },
  };
}

describe("C2: tree expansion & persistence", () => {
  test("explicit toggle overrides persisted prefs expansion", async () => {
    setExplorerPage([folderItem("f1", "Раздел Альфа", { child_folder_count: 0, child_project_count: 1 })]);
    setExplorerPage([projectItem("p_child", "Дочерний Проект")], { folderId: "f1" });

    const prefs = prefsWithExpanded(["f1"]);
    charConfig.preferences = prefs;
    const queryClient = makeQueryClient();
    queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, prefs);
    await renderExplorer({ queryClient });

    // Persisted expansion: children visible without any click.
    await screen.findByText("Дочерний Проект");

    // Explicit collapse overrides the persisted expanded state
    // (contextExpandedByFolder false wins in mergedExpandedByFolder).
    fireEvent.click(screen.getByLabelText("Скрыть вложенные элементы раздела Раздел Альфа"));
    await waitFor(() => expect(screen.queryByText("Дочерний Проект")).toBeNull());
  });

  test("first expand of folder lazily loads children exactly once", async () => {
    setExplorerPage([folderItem("f1", "Раздел Ленивый", { child_folder_count: 1, child_project_count: 0 })]);
    setExplorerPage([folderItem("f2", "Папка Внутренняя")], { folderId: "f1" });
    await renderExplorer();
    await screen.findByText("Раздел Ленивый");
    expect(explorerPageCallsFor("f1")).toBe(0);

    const expandLabel = "Показать вложенные элементы раздела Раздел Ленивый";
    fireEvent.click(screen.getByLabelText(expandLabel));
    await screen.findByText("Папка Внутренняя");
    expect(explorerPageCallsFor("f1")).toBe(1);

    // Collapse + re-expand: children stay cached in childItemsByFolder —
    // no second load (inFlight Set + cached-array guards in ensureFolderChildrenLoaded).
    fireEvent.click(screen.getByLabelText("Скрыть вложенные элементы раздела Раздел Ленивый"));
    await waitFor(() => expect(screen.queryByText("Папка Внутренняя")).toBeNull());
    fireEvent.click(screen.getByLabelText(expandLabel));
    await screen.findByText("Папка Внутренняя");
    expect(explorerPageCallsFor("f1")).toBe(1);
  });

  test("bulk expand is transient and never writes prefs", async () => {
    setExplorerPage([
      folderItem("f1", "Раздел Балк", { child_folder_count: 1, child_project_count: 0 }),
      projectItem("proj_1", "Проект С Сессиями", { trackable_sessions_count: 1 }),
    ]);
    setExplorerPage([folderItem("f2", "Папка Глубокая")], { folderId: "f1" });
    setProjectPage(
      { id: "proj_1", name: "Проект С Сессиями", status: "active", sessions_count: 1 },
      [sessionItem("s1", "Сессия Проекта")],
    );

    // Attach the debounced tree saver (prefs snapshot present).
    const prefs = prefsWithExpanded([]);
    charConfig.preferences = prefs;
    const queryClient = makeQueryClient();
    queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, prefs);
    await renderExplorer({ queryClient });

    // Wait for the root page: the bulk toggle is disabled while
    // treeBulkExpandableIds is empty (root items still loading).
    await screen.findByText("Раздел Балк");
    expect(screen.queryByText("Папка Глубокая")).toBeNull();
    const bulk = screen.getByTestId("workspace-tree-bulk-toggle");
    expect(bulk).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(bulk);
    await screen.findByText("Папка Глубокая");
    await screen.findByText("Сессия Проекта");
    expect(screen.getByTestId("workspace-tree-bulk-toggle")).toHaveAttribute("aria-pressed", "true");

    // Bulk expand never schedules the tree saver: no PATCH with the
    // explorer.tree.expanded payload (transient expansion only).
    const treePatches = libApiMocks.apiRequest.mock.calls.filter(([path, options]) =>
      path === "/api/users/me/preferences"
      && String(options?.method || "").toUpperCase() === "PATCH"
      && options?.body?.set?.[EXPLORER_TREE_EXPANDED_KEY]);
    expect(treePatches).toEqual([]);

    // Collapse-all restores the hidden state.
    fireEvent.click(screen.getByTestId("workspace-tree-bulk-toggle"));
    await waitFor(() => {
      expect(screen.queryByText("Папка Глубокая")).toBeNull();
      expect(screen.queryByText("Сессия Проекта")).toBeNull();
    });
  });

  test("pref restore triggers children load once per prefs snapshot", async () => {
    setExplorerPage([folderItem("f1", "Раздел Постоянный", { child_folder_count: 0, child_project_count: 1 })]);
    setExplorerPage([projectItem("p_deep", "Проект Из Prefs")], { folderId: "f1" });

    const prefs = prefsWithExpanded(["f1"], 3);
    charConfig.preferences = prefs;
    const queryClient = makeQueryClient();
    queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, prefs);
    const view = await renderExplorer({ queryClient });

    // Mount triggers exactly one children load for the persisted folder
    // (initialPrefsLoadedRef guard, WorkspaceExplorer.jsx ~L3205).
    await screen.findByText("Проект Из Prefs");
    expect(explorerPageCallsFor("f1")).toBe(1);

    // Re-render and a same-version prefs redelivery do not duplicate the load.
    view.rerenderExplorer();
    queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, {
      version: 3,
      preferences: { [EXPLORER_TREE_EXPANDED_KEY]: { "org_1::ws_1": ["f1"] } },
    });
    await screen.findByText("Проект Из Prefs");
    expect(explorerPageCallsFor("f1")).toBe(1);
  });

  test("tree state isolated per workspace context", async () => {
    charConfig.controller.workspaces = [
      { id: "ws_1", name: "Workspace A", role: "org_admin" },
      { id: "ws_2", name: "Workspace B", role: "org_admin" },
    ];
    // Same folder id in both workspaces; distinct children.
    setExplorerPage([folderItem("f1", "Общая Папка", { child_folder_count: 0, child_project_count: 1 })], { workspaceId: "ws_1" });
    setExplorerPage([projectItem("p_a", "Проект A")], { workspaceId: "ws_1", folderId: "f1" });
    setExplorerPage([folderItem("f1", "Общая Папка", { child_folder_count: 0, child_project_count: 1 })], { workspaceId: "ws_2" });
    setExplorerPage([projectItem("p_b", "Проект B")], { workspaceId: "ws_2", folderId: "f1" });

    const view = await renderExplorer();
    await screen.findByText("Общая Папка");

    // Expand f1 in ws_1.
    fireEvent.click(screen.getByLabelText("Показать вложенные элементы раздела Общая Папка"));
    await screen.findByText("Проект A");

    // Switch workspace (controller mock re-read on rerender).
    charConfig.controller.activeWorkspaceId = "ws_2";
    view.rerenderExplorer();
    // ws_2 renders its own root; ws_1 expansion must not leak into ws_2 context.
    await waitFor(() => expect(screen.queryByText("Проект A")).toBeNull());
    expect(screen.getByText("Общая Папка")).toBeTruthy();

    // Switch back: ws_1 context state is preserved (still expanded).
    charConfig.controller.activeWorkspaceId = "ws_1";
    view.rerenderExplorer();
    await screen.findByText("Проект A");
  });
});
