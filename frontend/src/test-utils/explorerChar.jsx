/**
 * Shared characterization-test infrastructure for WorkspaceExplorer (Шаг 0).
 *
 * Pattern (mirrors WorkspaceExplorer.smoke.test.jsx, parameterized):
 *   import this module, then render via renderExplorer() — WorkspaceExplorer.jsx
 *   is only imported dynamically, AFTER the vi.mock registrations below take
 *   effect. vi.mock paths are relative to THIS file (vitest resolves runtime
 *   vi.mock against the calling module). Mock handles and the mutable config
 *   are created inside vi.hoisted() because vitest hoists vi.mock calls above
 *   regular module initializers.
 *
 * Product code is NOT touched: mocks live at the API/wiring boundary
 * (explorerApi.js, lib/api.js, bpmnUploadFlow.js, useWorkspaceExplorerController.js,
 * AuthProvider, featureFlags, heavy presentational externals). The REAL
 * WorkspaceExplorer.jsx internals (state, effects, handlers) execute, alongside
 * the real pure sibling modules (explorerSortModel, explorerStatusFilters,
 * explorerTreePersistence, work3TreeState, explorerStatusCatalog, ...).
 *
 * Mutable per-test config lives in `charConfig`; reset it in beforeEach via
 * resetCharConfig(). Mock implementations are vi.fn handles grouped in
 * explorerApiMocks / libApiMocks / uploadMocks so tests can override per test.
 */
import React from "react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";

