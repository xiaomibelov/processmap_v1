// WS1: панельные формы конструктора вынесены для переиспользования
// (конструктор E4 + рабочее место WS1). Источник: Constructor.jsx.
import React, { useEffect, useMemo, useState } from "react";
import { t, tf } from "../i18n";
import {
  ENTITY_CATEGORIES,
  ENTITY_CATEGORY_LABELS,
  GATEWAY_CONDITION_UNKNOWN_OUTPUT,
  asArray,
  asObject,
  findFlow,
  findNode,
  findRefUsages,
  listEntityRefs,
  gatewayConditionError,
  getEntityEntry,
  listDeclaredRefs,
  missingRequiredParams,
  precedingTaskOutputs,
  removeEntity,
  renameEntityRef,
  upsertEntity,
} from "./modelUtils";

function nodeLabel(node) {
  return String(node?.display_name || node?.name || node?.id || "");
}

function BlockForm({ node, opDetail, declaredRefs, recipeKeys, onSave, onDelete, onDuplicate }) {
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
      <h3>{t("ctor.blockTitle")}: {nodeLabel(node)}</h3>
      <div className="ctor-field">
        <span className="ctor-field-label">operation_code</span>
        <code>{String(node?.operation_code || "—")}</code>
      </div>
      <label className="ctor-field">
        <span className="ctor-field-label">{t("ctor.blockDisplayName")}</span>
        <input
          type="text"
          data-testid="block-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>

      <div className="ctor-field">
        <span className="ctor-field-label">{t("ctor.blockParams")}</span>
        {opDetail === undefined ? (
          <div className="ctor-hint">{t("ctor.blockParamsLoading")}</div>
        ) : null}
        {paramKeys.length === 0 && opDetail !== undefined ? (
          <div className="ctor-hint">{t("ctor.blockParamsEmpty")}</div>
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
                  <option value="">{t("ctor.entitySelectPlaceholder")}</option>
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
        <span className="ctor-field-label">{t("ctor.blockOutputs")}</span>
        {outputRows.map((row, idx) => (
          <div className="ctor-output-row" key={`out_${idx}`}>
            <input
              type="text"
              data-testid="output-key"
              placeholder={t("ctor.blockOutputKey")}
              value={row.key}
              onChange={(e) =>
                setOutputRows((prev) => prev.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))
              }
            />
            <input
              type="text"
              data-testid="output-value"
              placeholder={t("ctor.blockOutputValue")}
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
          {t("ctor.blockOutputAdd")}
        </button>
      </div>

      <label className="ctor-field">
        <span className="ctor-field-label">{t("ctor.blockRecipeParams")}</span>
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
          <span className="ctor-hint">{t("ctor.blockRecipeContextEmpty")}</span>
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
          {t("ctor.blockSave")}
        </button>
        {onDuplicate ? (
          <button type="button" className="ctor-btn" data-testid="block-duplicate" onClick={onDuplicate}>
            {t("ctor.blockDuplicate")}
          </button>
        ) : null}
        <button type="button" className="ctor-btn ctor-btn--danger" data-testid="block-delete" onClick={onDelete}>
          {t("ctor.blockDelete")}
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
      <h3>{t("ctor.flowTitle")} {String(flow?.id || "")}</h3>
      <div className="ctor-field">
        <span className="ctor-field-label">
          {nodeLabel(source)} → {nodeLabel(target)}
        </span>
      </div>
      <label className="ctor-field">
        <span className="ctor-field-label">{t("ctor.flowName")}</span>
        <input
          type="text"
          data-testid="flow-name"
          value={String(flow?.name || "")}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      {sourceIsGateway ? (
        <label className="ctor-field">
          <span className="ctor-field-label">{t("ctor.flowCondition")}</span>
          <select
            data-testid="flow-condition"
            value={String(flow?.condition || "")}
            onChange={(e) => onChange({ condition: e.target.value })}
          >
            <option value="">{t("ctor.flowNoCondition")}</option>
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
          {t("ctor.flowDelete")}
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
      <h3 title={t("ctor.entitiesHint")}>{t("ctor.entities")}</h3>
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
                      {isDraft ? <span className="ctor-entity-draft-badge">{t("status.draft").toLowerCase()}</span> : null}
                    </span>
                  )}
                  <select
                    className="ctor-entity-type"
                    data-testid={`entity-type-${ref}`}
                    value={String(entry?.type_id || "")}
                    onChange={(e) => handleTypeChange(category, ref, e.target.value)}
                  >
                    <option value="">{t("ctor.entityTypePlaceholder")}</option>
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
                    {t("ctor.entityDelete")}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="ctor-entity-add">
        <h4>{t("ctor.entityAdd")}</h4>
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
          placeholder={t("ctor.entityRefPlaceholder")}
          value={newRef}
          onChange={(e) => setNewRef(e.target.value)}
        />
        <select data-testid="entity-add-type" value={newType} onChange={(e) => setNewType(e.target.value)}>
          <option value="">{t("ctor.entityTypePlaceholder")}</option>
          {dictFor(newCategory).map((item) => (
            <option key={String(item?.code || item?.id || item?.name)} value={String(item?.code || "")}>
              {String(item?.name || item?.code || "")}
            </option>
          ))}
        </select>
        <button type="button" className="ctor-btn" data-testid="entity-add" onClick={handleAdd}>
          {t("ctor.entityAdd")}
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
  versions = [],
  onRefreshVersions,
  onDownloadBpmn,
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
      <h3>{t("ctor.templatePanel")}</h3>
      <label className="ctor-field">
        <span className="ctor-field-label">{t("ctor.templateName")}</span>
        <input
          type="text"
          data-testid="template-name"
          value={templateName}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </label>
      <label className="ctor-field">
        <span className="ctor-field-label">{t("ctor.templateVersion")}</span>
        <input
          type="text"
          data-testid="template-version"
          value={templateVersion}
          onChange={(e) => onVersionChange(e.target.value)}
        />
      </label>
      <div className="ctor-field">
        <span className="ctor-field-label" title={t("ctor.recipeContextHint")}>{t("ctor.recipeContext")}</span>
        {recipeKeys.length === 0 ? <div className="ctor-hint">{t("ctor.recipeContextEmpty")}</div> : null}
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
            placeholder={t("ctor.recipeAddKey")}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <button type="button" className="ctor-btn ctor-btn--small" data-testid="recipe-add" onClick={handleAddKey}>
            {t("ctor.recipeAdd")}
          </button>
        </div>
      </div>

      <div className="ctor-field ctor-versions" data-testid="versions-panel">
        <span className="ctor-field-label">
          {t("ctor.versions")}{" "}
          <button
            type="button"
            className="ctor-btn ctor-btn--small"
            data-testid="versions-refresh"
            onClick={() => onRefreshVersions && onRefreshVersions()}
          >
            {t("ctor.versionsRefresh")}
          </button>
        </span>
        {versions.length === 0 ? <div className="ctor-hint">{t("ctor.versionsEmpty")}</div> : null}
        {versions.map((v) => (
          <div
            className="ctor-version-row"
            key={`${String(v.version)}_${String(v.status)}`}
            data-testid={`version-row-${String(v.version)}`}
          >
            <span className="ctor-version-num">v{String(v.version || "")}</span>
            <span className={`ctor-version-status ctor-version-status--${String(v.status || "")}`}>
              {t(`status.${String(v.status || "")}`)}
            </span>
            {v.status !== "draft" && onDownloadBpmn ? (
              <button
                type="button"
                className="ctor-btn ctor-btn--small"
                data-testid={`version-bpmn-${String(v.version)}`}
                onClick={() => onDownloadBpmn(String(v.version || ""))}
              >
                BPMN
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Main editor ---------------------------------------------------------


export { BlockForm, FlowForm, EntitiesPanel, TemplatePanel };
