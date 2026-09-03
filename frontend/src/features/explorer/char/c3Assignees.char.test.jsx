/**
 * C3 — characterization tests: assignees (Шаг 0).
 * Pins CURRENT behavior of WorkspaceExplorer.jsx assignee flows:
 * folder responsible assignee (no tree reload), ProjectPane session assignee
 * optimistic rollback, tree session assignee cache-only patch, assignable
 * users loading per dialog open.
 */
import React from "react";
import { beforeEach, describe, expect, test } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  installExplorerMocks,
  resetCharConfig,
  charConfig,
  renderExplorer,
  setExplorerPage,
  setProjectPage,
  folderItem,
  projectItem,
  sessionItem,
  explorerApiMocks,
  libApiMocks,
} from "../../../test-utils/explorerChar.jsx";
import { projectSessionsQueryKey } from "../projectSessionsQuery.js";

installExplorerMocks();

beforeEach(() => {
  resetCharConfig();
});

describe("C3: assignees", () => {
  test("folder responsible assignee saves via apiUpdateFolder without tree reload", async () => {
    setExplorerPage([folderItem("f1", "Раздел Ответственный")]);
    await renderExplorer();
    await screen.findByText("Раздел Ответственный");

    fireEvent.click(screen.getByTitle("Назначить ответственного"));
    await screen.findByText("Ответственный за раздел");
    await screen.findByText("Анна Иванова");
    const pageCallsBefore = explorerApiMocks.apiGetExplorerPage.mock.calls.length;

    fireEvent.click(screen.getByRole("radio", { name: /Анна Иванова/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(explorerApiMocks.apiUpdateFolder).toHaveBeenCalledWith("ws_1", "f1", { responsible_user_id: "u_1" }),
    );
    // No full tree reload after the save (#895 behavior): explorer page fetch
    // count is unchanged (optimistic cache patch only).
    expect(explorerApiMocks.apiGetExplorerPage.mock.calls.length).toBe(pageCallsBefore);
  });

  test("session assignee optimistic update rolls back both stores on failure", async () => {
    const sessions = [
      sessionItem("s1", "Сессия Альфа", {
        status: "in_progress",
        assignees: [{ user_id: "u_1", full_name: "Анна Иванова", job_title: "Аналитик" }],
      }),
    ];
    setProjectPage({ id: "proj_1", name: "Проект Один", status: "active", sessions_count: 1 }, sessions);
    charConfig.controller.currentProjectId = "proj_1";
    libApiMocks.apiReplaceSessionAssignees.mockResolvedValue({ ok: false, error: "сервер недоступен" });

    const view = await renderExplorer();
    await screen.findByText("Сессия Альфа");

    // Open the assignee dialog from the session row cell.
    fireEvent.click(screen.getAllByTitle(/Анна Иванова/)[0]);
    await screen.findByText("Исполнители схемы");
    await screen.findByText("Борис Петров");

    // Add Борис to the existing Анна.
    fireEvent.click(screen.getByRole("checkbox", { name: /Борис Петров/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(libApiMocks.apiReplaceSessionAssignees).toHaveBeenCalledWith("s1", ["u_1", "u_2"]),
    );
    // Error is surfaced inline inside the dialog (no crash).
    await screen.findByText("сервер недоступен");

    // Rollback of both stores: react-query cache + local page state.
    expect(view.queryClient.getQueryData(projectSessionsQueryKey("proj_1"))[0].assignees).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByText("Борис Петров")).toBeNull());
    expect(screen.getByText("Анна")).toBeTruthy();
  });

  test("tree session assignee save patches caches only (no invalidate)", async () => {
    setExplorerPage([projectItem("proj_1", "Проект Дерево", { trackable_sessions_count: 1 })]);
    setProjectPage(
      { id: "proj_1", name: "Проект Дерево", status: "active", sessions_count: 1 },
      [sessionItem("s1", "Сессия Дерева")],
    );
    await renderExplorer();
    await screen.findByText("Проект Дерево");
    const pageCallsBefore = explorerApiMocks.apiGetExplorerPage.mock.calls.length;

    fireEvent.click(screen.getByLabelText("Показать сессии проекта Проект Дерево"));
    await screen.findByText("Сессия Дерева");

    fireEvent.click(screen.getByTitle("Назначить исполнителя"));
    await screen.findByText("Исполнители схемы");
    // Same AssigneePickerDialog as ProjectPane — multi-select via checkboxes
    // (see workspaceSessionAssignees.source.test.mjs: no radio inputs).
    fireEvent.click(await screen.findByRole("checkbox", { name: /Вера Сидорова/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(libApiMocks.apiReplaceSessionAssignees).toHaveBeenCalledWith("s1", ["u_3"]),
    );
    // session_assignees branch in the tree patches the react-query cache only —
    // no explorer page refetch / invalidation.
    expect(explorerApiMocks.apiGetExplorerPage.mock.calls.length).toBe(pageCallsBefore);
    // Row updated optimistically after the dialog closes.
    await waitFor(() => expect(screen.getByText("Вера")).toBeTruthy());
  });

  test("assignable users load on dialog open with timeout race", async () => {
    setProjectPage(
      { id: "proj_1", name: "Проект Один", status: "active", sessions_count: 1 },
      [sessionItem("s1", "Сессия Один")],
    );
    charConfig.controller.currentProjectId = "proj_1";
    await renderExplorer();
    await screen.findByText("Сессия Один");

    fireEvent.click(screen.getByTitle("Назначить исполнителя"));
    await screen.findByText("Исполнители схемы");
    await screen.findByText("Анна Иванова");
    expect(libApiMocks.apiListOrgAssignableUsers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByText("Исполнители схемы")).toBeNull());

    // Reopening the dialog loads users again (ProjectPane effect ~L4358).
    fireEvent.click(screen.getByTitle("Назначить исполнителя"));
    await screen.findByText("Исполнители схемы");
    expect(libApiMocks.apiListOrgAssignableUsers).toHaveBeenCalledTimes(2);
  });
});