const hoisted = vi.hoisted(() => {
  function defaultController() {
    return {
      currentOrgName: "Org",
      currentOrgActive: true,
      permissions: {
        canManageUsers: true,
        canRenameWorkspace: true,
        canCreate: true,
        canRenameFolder: true,
        canRenameProject: true,
        canRenameSession: true,
        canDeleteSession: true,
        canChangeStatus: true,
        canAssignSessionAssignees: true,
      },
      workspaces: [{ id: "ws_1", name: "Workspace One", role: "org_admin" }],
      wsLoading: false,
      wsError: "",
      activeWorkspaceId: "ws_1",
      currentFolderId: "",
      currentProjectId: "",
      breadcrumbBase: [{ type: "workspace", id: "ws_1", name: "Workspace One" }],
      projectRestoreStatus: "idle",
      handleSelectWorkspace: vi.fn(),
      handleCreateWorkspace: vi.fn(),
      handleNavigateToFolder: vi.fn(),
      handleNavigateToProject: vi.fn(),
      handleNavigateToBreadcrumb: vi.fn(),
      handleBackFromProject: vi.fn(),
      handleWorkspaceRenamed: vi.fn(),
    };
  }

  const charConfig = {
    auth: null,
    featureFlags: {},
    controller: null,
    /** Preferences API document ({ version, preferences }) or null (401/guest). */
    preferences: null,
    /** explorer page payloads keyed `${workspaceId}::${folderId}`. */
    pages: new Map(),
    /** Fallback page payload for unconfigured keys. */
    defaultPage: null,
    /** Payload for apiGetProjectPage: { project, sessions }. */
    projectPage: null,
    /** Users returned by apiListOrgAssignableUsers. */
    assignableUsers: [],
    /** Verdict returned by validateBpmnUploadFile. */
    uploadValidation: { ok: true },
  };

  const explorerApiMocks = {
    apiRenameWorkspace: vi.fn(),
    apiGetExplorerPage: vi.fn(),
    apiCreateFolder: vi.fn(),
    apiRenameFolder: vi.fn(),
    apiUpdateFolder: vi.fn(),
    apiMoveFolder: vi.fn(),
    apiDeleteFolder: vi.fn(),
    apiCreateProject: vi.fn(),
    apiMoveProject: vi.fn(),
    apiGetProjectPage: vi.fn(),
    apiSearchExplorer: vi.fn(),
    apiCreateSession: vi.fn(),
    apiGetSessionChildren: vi.fn(),
    apiGetSubprocessesCount: vi.fn(),
    apiCreateSubprocessSessions: vi.fn(),
  };

  const libApiMocks = {
    apiRequest: vi.fn(),
    apiDeleteProject: vi.fn(),
    apiDeleteSession: vi.fn(),
    apiGetSession: vi.fn(),
    apiListOrgAssignableUsers: vi.fn(),
    apiPatchProject: vi.fn(),
    apiPatchSession: vi.fn(),
    apiReplaceSessionAssignees: vi.fn(),
  };

  const uploadMocks = {
    createSessionWithBpmnUpload: vi.fn(),
    uploadSessionBpmnOnly: vi.fn(),
    validateBpmnUploadFile: vi.fn(),
  };

  function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function restoreDefaultImplementations() {
    const apply = (handle, impl) => {
      handle.mockReset();
      handle.mockImplementation(impl);
    };

    apply(explorerApiMocks.apiRenameWorkspace, async () => ({ ok: true }));
    apply(explorerApiMocks.apiGetExplorerPage, async (workspaceId, folderId = "") => {
      const ws = String(workspaceId || "");
      const key = `${ws}::${String(folderId || "")}`;
      const page = charConfig.pages.get(key)
        ?? (folderId ? charConfig.pages.get(`${ws}::`) : undefined)
        ?? charConfig.defaultPage
        ?? { items: [] };
      return { ok: true, data: deepClone(page) };
    });
    apply(explorerApiMocks.apiCreateFolder, async () => ({ ok: true }));
    apply(explorerApiMocks.apiRenameFolder, async () => ({ ok: true }));
    apply(explorerApiMocks.apiUpdateFolder, async () => ({ ok: true }));
    apply(explorerApiMocks.apiMoveFolder, async () => ({ ok: true }));
    apply(explorerApiMocks.apiDeleteFolder, async () => ({ ok: true }));
    apply(explorerApiMocks.apiCreateProject, async () => ({ ok: true }));
    apply(explorerApiMocks.apiMoveProject, async () => ({ ok: true }));
    apply(explorerApiMocks.apiGetProjectPage, async () => ({
      ok: true,
      data: {
        project: charConfig.projectPage?.project ? deepClone(charConfig.projectPage.project) : null,
        sessions: deepClone(charConfig.projectPage?.sessions || []),
      },
    }));
    apply(explorerApiMocks.apiSearchExplorer, async () => ({ ok: true, data: { items: [] } }));
    apply(explorerApiMocks.apiCreateSession, async () => ({ ok: true }));
    apply(explorerApiMocks.apiGetSessionChildren, async () => ({ ok: true, data: [] }));
    apply(explorerApiMocks.apiGetSubprocessesCount, async () => ({ ok: true, count: 0 }));
    apply(explorerApiMocks.apiCreateSubprocessSessions, async () => ({ ok: true }));

    apply(libApiMocks.apiRequest, async (path, options = {}) => {
      if (String(path) === "/api/users/me/preferences") {
        if (String(options.method || "").toUpperCase() === "PATCH") {
          const current = charConfig.preferences || { version: 0, preferences: {} };
          const preferences = { ...current.preferences, ...(options.body?.set || {}) };
          charConfig.preferences = { version: (Number(current.version) || 0) + 1, preferences };
          return { ok: true, data: charConfig.preferences };
        }
        if (!charConfig.preferences) return { ok: false, status: 401 };
        return { ok: true, data: charConfig.preferences };
      }
      return { ok: true };
    });
    apply(libApiMocks.apiDeleteProject, async () => ({ ok: true }));
    apply(libApiMocks.apiDeleteSession, async () => ({ ok: true }));
    apply(libApiMocks.apiGetSession, async () => ({ ok: true, session: { diagram_state_version: 1 } }));
    apply(libApiMocks.apiListOrgAssignableUsers, async () => ({ ok: true, data: { items: charConfig.assignableUsers } }));
    apply(libApiMocks.apiPatchProject, async () => ({ ok: true }));
    apply(libApiMocks.apiPatchSession, async () => ({
      ok: true,
      session: { interview: { status: "in_progress" }, updated_at: 1700000000 },
    }));
    apply(libApiMocks.apiReplaceSessionAssignees, async () => ({ ok: true }));

    apply(uploadMocks.createSessionWithBpmnUpload, async () => ({ ok: true, stage: "done", sessionId: "sess_new" }));
    apply(uploadMocks.uploadSessionBpmnOnly, async () => ({ ok: true, stage: "done" }));
    apply(uploadMocks.validateBpmnUploadFile, () => charConfig.uploadValidation);
  }

  function resetCharConfig() {
    charConfig.auth = {
      user: { id: "u_admin", full_name: "Главный Админ", is_admin: true },
      orgs: [{ org_id: "org_1", id: "org_1", name: "Org", role: "org_admin", is_active: true }],
    };
    charConfig.featureFlags = {};
    charConfig.controller = defaultController();
    charConfig.preferences = null;
    charConfig.pages = new Map();
    charConfig.defaultPage = { items: [] };
    charConfig.projectPage = { project: null, sessions: [] };
    charConfig.assignableUsers = [
      { user_id: "u_1", full_name: "Анна Иванова", job_title: "Аналитик", email: "anna@example.com" },
      { user_id: "u_2", full_name: "Борис Петров", job_title: "Технолог", email: "boris@example.com" },
      { user_id: "u_3", full_name: "Вера Сидорова", job_title: "Инженер", email: "vera@example.com" },
    ];
    charConfig.uploadValidation = { ok: true };
    restoreDefaultImplementations();
  }

  resetCharConfig();

  return { charConfig, explorerApiMocks, libApiMocks, uploadMocks, resetCharConfig };
});

