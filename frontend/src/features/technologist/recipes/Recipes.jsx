import React, { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../../lib/apiCore";
import AuditHistory from "../audit/AuditHistory";
import VersionDiff from "../audit/VersionDiff";
import "./Recipes.css";

// ---------- helpers -----------------------------------------------------------

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function fmtBound(value) {
  if (value === null || value === undefined) return "…";
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(value);
}

function defHint(def) {
  const unit = def?.unit ? ` ${def.unit}` : "";
  if (def?.type === "number" || def?.type === "int") {
    if (def?.min === null && def?.max === null) return `число${unit}`;
    return `диапазон ${fmtBound(def?.min)}–${fmtBound(def?.max)}${unit}`;
  }
  if (def?.type === "dict_ref" && def?.dict_ref) return `справочник: ${def.dict_ref}`;
  return "";
}

// Client-side «используется в блоках» analysis (mirrors backend logic):
// blocks of the template ui_model referencing recipe_params, with highlight of
// params missing from the recipe parameters_json + unused recipe vars.
export function analyzeBlocks(uiModel, parameters) {
  const provided = new Set(Object.keys(asObject(parameters)));
  const blocks = [];
  const required = new Set();
  asArray(uiModel?.nodes).forEach((node) => {
    const refs = asArray(node?.recipe_params).map(String).filter(Boolean);
    if (!refs.length) return;
    refs.forEach((r) => required.add(r));
    blocks.push({
      node_id: String(node?.id || ""),
      node_name: String(node?.display_name || node?.name || node?.id || ""),
      operation_code: String(node?.operation_code || ""),
      recipe_params: refs,
      missing_params: refs.filter((r) => !provided.has(r)),
    });
  });
  const used = new Set(blocks.flatMap((b) => b.recipe_params));
  return {
    blocks,
    required_params: [...required].sort(),
    missing_params: [...required].filter((p) => !provided.has(p)).sort(),
    unused_params: [...provided].filter((p) => !used.has(p)).sort(),
  };
}

function extractErrors(resp) {
  const detail = resp?.data?.detail;
  if (Array.isArray(detail?.errors)) return detail.errors.map(String);
  if (detail?.message) return [String(detail.message)];
  if (typeof detail === "string") return [detail];
  if (resp?.error) return [String(resp.error)];
  return ["Неизвестная ошибка"];
}

function buildParameters(paramDefs, draft) {
  const params = {};
  paramDefs.forEach((def) => {
    const raw = draft[def.name];
    if (raw === undefined || raw === null || String(raw).trim() === "") return;
    if (def.type === "number" || def.type === "int") {
      const num = Number(raw);
      if (Number.isFinite(num)) params[def.name] = num;
    } else {
      params[def.name] = String(raw);
    }
  });
  return params;
}

// ---------- component ---------------------------------------------------------

export function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [paramDefs, setParamDefs] = useState([]);
  const [containerTypes, setContainerTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("draft");
  const [skuId, setSkuId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateVersion, setTemplateVersion] = useState("");
  const [paramDraft, setParamDraft] = useState({});
  const [templateModel, setTemplateModel] = useState(null);
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("params"); // params | history (E8.3)

  // initial load
  useEffect(() => {
    let canceled = false;
    apiRequest("/api/recipes").then((r) => {
      if (!canceled) setRecipes(r?.ok && Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    apiRequest("/api/recipe-params").then((r) => {
      if (!canceled) setParamDefs(r?.ok && Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    apiRequest("/api/dictionaries/container-types").then((r) => {
      if (!canceled) setContainerTypes(r?.ok && Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    apiRequest("/api/process-templates").then((r) => {
      if (!canceled) setTemplates(r?.ok && Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);

  // load template ui_model for the analysis block whenever template changes
  useEffect(() => {
    if (!templateId) {
      setTemplateModel(null);
      return undefined;
    }
    let canceled = false;
    apiRequest(`/api/process-templates/${encodeURIComponent(templateId)}`).then((r) => {
      if (!canceled) setTemplateModel(r?.ok ? asObject(r.data?.ui_model) : null);
    }).catch(() => {});
    return () => {
      canceled = true;
    };
  }, [templateId]);

  const parameters = useMemo(() => buildParameters(paramDefs, paramDraft), [paramDefs, paramDraft]);
  const analysis = useMemo(() => analyzeBlocks(templateModel, parameters), [templateModel, parameters]);

  function resetForm() {
    setSelectedId("");
    setActiveTab("params");
    setSelectedStatus("draft");
    setSkuId("");
    setTemplateId("");
    setTemplateVersion("");
    setParamDraft({});
    setErrors([]);
    setNotice("");
  }

  function fillForm(recipe) {
    setSelectedId(String(recipe.id || ""));
    setSelectedStatus(String(recipe.status || "draft"));
    setSkuId(String(recipe.sku_id || ""));
    setTemplateId(String(recipe.template_id || ""));
    setTemplateVersion(String(recipe.template_version || ""));
    const draft = {};
    Object.entries(asObject(recipe.parameters_json)).forEach(([k, v]) => {
      draft[k] = String(v);
    });
    setParamDraft(draft);
    setErrors([]);
    setNotice("");
  }

  function handleSelect(recipe) {
    setActiveTab("params");
    return selectRecipe(recipe);
  }

  async function selectRecipe(recipe) {
    setErrors([]);
    setNotice("");
    const r = await apiRequest(`/api/recipes/${encodeURIComponent(recipe.id)}`);
    if (r?.ok && r.data) fillForm(r.data);
    else setErrors(extractErrors(r));
  }

  function handleTemplateChange(nextId) {
    setTemplateId(nextId);
    const tpl = templates.find((t) => String(t?.id) === String(nextId));
    if (tpl) setTemplateVersion(String(tpl.version || ""));
  }

  function setParam(name, value) {
    setParamDraft((prev) => ({ ...prev, [name]: value }));
  }

  async function refreshList(selectId) {
    const r = await apiRequest("/api/recipes");
    if (r?.ok && Array.isArray(r.data)) {
      setRecipes(r.data);
      if (selectId) {
        const found = r.data.find((item) => String(item.id) === String(selectId));
        if (found) await handleSelect(found);
      }
    }
  }

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    setNotice("");
    try {
      const body = {
        sku_id: skuId.trim(),
        template_version: templateVersion.trim(),
        parameters_json: parameters,
      };
      let r;
      if (selectedId) {
        r = await apiRequest(`/api/recipes/${encodeURIComponent(selectedId)}`, { method: "PUT", body });
      } else {
        r = await apiRequest("/api/recipes", { method: "POST", body: { ...body, template_id: templateId } });
      }
      if (r?.ok && r.data) {
        setNotice(selectedId ? "Рецепт сохранён" : "Рецепт создан (черновик)");
        const id = String(r.data.id || selectedId);
        await refreshList(id);
      } else {
        setErrors(extractErrors(r));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (busy || !selectedId) return;
    setBusy(true);
    setErrors([]);
    setNotice("");
    try {
      const r = await apiRequest(`/api/recipes/${encodeURIComponent(selectedId)}/publish`, { method: "POST" });
      if (r?.ok && r.data) {
        setNotice("Рецепт опубликован");
        setSelectedStatus("published");
        await refreshList(selectedId);
      } else {
        setErrors(extractErrors(r));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleNewVersion() {
    // E8-gap1: «Новая версия» — published → draft (паттерн «Новый черновик» E7)
    if (busy || !selectedId) return;
    setBusy(true);
    setErrors([]);
    setNotice("");
    try {
      const r = await apiRequest(`/api/recipes/${encodeURIComponent(selectedId)}/new-version`, { method: "POST" });
      if (r?.ok && r.data) {
        const sourceV = r.data.source_version || "?";
        const nextV = r.data.next_version || "?";
        setActiveTab("params"); // переход в форму черновика
        await refreshList(selectedId);
        // notice/статус — ПОСЛЕ refreshList: он перечитывает форму и чистит notice
        setSelectedStatus("draft");
        setNotice(`Создан черновик новой версии: из v${sourceV} → v${nextV}`);
      } else {
        setErrors(extractErrors(r));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleClone() {
    if (busy || !selectedId) return;
    const nextSku = String(window.prompt("SKU для клона рецепта:", `${skuId}_copy`) || "").trim();
    if (!nextSku) return;
    setBusy(true);
    setErrors([]);
    setNotice("");
    try {
      const r = await apiRequest(`/api/recipes/${encodeURIComponent(selectedId)}/clone`, {
        method: "POST",
        body: { sku_id: nextSku },
      });
      if (r?.ok && r.data) {
        setNotice(`Создан клон на SKU «${nextSku}»`);
        await refreshList(String(r.data.id || ""));
      } else {
        setErrors(extractErrors(r));
      }
    } finally {
      setBusy(false);
    }
  }

  function renderParamField(def) {
    const value = paramDraft[def.name] ?? "";
    if (def.type === "enum") {
      return (
        <select
          data-testid={`param-select-${def.name}`}
          value={value}
          onChange={(e) => setParam(def.name, e.target.value)}
        >
          <option value="">— не задано —</option>
          {asArray(def.enum_json).map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      );
    }
    if (def.type === "dict_ref") {
      return (
        <select
          data-testid={`param-select-${def.name}`}
          value={value}
          onChange={(e) => setParam(def.name, e.target.value)}
        >
          <option value="">— не задано —</option>
          {containerTypes.map((item) => (
            <option key={String(item?.code)} value={String(item?.code)}>
              {String(item?.name || item?.code || "")}
            </option>
          ))}
        </select>
      );
    }
    if (def.type === "number" || def.type === "int") {
      return (
        <input
          type="number"
          data-testid={`param-input-${def.name}`}
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          value={value}
          onChange={(e) => setParam(def.name, e.target.value)}
        />
      );
    }
    return (
      <input
        type="text"
        data-testid={`param-input-${def.name}`}
        value={value}
        onChange={(e) => setParam(def.name, e.target.value)}
      />
    );
  }

  return (
    <div className="recipes">
      <h1 className="recipes__title">Рецепты</h1>

      <div className="recipes__main">
        <aside className="recipes__list" data-testid="recipes-list">
          <div className="recipes__list-head">
            <h3>Список рецептов</h3>
            <button type="button" className="recipes-btn recipes-btn--small" data-testid="new-recipe" onClick={resetForm}>
              Новый
            </button>
          </div>
          {recipes.length === 0 ? <div className="recipes-hint">рецептов нет</div> : null}
          {recipes.map((recipe) => (
            <button
              type="button"
              key={String(recipe.id)}
              className={`recipes__item${String(recipe.id) === selectedId ? " recipes__item--active" : ""}`}
              data-testid={`recipe-item-${recipe.id}`}
              onClick={() => handleSelect(recipe)}
            >
              <span className="recipes__item-sku">{String(recipe.sku_id || "")}</span>
              <span className={`recipes__item-status recipes__item-status--${String(recipe.status || "draft")}`}>
                {String(recipe.status || "draft")}
              </span>
            </button>
          ))}
        </aside>

        <section className="recipes__form" data-testid="recipe-form">
          <h3>{selectedId ? `Рецепт (${selectedStatus})` : "Новый рецепт"}</h3>

          {selectedId ? (
            <div className="recipes__tabs" data-testid="recipe-tabs">
              <button
                type="button"
                className={`recipes__tab${activeTab === "params" ? " recipes__tab--active" : ""}`}
                data-testid="tab-params"
                onClick={() => setActiveTab("params")}
              >
                Параметры
              </button>
              <button
                type="button"
                className={`recipes__tab${activeTab === "history" ? " recipes__tab--active" : ""}`}
                data-testid="tab-history"
                onClick={() => setActiveTab("history")}
              >
                История
              </button>
            </div>
          ) : null}

          {selectedId && activeTab === "history" ? (
            <div className="recipes__history" data-testid="history-tab">
              <h4>Diff версий</h4>
              <VersionDiff recipeId={selectedId} />
              <h4>Журнал изменений</h4>
              <AuditHistory entityType="recipe" entityId={selectedId} />
            </div>
          ) : null}

          {activeTab === "params" ? (
          <>
          <label className="recipes-field">
            <span className="recipes-field-label">SKU</span>
            <input
              type="text"
              data-testid="field-sku-id"
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
            />
          </label>

          <label className="recipes-field">
            <span className="recipes-field-label">Шаблон процесса</span>
            <select
              data-testid="field-template"
              value={templateId}
              disabled={Boolean(selectedId)}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">— выберите шаблон —</option>
              {templates.map((tpl) => (
                <option key={String(tpl?.id)} value={String(tpl?.id)}>
                  {String(tpl?.name || tpl?.id)} (v{String(tpl?.version || "")})
                </option>
              ))}
            </select>
          </label>

          <label className="recipes-field">
            <span className="recipes-field-label">Версия шаблона</span>
            <input
              type="text"
              data-testid="field-template-version"
              value={templateVersion}
              onChange={(e) => setTemplateVersion(e.target.value)}
            />
          </label>

          <div className="recipes-field">
            <span className="recipes-field-label">Параметры рецепта</span>
            {paramDefs.length === 0 ? <div className="recipes-hint">словарь параметров загружается…</div> : null}
            {paramDefs.map((def) => (
              <label className="recipes-param" key={def.name} data-param-name={def.name}>
                <span className="recipes-param-label">{def.name}</span>
                {renderParamField(def)}
                <span className="recipes-param-hint" data-testid={`param-hint-${def.name}`}>
                  {defHint(def)}
                </span>
              </label>
            ))}
          </div>

          {errors.length > 0 ? (
            <div className="recipes__errors" role="alert" data-testid="form-errors">
              {errors.map((err, idx) => (
                <div className="recipes__error" key={`err_${idx}`}>
                  {err}
                </div>
              ))}
            </div>
          ) : null}
          {notice ? (
            <div className="recipes__notice" data-testid="form-notice">
              {notice}
            </div>
          ) : null}

          <div className="recipes__actions">
            <button
              type="button"
              className="recipes-btn recipes-btn--primary"
              data-testid="save-recipe"
              disabled={busy || !skuId.trim() || (!selectedId && !templateId)}
              onClick={handleSave}
            >
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className="recipes-btn"
              data-testid="publish-recipe"
              disabled={busy || !selectedId || selectedStatus === "published"}
              onClick={handlePublish}
            >
              Опубликовать
            </button>
            {selectedStatus === "published" ? (
              <button
                type="button"
                className="recipes-btn"
                data-testid="new-version-recipe"
                disabled={busy || !selectedId}
                onClick={handleNewVersion}
              >
                Новая версия
              </button>
            ) : null}
            <button
              type="button"
              className="recipes-btn"
              data-testid="clone-recipe"
              disabled={busy || !selectedId}
              onClick={handleClone}
            >
              Клонировать на SKU
            </button>
          </div>

          <div className="recipes__analysis" data-testid="blocks-analysis">
            <h4>Используется в блоках</h4>
            {!templateId ? (
              <div className="recipes-hint">выберите шаблон, чтобы увидеть связанные блоки</div>
            ) : null}
            {templateId && analysis.blocks.length === 0 ? (
              <div className="recipes-hint">в блоках шаблона нет recipe_params</div>
            ) : null}
            {analysis.blocks.map((block) => (
              <div
                key={block.node_id}
                className={`recipes-analysis__row${block.missing_params.length ? " recipes-analysis__row--missing" : ""}`}
                data-testid={`analysis-block-${block.node_id}`}
              >
                <span className="recipes-analysis__name">{block.node_name || block.node_id}</span>
                <span className="recipes-analysis__params">
                  {block.recipe_params.map((p) => (
                    <span
                      key={p}
                      className={`recipes-analysis__param${block.missing_params.includes(p) ? " recipes-analysis__param--missing" : ""}`}
                      data-testid={block.missing_params.includes(p) ? `analysis-missing-${p}` : undefined}
                    >
                      {p}
                    </span>
                  ))}
                </span>
                {block.missing_params.length ? (
                  <span className="recipes-analysis__warn">нет в рецепте: {block.missing_params.join(", ")}</span>
                ) : null}
              </div>
            ))}
            {analysis.unused_params.length ? (
              <div className="recipes-analysis__unused" data-testid="analysis-unused">
                не используются блоками: {analysis.unused_params.join(", ")}
              </div>
            ) : null}
          </div>
          </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default Recipes;
