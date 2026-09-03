/**
 * C1 — characterization tests: explorer filters & sort (Шаг 0).
 * Pins CURRENT behavior of WorkspaceExplorer.jsx (filters, sort headers,
 * inline project-session filter). Product code must not change.
 */
import React from "react";
import { beforeEach, describe, expect, test } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
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
  explorerTopRowIds,
  projectRowNames,
} from "../../../test-utils/explorerChar.jsx";
import {
  EXPLORER_TREE_EXPANDED_KEY,
  USER_PREFERENCES_QUERY_KEY,
} from "../explorerTreePersistence.js";
import { sortExplorerItems, sortProjectSessions } from "../explorerSortModel.js";

installExplorerMocks();

beforeEach(() => {
  resetCharConfig();
});

function namesById(items) {
  const map = new Map(items.map((item) => [item.id, item.name]));
  return (ids) => ids.map((id) => map.get(id));
}

describe("C1: explorer filters & sort", () => {
  test("sorts explorer tree by name ascending when sort header clicked", async () => {
    const items = [
      projectItem("p_ban", "Банан"),
      folderItem("f_yab", "Яблоко"),
      projectItem("p_abr", "Абрикос"),
    ];
    setExplorerPage(items);
    const view = await renderExplorer();
    await screen.findByText("Яблоко");
    const rowNames = namesById(items);

    // Default (no sort): folders first, then projects in payload order.
    expect(rowNames(explorerTopRowIds(view.container))).toEqual(["Яблоко", "Банан", "Абрикос"]);

    // First click on «Название» → ascending (sortExplorerItems semantics).
    fireEvent.click(screen.getByRole("button", { name: "Сортировать Название по возрастанию" }));
    const expectedAsc = sortExplorerItems(items, { key: "name", direction: "asc" }, { isRoot: true }).map((i) => i.name);
    await waitFor(() => expect(rowNames(explorerTopRowIds(view.container))).toEqual(expectedAsc));

    // Second click reverses direction (toggleExplorerSort current behavior).
    fireEvent.click(screen.getByRole("button", { name: "Сортировать Название по убыванию" }));
    const expectedDesc = sortExplorerItems(items, { key: "name", direction: "desc" }, { isRoot: true }).map((i) => i.name);
    await waitFor(() => expect(rowNames(explorerTopRowIds(view.container))).toEqual(expectedDesc));
  });

  test("status chip filter hides non-matching branches and force-expands matches", async () => {
    const rootFolder = folderItem("f1", "Раздел Внешний", { child_folder_count: 1, child_project_count: 0 });
    const rootDraft = projectItem("p_root_draft", "Корневой Черновик", { status: "draft" });
    const childActive = projectItem("p_active", "Проект Активный", { status: "active" });
    const childDraft = projectItem("p_draft", "Проект Черновик", { status: "draft" });
    setExplorerPage([rootFolder, rootDraft]);
    setExplorerPage([childActive, childDraft], { folderId: "f1" });

    // Persisted expansion of f1 (scope key orgId::workspaceId).
    const prefs = {
      version: 1,
      preferences: { [EXPLORER_TREE_EXPANDED_KEY]: { "org_1::ws_1": ["f1"] } },
    };
    charConfig.preferences = prefs;
    const queryClient = makeQueryClient();
    queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, prefs);
    await renderExplorer({ queryClient });

    // Prefs expansion: children visible without any click.
    await screen.findByText("Проект Активный");
    expect(screen.getByText("Проект Черновик")).toBeTruthy();

    // Explicit collapse hides children (baseline before filter).
    fireEvent.click(screen.getByLabelText("Скрыть вложенные элементы раздела Раздел Внешний"));
    await waitFor(() => expect(screen.queryByText("Проект Активный")).toBeNull());

    // «Активен» chip: non-matching branches hidden; collapsed state ignored
    // (effectiveExpandedByFolder force-expands every loaded id while filter active).
    fireEvent.click(screen.getByRole("button", { name: "Активен" }));
    await screen.findByText("Проект Активный");
    expect(screen.queryByText("Проект Черновик")).toBeNull();
    expect(screen.queryByText("Корневой Черновик")).toBeNull();
    // Ancestor folder of a match is kept.
    expect(screen.getByText("Раздел Внешний")).toBeTruthy();
  });

  test("hidden active status resets filter to all", async () => {
    setExplorerPage([
      projectItem("p1", "Проект Один", { status: "active" }),
      projectItem("p2", "Проект Два", { status: "in_progress" }),
    ]);
    await renderExplorer();
    await screen.findByText("Проект Один");

    // Select «Готово» chip first.
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Готово" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Все" })).toHaveAttribute("aria-pressed", "false");

    // Hide «Готово» via «Настроить статусы» menu.
    fireEvent.click(screen.getByRole("button", { name: "Настроить статусы" }));
    const doneCheckbox = screen
      .getAllByRole("checkbox")
      .find((el) => el.closest("label")?.textContent?.includes("Готово"));
    expect(doneCheckbox).toBeTruthy();
    fireEvent.click(doneCheckbox);

    // Filter resets to «Все» and the hidden chip disappears from options.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Все" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: "Готово" })).toBeNull();
    });
  });

  test("project sessions sort + inline status filter match current code", async () => {
    const sessions = [
      sessionItem("s_prog", "Сессия В Работе", { status: "in_progress" }),
      sessionItem("s_ready", "Сессия Готовая", { status: "ready" }),
      sessionItem("s_draft", "Сессия Черновик", { status: "draft" }),
    ];
    // Project status "done" keeps the row visible under the «Готово» chip filter
    // (filterExplorerTreeByStatus matches project passport status).
    setExplorerPage([projectItem("proj_1", "Проект Один", { status: "done", trackable_sessions_count: 3 })]);
    setProjectPage({ id: "proj_1", name: "Проект Один", status: "done", sessions_count: 3 }, sessions);
    charConfig.controller.currentProjectId = "proj_1";
    const view = await renderExplorer();
    await screen.findByText("Сессия Готовая");

    // No sort: original payload order in ProjectPane.
    expect(projectRowNames(view.container)).toEqual(["Сессия В Работе", "Сессия Готовая", "Сессия Черновик"]);

    // Sort by «Статус» ascending → sortProjectSessions semantics.
    fireEvent.click(screen.getByRole("button", { name: "Сортировать Статус по возрастанию" }));
    const expected = sortProjectSessions(sessions, { key: "status", direction: "asc" }).map((s) => s.name);
    await waitFor(() => expect(projectRowNames(view.container)).toEqual(expected));

    // Inline status filter: same chips live in the (hidden but mounted) ExplorerPane
    // toolbar and are passed into tree ProjectSessionsRows.
    const tree = view.container.querySelector('[data-testid="explorer-table-container"]');
    fireEvent.click(within(tree).getByLabelText("Показать сессии проекта Проект Один"));
    await within(tree).findByText("Сессия Черновик");

    // NOTE: status chips live in workspaceFilterToolbar, which is a SIBLING
    // of data-testid="explorer-table-container", not inside it.
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => {
      expect(within(tree).getByText("Сессия Готовая")).toBeTruthy();
      expect(within(tree).queryByText("Сессия В Работе")).toBeNull();
      expect(within(tree).queryByText("Сессия Черновик")).toBeNull();
    });
    // The ProjectPane list itself is not filtered by the tree chip (inline filter
    // only affects tree session rows).
    expect(projectRowNames(view.container)).toEqual(expected);
  });
});
