import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "../../../lib/apiCore";
import { t, tf } from "../i18n";
import WorkflowBar from "../workflow/WorkflowBar";
import GraphCanvas from "../graph/GraphCanvas";
import CheckPanel from "./CheckPanel";
import {
  DICTIONARY_BY_CATEGORY,
  ENTITY_CATEGORIES,
  ENTITY_CATEGORY_LABELS,
  GATEWAY_CONDITION_UNKNOWN_OUTPUT,
  addFlow,
  addNode,
  asArray,
  asObject,
  computeReachable,
  deleteFlow,
  deleteNode,
  duplicateNode,
  emptyUiModel,
  findFlow,
  findNode,
  findRefUsages,
  gatewayConditionError,
  getEntityEntry,
  listDeclaredRefs,
  listEntityRefs,
  mergeDraftEntities,
  missingRequiredParams,
  nextId,
  normalizeUiModel,
  precedingTaskOutputs,
  removeEntity,
  renameEntityRef,
  updateFlow,
  updateNode,
  upsertEntity,
} from "./modelUtils";
import "./Constructor.css";
import { BlockForm, FlowForm, EntitiesPanel, TemplatePanel } from "./panels";

export const E4_HANDOFF_KEY = "fpc_e4_handoff";

const STRUCTURAL_BLOCKS = [
  { bpmn_type: "exclusiveGateway", label: "Развилка «исключающая»", prefix: "Gateway", width: 60, height: 60 },
  { bpmn_type: "parallelGateway", label: "Развилка «параллельная»", prefix: "Gateway", width: 60, height: 60 },
  { bpmn_type: "startEvent", label: "Событие «старт»", prefix: "StartEvent", width: 40, height: 40 },
  { bpmn_type: "endEvent", label: "Событие «завершение»", prefix: "EndEvent", width: 40, height: 40 },
  { bpmn_type: "intermediateCatchEvent", label: "Событие «промежуточное»", prefix: "IntermediateEvent", width: 40, height: 40 },
];

function readQuery() {
  if (typeof window === "undefined") return new URLSearchParams("");
  return new URLSearchParams(window.location.search || "");
}

function nextNodePosition(model) {
  const nodes = asArray(model?.nodes);
  if (nodes.length === 0) return { x: 80, y: 120 };
  const maxX = Math.max(...nodes.map((n) => (Number(n?.x) || 0) + (Number(n?.width) || 100)));
  return { x: maxX + 60, y: 120 };
}

function nodeLabel(node) {
  return String(node?.display_name || node?.name || node?.id || "");
}

// ---------- Block (task) edit form ------------------------------------------