export const charConfig = hoisted.charConfig;
export const explorerApiMocks = hoisted.explorerApiMocks;
export const libApiMocks = hoisted.libApiMocks;
export const uploadMocks = hoisted.uploadMocks;
export const resetCharConfig = hoisted.resetCharConfig;

// ─── vi.mock registration ───────────────────────────────────────────────────
// NOTE: vitest hoists vi.mock calls (also nested ones) to the top of this
// module — above the regular initializers — hence the vi.hoisted() block
// above. Registration happens when this module is evaluated; factories run
// lazily on the first dynamic import of WorkspaceExplorer.jsx.

export function installExplorerMocks() {
  vi.mock("../features/auth/AuthProvider.jsx", () => ({
    useAuth: () => charConfig.auth,
  }));

  vi.mock("../features/config/featureFlagsContext.jsx", () => ({
    useFeatureFlag: (name) => Boolean(charConfig.featureFlags[name]),
  }));

  vi.mock("../features/explorer/useWorkspaceExplorerController.js", () => ({
    useWorkspaceExplorerController: () => ({ ...charConfig.controller }),
  }));

  vi.mock("../features/explorer/SessionCreateModal.jsx", () => ({
    default: () => null,
  }));

  vi.mock("../features/explorer/bpmnUploadFlow.js", () => ({
    createSessionWithBpmnUpload: uploadMocks.createSessionWithBpmnUpload,
    stripBpmnExtension: (name) => String(name || "").replace(/\.bpmn$/i, ""),
    uploadSessionBpmnOnly: uploadMocks.uploadSessionBpmnOnly,
    uploadStageLabel: () => "",
    validateBpmnUploadFile: uploadMocks.validateBpmnUploadFile,
  }));

  vi.mock("../features/explorer/explorerApi.js", () => ({ ...explorerApiMocks }));

  vi.mock("../lib/api.js", () => ({ ...libApiMocks }));

  vi.mock("../features/analytics/AnalyticsPage.jsx", () => ({
    default: () => null,
  }));

  vi.mock("../components/NotesAggregateBadge.jsx", () => ({
    default: () => null,
  }));

  vi.mock("../lib/sessionNoteAggregates.js", () => ({
    // Real hook returns a Map (WorkspaceExplorer.jsx:4995 calls .get without ?.).
    useSessionNoteAggregates: () => new Map(),
  }));

  vi.mock("../components/navigation/AppRouteLink.jsx", () => ({
    default: ({ children, href, onNavigate, ...rest }) => (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onNavigate?.(event);
        }}
        {...rest}
      >
        {children}
      </a>
    ),
  }));

  vi.mock("../components/TextBreadcrumbs.jsx", () => ({
    default: ({ crumbs, items }) => (
      <span>{(crumbs || items || []).map((crumb) => crumb?.label || crumb?.name || "").join(" / ")}</span>
    ),
  }));

  vi.mock("../components/useElementWidth.js", () => ({
    default: () => [vi.fn(), 1280],
  }));

  vi.mock("../components/workspaceMainNavSlot.js", () => ({
    useWorkspaceMainNavSlot: () => null,
  }));

  // ExplorerSidebarContext store is stubbed with STABLE no-op register fns:
  // the real provider recreates register/unregister on every state change,
  // which (together with useSetExplorerSidebarHeader's [header, register]
  // effect deps and a fresh header element per render) drives an infinite
  // passive-effect re-render loop in jsdom, freezing the render.
  // See .planning/contours/refactor/workspace-explorer-s0-tests/FOUND-BUGS.md (char-bug-1).
  // The pane header/context registration is sidebar plumbing, not the logic
  // under characterization.
  vi.mock("../features/explorer/ExplorerSidebarContext.jsx", async () => {
    const ReactActual = await import("react");
    const Ctx = ReactActual.createContext(null);
    const stableValue = {
      header: null,
      register: () => {},
      unregister: () => {},
      contextInfo: null,
      registerContext: () => {},
      unregisterContext: () => {},
    };
    return {
      ExplorerSidebarProvider: ({ children }) => ReactActual.createElement(Ctx.Provider, { value: stableValue }, children),
      useExplorerSidebarHeader: () => null,
      useExplorerSidebarContext: () => ({ contextInfo: null }),
      useSetExplorerSidebarHeader: () => {},
      useSetExplorerSidebarContextInfo: () => {},
    };
  });
}

