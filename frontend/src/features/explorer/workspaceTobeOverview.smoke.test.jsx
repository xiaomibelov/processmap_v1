import React from "react";
import { expect, test, vi } from "vitest";
import { renderToString } from "react-dom/server";

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
const { StageBadges, CompositionCell } = await import("./WorkspaceExplorer.jsx");
const SessionCreateModal = (await import("./SessionCreateModal.jsx")).default;

test("StageBadges: два контура — маркеры + подписи + aria-label (не color-only)", () => {
  const html = renderToString(
    <StageBadges
      show
      item={{
        stage_badges: ["as_is", "to_be"],
        counters: { as_is: 1, to_be: 1 },
        tobe: { last_updated_at: 1700000000 },
      }}
    />,
  );
  expect(html).toContain("●");
  expect(html).toContain("◆");
  expect(html).toContain("AS IS");
  expect(html).toContain("TO BE");
  expect(html).toContain('aria-label="TO BE"');
  expect(html).toContain('aria-label="AS IS"');
  expect(html).toContain("TO BE: 1 описание");
});

test("StageBadges: скрыт без show или без бейджей", () => {
  expect(renderToString(
    <StageBadges item={{ stage_badges: ["to_be"] }} />,
  )).toBe("");
  expect(renderToString(
    <StageBadges show item={{ stage_badges: [] }} />,
  )).toBe("");
  expect(renderToString(
    <StageBadges show item={{ stage_badges: ["junk"] }} />,
  )).toBe("");
});

test("StageBadges: только AS IS — один бейдж", () => {
  const html = renderToString(
    <StageBadges show item={{ stage_badges: ["as_is"], counters: { as_is: 2, to_be: 0 } }} />,
  );
  expect(html).toContain('aria-label="AS IS"');
  expect(html).not.toContain('aria-label="TO BE"');
});

test("CompositionCell: вторая строка со split AS IS/TO BE и покрытие папки", () => {
  const html = renderToString(
    <CompositionCell
      showStage
      item={{
        type: "folder",
        descendant_projects_count: 3,
        descendant_sessions_count: 6,
        descendant_trackable_sessions_count: 6,
        descendant_done_sessions_count: 2,
        counters: { as_is: 4, to_be: 2 },
        tobe_coverage: { with_tobe: 2, total: 3 },
      }}
    />,
  );
  expect(html).toContain("AS IS 4 · TO BE 2");
  expect(html).toContain("Покрытие TO BE: 2/3");
});

test("CompositionCell: покрытие скрыто при to_be=0, split скрыт без showStage", () => {
  const noTobe = renderToString(
    <CompositionCell
      showStage
      item={{
        type: "folder",
        descendant_sessions_count: 1,
        counters: { as_is: 1, to_be: 0 },
        tobe_coverage: { with_tobe: 0, total: 1 },
      }}
    />,
  );
  expect(noTobe).not.toContain("Покрытие TO BE");
  const noFlag = renderToString(
    <CompositionCell
      item={{ type: "project", sessions_count: 2, counters: { as_is: 2, to_be: 0 } }}
    />,
  );
  expect(noFlag).not.toContain("AS IS 2");
});

// SessionCreateModal рендерится в портал — только клиентский рендер (jsdom).
async function renderModalInDom(props) {
  const { createRoot } = await import("react-dom/client");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => {
    root.render(<SessionCreateModal sessions={[]} onClose={() => {}} onSubmit={async () => ({})} {...props} />);
  });
  return { container, unmount: async () => {
    await React.act(async () => { root.unmount(); });
    container.remove();
  } };
}

test("SessionCreateModal: initialProcessLayer=to_be преселектит контур TO BE", async () => {
  const { unmount } = await renderModalInDom({ initialProcessLayer: "to_be" });
  expect(document.querySelector('input[data-testid="session-type-to-be"]')?.checked).toBe(true);
  expect(document.querySelector('input[data-testid="session-type-as-is"]')?.checked).toBe(false);
  expect(document.querySelector('[data-testid="session-asis-select"]')).toBeTruthy();
  await unmount();
});

test("SessionCreateModal: без пропа преселектит AS IS", async () => {
  const { unmount } = await renderModalInDom({});
  expect(document.querySelector('input[data-testid="session-type-as-is"]')?.checked).toBe(true);
  expect(document.querySelector('input[data-testid="session-type-to-be"]')?.checked).toBe(false);
  await unmount();
});
