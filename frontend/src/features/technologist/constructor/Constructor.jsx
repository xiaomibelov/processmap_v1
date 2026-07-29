import React, { useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "../../../lib/apiCore";
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

export const E4_HANDOFF_KEY = "fpc_e4_handoff";

const STRUCTURAL_BLOCKS = [
  { bpmn_type: "exclusiveGateway", label: "Шлюз «исключающий»", prefix: "Gateway", width: 60, height: 60 },
  { bpmn_type: "parallelGateway", label: "Шлюз «параллельный»", prefix: "Gateway", width: 60, height: 60 },
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

function BlockForm({ node, opDetail, declaredRefs, recipeKeys, onSave, onDelete }) {
  const schema = asObject(opDetail?.parameter_schema);
  const schemaKeys = Object.keys(schema);
  const [displayName, setDisplayName] = useState(String(node?.display_name || ""));
  const [params, setParams] = useState(() => ({ ...asObject(node?.params) }));
  const [outputRows, setOutputRows] = useState(() =>
    Object.entries(asObject(node?.outputs)).map(([key, value]) => ({ key, value: String(value) })),
  );
  const [recipeParams, setRecipeParams] = useState(() => asArray(node?.recipe_params).map(String));

  // Effective params = schema defaults + explicitly set values.
  const effectiveParams = useMemo(() => {
    const merged = {};
    schemaKeys.forEach((key) => {
      const def = asObject(schema[key]).default;
      if (def !== undefined && def !== null && String(def) !== "") merged[key] = def;
    });
    Object.assign(merged, params);
    return merged;
  }, [schema, schemaKeys, params]);

  const missing = useMemo(
    () => missingRequiredParams(opDetail, effectiveParams),
    [opDetail, effectiveParams],
  );

  // Params to render: schema keys first, then any extra existing param keys.
  const paramKeys = useMemo(() => {
    const extra = Object.keys(params).filter((key) => !schemaKeys.includes(key));
    return [...schemaKeys, ...extra];
  }, [schemaKeys, params]);

  function setParam(key, value) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const cleanParams = {};
    Object.keys(effectiveParams).forEach((key) => {
      const value = effectiveParams[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") cleanParams[key] = value;
    });
    const outputs = {};
    outputRows.forEach(({ key, value }) => {
      const k = String(key || "").trim();
      if (k) outputs[k] = value;
    });
    onSave({
      display_name: displayName.trim(),
      name: displayName.trim() || String(node?.name || ""),
      params: cleanParams,
      outputs,
      recipe_params: recipeParams,
    });
  }

  return (
    <div className="ctor-block" data-testid="block-form" data-node-id={String(node?.id || "")}>
      <h3>Блок: {nodeLabel(node)}</h3>
      <div className="ctor-field">
        <span className="ctor-field-label">operation_code</span>
        <code>{String(node?.operation_code || "—")}</code>
      </div>
      <label className="ctor-field">
        <span className="ctor-field-label">Название блока (display_name)</span>
        <input
          type="text"
          data-testid="block-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>

      <div className="ctor-field">
        <span className="ctor-field-label">Параметры (params.*)</span>
        {opDetail === undefined ? (
          <div className="ctor-hint">Загрузка схемы операции…</div>
        ) : null}
        {paramKeys.length === 0 && opDetail !== undefined ? (
          <div className="ctor-hint">Параметров нет</div>
        ) : null}
        {paramKeys.map((key) => {
          const spec = asObject(schema[key]);
          const required = Boolean(spec.required);
          const isRef = key.endsWith("_ref");
          const value = effectiveParams[key] !== undefined ? String(effectiveParams[key]) : "";
          return (
            <label className="ctor-param" key={key} data-param-key={key}>
              <span className={`ctor-param-label${required ? " ctor-param-label--required" : ""}`}>
                {key}
                {required ? " *" : ""}
              </span>
              {isRef ? (
                <select
                  data-testid={`param-${key}`}
                  value={value}
                  onChange={(e) => setParam(key, e.target.value)}
                >
                  <option value="">— выберите сущность —</option>
                  {declaredRefs.map((ref) => (
                    <option key={ref} value={ref}>
                      {ref}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  data-testid={`param-${key}`}
                  value={value}
                  placeholder={spec.type ? String(spec.type) : ""}
                  onChange={(e) => setParam(key, e.target.value)}
                />
              )}
            </label>
          );
        })}
        {missing.length > 0 ? (
          <div className="ctor-hint ctor-hint--error" data-testid="block-required-hint">
            Заполните обязательные параметры: {missing.join(", ")}
          </div>
        ) : null}
      </div>

      <div className="ctor-field">
        <span className="ctor-field-label">Выходы (outputs.*)</span>
        {outputRows.map((row, idx) => (
          <div className="ctor-output-row" key={`out_${idx}`}>
            <input
              type="text"
              data-testid="output-key"
              placeholder="ключ"
              value={row.key}
              onChange={(e) =>
                setOutputRows((prev) => prev.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))
              }
            />
            <input
              type="text"
              data-testid="output-value"
              placeholder="значение"
              value={row.value}
              onChange={(e) =>
                setOutputRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
              }
            />
            <button
              type="button"
              className="ctor-btn ctor-btn--small"
              onClick={() => setOutputRows((prev) => prev.filter((_, i) => i !== idx))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ctor-btn ctor-btn--small"
          data-testid="output-add"
          onClick={() => setOutputRows((prev) => [...prev, { key: "", value: "" }])}
        >
          Добавить output
        </button>
      </div>

      <label className="ctor-field">
        <span className="ctor-field-label">Параметры рецепта (recipe_params)</span>
        <select
          multiple
          data-testid="block-recipe-params"
          value={recipeParams}
          onChange={(e) =>
            setRecipeParams(Array.from(e.target.selectedOptions).map((o) => String(o.value)))
          }
        >
          {recipeKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        {recipeKeys.length === 0 ? (
          <span className="ctor-hint">recipe_context пуст — добавьте переменные на вкладке «Шаблон»</span>
        ) : null}
      </label>

      <div className="ctor-actions">
        <button
          type="button"
          className="ctor-btn ctor-btn--primary"
          data-testid="block-save"
          disabled={missing.length > 0}
          onClick={handleSave}
        >
          Сохранить блок
        </button>
        <button type="button" className="ctor-btn ctor-btn--danger" data-testid="block-delete" onClick={onDelete}>
          Удалить блок
        </button>
      </div>
    </div>
  );
}

// ---------- Flow edit form ----------------------------------------------------

function FlowForm({ model, flow, onChange, onDelete }) {
  const source = findNode(model, flow?.source_ref);
  const target = findNode(model, flow?.target_ref);
  const sourceIsGateway = String(source?.bpmn_type || "").endsWith("Gateway");
  const allowedOutputs = sourceIsGateway ? precedingTaskOutputs(model, flow?.source_ref) : [];
  const conditionError = gatewayConditionError(model, flow);

  return (
    <div className="ctor-flow" data-testid="flow-form" data-flow-id={String(flow?.id || "")}>
      <h3>Поток {String(flow?.id || "")}</h3>
      <div className="ctor-field">
        <span className="ctor-field-label">
          {nodeLabel(source)} → {nodeLabel(target)}
        </span>
      </div>
      <label className="ctor-field">
        <span className="ctor-field-label">Название потока</span>
        <input
          type="text"
          data-testid="flow-name"
          value={String(flow?.name || "")}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      {sourceIsGateway ? (
        <label className="ctor-field">
          <span className="ctor-field-label">Условие (output предыдущих блоков)</span>
          <select
            data-testid="flow-condition"
            value={String(flow?.condition || "")}
            onChange={(e) => onChange({ condition: e.target.value })}
          >
            <option value="">— без условия —</option>
            {allowedOutputs.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {conditionError === GATEWAY_CONDITION_UNKNOWN_OUTPUT ? (
            <span className="ctor-hint ctor-hint--error" data-testid="flow-condition-error">
              {GATEWAY_CONDITION_UNKNOWN_OUTPUT}: условие «{String(flow?.condition || "")}» не является
              объявленным output предыдущих блоков
            </span>
          ) : null}
        </label>
      ) : null}
      <div className="ctor-actions">
        <button type="button" className="ctor-btn ctor-btn--danger" data-testid="flow-delete" onClick={onDelete}>
          Удалить поток
        </button>
      </div>
    </div>
  );
}

// ---------- Entities panel ----------------------------------------------------

function EntitiesPanel({ model, dicts, onModelChange, onRenameRequest, onDeleteBlocked }) {
  const [newCategory, setNewCategory] = useState("containers");
  const [newRef, setNewRef] = useState("");
  const [newType, setNewType] = useState("");
  const [renameDraft, setRenameDraft] = useState(null); // {category, ref, value}
  const [error, setError] = useState("");

  const refs = listEntityRefs(model);

  function dictFor(category) {
    return asArray(dicts?.[category]);
  }

  function handleAdd() {
    const ref = newRef.trim();
    setError("");
    if (!ref) {
      setError("Укажите имя сущности (ref)");
      return;
    }
    if (getEntityEntry(model, newCategory, ref) || listDeclaredRefs(model).includes(ref)) {
      setError(`Сущность «${ref}» уже объявлена`);
      return;
    }
    onModelChange(upsertEntity(model, newCategory, ref, { type_id: newType, source: "manual" }));
    setNewRef("");
    setNewType("");
  }

  function handleTypeChange(category, ref, typeId) {
    onModelChange(upsertEntity(model, category, ref, { type_id: typeId }));
  }

  function handleDelete(category, ref) {
    const usages = findRefUsages(model, ref);
    if (usages.length > 0) {
      onDeleteBlocked({ category, ref, usages });
      return;
    }
    onModelChange(removeEntity(model, category, ref));
  }

  function handleRenameApply() {
    if (!renameDraft) return;
    const next = renameDraft.value.trim();
    setError("");
    if (!next || next === renameDraft.ref) {
      setRenameDraft(null);
      return;
    }
    if (listDeclaredRefs(model).includes(next)) {
      setError(`Сущность «${next}» уже объявлена`);
      return;
    }
    onRenameRequest({
      category: renameDraft.category,
      oldRef: renameDraft.ref,
      newRef: next,
      usages: findRefUsages(model, renameDraft.ref),
    });
    setRenameDraft(null);
  }

  return (
    <div className="ctor-entities" data-testid="entities-panel">
      <h3>Сущности процесса</h3>
      {error ? <div className="ctor-hint ctor-hint--error">{error}</div> : null}
      {ENTITY_CATEGORIES.map((category) => {
        const items = refs.filter((r) => r.category === category);
        return (
          <div className="ctor-entity-group" key={category} data-category={category}>
            <h4>{ENTITY_CATEGORY_LABELS[category] || category}</h4>
            {items.length === 0 ? <div className="ctor-hint">пусто</div> : null}
            {items.map(({ ref, entry }) => {
              const isDraft = String(entry?.source || "") === "draft";
              const renaming = renameDraft && renameDraft.category === category && renameDraft.ref === ref;
              return (
                <div className="ctor-entity-row" key={`${category}_${ref}`} data-entity-ref={ref}>
                  {renaming ? (
                    <span className="ctor-entity-rename">
                      <input
                        type="text"
                        data-testid="entity-rename-input"
                        value={renameDraft.value}
                        onChange={(e) => setRenameDraft((prev) => ({ ...prev, value: e.target.value }))}
                      />
                      <button type="button" className="ctor-btn ctor-btn--small" data-testid="entity-rename-apply" onClick={handleRenameApply}>
                        ОК
                      </button>
                      <button type="button" className="ctor-btn ctor-btn--small" onClick={() => setRenameDraft(null)}>
                        ×
                      </button>
                    </span>
                  ) : (
                    <span className="ctor-entity-name">
                      {ref}
                      {isDraft ? <span className="ctor-entity-draft-badge">черновик</span> : null}
                    </span>
                  )}
                  <select
                    className="ctor-entity-type"
                    data-testid={`entity-type-${ref}`}
                    value={String(entry?.type_id || "")}
                    onChange={(e) => handleTypeChange(category, ref, e.target.value)}
                  >
                    <option value="">— тип —</option>
                    {dictFor(category).map((item) => (
                      <option key={String(item?.code || item?.id || item?.name)} value={String(item?.code || "")}>
                        {String(item?.name || item?.code || "")}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ctor-btn ctor-btn--small"
                    data-testid={`entity-rename-${ref}`}
                    onClick={() => setRenameDraft({ category, ref, value: ref })}
                  >
                    Переименовать
                  </button>
                  <button
                    type="button"
                    className="ctor-btn ctor-btn--small ctor-btn--danger"
                    data-testid={`entity-delete-${ref}`}
                    onClick={() => handleDelete(category, ref)}
                  >
                    Удалить
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="ctor-entity-add">
        <h4>Добавить сущность</h4>
        <select
          data-testid="entity-add-category"
          value={newCategory}
          onChange={(e) => {
            setNewCategory(e.target.value);
            setNewType("");
          }}
        >
          {ENTITY_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {ENTITY_CATEGORY_LABELS[cat] || cat}
            </option>
          ))}
        </select>
        <input
          type="text"
          data-testid="entity-add-ref"
          placeholder="ref (например, tank_1)"
          value={newRef}
          onChange={(e) => setNewRef(e.target.value)}
        />
        <select data-testid="entity-add-type" value={newType} onChange={(e) => setNewType(e.target.value)}>
          <option value="">— тип —</option>
          {dictFor(newCategory).map((item) => (
            <option key={String(item?.code || item?.id || item?.name)} value={String(item?.code || "")}>
              {String(item?.name || item?.code || "")}
            </option>
          ))}
        </select>
        <button type="button" className="ctor-btn" data-testid="entity-add" onClick={handleAdd}>
          Добавить сущность
        </button>
      </div>
    </div>
  );
}

// ---------- Template panel ----------------------------------------------------

function TemplatePanel({
  model,
  templateName,
  templateVersion,
  onNameChange,
  onVersionChange,
  onModelChange,
}) {
  const [newKey, setNewKey] = useState("");
  const recipeKeys = Object.keys(asObject(model.recipe_context));

  function handleAddKey() {
    const key = newKey.trim();
    if (!key || recipeKeys.includes(key) || key.includes("${")) {
      return;
    }
    onModelChange({
      ...model,
      recipe_context: { ...asObject(model.recipe_context), [key]: "" },
    });
    setNewKey("");
  }

  function handleRemoveKey(key) {
    const next = { ...asObject(model.recipe_context) };
    delete next[key];
    onModelChange({ ...model, recipe_context: next });
  }

  return (
    <div className="ctor-template" data-testid="template-panel">
      <h3>Шаблон</h3>
      <label className="ctor-field">
        <span className="ctor-field-label">Название шаблона</span>
        <input
          type="text"
          data-testid="template-name"
          value={templateName}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </label>
      <label className="ctor-field">
        <span className="ctor-field-label">Версия</span>
        <input
          type="text"
          data-testid="template-version"
          value={templateVersion}
          onChange={(e) => onVersionChange(e.target.value)}
        />
      </label>
      <div className="ctor-field">
        <span className="ctor-field-label">recipe_context (переменные рецепта)</span>
        {recipeKeys.length === 0 ? <div className="ctor-hint">переменных нет</div> : null}
        {recipeKeys.map((key) => (
          <div className="ctor-recipe-row" key={key} data-recipe-key={key}>
            <span>{key}</span>
            <button
              type="button"
              className="ctor-btn ctor-btn--small"
              data-testid={`recipe-remove-${key}`}
              onClick={() => handleRemoveKey(key)}
            >
              ×
            </button>
          </div>
        ))}
        <div className="ctor-recipe-add">
          <input
            type="text"
            data-testid="recipe-add-key"
            placeholder="имя переменной"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <button type="button" className="ctor-btn ctor-btn--small" data-testid="recipe-add" onClick={handleAddKey}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main editor ---------------------------------------------------------

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
        setNotice("ui_model загружен из импорта BPMN");
        return true;
      } catch {
        return false;
      }
    }

    async function bootstrap() {
      const query = readQuery();
      const templateParam = String(query.get("template") || "").trim();
      const fromImport = String(query.get("from") || "").trim() === "import";
      if (templateParam) {
        await loadTemplate(templateParam);
      } else if (fromImport) {
        loadHandoff();
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
      name: String(op?.name || op?.code || ""),
      operation_code: String(op?.code || ""),
      display_name: String(op?.name || op?.code || ""),
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
    setNotice("Шаблон клонирован — сохраните, чтобы создать новый черновик");
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
          setNotice(`Сохранено: черновик v${templateVersion}`);
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
          setNotice(`Сохранено: черновик v${templateVersion}`);
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
        setNotice(`⚠ Недостижимые из старта блоки: ${names}`);
      }
    } finally {
      setCheckBusy(false);
    }
  }

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
      ? `Режим связи: выберите целевой блок для «${nodeLabel(findNode(uiModel, connectSourceId))}»`
      : "Режим связи: выберите блок-источник"
    : "";

  return (
    <div className="ctor">
      <h1 className="ctor__title">Конструктор процессов</h1>

      <div className="ctor__toolbar">
        <button type="button" className="ctor-btn" data-testid="template-new" onClick={handleNew}>
          Новый
        </button>
        <button type="button" className="ctor-btn" data-testid="template-clone" onClick={handleClone}>
          Клонировать
        </button>
        <button
          type="button"
          className="ctor-btn ctor-btn--primary"
          data-testid="template-save"
          disabled={saveBusy}
          onClick={handleSave}
        >
          {saveBusy ? "Сохранение…" : "Сохранить"}
        </button>
        <button type="button" className="ctor-btn" data-testid="template-open" onClick={handleOpenList}>
          Открыть
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
          Связать
        </button>
        <button type="button" className="ctor-btn" data-testid="check-reachability" onClick={handleCheck}>
          Проверить
        </button>
        <span className="ctor__version" data-testid="version-label">
          Черновик · v{templateVersion}
          {templateId ? ` · id ${templateId}` : " · новый"}
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

      <div className="ctor__main">
        <aside className="ctor__palette">
          <h3>Каталог операций</h3>
          {catalog.length === 0 ? <div className="ctor-hint">Каталог пуст или загружается…</div> : null}
          {catalog.map((op) => (
            <div className="ctor-palette-item" key={String(op?.code || op?.name)}>
              <div className="ctor-palette-item-name">{String(op?.name || op?.code || "")}</div>
              <div className="ctor-palette-item-code">{String(op?.code || "")}</div>
              <button
                type="button"
                className="ctor-btn ctor-btn--small"
                data-testid={`palette-add-${String(op?.code || "")}`}
                onClick={() => handleAddOperation(op)}
              >
                Добавить блок
              </button>
            </div>
          ))}
          <h3>Шлюзы и события</h3>
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
            ariaLabel="Редактор графа процесса"
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
              Шаблон
            </button>
            <button
              type="button"
              className={`ctor-tab${panelTab === "entities" ? " ctor-tab--active" : ""}`}
              data-testid="tab-entities"
              onClick={() => setPanelTab("entities")}
            >
              Сущности
            </button>
            <button
              type="button"
              className={`ctor-tab${panelTab === "block" ? " ctor-tab--active" : ""}`}
              data-testid="tab-block"
              disabled={!selectedNode}
              onClick={() => selectedNode && setPanelTab("block")}
            >
              Блок
            </button>
            <button
              type="button"
              className={`ctor-tab${panelTab === "flow" ? " ctor-tab--active" : ""}`}
              data-testid="tab-flow"
              disabled={!selectedFlow}
              onClick={() => selectedFlow && setPanelTab("flow")}
            >
              Поток
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
                  setNotice(`Блок «${patch.display_name || selectedNode.id}» сохранён`);
                }}
                onDelete={() => handleDeleteNode(selectedNode.id)}
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
                    Удалить
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
            <h3>Открыть черновик</h3>
            {openList === "loading" ? <div className="ctor-hint">Загрузка…</div> : null}
            {Array.isArray(openList) && openList.length === 0 ? (
              <div className="ctor-hint">Черновиков нет</div>
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
            <h3>Переименовать сущность</h3>
            <p>
              «{renameConfirm.oldRef}» → «{renameConfirm.newRef}»
            </p>
            {renameConfirm.usages.length > 0 ? (
              <div>
                <p>Будут обновлены блоки:</p>
                <ul data-testid="rename-affected-blocks">
                  {renameConfirm.usages.map((u, idx) => (
                    <li key={`${u.nodeId}_${u.paramKey}_${idx}`}>
                      {u.nodeName} (параметр {u.paramKey})
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="ctor-hint">Ссылок на сущность нет</p>
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