// ─── Rendering helpers ──────────────────────────────────────────────────────

let workspaceExplorerComponent = null;

export async function loadWorkspaceExplorer() {
  if (!workspaceExplorerComponent) {
    const mod = await import("../features/explorer/WorkspaceExplorer.jsx");
    workspaceExplorerComponent = mod.default;
  }
  return workspaceExplorerComponent;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60 * 60 * 1000 },
      mutations: { retry: false },
    },
  });
}

/**
 * Render the real WorkspaceExplorer inside a QueryClientProvider.
 * Returns the testing-library view plus queryClient and rerenderExplorer()
 * (re-renders a fresh element so the controller mock is re-read — used to
 * simulate workspace switching / pref redelivery).
 */
export async function renderExplorer({ props = {}, queryClient = makeQueryClient() } = {}) {
  const WorkspaceExplorer = await loadWorkspaceExplorer();
  const element = (
    <QueryClientProvider client={queryClient}>
      <WorkspaceExplorer activeOrgId="org_1" {...props} />
    </QueryClientProvider>
  );
  const view = render(element);
  return {
    ...view,
    queryClient,
    rerenderExplorer: () => {
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <WorkspaceExplorer activeOrgId="org_1" {...props} />
        </QueryClientProvider>,
      );
    },
  };
}

// ─── Fixture helpers ────────────────────────────────────────────────────────

export function pageKey(workspaceId = "ws_1", folderId = "") {
  return `${workspaceId}::${folderId}`;
}

export function setExplorerPage(items, { workspaceId = "ws_1", folderId = "", ...rest } = {}) {
  charConfig.pages.set(pageKey(workspaceId, folderId), { items, ...rest });
}

export function setProjectPage(project, sessions) {
  charConfig.projectPage = { project, sessions };
}

export function folderItem(id, name, extra = {}) {
  return {
    id,
    type: "folder",
    name,
    parent_id: "",
    context_status: "none",
    child_folder_count: 0,
    child_project_count: 0,
    ...extra,
  };
}

export function projectItem(id, name, extra = {}) {
  return {
    id,
    type: "project",
    name,
    status: "active",
    trackable_sessions_count: 0,
    ...extra,
  };
}

export function sessionItem(id, name, extra = {}) {
  return {
    id,
    name,
    status: "draft",
    project_id: "proj_1",
    assignees: [],
    ...extra,
  };
}

/** Ids of top-level explorer tree rows in DOM order (folders + projects). */
export function explorerTopRowIds(container) {
  const rows = Array.from(
    container.querySelectorAll('[data-testid="explorer-table-container"] tbody tr[data-depth="0"]'),
  );
  return rows.map((row) => {
    const projectId = row.getAttribute("data-testid")?.match(/^project-row-(.+)$/)?.[1];
    if (projectId) return projectId;
    const folderButton = row.querySelector('button[data-testid^="folder-navigate-"]');
    return folderButton?.getAttribute("data-testid")?.replace(/^folder-navigate-/, "") || null;
  });
}

/** Session names of ProjectPane table rows in DOM order. */
export function projectRowNames(container) {
  const zone = container.querySelector('[data-testid="project-sessions-dropzone"]');
  if (!zone) return [];
  return Array.from(zone.querySelectorAll("tbody tr"))
    .map((row) => row.querySelector("td a")?.textContent?.trim() || null)
    .filter(Boolean);
}

/** Number of apiGetExplorerPage calls for a given folder id. */
export function explorerPageCallsFor(folderId) {
  return explorerApiMocks.apiGetExplorerPage.mock.calls.filter((call) => call[1] === folderId).length;
}
