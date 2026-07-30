// WS1 — рабочее место TO BE на канвасе. Весь воркфлоу технолога на одной
// странице: импорт AS IS (слой), трансформация (решения на схеме),
// конструирование, рецепт, проверка, публикация, пилот — без смены маршрута.
// Эволюция: GraphCanvas + panels.jsx (E4) + WorkflowBar (UX1) + E6/E7/E8/E9 API.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "../../../lib/apiCore";
import { apiGetBpmnXml } from "../../../lib/api";
import { t, tf } from "../i18n";
import GraphCanvas from "../graph/GraphCanvas";
import WorkflowBar, { WORKFLOW_STEPS } from "../workflow/WorkflowBar";
import CheckPanel from "../constructor/CheckPanel";
import AuditHistory from "../audit/AuditHistory";
import { BlockForm, FlowForm, EntitiesPanel, TemplatePanel } from "../constructor/panels";
import {
  DICTIONARY_BY_CATEGORY,
  ENTITY_CATEGORIES,
  addFlow,
  addNode,
  asArray,
  asObject,
  computeReachable,
  deleteFlow,
  deleteNode,
  emptyUiModel,
  findFlow,
  findNode,
  listDeclaredRefs,
  mergeDraftEntities,
  nextId,
  normalizeUiModel,
  updateFlow,
  updateNode,
} from "../constructor/modelUtils";
import WorkspacePanel from "./WorkspacePanel";
import RecipePanel from "./RecipePanel";
import PilotPanel from "./PilotPanel";
import "./Workspace.css";

const STRUCTURAL_BLOCKS = [
  { bpmn_type: "exclusiveGateway", label: "Развилка «исключающая»", prefix: "Gateway", width: 60, height: 60 },
  { bpmn_type: "parallelGateway", label: "Развилка «параллельная»", prefix: "Gateway", width: 60, height: 60 },
  { bpmn_type: "startEvent", label: "Событие «старт»", prefix: "StartEvent", width: 40, height: 40 },
  { bpmn_type: "endEvent", label: "Событие «завершение»", prefix: "EndEvent", width: 40, height: 40 },
];

function readQuery() {
  return new URLSearchParams(window.location.search);
}

