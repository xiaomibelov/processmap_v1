import React from "react";
import { expect, test, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../auth/AuthProvider.jsx", () => ({
  useAuth: () => ({
    user: { id: "u_admin", is_admin: true },
    orgs: [{ org_id: "org_1", name: "Org", role: "org_admin", is_active: true }],
  }),
}));

vi.mock("../config/featureFlagsContext.jsx", () => ({
  useFeatureFlag: () => false,
}));

vi.mock("./useWorkspaceExplorerController.js", () => ({
  useWorkspaceExplorerController: () => ({
    currentOrgName: "Org",
    currentOrgActive: true,
    permissions: {
      canManageUsers: true,
      canRenameWorkspace: true,
      canCreate: true,
      canRenameSession: true,
      canDeleteSession: true,
      canChangeStatus: true,
      canAssignSessionAssignees: true,
    },
    workspaces: [{ id: "ws_1", name: "Workspace", role: "org_admin" }],
    wsLoading: false,
    wsError: "",
    activeWorkspaceId: "ws_1",
    currentFolderId: "",
    currentProjectId: "proj_1",
    breadcrumbBase: [{ type: "workspace", id: "ws_1", name: "Workspace" }],
    projectRestoreStatus: "idle",
    handleSelectWorkspace: vi.fn(),
    handleCreateWorkspace: vi.fn(),
    handleNavigateToFolder: vi.fn(),
    handleNavigateToProject: vi.fn(),
    handleNavigateToBreadcrumb: vi.fn(),
    handleBackFromProject: vi.fn(),
    handleWorkspaceRenamed: vi.fn(),
  }),
}));

vi.mock("./SessionCreateModal.jsx", () => ({
  default: () => null,
}));

vi.mock("./bpmnUploadFlow.js", () => ({
  createSessionWithBpmnUpload: vi.fn(async () => ({ ok: true })),
  stripBpmnExtension: (name) => String(name || "").replace(/\.bpmn$/i, ""),
  uploadSessionBpmnOnly: vi.fn(async () => ({ ok: true })),
  uploadStageLabel: () => "",
  validateBpmnUploadFile: () => ({ ok: true }),
}));

vi.mock("./explorerPageQuery.js", () => ({
  explorerPageQueryKey: (workspaceId, folderId = "") => ["explorer-page", String(workspaceId || ""), String(folderId || "")],
  explorerPageQueryOptions: (workspaceId, folderId = "") => ({
    queryKey: ["explorer-page", String(workspaceId || ""), String(folderId || "")],
    queryFn: async () => ({
      items: [],
      current: { id: String(workspaceId || "ws_1"), name: "Workspace" },
    }),
    staleTime: 0,
  }),
}));

vi.mock("./projectSessionsQuery.js", () => ({
  projectSessionsQueryKey: (projectId) => ["project-sessions", String(projectId || "")],
  projectSessionsQueryOptions: (_workspaceId, projectId) => ({
    queryKey: ["project-sessions", String(projectId || "")],
    queryFn: async () => [
      {
        id: "sess_with",
        name: "Session with assignees",
        status: "draft",
        project_id: "proj_1",
        assignees: [
          { user_id: "u_1", full_name: "Анна Иванова", job_title: "Аналитик" },
          { user_id: "u_2", full_name: "Борис Петров", job_title: "Технолог" },
        ],
      },
      { id: "sess_empty", name: "Session without assignees", status: "draft", project_id: "proj_1", assignees: [] },
    ],
    staleTime: 0,
  }),
}));

vi.mock("../analytics/AnalyticsPage.jsx", () => ({
  default: () => <div data-testid="analytics-page" />,
}));

vi.mock("../../components/NotesAggregateBadge.jsx", () => ({
  default: () => null,
}));

vi.mock("../../lib/sessionNoteAggregates.js", () => ({
  useSessionNoteAggregates: () => ({ data: {}, loading: false, error: "" }),
}));

vi.mock("../../components/navigation/AppRouteLink.jsx", () => ({
  default: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock("../../components/TextBreadcrumbs.jsx", () => ({
  default: ({ items = [] }) => <span>{items.map((item) => item.name || item.label).join(" / ")}</span>,
}));

vi.mock("../../components/useElementWidth.js", () => ({
  default: () => [vi.fn(), 1280],
}));

vi.mock("../../components/workspaceMainNavSlot.js", () => ({
  useWorkspaceMainNavSlot: () => {},
}));

vi.mock("./explorerApi.js", () => {
  const ok = vi.fn(async () => ({ ok: true, data: [] }));
  return {
    apiRenameWorkspace: ok,
    apiGetExplorerPage: ok,
    apiCreateFolder: ok,
    apiRenameFolder: ok,
    apiUpdateFolder: ok,
    apiMoveFolder: ok,
    apiDeleteFolder: ok,
    apiCreateProject: ok,
    apiMoveProject: ok,
    apiSearchExplorer: ok,
    apiCreateSession: ok,
    apiGetSessionChildren: ok,
    apiGetSubprocessesCount: vi.fn(async () => ({ ok: true, count: 0 })),
    apiCreateSubprocessSessions: ok,
    apiListWorkspaces: vi.fn(async () => ({ ok: true, data: [{ id: "ws_1", name: "Workspace", role: "org_admin" }] })),
    apiFindProjectWorkspace: vi.fn(async () => "ws_1"),
    apiGetProjectPage: vi.fn(async () => ({
      ok: true,
      data: {
        project: { id: "proj_1", name: "Project", status: "active", sessions_count: 2 },
        sessions: [
          {
            id: "sess_with",
            name: "Session with assignees",
            status: "draft",
            project_id: "proj_1",
            assignees: [
              { user_id: "u_1", full_name: "Анна Иванова", job_title: "Аналитик" },
              { user_id: "u_2", full_name: "Борис Петров", job_title: "Технолог" },
            ],
          },
          { id: "sess_empty", name: "Session without assignees", status: "draft", project_id: "proj_1", assignees: [] },
        ],
      },
    })),
  };
});

vi.mock("../../lib/api", () => {
  return {
    apiDeleteProject: vi.fn(async () => ({ ok: true })),
    apiDeleteSession: vi.fn(async () => ({ ok: true })),
    apiListOrgAssignableUsers: vi.fn(async () => ({ ok: true, data: [] })),
    apiGetSession: vi.fn(async () => ({ ok: true, session: { diagram_state_version: 1 } })),
    apiPatchProject: vi.fn(async () => ({ ok: true })),
    apiPatchSession: vi.fn(async () => ({ ok: true })),
    apiReplaceSessionAssignees: vi.fn(async () => ({ ok: true, user_ids: ["u_1", "u_2"] })),
  };
});

test("WorkspaceExplorer renders project assignee column without throwing", async () => {
  const { default: WorkspaceExplorer } = await import("./WorkspaceExplorer.jsx");
  const sessions = [
    {
      id: "sess_with",
      name: "Session with assignees",
      status: "draft",
      project_id: "proj_1",
      assignees: [
        { user_id: "u_1", full_name: "Анна Иванова", job_title: "Аналитик" },
        { user_id: "u_2", full_name: "Борис Петров", job_title: "Технолог" },
      ],
    },
    { id: "sess_empty", name: "Session without assignees", status: "draft", project_id: "proj_1", assignees: [] },
  ];
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["project-sessions", "proj_1"], sessions);

  const html = renderToString(
    <QueryClientProvider client={queryClient}>
      <WorkspaceExplorer activeOrgId="org_1" onOpenSession={() => {}} />
    </QueryClientProvider>,
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("Исполнители");
});
