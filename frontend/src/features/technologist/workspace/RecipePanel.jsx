// WS1.5 — форма рецепта в панели рабочего места: создать/сохранить/опубликовать
// рецепт на текущий шаблон + переключатель существующих рецептов шаблона.
import React, { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/apiCore";
import { t, tf } from "../i18n";

export default function RecipePanel({ templateId, templateVersion, templateStatus, onPublished }) {
  const [recipes, setRecipes] = useState([]);
  const [paramDefs, setParamDefs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [params, setParams] = useState({});
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiRequest("/api/recipe-params").then((r) => {
      setParamDefs(r?.ok && Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!templateId) { setRecipes([]); return undefined; }
    let canceled = false;
    apiRequest("/api/recipes?limit=100").then((r) => {
      if (canceled) return;
      const list = (r?.ok && Array.isArray(r.data) ? r.data : [])
        .filter((x) => String(x.template_id) === String(templateId));
      setRecipes(list);
      // WS1: при ремаунте панели — автовыбор рецепта (форма не пустая)
      if (list.length > 0 && !selectedId) fillForm(list[0]);
    }).catch(() => {});
    return () => { canceled = true; };
  }, [templateId, selectedId]);

  function fillForm(recipe) {
    setSelectedId(String(recipe.id));
    setSkuId(String(recipe.sku_id || ""));
    setStatus(String(recipe.status || "draft"));
    const draft = {};
    Object.entries(recipe.parameters_json || {}).forEach(([k, v]) => { draft[k] = String(v); });
    setParams(draft);
    setNotice(""); setError("");
  }

  function resetForm() {
    setSelectedId("");
    setSkuId("");
    setStatus("draft");
    setParams({});
    setNotice(""); setError("");
  }

  function coercedParams() {
    const out = {};
    paramDefs.forEach((def) => {
      const raw = params[def.name];
      if (raw === undefined || raw === "") return;
      if (def.type === "number" || def.type === "int") {
        const num = Number(raw);
        if (!Number.isNaN(num)) out[def.name] = num;
      } else {
        out[def.name] = raw;
      }
    });
    return out;
  }

  async function handleSave() {
    if (busy || !skuId.trim() || !templateId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = { sku_id: skuId.trim(), template_version: templateVersion, parameters_json: coercedParams() };
      let r;
      if (selectedId) {
        r = await apiRequest(`/api/recipes/${encodeURIComponent(selectedId)}`, { method: "PUT", body });
      } else {
        r = await apiRequest("/api/recipes", { method: "POST", body: { ...body, template_id: templateId } });
      }
      if (r?.ok && r.data) {
        setNotice(selectedId ? t("recipes.saved") : t("recipes.created"));
        setSelectedId(String(r.data.id || selectedId));
        setStatus(String(r.data.status || "draft"));
      } else {
        const detail = r?.data?.detail;
        setError(String(detail?.message || detail || r?.error || "save failed"));
      }
    } finally { setBusy(false); }
  }

  async function handlePublish() {
    if (busy || !selectedId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await apiRequest(`/api/recipes/${encodeURIComponent(selectedId)}/publish`, { method: "POST" });
      if (r?.ok) {
        setNotice(t("recipes.published"));
        setStatus("published");
        onPublished?.();
      } else {
        const detail = r?.data?.detail;
        setError(String(detail?.message || detail || r?.error || "publish failed"));
      }
    } finally { setBusy(false); }
  }

  if (!templateId) {
    return <div className="ctor-hint" data-testid="recipe-no-template">{t("ws.recipeNoTemplate")}</div>;
  }

  return (
    <div className="ws-recipe" data-testid="panel-recipe">
      <h3>{t("wf.step.recipe")}</h3>
      {recipes.length > 0 ? (
        <label className="ctor-field">
          <span className="ctor-field-label">{t("recipes.list")}</span>
          <select
            data-testid="recipe-switch"
            value={selectedId}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) { resetForm(); return; }
              const found = recipes.find((x) => String(x.id) === id);
              if (found) fillForm(found);
            }}
          >
            <option value="">{t("recipes.new")}</option>
            {recipes.map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {String(r.sku_id)} · {t(`status.${String(r.status || "draft")}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="ctor-field">
        <span className="ctor-field-label">{t("recipes.fieldSku")}</span>
        <input type="text" data-testid="recipe-sku" value={skuId} onChange={(e) => setSkuId(e.target.value)} />
      </label>

      {paramDefs.map((def) => {
        const value = params[def.name] || "";
        if (def.type === "enum" && Array.isArray(def.enum_json)) {
          return (
            <label className="ctor-field" key={def.name}>
              <span className="ctor-field-label">{def.name}</span>
              <select
                data-testid={`recipe-param-${def.name}`}
                value={value}
                onChange={(e) => setParams((p) => ({ ...p, [def.name]: e.target.value }))}
              >
                <option value="">{t("recipes.notSet")}</option>
                {def.enum_json.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
              </select>
            </label>
          );
        }
        if (def.type === "dict_ref" && def.dict_ref) {
          return (
            <label className="ctor-field" key={def.name}>
              <span className="ctor-field-label">{def.name}</span>
              <DictSelect
                dict={def.dict_ref}
                value={value}
                testid={`recipe-param-${def.name}`}
                onChange={(v) => setParams((p) => ({ ...p, [def.name]: v }))}
              />
            </label>
          );
        }
        return (
          <label className="ctor-field" key={def.name}>
            <span className="ctor-field-label">{def.name}</span>
            <input
              type="text"
              data-testid={`recipe-param-${def.name}`}
              value={value}
              placeholder={def.unit ? `${def.min ?? ""}–${def.max ?? ""} ${def.unit}` : ""}
              onChange={(e) => setParams((p) => ({ ...p, [def.name]: e.target.value }))}
            />
          </label>
        );
      })}

      {error ? <div className="ctor-hint ctor-hint--error" data-testid="recipe-error">{error}</div> : null}
      {notice ? <div className="ctor__notice" data-testid="recipe-notice">{notice}</div> : null}

      <div className="ctor-actions">
        <button
          type="button"
          className="ctor-btn ctor-btn--primary"
          data-testid="recipe-save"
          disabled={busy || !skuId.trim()}
          onClick={handleSave}
        >
          {busy ? t("recipes.saving") : t("recipes.save")}
        </button>
        <button
          type="button"
          className="ctor-btn"
          data-testid="recipe-publish"
          disabled={busy || !selectedId || status === "published" || templateStatus !== "published"}
          title={templateStatus !== "published" ? t("ws.recipePublishNeedsTemplate") : ""}
          onClick={handlePublish}
        >
          {t("recipes.publish")}
        </button>
      </div>
      {templateStatus !== "published" ? (
        <div className="ctor-hint">{t("ws.recipePublishNeedsTemplate")}</div>
      ) : null}
    </div>
  );
}

function DictSelect({ dict, value, testid, onChange }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    apiRequest(`/api/dictionaries/${encodeURIComponent(dict)}`).then((r) => {
      setItems(r?.ok && Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
  }, [dict]);
  return (
    <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("recipes.notSet")}</option>
      {items.map((item) => (
        <option key={String(item.code || item.id)} value={String(item.code || "")}>
          {String(item.name || item.code)}
        </option>
      ))}
    </select>
  );
}