export function Constructor() {
  const [uiModel, setUiModel] = useState(() => emptyUiModel());
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("Новый шаблон");
  const [templateVersion, setTemplateVersion] = useState("0.1.0");
  const [templateStatus, setTemplateStatus] = useState("draft");
  const [catalog, setCatalog] = useState([]);
  const [opDetails, setOpDetails] = useState({});
  const [dicts, setDicts] = useState({ containers: [], equipment: [], zones: [] });
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [panelTab, setPanelTab] = useState("template");
  const [connectArmed, setConnectArmed] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState("");
  const [unreachableIds, setUnreachableIds] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [openList, setOpenList] = useState(null); // null | "loading" | array
  const [renameConfirm, setRenameConfirm] = useState(null); // {category, oldRef, newRef, usages}
  const [deleteBlocked, setDeleteBlocked] = useState(null); // {category, ref, usages}
  // E6.5: панель «Проверить» (dry-run + pre-check по кухням)
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [validation, setValidation] = useState(null); // {summary, findings}
  const [kitchens, setKitchens] = useState([]);
  const [selectedKitchenIds, setSelectedKitchenIds] = useState([]);
  const [precheckMode, setPrecheckMode] = useState("warning"); // default = warning (locked)
  const [precheck, setPrecheck] = useState(null);
  // E7: publish & версии
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishResult, setPublishResult] = useState(null); // {ok:true, version, warningsCount} | {ok:false, message, findings}
  const [templateVersions, setTemplateVersions] = useState([]);
  const nodeRefs = useRef({});

  // initial load: catalog + dictionaries, then bootstrap from query/handoff
  useEffect(() => {
    let canceled = false;

    async function loadTemplate(id) {
      const r = await apiRequest(`/api/process-templates/${encodeURIComponent(id)}`);
      if (canceled) return;
      if (r?.ok && r.data) {
        const data = r.data;
        setTemplateId(String(data.id || id));
        setTemplateName(String(data.name || "Шаблон"));
        setTemplateVersion(String(data.version || "0.1.0"));
        setTemplateStatus(String(data.status || "draft"));
        setUiModel(normalizeUiModel(data.ui_model));
      } else {
        setError(`Не удалось загрузить шаблон: ${String(r?.error || "ошибка")}`);
      }
    }

    function loadHandoff() {
      try {
        const raw = window.sessionStorage?.getItem(E4_HANDOFF_KEY);
        if (!raw) return false;
        window.sessionStorage?.removeItem(E4_HANDOFF_KEY);
        const payload = JSON.parse(raw);
        const model = mergeDraftEntities(normalizeUiModel(payload?.ui_model), payload?.draft_entities);
        setUiModel(model);
        setTemplateId("");
        setTemplateName("Импортированный шаблон");
        setTemplateVersion("0.1.0");
        setTemplateStatus("draft");
        setNotice(t("ctor.handoffLoaded"));
        return true;
      } catch {
        return false;
      }
    }

    async function bootstrap() {
      const query = readQuery();
      const templateParam = String(query.get("template") || "").trim();
      const fromValue = String(query.get("from") || "").trim();
      const fromHandoff = fromValue === "import" || fromValue === "transform"; // E3/E3.5 handoff
      if (templateParam) {
        await loadTemplate(templateParam);
      } else if (fromHandoff) {
        loadHandoff();
      }
      // UX1/U1.3: ?check=1 — авто-запуск «Проверить» после загрузки
      if (String(query.get("check") || "") === "1") {
        setTimeout(() => { void handleCheckRef.current?.(); }, 600);
      }
    }

    apiRequest("/api/operation-catalog")
      .then((r) => {
        if (!canceled) setCatalog(r?.ok && Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {});
    ENTITY_CATEGORIES.forEach((category) => {
      apiRequest(`/api/dictionaries/${DICTIONARY_BY_CATEGORY[category]}`)
        .then((r) => {
          if (canceled) return;
          const items = r?.ok && Array.isArray(r.data) ? r.data : [];
          setDicts((prev) => ({ ...prev, [category]: items }));
        })
        .catch(() => {});
    });
    void bootstrap();
    return () => {
      canceled = true;
    };
  }, []);

  // lazy-load operation detail for selected task node
  const selectedNode = useMemo(() => findNode(uiModel, selectedNodeId), [uiModel, selectedNodeId]);
  const selectedFlow = useMemo(() => findFlow(uiModel, selectedFlowId), [uiModel, selectedFlowId]);

  useEffect(() => {
    const code = String(selectedNode?.operation_code || "").trim();
    if (!code || opDetails[code] !== undefined) return;
    let canceled = false;
    apiRequest(`/api/operation-catalog/${encodeURIComponent(code)}`)
      .then((r) => {
        if (canceled) return;
        setOpDetails((prev) => ({ ...prev, [code]: r?.ok ? r.data : null }));
      })
      .catch(() => {
        if (!canceled) setOpDetails((prev) => ({ ...prev, [code]: null }));
      });
    return () => {
      canceled = true;
    };
  }, [selectedNode, opDetails]);

  const declaredRefs = useMemo(() => listDeclaredRefs(uiModel), [uiModel]);
  const recipeKeys = useMemo(() => Object.keys(asObject(uiModel.recipe_context)), [uiModel]);

  // E7: версии шаблона — подгружаем при смене templateId
  const loadVersions = useCallback(async (idOverride) => {
    const tid = String(idOverride || templateId || "").trim();
    if (!tid) {
      setTemplateVersions([]);
      return;
    }
    const r = await apiRequest(`/api/process-templates/${encodeURIComponent(tid)}/versions`);
    setTemplateVersions(r?.ok && Array.isArray(r.data) ? r.data : []);
  }, [templateId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  // ---- canvas interactions ----

  function handleSelectNode(id) {
    if (connectArmed) {
      if (!connectSourceId) {
        setConnectSourceId(id);
        return;
      }
      if (connectSourceId !== id) {
        const { model, flow } = addFlow(uiModel, connectSourceId, id);
        setUiModel(model);
        setConnectArmed(false);
        setConnectSourceId("");
        setSelectedFlowId(flow.id);
        setSelectedNodeId("");
        setPanelTab("flow");
      }
      return;
    }
    setSelectedNodeId(id);
    setSelectedFlowId("");
    setPanelTab("block");
  }

  function handleSelectFlow(id) {
    if (connectArmed) return;
    setSelectedFlowId(id);
    setSelectedNodeId("");
    setPanelTab("flow");
  }

  function handleNodeMove(id, x, y) {
    setUiModel((prev) => updateNode(prev, id, { x, y }));
  }

  function handleAddOperation(op) {
    const pos = nextNodePosition(uiModel);
    const node = {
      id: nextId(uiModel, "Task"),
      bpmn_type: "task",
      name: String(op?.name_ru || op?.name || op?.code || ""),
      operation_code: String(op?.code || ""),
      // display_name — на языке UI (name_ru), переименовывается в блоке
      display_name: String(op?.name_ru || op?.name || op?.code || ""),
      params: {},
      outputs: {},
      recipe_params: [],
      x: pos.x,
      y: pos.y,
      width: 140,
      height: 70,
    };
    setUiModel((prev) => addNode(prev, node));
    setSelectedNodeId(node.id);
    setSelectedFlowId("");
    setPanelTab("block");
  }

  function handleAddStructural(spec) {
    const pos = nextNodePosition(uiModel);
    const node = {
      id: nextId(uiModel, spec.prefix),
      bpmn_type: spec.bpmn_type,
      name: spec.label,
      display_name: "",
      params: {},
      outputs: {},
      recipe_params: [],
      x: pos.x,
      y: pos.y,
      width: spec.width,
      height: spec.height,
    };
    setUiModel((prev) => addNode(prev, node));
    setSelectedNodeId(node.id);
    setSelectedFlowId("");
    setPanelTab("block");
  }

  function handleDeleteNode(id) {
    setUiModel((prev) => deleteNode(prev, id));
    if (selectedNodeId === id) setSelectedNodeId("");
    setPanelTab("template");
  }

  // T3#2 — дублирование блока (без потоков, смещение x/y; см. modelUtils.duplicateNode)
  function handleDuplicateNode(id) {
    const { model, node } = duplicateNode(uiModel, id, { nameSuffix: t("ctor.copySuffix") });
    if (!node) return;
    setUiModel(model);
    setSelectedNodeId(node.id);
    setSelectedFlowId("");
    setPanelTab("block");
    setNotice(tf("ctor.blockDuplicated", { name: nodeLabel(node) }));
  }

  function handleDeleteFlow(id) {
    setUiModel((prev) => deleteFlow(prev, id));
    if (selectedFlowId === id) setSelectedFlowId("");
    setPanelTab("template");
  }

  // ---- toolbar ----

  function handleNew() {
    setUiModel(emptyUiModel());
    setTemplateId("");
    setTemplateName("Новый шаблон");
    setTemplateVersion("0.1.0");
    setTemplateStatus("draft");
    setSelectedNodeId("");
    setSelectedFlowId("");
    setUnreachableIds([]);
    setNotice("");
    setError("");
    setPanelTab("template");
  }

  function handleClone() {
    setTemplateId("");
    setTemplateName((prev) => `${prev} (копия)`);
    setTemplateStatus("draft");
    setNotice(t("ctor.templateCloned"));
  }

  async function handleSave() {
    if (saveBusy) return;
    setSaveBusy(true);
    setError("");
    setNotice("");
    try {
      if (!templateId) {
        const r = await apiRequest("/api/process-templates", {
          method: "POST",
          body: {
            name: templateName,
            version: templateVersion,
            status: "draft",
            ui_model: uiModel,
            created_by: "",
          },
        });
        if (r?.ok) {
          const data = asObject(r.data);
          setTemplateId(String(data.id || ""));
          setTemplateStatus("draft");
          setNotice(tf("ctor.savedDraft", { version: templateVersion }));
          setJustSaved(true);
        } else {
          setError(`Ошибка сохранения: ${String(r?.error || "unknown")}`);
        }
      } else {
        const r = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}`, {
          method: "PUT",
          body: {
            name: templateName,
            version: templateVersion,
            status: templateStatus || "draft",
            ui_model: uiModel,
          },
        });
        if (r?.ok) {
          setNotice(tf("ctor.savedDraft", { version: templateVersion }));
          setJustSaved(true);
        } else {
          setError(`Ошибка сохранения: ${String(r?.error || "unknown")}`);
        }
      }
    } catch (err) {
      setError(`Ошибка сохранения: ${String(err?.message || err)}`);
    } finally {
      setSaveBusy(false);
    }
  }

  // ---- E7: publish & версии ----

  async function handlePublish() {
    if (!templateId || publishBusy) return;
    setPublishBusy(true);
    setError("");
    setNotice("");
    setPublishResult(null);
    try {
      // сначала сохраняем черновик — публикуется сохранённая модель
      const sr = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}`, {
        method: "PUT",
        body: { name: templateName, version: templateVersion, status: templateStatus || "draft", ui_model: uiModel },
      });
      if (!sr?.ok) {
        setError(`Ошибка сохранения перед публикацией: ${String(sr?.error || "unknown")}`);
        return;
      }
      const r = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}/publish`, {
        method: "POST",
        body: { bump: "patch", mode: "warning", target_kitchen_ids: [] },
      });
      if (r?.ok) {
        const data = asObject(r.data);
        const version = String(data.version || "");
        const warningsCount = Number(data.warnings_count || 0);
        setTemplateStatus("published");
        if (version) setTemplateVersion(version);
        setPublishResult({ ok: true, version, warningsCount });
        setNotice(
          warningsCount > 0
            ? tf("ctor.publishedWithWarnings", { version: version || "?", count: warningsCount })
            : tf("ctor.published", { version: version || "?" }),
        );
        await loadVersions();
      } else {
        const detail = asObject(r?.data?.detail);
        setPublishResult({
          ok: false,
          stage: String(detail.stage || ""),
          message: String(detail.message || r?.error || "publish failed"),
          findings: Array.isArray(detail.findings) ? detail.findings : [],
          precheck: detail.precheck || null,
        });
      }
    } catch (err) {
      setError(`Ошибка публикации: ${String(err?.message || err)}`);
    } finally {
      setPublishBusy(false);
    }
  }

  async function handleNewDraft() {
    if (!templateId) return;
    setError("");
    const r = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}/new-draft`, {
      method: "POST",
    });
    if (r?.ok) {
      const data = asObject(r.data);
      setTemplateStatus("draft");
      setTemplateVersion(String(data.version || templateVersion));
      setNotice(tf("ctor.newDraftCreated", { version: String(data.version || "?") }));
      await loadVersions();
    } else {
      setError(`Не удалось создать черновик: ${String(r?.error || "unknown")}`);
    }
  }

  async function handleDownloadBpmn(versionOverride) {
    const version = String(versionOverride || templateVersion || "").trim();
    if (!templateId || !version) return;
    const r = await apiRequest(
      `/api/process-templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(version)}/bpmn`,
      { responseType: "blob" },
    );
    if (r?.ok && r.data) {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${templateName || "process_template"}_v${version}.bpmn`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      setError(`Не удалось скачать BPMN v${version}: ${String(r?.error || "unknown")}`);
    }
  }

  async function handleOpenList() {
    setOpenList("loading");
    const r = await apiRequest("/api/process-templates");
    if (r?.ok && Array.isArray(r.data)) {
      const drafts = r.data.filter((t) => String(t?.status || "") === "draft");
      setOpenList(drafts.length > 0 ? drafts : r.data);
    } else {
      setOpenList(null);
      setError(`Не удалось загрузить список шаблонов: ${String(r?.error || "unknown")}`);
    }
  }

  async function handleOpenTemplate(id) {
    setOpenList(null);
    const r = await apiRequest(`/api/process-templates/${encodeURIComponent(id)}`);
    if (r?.ok && r.data) {
      const data = r.data;
      setTemplateId(String(data.id || id));
      setTemplateName(String(data.name || "Шаблон"));
      setTemplateVersion(String(data.version || "0.1.0"));
      setTemplateStatus(String(data.status || "draft"));
      setUiModel(normalizeUiModel(data.ui_model));
      setSelectedNodeId("");
      setSelectedFlowId("");
      setUnreachableIds([]);
      setPanelTab("template");
      setNotice(`Открыт шаблон «${String(data.name || id)}»`);
    } else {
      setError(`Не удалось открыть шаблон: ${String(r?.error || "unknown")}`);
    }
  }

  const handleCheckRef = useRef(null);
  // ---- E6.5: «Проверить» = dry-run validate + feasibility pre-check ----

  async function runPrecheck(kitchenIds, mode, model) {
    const r = await apiRequest("/api/process-templates/precheck", {
      method: "POST",
      body: { ui_model: model, kitchen_ids: kitchenIds, mode },
    });
    if (r?.ok) {
      setPrecheck(r.data);
    } else {
      setError(`Ошибка pre-check: ${String(r?.error || "unknown")}`);
    }
  }

  async function handleCheck() {
    // локальная подсветка недостижимых (та же семантика корней, что и R6 на
    // сервере; ⚠ известное дублирование — см. docs/e6/rules_coverage.md)
    const { unreachable } = computeReachable(uiModel);
    setUnreachableIds(unreachable);
    setCheckOpen(true);
    setCheckBusy(true);
    setError("");
    try {
      // (а) dry-run валидация текущего черновика (body-variant, без сохранения)
      const r = await apiRequest("/api/process-templates/validate", {
        method: "POST",
        body: { ui_model: uiModel },
      });
      if (r?.ok) {
        setValidation(r.data);
      } else {
        setError(`Ошибка валидации: ${String(r?.error || "unknown")}`);
      }
      // (б) pre-check: загрузить кухни, по умолчанию выбраны все
      let kitchenIds = selectedKitchenIds;
      const kr = await apiRequest("/api/kitchens");
      if (kr?.ok && Array.isArray(kr.data)) {
        setKitchens(kr.data);
        if (kitchenIds.length === 0) {
          kitchenIds = kr.data.map((k) => String(k?.id || "")).filter(Boolean);
          setSelectedKitchenIds(kitchenIds);
        }
      }
      if (kitchenIds.length > 0) {
        await runPrecheck(kitchenIds, precheckMode, uiModel);
      }
      if (unreachable.length > 0) {
        const names = unreachable.map((id) => nodeLabel(findNode(uiModel, id)) || id).join(", ");
        setNotice(tf("ctor.unreachable", { names }));
      }
    } finally {
      setCheckBusy(false);
    }
  }

  handleCheckRef.current = handleCheck;

  function handleToggleKitchen(id) {
    setSelectedKitchenIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleRunPrecheck() {
    setCheckBusy(true);
    try {
      await runPrecheck(selectedKitchenIds, precheckMode, uiModel);
    } finally {
      setCheckBusy(false);
    }
  }

  function handleFindingNavigate(elementId) {
    const id = String(elementId || "").trim();
    if (!id) return;
    if (findNode(uiModel, id)) {
      setSelectedNodeId(id);
      setSelectedFlowId("");
      const el = nodeRefs.current[id];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    } else if (findFlow(uiModel, id)) {
      setSelectedFlowId(id);
      setSelectedNodeId("");
    }
  }

  // ---- entities dialogs ----

  function handleRenameConfirm() {
    if (!renameConfirm) return;
    setUiModel((prev) =>
      renameEntityRef(prev, renameConfirm.category, renameConfirm.oldRef, renameConfirm.newRef),
    );
    setRenameConfirm(null);
  }

  const connectHint = connectArmed
    ? connectSourceId
      ? tf("ctor.connectHintTarget", { name: nodeLabel(findNode(uiModel, connectSourceId)) })
      : t("ctor.connectHintSource")
    : "";

  return (
    <div className="ctor">
      <h1 className="ctor__title">{t("ctor.title")}</h1>

      <WorkflowBar current="constructor" />

      <div className="ctor__toolbar">
        <button type="button" className="ctor-btn" data-testid="template-new" onClick={handleNew}>
          {t("ctor.new")}
        </button>
        <button type="button" className="ctor-btn" data-testid="template-clone" onClick={handleClone}>
          {t("ctor.clone")}
        </button>
        <button
          type="button"
          className="ctor-btn ctor-btn--primary"
          data-testid="template-save"
          disabled={saveBusy}
          onClick={handleSave}
        >
          {saveBusy ? t("ctor.saving") : t("ctor.save")}
        </button>
        <button type="button" className="ctor-btn" data-testid="template-open" onClick={handleOpenList}>
          {t("ctor.open")}
        </button>
        <button
          type="button"
          className={`ctor-btn${connectArmed ? " ctor-btn--active" : ""}`}
          data-testid="connect-toggle"
          onClick={() => {
            setConnectArmed((prev) => !prev);
            setConnectSourceId("");
          }}
        >
          {t("ctor.connect")}
        </button>
        <button type="button" className="ctor-btn" data-testid="check-reachability" onClick={handleCheck}>
          {t("ctor.check")}
        </button>
        <button
          type="button"
          className="ctor-btn ctor-btn--primary"
          data-testid="template-publish"
          disabled={!templateId || publishBusy || templateStatus === "published"}
          title={!templateId ? t("ctor.saveFirst") : ""}
          onClick={handlePublish}
        >
          {publishBusy ? t("ctor.publishing") : t("ctor.publish")}
        </button>
        {templateStatus === "published" ? (
          <>
            <button
              type="button"
              className="ctor-btn"
              data-testid="template-new-draft"
              onClick={handleNewDraft}
            >
              {t("ctor.newDraft")}
            </button>
            <button
              type="button"
              className="ctor-btn"
              data-testid="template-download-bpmn"
              onClick={() => handleDownloadBpmn()}
            >
              {t("ctor.downloadBpmn")}
            </button>
          </>
        ) : null}
        <span className="ctor__version" data-testid="version-label">
          {templateStatus === "published" ? t("ctor.statusPublished") : t("ctor.statusDraft")} · v{templateVersion}
          {templateId ? ` · id ${templateId}` : ` · ${t("ctor.newTemplate")}`}
        </span>
      </div>

      {error ? (
        <div className="ctor__error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="ctor__notice" data-testid="ctor-notice">
          {notice}
        </div>
      ) : null}
      {justSaved && templateId ? (
        <div className="ctor__next-step" data-testid="next-step-banner">
          <span>{t("wf.next")}</span>
          <a
            className="ctor-btn ctor-btn--primary"
            data-testid="next-create-recipe"
            href={`/technologist/recipes?template=${encodeURIComponent(templateId)}`}
          >
            {t("wf.nextRecipe")}
          </a>
        </div>
      ) : null}
      {connectHint ? (
        <div className="ctor__hint-bar" data-testid="connect-hint">
          {connectHint}
        </div>
      ) : null}

      {checkOpen ? (
        <CheckPanel
          validation={validation}
          kitchens={kitchens}
          selectedKitchenIds={selectedKitchenIds}
          onToggleKitchen={handleToggleKitchen}
          mode={precheckMode}
          onModeChange={setPrecheckMode}
          precheck={precheck}
          busy={checkBusy}
          onRunPrecheck={handleRunPrecheck}
          onSelectFinding={handleFindingNavigate}
          onClose={() => setCheckOpen(false)}
        />
      ) : null}

      {publishResult && !publishResult.ok ? (
        <div className="ctor-modal" data-testid="publish-result-dialog">
          <div className="ctor-modal__box">
            <h3>{t("ctor.publishResultTitle")}</h3>
            <p>{publishResult.message}</p>
            {publishResult.findings.length > 0 ? (
              <ul data-testid="publish-findings">
                {publishResult.findings.map((f, idx) => (
                  <li key={`${f.element_id || "el"}_${idx}`}>
                    <strong>{String(f.severity || "")}</strong> [{String(f.code || "")}]{" "}
                    {String(f.element_name || f.element_id || "")}: {String(f.message || "")}
                  </li>
                ))}
              </ul>
            ) : null}
            {publishResult.precheck ? (
              <p className="ctor-hint">
                Pre-check: {JSON.stringify(asObject(publishResult.precheck.summary))}
              </p>
            ) : null}
            <div className="ctor-actions">
              <button
                type="button"
                className="ctor-btn"
                data-testid="publish-result-close"
                onClick={() => setPublishResult(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="ctor__main">
        <aside className="ctor__palette">
          <h3>{t("ctor.palette")}</h3>
          {catalog.length === 0 ? <div className="ctor-hint">{t("ctor.paletteEmpty")}</div> : null}
          {catalog.map((op) => (
            <div className="ctor-palette-item" key={String(op?.code || op?.name)}>
              <div className="ctor-palette-item-name">{String(op?.name_ru || op?.name || op?.code || "")}</div>
              <div className="ctor-palette-item-code">{String(op?.code || "")}</div>
              <button
                type="button"
                className="ctor-btn ctor-btn--small"
                data-testid={`palette-add-${String(op?.code || "")}`}
                onClick={() => handleAddOperation(op)}
              >
                {t("ctor.addBlock")}
              </button>
            </div>
          ))}
          <h3>{t("ctor.paletteStructural")}</h3>
          {STRUCTURAL_BLOCKS.map((spec) => (
            <button
              type="button"
              key={spec.bpmn_type}
              className="ctor-btn ctor-palette-struct"
              data-testid={`palette-${spec.bpmn_type}`}
              onClick={() => handleAddStructural(spec)}
            >
              {spec.label}
            </button>
          ))}
        </aside>

        <section className="ctor__canvas">
          <GraphCanvas
            uiModel={uiModel}
            selectedElementId={selectedNodeId}
            selectedFlowId={selectedFlowId}
            onSelectNode={handleSelectNode}
            onSelectFlow={handleSelectFlow}
            onNodeMove={handleNodeMove}
            connectSourceId={connectSourceId}
            unreachableNodeIds={unreachableIds}
            nodeRefs={nodeRefs}
            ariaLabel={t("ctor.canvasAria")}
          />
        </section>

        <aside className="ctor__side">
          <div className="ctor__tabs">
            <button
              type="button"
              className={`ctor-tab${panelTab === "template" ? " ctor-tab--active" : ""}`}
              data-testid="tab-template"
              onClick={() => setPanelTab("template")}
            >
              {t("ctor.tabTemplate")}
            </button>
            <button
              type="button"
              className={`ctor-tab${panelTab === "entities" ? " ctor-tab--active" : ""}`}
              data-testid="tab-entities"
              onClick={() => setPanelTab("entities")}
            >
              {t("ctor.tabEntities")}
            </button>
            <button
              type="button"
              className={`ctor-tab${panelTab === "block" ? " ctor-tab--active" : ""}`}
              data-testid="tab-block"
              disabled={!selectedNode}
              onClick={() => selectedNode && setPanelTab("block")}
            >
              {t("ctor.tabBlock")}
            </button>
            <button
              type="button"
              className={`ctor-tab${panelTab === "flow" ? " ctor-tab--active" : ""}`}
              data-testid="tab-flow"
              disabled={!selectedFlow}
              onClick={() => selectedFlow && setPanelTab("flow")}
            >
              {t("ctor.tabFlow")}
            </button>
          </div>

          {panelTab === "template" ? (
            <TemplatePanel
              model={uiModel}
              templateName={templateName}
              templateVersion={templateVersion}
              onNameChange={setTemplateName}
              onVersionChange={setTemplateVersion}
              onModelChange={setUiModel}
              versions={templateVersions}
              onRefreshVersions={() => loadVersions()}
              onDownloadBpmn={handleDownloadBpmn}
            />
          ) : null}

          {panelTab === "entities" ? (
            <EntitiesPanel
              model={uiModel}
              dicts={dicts}
              onModelChange={setUiModel}
              onRenameRequest={setRenameConfirm}
              onDeleteBlocked={setDeleteBlocked}
            />
          ) : null}

          {panelTab === "block" && selectedNode ? (
            String(selectedNode?.bpmn_type || "task") === "task" ? (
              <BlockForm
                key={String(selectedNode.id)}
                node={selectedNode}
                opDetail={
                  opDetails[String(selectedNode?.operation_code || "").trim()]
                }
                declaredRefs={declaredRefs}
                recipeKeys={recipeKeys}
                onSave={(patch) => {
                  setUiModel((prev) => updateNode(prev, selectedNode.id, patch));
                  setNotice(tf("ctor.blockSaved", { name: patch.display_name || selectedNode.id }));
                }}
                onDelete={() => handleDeleteNode(selectedNode.id)}
                onDuplicate={() => handleDuplicateNode(selectedNode.id)}
              />
            ) : (
              <div className="ctor-block" data-testid="node-form">
                <h3>
                  {String(selectedNode?.bpmn_type || "")}: {nodeLabel(selectedNode)}
                </h3>
                <label className="ctor-field">
                  <span className="ctor-field-label">Название</span>
                  <input
                    type="text"
                    data-testid="node-name"
                    value={String(selectedNode?.name || "")}
                    onChange={(e) =>
                      setUiModel((prev) => updateNode(prev, selectedNode.id, { name: e.target.value }))
                    }
                  />
                </label>
                <div className="ctor-actions">
                  <button
                    type="button"
                    className="ctor-btn ctor-btn--danger"
                    data-testid="node-delete"
                    onClick={() => handleDeleteNode(selectedNode.id)}
                  >
                    {t("ctor.entityDelete")}
                  </button>
                </div>
              </div>
            )
          ) : null}

          {panelTab === "flow" && selectedFlow ? (
            <FlowForm
              model={uiModel}
              flow={selectedFlow}
              onChange={(patch) => setUiModel((prev) => updateFlow(prev, selectedFlow.id, patch))}
              onDelete={() => handleDeleteFlow(selectedFlow.id)}
            />
          ) : null}
        </aside>
      </div>

      {openList !== null ? (
        <div className="ctor-modal" data-testid="open-dialog">
          <div className="ctor-modal__box">
            <h3>{t("ctor.openListTitle")}</h3>
            {openList === "loading" ? <div className="ctor-hint">{t("ctor.loading")}</div> : null}
            {Array.isArray(openList) && openList.length === 0 ? (
              <div className="ctor-hint">{t("ctor.openListEmpty")}</div>
            ) : null}
            {Array.isArray(openList)
              ? openList.map((t) => (
                  <button
                    type="button"
                    key={String(t?.id || t?.name)}
                    className="ctor-open-item"
                    data-testid={`open-item-${String(t?.id || "")}`}
                    onClick={() => handleOpenTemplate(t?.id)}
                  >
                    <span className="ctor-open-item-name">{String(t?.name || t?.id || "")}</span>
                    <span className="ctor-open-item-meta">
                      v{String(t?.version || "")} · {String(t?.status || "")}
                    </span>
                  </button>
                ))
              : null}
            <div className="ctor-actions">
              <button type="button" className="ctor-btn" onClick={() => setOpenList(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameConfirm ? (
        <div className="ctor-modal" data-testid="rename-confirm-dialog">
          <div className="ctor-modal__box">
            <h3>{t("ctor.entityRename")}</h3>
            <p>
              «{renameConfirm.oldRef}» → «{renameConfirm.newRef}»
            </p>
            {renameConfirm.usages.length > 0 ? (
              <div>
                <p>{t("ctor.renameAffected")}</p>
                <ul data-testid="rename-affected-blocks">
                  {renameConfirm.usages.map((u, idx) => (
                    <li key={`${u.nodeId}_${u.paramKey}_${idx}`}>
                      {u.nodeName} (параметр {u.paramKey})
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="ctor-hint">{t("ctor.renameNoRefs")}</p>
            )}
            <div className="ctor-actions">
              <button
                type="button"
                className="ctor-btn ctor-btn--primary"
                data-testid="rename-confirm"
                onClick={handleRenameConfirm}
              >
                Подтвердить
              </button>
              <button type="button" className="ctor-btn" onClick={() => setRenameConfirm(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteBlocked ? (
        <div className="ctor-modal" data-testid="entity-delete-blocked">
          <div className="ctor-modal__box">
            <h3>Нельзя удалить сущность</h3>
            <p>Сущность «{deleteBlocked.ref}» используется в блоках:</p>
            <ul data-testid="delete-blocked-blocks">
              {deleteBlocked.usages.map((u, idx) => (
                <li key={`${u.nodeId}_${u.paramKey}_${idx}`}>
                  {u.nodeName} (параметр {u.paramKey})
                </li>
              ))}
            </ul>
            <div className="ctor-actions">
              <button type="button" className="ctor-btn" data-testid="delete-blocked-ok" onClick={() => setDeleteBlocked(null)}>
                Понятно
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Constructor;
