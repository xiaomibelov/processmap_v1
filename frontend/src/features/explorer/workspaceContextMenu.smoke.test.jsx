import React from "react";
import { expect, test, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../auth/AuthProvider.jsx", () => ({ useAuth: () => ({ user: null, orgs: [] }) }));
vi.mock("../config/featureFlagsContext.jsx", () => ({ useFeatureFlag: () => false }));
vi.mock("./explorerPageQuery.js", () => ({
  explorerPageQueryKey: (workspaceId, folderId = "", stageKey = "") => ["explorer-page", String(workspaceId || ""), String(folderId || ""), String(stageKey || "")],
  explorerPageQueryOptions: (workspaceId, folderId = "", stageKey = "") => ({
    queryKey: ["explorer-page", String(workspaceId || ""), String(folderId || ""), String(stageKey || "")],
    queryFn: async () => ({ items: [] }),
    staleTime: 0,
  }),
}));
vi.mock("./useWorkspaceExplorerController.js", () => ({
  useWorkspaceExplorerController: () => ({
    currentOrgName: "", currentOrgActive: true, permissions: {}, workspaces: [],
    wsLoading: false, wsError: "", activeWorkspaceId: "", currentFolderId: "",
    currentProjectId: null, breadcrumbBase: [], projectRestoreStatus: "idle",
    handleSelectWorkspace: vi.fn(), handleCreateWorkspace: vi.fn(),
    handleNavigateToFolder: vi.fn(), handleNavigateToProject: vi.fn(),
    handleNavigateToBreadcrumb: vi.fn(), handleBackFromProject: vi.fn(),
    handleWorkspaceRenamed: vi.fn(),
  }),
}));
vi.mock("./bpmnUploadFlow.js", () => ({
  createSessionWithBpmnUpload: vi.fn(async () => ({ ok: true })),
  stripBpmnExtension: (name) => String(name || ""),
  uploadSessionBpmnOnly: vi.fn(async () => ({ ok: true })),
  uploadStageLabel: () => "",
  validateBpmnUploadFile: () => ({ ok: true }),
  BPMN_UPLOAD_ACCEPT: ".bpmn,.xml",
}));

// Импорт после моков — WorkspaceExplorer тянет много модулей целиком.
const { ContextMenu } = await import("./WorkspaceExplorer.jsx");

afterEach(cleanup);

const MENU_ITEMS = [
  { label: "Открыть", action: vi.fn() },
  { label: "Создать TO BE", action: vi.fn() },
  { separator: true },
  { label: "Удалить", action: vi.fn(), danger: true },
];

function renderMenu({ items = MENU_ITEMS, onClose = vi.fn() } = {}) {
  const utils = render(
    <div className="relative flex justify-end">
      <button type="button" aria-label="Действия с проектом">···</button>
      <ContextMenu items={items} onClose={onClose} />
    </div>,
  );
  return { ...utils, onClose };
}

test("ContextMenu: role=menu/menuitem/separator, aria-orientation, фокус на первый пункт", () => {
  const { container } = renderMenu();
  const menu = container.querySelector('[role="menu"]');
  expect(menu).toBeTruthy();
  expect(menu.getAttribute("aria-orientation")).toBe("vertical");
  const items = container.querySelectorAll('[role="menuitem"]');
  expect(items.length).toBe(3);
  expect(container.querySelectorAll('[role="separator"]').length).toBe(1);
  // При открытии фокус на первом пункте.
  expect(document.activeElement).toBe(items[0]);
});

test("ContextMenu: ArrowDown/ArrowUp ходят по пунктам, separator пропускается", () => {
  const { container } = renderMenu();
  const items = container.querySelectorAll('[role="menuitem"]');
  fireEvent.keyDown(document.activeElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[1]); // «Создать TO BE»
  // следующий пункт за separator — индекс 3 в items-массиве (Удалить)
  fireEvent.keyDown(document.activeElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[2]);
  // зацикливание через последний → первый
  fireEvent.keyDown(document.activeElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[0]);
  // ArrowUp с первого → последний
  fireEvent.keyDown(document.activeElement, { key: "ArrowUp" });
  expect(document.activeElement).toBe(items[2]);
});

test("ContextMenu: Home/End — первый/последний пункт", () => {
  const { container } = renderMenu();
  const items = container.querySelectorAll('[role="menuitem"]');
  fireEvent.keyDown(document.activeElement, { key: "End" });
  expect(document.activeElement).toBe(items[2]);
  fireEvent.keyDown(document.activeElement, { key: "Home" });
  expect(document.activeElement).toBe(items[0]);
});

test("ContextMenu: Enter активирует пункт (Создать TO BE достижимо)", async () => {
  const user = userEvent.setup();
  const { container } = renderMenu();
  const items = container.querySelectorAll('[role="menuitem"]');
  fireEvent.keyDown(document.activeElement, { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[1]);
  await user.keyboard("{Enter}");
  expect(MENU_ITEMS[1].action).toHaveBeenCalledTimes(1);
});

test("ContextMenu: Escape закрывает с возвратом фокуса на триггер", () => {
  const { container, onClose } = renderMenu();
  const trigger = container.querySelector('button[aria-label="Действия с проектом"]');
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(trigger);
});

test("ContextMenu: клик по пункту активирует action и возвращает фокус на триггер", () => {
  const { container, onClose } = renderMenu();
  const trigger = container.querySelector('button[aria-label="Действия с проектом"]');
  fireEvent.click(container.querySelectorAll('[role="menuitem"]')[0]);
  expect(MENU_ITEMS[0].action).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(trigger);
});
