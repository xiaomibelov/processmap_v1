import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  apiListWorkspaces,
  apiCreateWorkspace,
  apiFindProjectWorkspace,
} from "./explorerApi.js";
import { buildWorkspacePermissions } from "../workspace/workspacePermissions";
import {
  canRestoreRequestedProject,
  normalizeRequestedProjectWorkspace,
  resolveExplorerWorkspaceId,
} from "./workspaceRestore.js";
import {
  normalizeProjectBreadcrumbBase,
  resolveProjectBreadcrumbTarget,
} from "./workspaceBreadcrumbs.js";

export function useWorkspaceExplorerController({
  activeOrgId,
  requestProjectId,
  requestProjectWorkspaceId = "",
  onClearRequestedProject,
  orgs = [],
  isAdmin = false,
}) {
  const [workspaces, setWorkspaces] = useState([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsError, setWsError] = useState("");

  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [breadcrumbBase, setBreadcrumbBase] = useState([]);
  const [resolvedRequestWorkspaceId, setResolvedRequestWorkspaceId] = useState("");
  const [projectRestoreStatus, setProjectRestoreStatus] = useState("idle");
  const [ignoredRequestProjectId, setIgnoredRequestProjectId] = useState("");
  const resolvedWorkspaceCacheRef = useRef(new Map());
  const previousRequestProjectIdRef = useRef("");

  const currentOrg = useMemo(
    () => (Array.isArray(orgs) ? orgs : []).find((item) => String(item?.org_id || item?.id || "") === String(activeOrgId || "")) || null,
    [orgs, activeOrgId]
  );
  const currentOrgName = String(currentOrg?.name || currentOrg?.org_name || activeOrgId || "").trim();
  const activeWorkspace = useMemo(
    () => workspaces.find((item) => String(item?.id || "") === String(activeWorkspaceId || "")) || null,
    [workspaces, activeWorkspaceId]
  );
  const permissions = useMemo(
    () => buildWorkspacePermissions(activeWorkspace?.role || "", Boolean(isAdmin)),
    [activeWorkspace?.role, isAdmin]
  );

  useEffect(() => {
    let cancelled = false;
    setWsLoading(true);
    setWsError("");
    apiListWorkspaces()
      .then((resp) => {
        if (cancelled) return;
        if (!resp?.ok) {
          setWsError(resp?.error || "Ошибка загрузки");
          return;
        }
        const raw = resp?.data;
        const list = Array.isArray(raw) ? raw : [];
        setWorkspaces(list);
        if (!list.length) {
          setActiveWorkspaceId("");
          setCurrentFolderId("");
          setCurrentProjectId(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setWsError(String(e?.message || "Ошибка"));
      })
      .finally(() => {
        if (!cancelled) setWsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  useEffect(() => {
    if (wsLoading) return;
    if (!workspaces.length) return;
    const nextWorkspaceId = resolveExplorerWorkspaceId({
      workspaces,
      activeWorkspaceId,
      requestProjectWorkspaceId,
    });
    if (nextWorkspaceId && nextWorkspaceId !== String(activeWorkspaceId || "").trim()) {
      setActiveWorkspaceId(nextWorkspaceId);
      setCurrentFolderId("");
    }
  }, [workspaces, wsLoading, activeWorkspaceId, requestProjectWorkspaceId]);

  useEffect(() => {
    setActiveWorkspaceId("");
    setCurrentFolderId("");
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
    setResolvedRequestWorkspaceId("");
    setProjectRestoreStatus("idle");
    setIgnoredRequestProjectId("");
  }, [activeOrgId]);

  useEffect(() => {
    const pid = String(requestProjectId || "").trim();
    const ignored = String(ignoredRequestProjectId || "").trim();
    if (!pid) {
      setResolvedRequestWorkspaceId("");
      setProjectRestoreStatus("idle");
      return;
    }
    if (ignored && pid === ignored) {
      setResolvedRequestWorkspaceId("");
      setProjectRestoreStatus("idle");
      return;
    }
    if (wsLoading) {
      setProjectRestoreStatus("resolving");
      return;
    }
    if (!workspaces.length) {
      setResolvedRequestWorkspaceId("");
      setProjectRestoreStatus("idle");
      return;
    }

    const workspaceIds = workspaces.map((item) => String(item?.id || "").trim()).filter(Boolean);
    const explicitWorkspaceId = String(requestProjectWorkspaceId || "").trim();
    const cachedWorkspaceId = String(resolvedWorkspaceCacheRef.current.get(pid) || "").trim();
    const immediateWorkspaceId = [explicitWorkspaceId, cachedWorkspaceId]
      .find((candidate) => candidate && workspaceIds.includes(candidate)) || "";

    if (immediateWorkspaceId) {
      setResolvedRequestWorkspaceId(immediateWorkspaceId);
      setProjectRestoreStatus("ready");
      if (immediateWorkspaceId !== String(activeWorkspaceId || "").trim()) {
        setActiveWorkspaceId(immediateWorkspaceId);
        setCurrentFolderId("");
      }
      return;
    }

    let cancelled = false;
    setProjectRestoreStatus("resolving");
    void (async () => {
      const foundWorkspaceId = await apiFindProjectWorkspace(workspaceIds, pid);
      if (cancelled) return;
      const fallbackWorkspaceId = resolveExplorerWorkspaceId({
        workspaces,
        activeWorkspaceId,
        requestProjectWorkspaceId: "",
      });
      const nextWorkspaceId = String(foundWorkspaceId || fallbackWorkspaceId || "").trim();
      if (foundWorkspaceId) {
        resolvedWorkspaceCacheRef.current.set(pid, foundWorkspaceId);
      }
      setResolvedRequestWorkspaceId(nextWorkspaceId);
      setProjectRestoreStatus("ready");
      if (nextWorkspaceId && nextWorkspaceId !== String(activeWorkspaceId || "").trim()) {
        setActiveWorkspaceId(nextWorkspaceId);
        setCurrentFolderId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestProjectId, requestProjectWorkspaceId, workspaces, wsLoading, activeWorkspaceId, ignoredRequestProjectId]);

  useEffect(() => {
    const pid = String(requestProjectId || "").trim();
    const ignored = String(ignoredRequestProjectId || "").trim();
    if (!ignored) return;
    if (!pid || pid !== ignored) {
      setIgnoredRequestProjectId("");
    }
  }, [requestProjectId, ignoredRequestProjectId]);

  const dismissRequestedProjectRestore = useCallback((options = {}) => {
    const pid = String(requestProjectId || "").trim();
    if (!pid) return;
    setIgnoredRequestProjectId(pid);
    if (options?.clearExternal) {
      onClearRequestedProject?.();
    }
  }, [requestProjectId, onClearRequestedProject]);

  useEffect(() => {
    const pid = String(requestProjectId || "").trim();
    const prevPid = String(previousRequestProjectIdRef.current || "").trim();
    previousRequestProjectIdRef.current = pid;
    if (!pid) {
      if (prevPid && currentProjectId === prevPid) {
        setCurrentProjectId(null);
      }
      return;
    }
    if (projectRestoreStatus === "resolving") {
      return;
    }
    if (pid === String(ignoredRequestProjectId || "").trim()) {
      return;
    }
    const effectiveRequestedWorkspaceId = normalizeRequestedProjectWorkspace({
      requestProjectId: pid,
      requestProjectWorkspaceId,
      resolvedWorkspaceId: resolvedRequestWorkspaceId,
      activeWorkspaceId,
    });
    if (!canRestoreRequestedProject({
      requestProjectId: pid,
      requestProjectWorkspaceId: effectiveRequestedWorkspaceId,
      activeWorkspaceId,
    })) {
      return;
    }
    if (pid !== currentProjectId) {
      setBreadcrumbBase([]);
      setCurrentProjectId(pid);
    }
  }, [requestProjectId, requestProjectWorkspaceId, resolvedRequestWorkspaceId, activeWorkspaceId, currentProjectId, projectRestoreStatus, ignoredRequestProjectId]);

  const handleSelectWorkspace = useCallback((wsId) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    setActiveWorkspaceId(wsId);
    setCurrentFolderId("");
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
  }, [dismissRequestedProjectRestore]);

  const handleCreateWorkspace = useCallback(async (name) => {
    const resp = await apiCreateWorkspace(name);
    if (!resp?.ok) throw new Error(resp?.error || "Не удалось создать");
    const created = resp?.data || {};
    const newWs = {
      id: created.id,
      org_id: created.org_id || activeOrgId || "",
      name: created.name || name,
      role: created.role || activeWorkspace?.role || "member",
      created_at: created.created_at || 0,
    };
    setWorkspaces((prev) => [...prev, newWs]);
    setActiveWorkspaceId(created.id);
    setCurrentFolderId("");
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
  }, [activeOrgId, activeWorkspace?.role]);

  const handleNavigateToFolder = useCallback((folderId) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    setCurrentFolderId(folderId);
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
  }, [dismissRequestedProjectRestore]);

  const handleNavigateToProject = useCallback((projectId, options = {}) => {
    setBreadcrumbBase(normalizeProjectBreadcrumbBase(options?.breadcrumbBase));
    setCurrentProjectId(projectId);
  }, []);

  const handleNavigateToBreadcrumb = useCallback((wsId, folderId) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    if (wsId !== activeWorkspaceId) {
      setActiveWorkspaceId(wsId);
    }
    setCurrentFolderId(folderId || "");
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
  }, [dismissRequestedProjectRestore, activeWorkspaceId]);

  const handleBackFromProject = useCallback((crumb) => {
    dismissRequestedProjectRestore({ clearExternal: true });
    setCurrentProjectId(null);
    setBreadcrumbBase([]);
    const target = resolveProjectBreadcrumbTarget(crumb);
    if (target) {
      setCurrentFolderId(target.folderId);
    }
  }, [dismissRequestedProjectRestore]);

  const handleWorkspaceRenamed = useCallback(async () => {
    const resp = await apiListWorkspaces();
    if (!resp?.ok) {
      throw new Error(resp?.error || "Не удалось обновить список workspaces");
    }
    const raw = resp?.data;
    const list = Array.isArray(raw) ? raw : [];
    setWorkspaces(list);
  }, []);

  return {
    currentOrgName,
    permissions,
    workspaces,
    wsLoading,
    wsError,
    activeWorkspaceId,
    currentFolderId,
    currentProjectId,
    breadcrumbBase,
    projectRestoreStatus,
    handleSelectWorkspace,
    handleCreateWorkspace,
    handleNavigateToFolder,
    handleNavigateToProject,
    handleNavigateToBreadcrumb,
    handleBackFromProject,
    handleWorkspaceRenamed,
  };
}
