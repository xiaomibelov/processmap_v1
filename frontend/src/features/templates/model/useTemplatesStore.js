import { useCallback, useEffect, useMemo, useState } from "react";
import { createTemplate, deleteTemplate, listTemplates } from "../api/index.js";
import { countTemplatesByScope, filterTemplatesByQuery, suggestTemplates, splitTemplatesByScope } from "./templatesSelectors.js";
import { buildTemplateFromSelection } from "../services/buildTemplateFromSelection.js";

function toText(value) {
  return String(value || "").trim();
}

const TEMPLATES_ENABLED_KEY = "fpc_templates_mode";

function readTemplatesEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(TEMPLATES_ENABLED_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function writeTemplatesEnabled(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(TEMPLATES_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function defaultTemplateTitle(selectionContext = {}, selectionCount = 0) {
  const primaryName = toText(selectionContext.primaryName);
  if (primaryName) return `Шаблон: ${primaryName}`;
  return `Шаблон ${Math.max(1, Number(selectionCount || 0))}`;
}

export async function loadTemplatesForScopes({
  userId = "",
  orgId = "",
  listFn = listTemplates,
}) {
  const myTemplates = await listFn({ scope: "personal", userId, orgId: "" });
  const orgTemplates = orgId ? await listFn({ scope: "org", userId, orgId }) : [];
  return {
    myTemplates: Array.isArray(myTemplates) ? myTemplates : [],
    orgTemplates: Array.isArray(orgTemplates) ? orgTemplates : [],
  };
}

export default function useTemplatesStore({
  userId = "",
  orgId = "",
  canCreateOrgTemplate = false,
  hasSession = false,
  tab = "",
  getSelectedBpmnElementIds,
  applySelectionIds,
  selectionContext = {},
  setError,
  setInfo,
}) {
  const [templatesEnabled, setTemplatesEnabled] = useState(() => readTemplatesEnabled());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState("");
  const [search, setSearch] = useState("");
  const [activeScope, setActiveScope] = useState("personal");
  const [createScope, setCreateScope] = useState("personal");
  const [createTitle, setCreateTitle] = useState("");
  const [myTemplates, setMyTemplates] = useState([]);
  const [orgTemplates, setOrgTemplates] = useState([]);

  const selectedIds = typeof getSelectedBpmnElementIds === "function" ? getSelectedBpmnElementIds() : [];

  const loadMy = useCallback(async () => {
    const items = await listTemplates({ scope: "personal", userId, orgId: "" });
    setMyTemplates(Array.isArray(items) ? items : []);
    return Array.isArray(items) ? items : [];
  }, [userId]);

  const loadOrg = useCallback(async () => {
    if (!orgId) {
      setOrgTemplates([]);
      return [];
    }
    const items = await listTemplates({ scope: "org", userId, orgId });
    setOrgTemplates(Array.isArray(items) ? items : []);
    return Array.isArray(items) ? items : [];
  }, [orgId, userId]);

  const reloadTemplates = useCallback(async () => {
    setLoading(true);
    setLastError("");
    try {
      const loaded = await loadTemplatesForScopes({
        userId,
        orgId,
        listFn: listTemplates,
      });
      setMyTemplates(loaded.myTemplates);
      setOrgTemplates(loaded.orgTemplates);
      return loaded;
    } catch (error) {
      const message = toText(error?.message || error || "template_list_failed");
      setLastError(message);
      setError?.(message);
      return { myTemplates: [], orgTemplates: [] };
    } finally {
      setLoading(false);
    }
  }, [orgId, setError, userId]);

  useEffect(() => {
    writeTemplatesEnabled(templatesEnabled);
  }, [templatesEnabled]);

  useEffect(() => {
    if (!templatesEnabled) return;
    void reloadTemplates();
  }, [reloadTemplates, templatesEnabled]);

  const templates = useMemo(() => [...myTemplates, ...orgTemplates], [myTemplates, orgTemplates]);
  const byScope = useMemo(() => splitTemplatesByScope(templates), [templates]);
  const counts = useMemo(() => countTemplatesByScope(templates), [templates]);
  const scopedTemplates = useMemo(
    () => filterTemplatesByQuery(activeScope === "org" ? byScope.org : byScope.personal, search),
    [activeScope, byScope.org, byScope.personal, search],
  );
  const suggestedTemplates = useMemo(
    () => suggestTemplates(templates, selectionContext),
    [selectionContext, templates],
  );

  const openTemplatesPicker = useCallback(async () => {
    setTemplatesEnabled(true);
    await reloadTemplates();
    setPickerOpen(true);
  }, [reloadTemplates]);

  const openCreateTemplateModal = useCallback(() => {
    if (!hasSession || tab !== "diagram") {
      setError?.("Откройте Diagram и выделите BPMN элементы для шаблона.");
      return;
    }
    if (!selectedIds.length) {
      setError?.("Сначала выделите BPMN элементы.");
      return;
    }
    setTemplatesEnabled(true);
    setCreateTitle(defaultTemplateTitle(selectionContext, selectedIds.length));
    const nextScope = canCreateOrgTemplate && activeScope === "org" ? "org" : "personal";
    setCreateScope(nextScope);
    setCreateOpen(true);
  }, [activeScope, canCreateOrgTemplate, hasSession, selectedIds.length, selectionContext, setError, tab]);

  const saveCurrentSelectionAsTemplate = useCallback(async () => {
    const scope = createScope === "org" && canCreateOrgTemplate ? "org" : "personal";
    const built = buildTemplateFromSelection(selectedIds, {
      title: createTitle,
      scope,
      primaryName: selectionContext.primaryName,
      primaryElementId: selectionContext.primaryElementId,
      sourceSessionId: selectionContext.sourceSessionId,
      elementTypes: selectionContext.elementTypes,
      laneNames: selectionContext.laneNames,
    });
    if (!built.ok) {
      setError?.("Не удалось собрать шаблон из текущего выделения.");
      return;
    }
    setBusy(true);
    setLastError("");
    try {
      const saved = await createTemplate({
        scope,
        userId,
        orgId,
        template: built.template,
      });
      if (!saved?.ok) {
        const message = toText(saved?.error || "Не удалось сохранить шаблон.");
        setLastError(message);
        setError?.(message);
        return;
      }
      await reloadTemplates();
      setCreateOpen(false);
      setInfo?.(`Saved: ${toText(saved?.item?.title || built.template.title)}`);
    } finally {
      setBusy(false);
    }
  }, [
    canCreateOrgTemplate,
    createScope,
    createTitle,
    orgId,
    reloadTemplates,
    selectedIds,
    selectionContext.elementTypes,
    selectionContext.laneNames,
    selectionContext.primaryElementId,
    selectionContext.primaryName,
    selectionContext.sourceSessionId,
    setError,
    setInfo,
    userId,
  ]);

  const createPersonalTemplate = useCallback(async (template) => {
    return await createTemplate({
      scope: "personal",
      userId,
      orgId: "",
      template,
    });
  }, [userId]);

  const createOrgTemplate = useCallback(async (template) => {
    if (!canCreateOrgTemplate || !orgId) return { ok: false, status: 403, error: "insufficient_permissions" };
    return await createTemplate({
      scope: "org",
      userId,
      orgId,
      template,
    });
  }, [canCreateOrgTemplate, orgId, userId]);

  const applyTemplate = useCallback(async (template) => {
    if (typeof applySelectionIds !== "function") return;
    const result = await Promise.resolve(applySelectionIds(template?.bpmn_element_ids || []));
    if (result?.ok === false) {
      setError?.(toText(result.error || "Не удалось применить шаблон."));
      return;
    }
    const missingCount = Array.isArray(result?.missing) ? result.missing.length : 0;
    const appliedCount = Array.isArray(result?.applied) ? result.applied.length : Number(result?.count || 0);
    if (missingCount > 0) {
      setError?.(`Applied ${appliedCount}, missing ${missingCount}`);
      return;
    }
    setInfo?.(`Applied: ${toText(template?.title || "Template")}`);
  }, [applySelectionIds, setError, setInfo]);

  const removeTemplate = useCallback(async (template) => {
    const item = template && typeof template === "object" ? template : {};
    if (!item.id) return;
    if (item.can_delete === false) {
      setError?.("Недостаточно прав для удаления шаблона.");
      return;
    }
    const ok = typeof window === "undefined" || window.confirm(`Удалить шаблон «${toText(item.title || item.id)}»?`);
    if (!ok) return;
    setBusy(true);
    setLastError("");
    try {
      const removed = await deleteTemplate({
        scope: toText(item.scope || "personal"),
        userId,
        orgId,
        templateId: item.id,
      });
      if (!removed?.ok) {
        const message = toText(removed?.error || "Не удалось удалить шаблон.");
        setLastError(message);
        setError?.(message);
        return;
      }
      await reloadTemplates();
    } finally {
      setBusy(false);
    }
  }, [orgId, reloadTemplates, setError, userId]);

  return {
    templatesEnabled,
    setTemplatesEnabled,
    pickerOpen,
    setPickerOpen,
    createOpen,
    setCreateOpen,
    busy: busy || loading,
    loading,
    lastError,
    search,
    setSearch,
    activeScope,
    setActiveScope,
    createScope,
    setCreateScope,
    createTitle,
    setCreateTitle,
    selectedIds,
    myTemplates,
    orgTemplates,
    scopedTemplates,
    suggestedTemplates,
    counts,
    loadMy,
    loadOrg,
    createPersonalTemplate,
    createOrgTemplate,
    openTemplatesPicker,
    openCreateTemplateModal,
    saveCurrentSelectionAsTemplate,
    reloadTemplates,
    applyTemplate,
    removeTemplate,
  };
}
