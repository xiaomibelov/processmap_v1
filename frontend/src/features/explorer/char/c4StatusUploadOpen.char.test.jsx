/**
 * C4 — characterization tests: status flow, dnd upload, session open (Шаг 0).
 * Pins CURRENT behavior of WorkspaceExplorer.jsx:
 * session status change (version fetch → patch with base_diagram_state_version),
 * project-row BPMN drop (validate → upload → invalidate), re-entrancy-guarded
 * session open passing projectContext.
 */
import React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  installExplorerMocks,
  resetCharConfig,
  charConfig,
  renderExplorer,
  setExplorerPage,
  setProjectPage,
  projectItem,
  sessionItem,
  explorerApiMocks,
  libApiMocks,
  uploadMocks,
} from "../../../test-utils/explorerChar.jsx";

installExplorerMocks();

beforeEach(() => {
  resetCharConfig();
});

describe("C4: status flow, dnd upload, session open", () => {
  test("session status change fetches version then patches with base_diagram_state_version", async () => {
    setProjectPage(
      { id: "proj_1", name: "Проект Один", status: "active", sessions_count: 1 },
      [sessionItem("s1", "Сессия Статусная")],
    );
    charConfig.controller.currentProjectId = "proj_1";
    libApiMocks.apiGetSession.mockResolvedValue({ ok: true, session: { diagram_state_version: 7 } });
    libApiMocks.apiPatchSession.mockResolvedValue({
      ok: true,
      session: { interview: { status: "in_progress" }, updated_at: 1700000000 },
    });
    await renderExplorer();
    await screen.findByText("Сессия Статусная");

    fireEvent.click(screen.getByRole("button", { name: "Статус: Черновик" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "В работе" }));

    await waitFor(() =>
      expect(libApiMocks.apiPatchSession).toHaveBeenCalledWith("s1", {
        status: "in_progress",
        base_diagram_state_version: 7,
      }),
    );
    // apiGetSession must run BEFORE apiPatchSession (version fetch first).
    expect(libApiMocks.apiGetSession.mock.invocationCallOrder[0])
      .toBeLessThan(libApiMocks.apiPatchSession.mock.invocationCallOrder[0]);
  });

  test("project row bpmn drop validates, uploads, invalidates", async () => {
    setExplorerPage([projectItem("proj_1", "Проект Загрузка")]);
    await renderExplorer();
    await screen.findByText("Проект Загрузка");
    expect(explorerApiMocks.apiGetExplorerPage.mock.calls.filter((c) => c[1] === "").length).toBe(1);

    const file = new File(["<bpmn/>"], "proc.bpmn", { type: "text/xml" });
    fireEvent.drop(screen.getByTestId("project-row-proj_1"), {
      dataTransfer: { types: ["Files"], files: [file] },
    });

    await waitFor(() => expect(uploadMocks.createSessionWithBpmnUpload).toHaveBeenCalled());
    expect(uploadMocks.createSessionWithBpmnUpload.mock.calls[0][0]).toMatchObject({
      workspaceId: "ws_1",
      projectId: "proj_1",
      name: "proc",
    });

    // Success invalidates the explorer page query → refetch of the root page.
    await waitFor(() =>
      expect(explorerApiMocks.apiGetExplorerPage.mock.calls.filter((c) => c[1] === "").length)
        .toBeGreaterThanOrEqual(2),
    );
  });

  test("bpmn drop with invalid file shows error and does not upload", async () => {
    setExplorerPage([projectItem("proj_1", "Проект Загрузка")]);
    charConfig.uploadValidation = { ok: false, error: "ожидался .bpmn" };
    await renderExplorer();
    await screen.findByText("Проект Загрузка");

    fireEvent.drop(screen.getByTestId("project-row-proj_1"), {
      dataTransfer: { types: ["Files"], files: [new File(["x"], "bad.txt")] },
    });

    const stage = await screen.findByTestId("session-upload-stage");
    expect(stage.textContent).toContain("Ошибка: ожидался .bpmn");
    expect(uploadMocks.createSessionWithBpmnUpload).not.toHaveBeenCalled();
  });

  test("session open is re-entrancy guarded and passes projectContext", async () => {
    setProjectPage(
      { id: "proj_1", name: "Проект Один", status: "active", sessions_count: 1 },
      [sessionItem("s1", "Сессия Открытие")],
    );
    charConfig.controller.currentProjectId = "proj_1";
    // Never-resolving promise keeps the re-entrancy guard window observable.
    const onOpenSession = vi.fn(() => new Promise(() => {}));

    await renderExplorer({ props: { onOpenSession } });
    await screen.findByText("Сессия Открытие");

    const cta = screen.getByRole("link", { name: "Открыть сессию" });
    fireEvent.click(cta);
    fireEvent.click(cta);

    await waitFor(() => expect(onOpenSession).toHaveBeenCalledTimes(1));
    const [payload, options] = onOpenSession.mock.calls[0];
    expect(payload.projectContext).toMatchObject({ projectId: "proj_1", workspaceId: "ws_1" });
    expect(options).toMatchObject({ openTab: "diagram" });
  });
});
