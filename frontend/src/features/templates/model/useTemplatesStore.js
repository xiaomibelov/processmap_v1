import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTemplate, deleteTemplate, listTemplates } from "../api/index.js";
import { countTemplatesByScope, filterTemplatesByQuery, suggestTemplates, splitTemplatesByScope } from "./templatesSelectors.js";
import { buildTemplateFromSelection } from "../services/buildTemplateFromSelection.js";
import { buildHybridStencilTemplate } from "../services/buildHybridStencilTemplate.js";
import { buildBpmnFragmentTemplate } from "../services/buildBpmnFragmentTemplate.js";
import {
  buildBpmnFragmentGhost,
  createBpmnFragmentPlacementDraft,
  updateBpmnFragmentPlacementPointer,
} from "../services/applyBpmnFragmentTemplatePlacement.js";

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
  getSelectedHybridStencilTemplate,
  applySelectionIds,
  applyHybridStencilTemplate,
  captureBpmnFragmentTemplatePack,
  insertBpmnFragmentTemplateAtPoint,
  isDiagramClientPoint,
  diagramContainerRect,
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
  const [createType, setCreateType] = useState("bpmn_fragment_v1");
  const [createTitle, setCreateTitle] = useState("");
  const [myTemplates, setMyTemplates] = useState([]);
  const [orgTemplates, setOrgTemplates] = useState([]);
  const [fragmentPlacement, setFragmentPlacement] = useState(null);
  const [fragmentPlacementBusy, setFragmentPlacementBusy] = useState(false);
  const fragmentPlacementRef = useRef(null);
  const fragmentPlacementBusyRef = useRef(false);

  const selectedIds = typeof getSelectedBpmnElementIds === "function" ? getSelectedBpmnElementIds() : [];
  const selectedHybridStencil = typeof getSelectedHybridStencilTemplate === "function"
    ? getSelectedHybridStencilTemplate()
    : null;
  const selectedHybridCount = Number(selectedHybridStencil?.selection_count || selectedHybridStencil?.payload?.elements?.length || 0);

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

  useEffect(() => {
    fragmentPlacementRef.current = fragmentPlacement;
  }, [fragmentPlacement]);

  useEffect(() => {
    fragmentPlacementBusyRef.current = fragmentPlacementBusy;
  }, [fragmentPlacementBusy]);

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
  const fragmentPlacementGhost = useMemo(
    () => buildBpmnFragmentGhost(fragmentPlacement, diagramContainerRect),
    [diagramContainerRect, fragmentPlacement],
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
    if (!selectedIds.length && selectedHybridCount <= 0) {
      setError?.("Сначала выделите BPMN или Hybrid элементы.");
      return;
    }
    setTemplatesEnabled(true);
    setCreateTitle(defaultTemplateTitle(selectionContext, selectedIds.length || selectedHybridCount));
    setCreateType(selectedIds.length > 0 ? "bpmn_fragment_v1" : "hybrid_stencil_v1");
    const nextScope = canCreateOrgTemplate && activeScope === "org" ? "org" : "personal";
    setCreateScope(nextScope);
    setCreateOpen(true);
  }, [activeScope, canCreateOrgTemplate, hasSession, selectedHybridCount, selectedIds.length, selectionContext, setError, tab]);

  const saveCurrentSelectionAsTemplate = useCallback(async () => {
    const scope = createScope === "org" && canCreateOrgTemplate ? "org" : "personal";
    const built = createType === "hybrid_stencil_v1"
      ? buildHybridStencilTemplate(
        selectedHybridStencil?.selected_ids || [],
        selectedHybridStencil?.hybrid_doc,
        {
          title: createTitle,
          scope,
          sourceSessionId: selectionContext.sourceSessionId,
        },
      )
      : createType === "bpmn_fragment_v1"
        ? await buildBpmnFragmentTemplate(captureBpmnFragmentTemplatePack, {
          title: createTitle,
          scope,
          sourceSessionId: selectionContext.sourceSessionId,
          primaryName: selectionContext.primaryName,
          primaryElementId: selectionContext.primaryElementId,
        })
        : buildTemplateFromSelection(selectedIds, {
          title: createTitle,
          scope,
          primaryName: selectionContext.primaryName,
          primaryElementId: selectionContext.primaryElementId,
          sourceSessionId: selectionContext.sourceSessionId,
          elementTypes: selectionContext.elementTypes,
          laneNames: selectionContext.laneNames,
        });
    if (!built.ok) {
      setError?.(createType === "hybrid_stencil_v1"
        ? "Не удалось собрать stencil из текущего Hybrid выделения."
        : createType === "bpmn_fragment_v1"
          ? toText(built.warning || "Не удалось собрать BPMN-фрагмент из текущего выделения.")
        : "Не удалось собрать шаблон из текущего выделения.");
      return;
    }
    setBusy(true);
    setLastError("");
    try {
      const saved = await createTemplate({
        scope,
        userId,
        orgId,
        template: {
          ...built.template,
          template_type: toText(built?.template?.template_type || createType) || "bpmn_selection_v1",
        },
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
    createType,
    createTitle,
    orgId,
    reloadTemplates,
    selectedIds,
    selectionContext.elementTypes,
    selectionContext.laneNames,
    selectionContext.primaryElementId,
    selectionContext.primaryName,
    selectionContext.sourceSessionId,
    selectedHybridStencil?.hybrid_doc,
    selectedHybridStencil?.selected_ids,
    captureBpmnFragmentTemplatePack,
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

  const startBpmnFragmentPlacement = useCallback((templateRaw) => {
    const created = createBpmnFragmentPlacementDraft(templateRaw, { ignoreClickMs: 0 });
    if (!created.ok) return created;
    const rect = diagramContainerRect && typeof diagramContainerRect === "object" ? diagramContainerRect : {};
    const width = Number(rect.width || 0);
    const height = Number(rect.height || 0);
    const nextDraft = { ...created.draft };
    if (width > 0 && height > 0) {
      nextDraft.pointer = {
        x: Number(rect.left || 0) + Math.round(width / 2),
        y: Number(rect.top || 0) + Math.round(height / 2),
      };
    } else if (typeof window !== "undefined") {
      nextDraft.pointer = {
        x: Math.round(Number(window.innerWidth || 1280) / 2),
        y: Math.round(Number(window.innerHeight || 800) / 2),
      };
    }
    setFragmentPlacement(nextDraft);
    fragmentPlacementBusyRef.current = false;
    setFragmentPlacementBusy(false);
    return { ok: true, error: "" };
  }, [diagramContainerRect]);

  const cancelBpmnFragmentPlacement = useCallback((reason = "cancelled") => {
    setFragmentPlacement(null);
    fragmentPlacementBusyRef.current = false;
    setFragmentPlacementBusy(false);
    if (reason === "escape") setInfo?.("Режим вставки BPMN-фрагмента отменён.");
  }, [setInfo]);

  const applyTemplate = useCallback(async (template) => {
    const templateType = toText(template?.template_type || "bpmn_selection_v1");
    if (templateType === "hybrid_stencil_v1") {
      if (typeof applyHybridStencilTemplate !== "function") {
        setError?.("Hybrid placement API недоступен.");
        return;
      }
      const result = await Promise.resolve(applyHybridStencilTemplate(template));
      if (result?.ok === false) {
        setError?.(toText(result.error || "Не удалось включить режим размещения stencil."));
        return;
      }
      setPickerOpen(false);
      setInfo?.(`Placement mode: ${toText(template?.title || "Stencil")}`);
      return;
    }
    if (templateType === "bpmn_fragment_v1") {
      const result = startBpmnFragmentPlacement(template);
      if (!result?.ok) {
        setError?.(toText(result?.error || "Не удалось включить режим вставки BPMN-фрагмента."));
        return;
      }
      setPickerOpen(false);
      setInfo?.(`Placement mode: ${toText(template?.title || "BPMN fragment")}`);
      return;
    }
    if (typeof applySelectionIds !== "function") return;
    const result = await Promise.resolve(applySelectionIds(template?.bpmn_element_ids || []));
    if (result?.ok === false && toText(result?.error) !== "elements_not_found") {
      setError?.(toText(result.error || "Не удалось применить шаблон."));
      return;
    }
    const missingCount = Array.isArray(result?.missing) ? result.missing.length : 0;
    const appliedCount = Array.isArray(result?.applied) ? result.applied.length : Number(result?.count || 0);
    if (missingCount > 0) {
      setInfo?.(`Applied ${appliedCount}, missing ${missingCount}`);
      return;
    }
    setInfo?.(`Applied: ${toText(template?.title || "Template")}`);
  }, [applyHybridStencilTemplate, applySelectionIds, setError, setInfo, startBpmnFragmentPlacement]);

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

  useEffect(() => {
    if (!fragmentPlacement) return;
    if (typeof window === "undefined") return;
    let cancelled = false;

    const onPointerMove = (event) => {
      const current = fragmentPlacementRef.current;
      if (!current) return;
      setFragmentPlacement((prev) => {
        if (!prev) return prev;
        return updateBpmnFragmentPlacementPointer(prev, event?.clientX, event?.clientY);
      });
    };

    const onKeyDown = (event) => {
      if (String(event?.key || "").toLowerCase() !== "escape") return;
      event.preventDefault();
      cancelBpmnFragmentPlacement("escape");
    };

    const onPointerDown = async (event) => {
      if (cancelled) return;
      if (Number(event?.button || 0) !== 0) return;
      const target = event?.target;
      if (target instanceof Element) {
        if (target.closest("[data-testid='templates-picker']")) return;
        if (target.closest("[data-testid='modal-create-template']")) return;
        if (target.closest(".modalCard")) return;
      }
      const current = fragmentPlacementRef.current;
      if (!current || fragmentPlacementBusyRef.current) return;
      const now = Date.now();
      if (now < Number(current.ignoreClickUntil || 0)) return;
      const clientX = Number(event?.clientX);
      const clientY = Number(event?.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      if (typeof insertBpmnFragmentTemplateAtPoint !== "function") {
        setError?.("BPMN insert API недоступен.");
        return;
      }
      event.preventDefault();
      fragmentPlacementBusyRef.current = true;
      setFragmentPlacementBusy(true);
      const inserted = await Promise.resolve(
        insertBpmnFragmentTemplateAtPoint(current, {
          clientX,
          clientY,
          mode: "after",
        }),
      );
      if (typeof window !== "undefined" && window.__FPC_E2E__) {
        window.__FPC_E2E_TEMPLATE_FRAGMENT_INSERT__ = {
          ok: !!inserted?.ok,
          error: toText(inserted?.error || ""),
          createdNodes: Number(inserted?.createdNodes || 0),
          createdEdges: Number(inserted?.createdEdges || 0),
          at: Date.now(),
        };
      }
      if (cancelled) return;
      if (!inserted?.ok) {
        fragmentPlacementBusyRef.current = false;
        setFragmentPlacementBusy(false);
        setError?.(toText(inserted?.error || "Не удалось вставить BPMN-фрагмент."));
        return;
      }
      const createdNodes = Number(inserted?.createdNodes || 0);
      const createdEdges = Number(inserted?.createdEdges || 0);
      fragmentPlacementBusyRef.current = false;
      setFragmentPlacementBusy(false);
      setFragmentPlacement(null);
      setInfo?.(`Inserted: ${createdNodes} nodes, ${createdEdges} flows.`);
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelled = true;
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    cancelBpmnFragmentPlacement,
    fragmentPlacement,
    insertBpmnFragmentTemplateAtPoint,
    setError,
    setInfo,
  ]);

  return {
    templatesEnabled,
    setTemplatesEnabled,
    pickerOpen,
    setPickerOpen,
    createOpen,
    setCreateOpen,
    busy: busy || loading || fragmentPlacementBusy,
    loading,
    lastError,
    search,
    setSearch,
    activeScope,
    setActiveScope,
    createScope,
    setCreateScope,
    createType,
    setCreateType,
    createTitle,
    setCreateTitle,
    selectedIds,
    selectedHybridCount,
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
    bpmnFragmentPlacementGhost: fragmentPlacementGhost,
    bpmnFragmentPlacementActive: !!fragmentPlacement,
    bpmnFragmentPlacementBusy: fragmentPlacementBusy,
    cancelBpmnFragmentPlacement,
  };
}
