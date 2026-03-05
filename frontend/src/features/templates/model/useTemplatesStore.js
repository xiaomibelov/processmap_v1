import { useCallback, useEffect, useMemo, useState } from "react";
import { createTemplate, deleteTemplate, listTemplates } from "../api/index.js";
import { countTemplatesByScope, filterTemplatesByQuery, suggestTemplates, splitTemplatesByScope } from "./templatesSelectors";
import { buildTemplateFromSelection } from "../services/buildTemplateFromSelection";

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
  const [search, setSearch] = useState("");
  const [activeScope, setActiveScope] = useState("personal");
  const [createScope, setCreateScope] = useState("personal");
  const [createTitle, setCreateTitle] = useState("");
  const [templates, setTemplates] = useState([]);

  const selectedIds = typeof getSelectedBpmnElementIds === "function" ? getSelectedBpmnElementIds() : [];

  const reloadTemplates = useCallback(async () => {
    const personal = await listTemplates({ scope: "personal", userId });
    const org = await listTemplates({ scope: "org", orgId });
    setTemplates([...personal, ...org]);
    return { personal, org };
  }, [orgId, userId]);

  useEffect(() => {
    writeTemplatesEnabled(templatesEnabled);
  }, [templatesEnabled]);

  useEffect(() => {
    if (!templatesEnabled) return;
    void reloadTemplates();
  }, [reloadTemplates, templatesEnabled]);

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
    setBusy(true);
    try {
      await reloadTemplates();
      setPickerOpen(true);
    } finally {
      setBusy(false);
    }
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
    setCreateScope(canCreateOrgTemplate ? activeScope : "personal");
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
    try {
      const saved = await createTemplate({
        scope,
        userId,
        orgId,
        template: built.template,
      });
      if (!saved?.ok) {
        setError?.("Не удалось сохранить шаблон.");
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
    const scope = toText(item.scope || "personal");
    if (!item.id) return;
    const ok = typeof window === "undefined" || window.confirm(`Удалить шаблон «${toText(item.title || item.id)}»?`);
    if (!ok) return;
    setBusy(true);
    try {
      const removed = await deleteTemplate({
        scope,
        userId,
        orgId,
        templateId: item.id,
      });
      if (!removed?.ok) {
        setError?.("Не удалось удалить шаблон.");
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
    busy,
    search,
    setSearch,
    activeScope,
    setActiveScope,
    createScope,
    setCreateScope,
    createTitle,
    setCreateTitle,
    selectedIds,
    scopedTemplates,
    suggestedTemplates,
    counts,
    openTemplatesPicker,
    openCreateTemplateModal,
    saveCurrentSelectionAsTemplate,
    reloadTemplates,
    applyTemplate,
    removeTemplate,
  };
}
