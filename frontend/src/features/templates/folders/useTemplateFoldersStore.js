import { useCallback, useState } from "react";
import { createFolder, listFoldersWithStatus } from "./api.js";
import { runGuardedLoader } from "../../auth/authGatedLoader.js";

function toText(value) {
  return String(value || "").trim();
}

export default function useTemplateFoldersStore({
  userId = "",
  orgId = "",
  canCreateOrgFolder = false,
  authLoaderGate = null,
  setError,
} = {}) {
  const [foldersMy, setFoldersMy] = useState([]);
  const [foldersOrg, setFoldersOrg] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState("");

  const loadFolders = useCallback(async (scopeRaw = "personal") => {
    const scope = toText(scopeRaw).toLowerCase() === "org" ? "org" : "personal";
    if (scope === "org" && !orgId) {
      setFoldersOrg([]);
      return [];
    }
    const guarded = await runGuardedLoader({
      gate: authLoaderGate,
      scope: `template_folders:${scope}`,
      run: () => listFoldersWithStatus({
        scope,
        userId,
        orgId: scope === "org" ? orgId : "",
      }),
    });
    if (guarded.state === "skipped_auth_not_ready") {
      if (scope === "org") setFoldersOrg([]);
      else setFoldersMy([]);
      return [];
    }
    if (!guarded.ok) {
      const message = guarded.state === "unauthorized"
        ? "Требуется повторная авторизация для загрузки папок шаблонов."
        : toText(guarded.error || "template_folders_load_failed");
      setFoldersError(message);
      setError?.(message);
      if (scope === "org") setFoldersOrg([]);
      else setFoldersMy([]);
      return [];
    }
    const items = Array.isArray(guarded?.data?.items) ? guarded.data.items : [];
    const normalized = Array.isArray(items) ? items : [];
    if (scope === "org") setFoldersOrg(normalized);
    else setFoldersMy(normalized);
    return normalized;
  }, [authLoaderGate, orgId, setError, userId]);

  const reloadAllFolders = useCallback(async () => {
    setFoldersLoading(true);
    setFoldersError("");
    try {
      const personal = await loadFolders("personal");
      const org = orgId ? await loadFolders("org") : [];
      return { personal, org };
    } catch (error) {
      const message = toText(error?.message || error || "template_folders_load_failed");
      setFoldersError(message);
      setError?.(message);
      return { personal: [], org: [] };
    } finally {
      setFoldersLoading(false);
    }
  }, [loadFolders, orgId, setError]);

  const createFolderForScope = useCallback(async ({
    scope: scopeRaw = "personal",
    name = "",
    parentId = "",
    sortOrder = 0,
  } = {}) => {
    const scope = toText(scopeRaw).toLowerCase() === "org" ? "org" : "personal";
    if (scope === "org" && (!canCreateOrgFolder || !orgId)) {
      const blocked = { ok: false, status: 403, error: "insufficient_permissions" };
      setFoldersError(toText(blocked.error));
      return blocked;
    }
    const created = await createFolder({
      scope,
      orgId: scope === "org" ? orgId : "",
      name,
      parentId,
      sortOrder,
    });
    if (!created?.ok) {
      const message = toText(created?.error || "template_folder_create_failed");
      setFoldersError(message);
      setError?.(message);
      return created;
    }
    await loadFolders(scope);
    return created;
  }, [canCreateOrgFolder, loadFolders, orgId, setError]);

  return {
    foldersMy,
    foldersOrg,
    foldersLoading,
    foldersError,
    loadFolders,
    reloadAllFolders,
    createFolderForScope,
  };
}