export default function Workspace({
  embedded = false,
  asIsSource = null, // {sessionId, title} — WS3: AS IS из сессии ProcessMap
  onClose = null,
  onPublishedTobe = null,
} = {}) {
  // ---- модель процесса (TO BE) ----
  const [uiModel, setUiModel] = useState(() => emptyUiModel());
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState(t("ctor.newTemplate"));
  const [templateVersion, setTemplateVersion] = useState("0.1.0");
  const [templateStatus, setTemplateStatus] = useState("draft");
  const [versions, setVersions] = useState([]);
  const [dirty, setDirty] = useState(false);

  // ---- AS IS слой + отчёт ----
  const [asIsModel, setAsIsModel] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [asIsXmlText, setAsIsXmlText] = useState("");
  const [layerMode, setLayerMode] = useState("tobe"); // tobe | asis | split

  // ---- трансформация ----
  const [traceMap, setTraceMap] = useState([]);
  const [rejectedIds, setRejectedIds] = useState(() => new Set());
  const [selectedDecisionId, setSelectedDecisionId] = useState("");

  // ---- выделение/редактирование ----
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [connectArmed, setConnectArmed] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [dicts, setDicts] = useState({});
  const [opDetails, setOpDetails] = useState({});
  const nodeRefs = useRef({});

  // ---- проверка/публикация ----
  const [validation, setValidation] = useState(null);
  const [precheck, setPrecheck] = useState(null);
  const [kitchens, setKitchens] = useState([]);
  const [selectedKitchenIds, setSelectedKitchenIds] = useState([]);

  // ---- прочее ----
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelTab, setPanelTab] = useState("step");
  const [selectedAsisId, setSelectedAsisId] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const markDirty = useCallback((model) => {
    setUiModel(model);
    setDirty(true);
  }, []);

  const selectedNode = useMemo(() => findNode(uiModel, selectedNodeId), [uiModel, selectedNodeId]);
  const selectedFlow = useMemo(() => findFlow(uiModel, selectedFlowId), [uiModel, selectedFlowId]);

  // ---- WS3: AS IS из реальной сессии ProcessMap (embedded) ----
  useEffect(() => {
    if (!asIsSource?.sessionId) return undefined;
    let canceled = false;
    (async () => {
      setBusy(true); setError("");
      try {
        const r = await apiGetBpmnXml(asIsSource.sessionId);
        if (canceled) return;
        if (!r?.ok || !r.xml) { setError(String(r?.error || "bpmn load failed")); return; }
        setAsIsXmlText(String(r.xml));
        const ir = await apiRequest("/api/process-templates/import-bpmn", {
          method: "POST",
          body: String(r.xml),
          headers: { "Content-Type": "application/octet-stream" },
        });
        if (canceled) return;
        if (ir?.ok && ir.data) {
          setAsIsModel(normalizeUiModel(ir.data.ui_model));
          setImportReport(asObject(ir.data.report));
          setLayerMode("split");
          setPanelTab("findings");
          setNotice(t("ws.asIsFromSession"));
        } else setError(String(ir?.error || "import failed"));
      } finally { if (!canceled) setBusy(false); }
    })();
    return () => { canceled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asIsSource?.sessionId]);

  // ---- загрузка справочников + шаблона из ?template= ----
  useEffect(() => {
    let canceled = false;
    apiRequest("/api/operation-catalog").then((r) => {
      if (!canceled) setCatalog(r?.ok && Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    ENTITY_CATEGORIES.forEach((category) => {
      apiRequest(`/api/dictionaries/${DICTIONARY_BY_CATEGORY[category]}`).then((r) => {
        if (canceled) return;
        const items = r?.ok && Array.isArray(r.data) ? r.data : [];
        setDicts((prev) => ({ ...prev, [category]: items }));
      }).catch(() => {});
    });
    const q = readQuery();
    const tplId = String(q.get("template") || "").trim();
    if (tplId) {
      apiRequest(`/api/process-templates/${encodeURIComponent(tplId)}`).then((r) => {
        if (canceled || !r?.ok || !r.data) return;
        const data = r.data;
        setTemplateId(String(data.id || tplId));
        setTemplateName(String(data.name || t("ctor.templatePanel")));
        setTemplateVersion(String(data.version || "0.1.0"));
        setTemplateStatus(String(data.status || "draft"));
        setUiModel(normalizeUiModel(data.ui_model));
        setDirty(false);
        loadVersionsFor(String(data.id || tplId));
      }).catch(() => {});
    }
    return () => { canceled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadVersionsFor = useCallback(async (id) => {
    const r = await apiRequest(`/api/process-templates/${encodeURIComponent(id)}/versions`);
    if (r?.ok && Array.isArray(r.data)) setVersions(r.data);
  }, []);

  // opDetail для выделенного блока
  useEffect(() => {
    const code = String(selectedNode?.operation_code || "").trim();
    if (!code || opDetails[code] !== undefined) return undefined;
    let canceled = false;
    apiRequest(`/api/operation-catalog/${encodeURIComponent(code)}`).then((r) => {
      if (!canceled) setOpDetails((prev) => ({ ...prev, [code]: r?.ok ? r.data : null }));
    }).catch(() => {});
    return () => { canceled = true; };
  }, [selectedNode, opDetails]);

  // контекстная вкладка панели по выделению
  useEffect(() => {
    if (selectedNodeId) setPanelTab("block");
    else if (selectedFlowId) setPanelTab("flow");
  }, [selectedNodeId, selectedFlowId]);

  // ---- канвас: выделение/перемещение/связи ----
  function handleSelectNode(id) {
    if (connectArmed) {
      if (!connectSourceId) { setConnectSourceId(id); return; }
      if (connectSourceId !== id) {
        const { model } = addFlow(uiModel, connectSourceId, id);
        markDirty(model);
        setConnectArmed(false);
        setConnectSourceId("");
        setSelectedNodeId("");
      }
      return;
    }
    setSelectedNodeId(id);
    setSelectedFlowId("");
  }

  function handleSelectFlow(id) {
    if (connectArmed) return;
    setSelectedFlowId(id);
    setSelectedNodeId("");
  }

  function handleNodeMove(id, x, y) {
    markDirty(updateNode(uiModel, id, { x, y }));
  }

  function handleAddOperation(op) {
    const pos = { x: 40 + ((uiModel.nodes?.length || 0) % 6) * 170, y: 60 };
    const node = {
      id: nextId(uiModel, "Task"),
      bpmn_type: "task",
      name: String(op?.name_ru || op?.name || op?.code || ""),
      operation_code: String(op?.code || ""),
      display_name: String(op?.name_ru || op?.name || op?.code || ""),
      params: {},
      outputs: {},
      recipe_params: [],
      x: pos.x, y: pos.y, width: 140, height: 70,
    };
    markDirty(addNode(uiModel, node));
    setSelectedNodeId(node.id);
    setSelectedFlowId("");
  }

  function handleAddStructural(spec) {
    const node = {
      id: nextId(uiModel, spec.prefix),
      bpmn_type: spec.bpmn_type,
      name: spec.label,
      display_name: "",
      params: {}, outputs: {}, recipe_params: [],
      x: 80, y: 220, width: spec.width, height: spec.height,
    };
    markDirty(addNode(uiModel, node));
    setSelectedNodeId(node.id);
  }

  function handleDeleteNode(id) {
    markDirty(deleteNode(uiModel, id));
    if (selectedNodeId === id) setSelectedNodeId("");
    setPanelTab("step");
  }

  function handleDeleteFlow(id) {
    markDirty(deleteFlow(uiModel, id));
    if (selectedFlowId === id) setSelectedFlowId("");
  }

  // ---- сохранение / версии / публикация ----
  async function handleSave() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!templateId) {
        const r = await apiRequest("/api/process-templates", {
          method: "POST",
          body: { name: templateName, version: templateVersion, status: "draft", ui_model: uiModel, created_by: "" },
        });
        if (r?.ok) {
          const data = asObject(r.data);
          setTemplateId(String(data.id || ""));
          setTemplateStatus("draft");
          setNotice(tf("ctor.savedDraft", { version: templateVersion }));
          setDirty(false);
          loadVersionsFor(String(data.id || ""));
        } else setError(String(r?.error || "save failed"));
      } else {
        const r = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}`, {
          method: "PUT",
          body: { name: templateName, version: templateVersion, status: templateStatus || "draft", ui_model: uiModel },
        });
        if (r?.ok) { setNotice(tf("ctor.savedDraft", { version: templateVersion })); setDirty(false); }
        else setError(String(r?.error || "save failed"));
      }
    } finally { setBusy(false); }
  }

  async function handlePublishTemplate() {
    if (!templateId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const sr = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}`, {
        method: "PUT",
        body: { name: templateName, version: templateVersion, status: templateStatus || "draft", ui_model: uiModel },
      });
      if (!sr?.ok) { setError(String(sr?.error || "save failed")); return; }
      const r = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}/publish`, {
        method: "POST",
        body: { bump: "patch", mode: "warning", target_kitchen_ids: [] },
      });
      if (r?.ok) {
        const data = asObject(r.data);
        setTemplateStatus("published");
        if (data.version) setTemplateVersion(String(data.version));
        setNotice(tf("ctor.published", { version: data.version || "?" }));
        setDirty(false);
        loadVersionsFor(templateId);
        setPanelTab("versions");
        if (onPublishedTobe) {
          void onPublishedTobe({
            templateId,
            version: String(data.version || ""),
            templateName,
          });
        }
      } else {
        const detail = asObject(r?.data?.detail);
        setError(String(detail.message || r?.error || "publish failed"));
        setValidation(detail.findings ? { findings: detail.findings, summary: {} } : null);
        setPanelTab("findings");
      }
    } finally { setBusy(false); }
  }

  async function handleNewDraft() {
    if (!templateId) return;
    const r = await apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}/new-draft`, { method: "POST" });
    if (r?.ok) {
      setTemplateStatus("draft");
      setTemplateVersion(String(r.data?.version || templateVersion));
      setNotice(tf("ctor.newDraftCreated", { version: String(r.data?.version || "?") }));
      loadVersionsFor(templateId);
    }
  }

  async function handleDownloadBpmn(version) {
    if (!templateId) return;
    const r = await apiRequest(
      `/api/process-templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(version)}/bpmn`,
      { responseType: "blob" },
    );
    if (r?.ok && r.data) {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${templateName || "process"}_v${version}.bpmn`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      setError(String(r?.error || "bpmn download failed"));
    }
  }

  // ---- проверка (E6) ----
  async function handleCheck() {
    setError(""); setNotice("");
    const r = await apiRequest("/api/process-templates/validate", {
      method: "POST",
      body: { ui_model: uiModel },
    });
    if (r?.ok) setValidation(r.data);
    else setError(String(r?.error || "validate failed"));
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
      const pr = await apiRequest("/api/process-templates/precheck", {
        method: "POST",
        body: { ui_model: uiModel, kitchen_ids: kitchenIds, mode: "warning" },
      });
      if (pr?.ok) setPrecheck(pr.data);
    }
    setPanelTab("findings");
  }

  function handleFindingNavigate(elementId) {
    const id = String(elementId || "").trim();
    if (!id) return;
    if (findNode(uiModel, id)) {
      setSelectedNodeId(id);
      setSelectedFlowId("");
      const el = nodeRefs.current[id];
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    } else if (findFlow(uiModel, id)) {
      setSelectedFlowId(id);
      setSelectedNodeId("");
    }
  }

  // ---- импорт AS IS на канвасе ----
  async function handleImportFile(file) {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await apiRequest("/api/process-templates/import-bpmn", { method: "POST", body: form });
      if (r?.ok && r.data) {
        setAsIsModel(normalizeUiModel(r.data.ui_model));
        setImportReport(asObject(r.data.report));
        setImportFile(file);
        setLayerMode("split");
        setPanelTab("findings");
        setNotice(t("ws.importDone"));
      } else setError(String(r?.error || "import failed"));
    } finally { setBusy(false); }
  }

  // ---- трансформация на канвасе ----
  async function handleTransform() {
    if (busy) return;
    if (!importFile && !asIsXmlText) return;
    setBusy(true); setError("");
    try {
      const r = importFile
        ? await apiRequest("/api/process-templates/transform-asis", {
            method: "POST",
            body: (() => { const f = new FormData(); f.append("file", importFile); return f; })(),
          })
        : await apiRequest("/api/process-templates/transform-asis", {
            method: "POST",
            body: asIsXmlText,
            headers: { "Content-Type": "application/octet-stream" },
          });
      if (r?.ok && r.data) {
        const draft = normalizeUiModel(r.data.draft_ui_model);
        setUiModel(mergeDraftEntities(draft, asArray(r.data.draft_entities)));
        setTraceMap(asArray(r.data.trace_map));
        setRejectedIds(new Set());
        setTemplateStatus("draft");
        setDirty(true);
        setLayerMode("split");
        setPanelTab("decisions");
        setNotice(t("ws.transformDone"));
      } else setError(String(r?.error || "transform failed"));
    } finally { setBusy(false); }
  }

  function toggleDecision(elementId, accept) {
    setRejectedIds((prev) => {
      const next = new Set(prev);
      if (accept) next.delete(elementId);
      else next.add(elementId);
      return next;
    });
  }

  // TO BE с учётом отклонённых решений
  const effectiveModel = useMemo(() => {
    if (!traceMap.length) return uiModel;
    const removed = new Set();
    traceMap.forEach((tr) => {
      if (!rejectedIds.has(String(tr?.element_id || ""))) return;
      asArray(tr?.draft_node_ids).forEach((id) => removed.add(String(id)));
    });
    const nodes = asArray(uiModel.nodes).filter((n) => !removed.has(String(n?.id || "")));
    const nodeIds = new Set(nodes.map((n) => String(n?.id || "")));
    const flows = asArray(uiModel.flows).filter(
      (f) => nodeIds.has(String(f?.source_ref || "")) && nodeIds.has(String(f?.target_ref || "")),
    );
    return { ...uiModel, nodes, flows };
  }, [uiModel, traceMap, rejectedIds]);

  // бейджи решений на блоках TO BE
  const decisionBadges = useMemo(() => {
    if (!traceMap.length) return {};
    const byDraft = {};
    traceMap.forEach((tr) => {
      const id = String(tr?.element_id || "");
      const rejected = rejectedIds.has(id);
      asArray(tr?.draft_node_ids).forEach((draftId) => {
        byDraft[String(draftId)] = {
          text: rejected ? "✗" : "✓",
          className: rejected ? "graph-canvas__badge--rejected" : "graph-canvas__badge--accepted",
        };
      });
    });
    return byDraft;
  }, [traceMap, rejectedIds]);

  // выбор решения на канвасе → подсветка источников AS IS (вкладку панели
  // НЕ переключаем: блок важнее для редактирования; решения — через список)
  function handleSelectDecisionNode(id) {
    if (!decisionBadges[id]) return;
    setSelectedDecisionId(id);
    const trace = traceMap.find((tr) => asArray(tr?.draft_node_ids).map(String).includes(String(id)));
    const asisId = String(trace?.element_id || "");
    if (asisId) setSelectedAsisId(asisId);
  }

  // ---- действие тулбара по шагу ----
  const hasTemplate = Boolean(templateId) || asArray(uiModel.nodes).length > 0;
  const action = useMemo(() => {
    if (!asIsModel && !hasTemplate) {
      return asIsSource?.sessionId
        ? { id: "transform", label: t("wf.nextTransform") }
        : { id: "import", label: t("ws.actionImport") };
    }
    if (asIsModel && importReport && Number(importReport?.summary?.errors) > 0 && !traceMap.length)
      return { id: "transform", label: t("wf.nextTransform") };
    if (!templateId) return { id: "save", label: t("ctor.save") };
    if (templateStatus === "draft") return { id: "check", label: t("ctor.check") };
    return { id: "pilot", label: t("wf.nextPilot") };
  }, [asIsModel, hasTemplate, importReport, traceMap.length, templateId, templateStatus]);

  async function handleAction() {
    if (action.id === "import") { document.getElementById("ws-file-input")?.click(); return; }
    if (action.id === "transform") return handleTransform();
    if (action.id === "save") return handleSave();
    if (action.id === "check") return handleCheck();
    if (action.id === "pilot") { setPanelTab("pilot"); return; }
  }

  // ---- вкладки панели ----
  const tabs = [
    { id: "step", label: t("ws.tabStep") },
    { id: "block", label: t("ctor.tabBlock") },
    { id: "flow", label: t("ctor.tabFlow") },
    { id: "template", label: t("ctor.tabTemplate") },
    { id: "entities", label: t("ctor.tabEntities") },
    ...(traceMap.length ? [{ id: "decisions", label: t("ws.tabDecisions") }] : []),
    { id: "findings", label: t("ws.tabFindings") },
    { id: "recipe", label: t("wf.step.recipe") },
    { id: "versions", label: t("ctor.versions") },
    { id: "history", label: t("recipes.tabHistory") },
    { id: "pilot", label: t("wf.step.pilot") },
  ];

  const importFindings = asArray(importReport?.findings);

  return (
    <div className="ws">
      <header className="ws__head">
        <WorkflowBar current="" />
        <div className="ws__toolbar">
          {action.id !== "import" ? (
            <button
              type="button"
              className="ctor-btn ctor-btn--primary"
              data-testid="ws-action"
              disabled={busy}
              onClick={handleAction}
            >
              {action.label}
            </button>
          ) : (
            <button
              type="button"
              className="ctor-btn"
              data-testid="ws-action"
              disabled={busy}
              title={t("ws.diskImportHint")}
              onClick={handleAction}
            >
              {t("ws.diskImport")}
            </button>
          )}
          <input
            id="ws-file-input"
            type="file"
            accept=".bpmn,.xml"
            hidden
            data-testid="ws-import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="ctor-btn" data-testid="ws-save" disabled={busy || !dirty} onClick={handleSave}>
            {t("ctor.save")}{dirty ? " •" : ""}
          </button>
          <button
            type="button"
            className={`ctor-btn${connectArmed ? " ctor-btn--active" : ""}`}
            data-testid="ws-connect"
            onClick={() => { setConnectArmed((p) => !p); setConnectSourceId(""); }}
          >
            {t("ctor.connect")}
          </button>
          <button type="button" className="ctor-btn" data-testid="ws-palette" onClick={() => setPaletteOpen((p) => !p)}>
            {t("ctor.palette")}
          </button>
          {asIsModel ? (
            <span className="ws__layers" data-testid="layer-toggle">
              {[["tobe", "TO BE"], ["asis", "AS IS"], ["split", t("ws.layerBoth")]].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`ws__layer-btn${layerMode === mode ? " ws__layer-btn--active" : ""}`}
                  data-testid={`layer-${mode}`}
                  onClick={() => setLayerMode(mode)}
                >
                  {label}
                </button>
              ))}
            </span>
          ) : null}
          {embedded && onClose ? (
            <button type="button" className="ctor-btn" data-testid="ws-close" onClick={onClose}>
              {t("ws.backToSession")}
            </button>
          ) : null}
          <span className="ws__status" data-testid="ws-status">
            {t(`status.${templateStatus}`)} · v{templateVersion}
            {dirty ? ` · ${t("ws.dirty")}` : ""}
          </span>
        </div>
      </header>

      {notice ? <div className="ctor__notice" data-testid="ws-notice">{notice}</div> : null}
      {error ? <div className="ctor__error" role="alert" data-testid="ws-error">{error}</div> : null}
      {asIsModel && importReport && Number(importReport?.summary?.errors) > 0 && !traceMap.length ? (
        <div className="import-bpmn__legacy-hint" data-testid="ws-legacy-hint">{t("wf.legacyHint")}</div>
      ) : null}

      <div className="ws__main">
        <div className={`ws__canvases ws__canvases--${layerMode}`}>
          {layerMode !== "tobe" && asIsModel ? (
            <div className="ws__canvas ws__canvas--asis" data-testid="canvas-asis">
              <div className="ws__canvas-label">AS IS</div>
              <GraphCanvas
                uiModel={asIsModel}
                selectedElementId={selectedAsisId}
                onSelectNode={setSelectedAsisId}
                ariaLabel="AS IS"
              />
            </div>
          ) : null}
          {layerMode !== "asis" ? (
            <div className="ws__canvas" data-testid="canvas-tobe">
              {layerMode === "split" ? <div className="ws__canvas-label">TO BE</div> : null}
              <GraphCanvas
                uiModel={effectiveModel}
                selectedElementId={selectedNodeId}
                selectedFlowId={selectedFlowId}
                onSelectNode={traceMap.length ? (id) => { handleSelectNode(id); handleSelectDecisionNode(id); } : handleSelectNode}
                onSelectFlow={handleSelectFlow}
                onNodeMove={handleNodeMove}
                connectSourceId={connectSourceId}
                nodeBadges={decisionBadges}
                nodeRefs={nodeRefs}
                ariaLabel="TO BE"
              />
            </div>
          ) : null}
        </div>

        <WorkspacePanel title={t("ws.panel")} tabs={tabs} activeTab={panelTab} onTabChange={setPanelTab}>
          {panelTab === "step" ? (
            <div data-testid="panel-step">
              <h3>{t("wf.aria")}</h3>
              <p className="ctor-hint">{t("ws.stepHint")}</p>
              <button type="button" className="ctor-btn ctor-btn--primary" onClick={handleAction}>
                {action.label}
              </button>
              <p className="ctor-hint" style={{ marginTop: 12 }}>
                {t("ws.diskImportHint")}{" "}
                <button
                  type="button"
                  className="ctor-btn ctor-btn--small"
                  data-testid="ws-disk-import"
                  onClick={() => document.getElementById("ws-file-input")?.click()}
                >
                  {t("ws.diskImport")}
                </button>
              </p>
            </div>
          ) : null}

          {panelTab === "block" && selectedNode ? (
            <BlockForm
              node={selectedNode}
              opDetail={opDetails[String(selectedNode?.operation_code || "")]}
              declaredRefs={listDeclaredRefs(uiModel)}
              recipeKeys={Object.keys(uiModel?.recipe_context || {})}
              onSave={(patch) => {
                markDirty(updateNode(uiModel, selectedNodeId, patch));
                setNotice(tf("ctor.blockSaved", { name: patch.display_name || selectedNodeId }));
              }}
              onDelete={() => handleDeleteNode(selectedNodeId)}
            />
          ) : null}
          {panelTab === "block" && !selectedNode ? <div className="ctor-hint">{t("ws.selectBlock")}</div> : null}

          {panelTab === "flow" && selectedFlow ? (
            <FlowForm
              model={uiModel}
              flow={selectedFlow}
              onChange={(patch) => markDirty(updateFlow(uiModel, selectedFlowId, patch))}
              onDelete={() => handleDeleteFlow(selectedFlowId)}
            />
          ) : null}
          {panelTab === "flow" && !selectedFlow ? <div className="ctor-hint">{t("ws.selectFlow")}</div> : null}

          {panelTab === "template" ? (
            <TemplatePanel
              model={uiModel}
              templateName={templateName}
              templateVersion={templateVersion}
              onNameChange={(v) => { setTemplateName(v); setDirty(true); }}
              onVersionChange={(v) => { setTemplateVersion(v); setDirty(true); }}
              versions={versions}
              onRefreshVersions={() => templateId && loadVersionsFor(templateId)}
              onDownloadBpmn={handleDownloadBpmn}
            />
          ) : null}

          {panelTab === "entities" ? (
            <EntitiesPanel
              model={uiModel}
              dicts={dicts}
              onModelChange={(m) => markDirty(m)}
              onRenameRequest={() => {}}
              onDeleteBlocked={() => {}}
            />
          ) : null}

          {panelTab === "decisions" ? (
            <div data-testid="panel-decisions">
              <h3>{t("ws.tabDecisions")}</h3>
              {traceMap.length === 0 ? <div className="ctor-hint">{t("ws.noDecisions")}</div> : null}
              <ul className="ws-decisions">
                {traceMap
                  .filter((tr) => !["sequenceFlow", "textAnnotation"].includes(String(tr?.element_type || "")))
                  .map((tr) => {
                    const id = String(tr?.element_id || "");
                    const rejected = rejectedIds.has(id);
                    return (
                      <li
                        key={id}
                        className={`ws-decision${rejected ? " ws-decision--rejected" : ""}`}
                        data-testid={`decision-${id}`}
                      >
                        <button type="button" className="ws-decision__main" onClick={() => handleSelectDecisionNode(id)}>
                          <b>{String(tr?.name || id)}</b>
                          <span className="ws-decision__rule">{String(tr?.rule_id || "—")}</span>
                          <span className="ws-decision__note">{String(tr?.note || "")}</span>
                        </button>
                        <span className="ws-decision__actions">
                          <button
                            type="button"
                            data-testid={`decision-accept-${id}`}
                            disabled={!rejected}
                            onClick={() => toggleDecision(id, true)}
                          >
                            {t("transform.accept")}
                          </button>
                          <button
                            type="button"
                            data-testid={`decision-reject-${id}`}
                            disabled={rejected}
                            onClick={() => toggleDecision(id, false)}
                          >
                            {t("transform.reject")}
                          </button>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}

          {panelTab === "findings" ? (
            <div data-testid="panel-findings">
              {importFindings.length > 0 ? (
                <>
                  <h3>{t("import.findings")}</h3>
                  <ul className="ctor-check__findings-list">
                    {importFindings.map((f, idx) => (
                      <li key={`imp_${idx}`}>
                        <button type="button" className="ctor-check__finding" onClick={() => {
                          const id = String(f?.element_id || "");
                          setSelectedAsisId(id);
                          setLayerMode((m) => (m === "tobe" ? "asis" : m));
                        }}>
                          <span className="ctor-check__finding-message">{String(f?.message || "")}</span>
                          <span className="ctor-check__finding-code">{String(f?.code || "")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <CheckPanel
                validation={validation}
                kitchens={kitchens}
                selectedKitchenIds={selectedKitchenIds}
                onToggleKitchen={(id) => setSelectedKitchenIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
                mode="warning"
                onModeChange={() => {}}
                precheck={precheck}
                busy={busy}
                onRunPrecheck={handleCheck}
                onSelectFinding={handleFindingNavigate}
                onClose={() => setPanelTab("step")}
              />
            </div>
          ) : null}

          {panelTab === "recipe" ? (
            <RecipePanel
              templateId={templateId}
              templateVersion={templateVersion}
              templateStatus={templateStatus}
              onPublished={() => { setPanelTab("versions"); }}
            />
          ) : null}

          {panelTab === "versions" ? (
            <div data-testid="panel-versions">
              <h3>{t("ctor.versions")}</h3>
              {templateStatus === "draft" && templateId ? (
                <button
                  type="button"
                  className="ctor-btn ctor-btn--primary"
                  data-testid="ws-publish"
                  disabled={busy}
                  onClick={handlePublishTemplate}
                >
                  {t("ctor.publish")}
                </button>
              ) : null}
              {templateStatus === "published" ? (
                <>
                  <button type="button" className="ctor-btn" data-testid="ws-new-draft" onClick={handleNewDraft}>
                    {t("ctor.newDraft")}
                  </button>
                  <button
                    type="button"
                    className="ctor-btn"
                    data-testid="ws-download-bpmn"
                    onClick={() => handleDownloadBpmn(templateVersion)}
                  >
                    {t("ctor.downloadBpmn")}
                  </button>
                </>
              ) : null}
              <ul className="ctor-versions__list">
                {versions.map((v) => (
                  <li key={`${v.version}_${v.status}`}>
                    v{String(v.version)} · {t(`status.${String(v.status || "")}`)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {panelTab === "history" ? (
            <AuditHistory entityType="process_template" entityId={templateId} />
          ) : null}

          {panelTab === "pilot" ? (
            <PilotPanel templateId={templateId} templateStatus={templateStatus} />
          ) : null}
        </WorkspacePanel>
      </div>

      {paletteOpen ? (
        <div className="ws__palette" data-testid="ws-palette-panel">
          <div className="ws__palette-head">
            <b>{t("ctor.palette")}</b>
            <button type="button" className="ctor-btn ctor-btn--small" onClick={() => setPaletteOpen(false)}>
              {t("ctor.close")}
            </button>
          </div>
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
          <h4>{t("ctor.paletteStructural")}</h4>
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
        </div>
      ) : null}
    </div>
  );
}
