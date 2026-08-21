import { useCallback, useEffect, useState } from "react";

import {
  apiAdminLlmCreateModel,
  apiAdminLlmDeleteModel,
  apiAdminLlmListFeatureModels,
  apiAdminLlmListModels,
  apiAdminLlmPatchModel,
  apiAdminLlmPutFeatureModel,
  apiAdminLlmSetDefaultModel,
} from "../api/adminApi";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, formatTs, toText } from "../adminUtils";
import { t, tf } from "./i18n";
import { LLM_KNOWN_FEATURES } from "./llmConstants";

function errorMessage(res, fallback) {
  const err = res?.error;
  if (err && typeof err === "object") return toText(err.message || err.code || fallback);
  return toText(err || fallback);
}

const EMPTY_FORM = { provider: "", model_name: "", display_name: "", is_default: false };

export default function LlmModelsPanel() {
  const [items, setItems] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [modelsRes, overridesRes] = await Promise.all([
      apiAdminLlmListModels(),
      apiAdminLlmListFeatureModels(),
    ]);
    if (!modelsRes?.ok) {
      setError(errorMessage(modelsRes, "llm_models_failed"));
      setItems([]);
    } else {
      setItems(asArray(asObject(modelsRes.data).items));
    }
    if (overridesRes?.ok) {
      setOverrides(asArray(asObject(overridesRes.data).items));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(id, fn) {
    setBusyId(id);
    setActionError("");
    const res = await fn();
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_model_action_failed"));
    } else {
      await load();
    }
    setBusyId("");
  }

  async function createModel(event) {
    event.preventDefault();
    // Значения читаются из элементов формы (не только React state) — как в
    // LlmProvidersPanel: так honoured programmatic input events (тесты, autofill).
    const elements = event.currentTarget?.elements;
    const fieldValue = (field, fallback) => {
      const node = elements?.namedItem?.(field);
      return node && typeof node.value === "string" ? node.value : fallback;
    };
    const defaultNode = elements?.namedItem?.("is_default");
    const values = {
      provider: toText(fieldValue("provider", form.provider)),
      model_name: toText(fieldValue("model_name", form.model_name)),
      display_name: toText(fieldValue("display_name", form.display_name)),
      is_default: defaultNode ? defaultNode.checked === true : form.is_default === true,
    };
    if (!values.model_name || creating) return;
    setCreating(true);
    setActionError("");
    const res = await apiAdminLlmCreateModel(values);
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_model_create_failed"));
    } else {
      setForm(EMPTY_FORM);
      await load();
    }
    setCreating(false);
  }

  const enabledItems = items.filter((row) => row?.enabled === true);
  const overrideByFeature = new Map(overrides.map((row) => [toText(row?.feature), row]));

  return (
    <div className="space-y-5" data-testid="llm-models-panel">
      <SectionCard title={t("models.title")} subtitle={t("models.subtitle")}>
        {loading ? <LoadingBlock label={t("common.loading")} /> : null}
        {error ? <ErrorState title={t("common.error")} message={error} /> : null}
        {actionError ? <ErrorState title={t("common.error")} message={actionError} /> : null}
        {!loading && !error ? (
          <div className="overflow-x-auto" data-testid="llm-models-table">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t("models.col.model")}</th>
                  <th className="px-3 py-2">{t("models.col.provider")}</th>
                  <th className="px-3 py-2">{t("models.col.displayName")}</th>
                  <th className="px-3 py-2">{t("models.col.default")}</th>
                  <th className="px-3 py-2">{t("models.col.enabled")}</th>
                  <th className="px-3 py-2">{t("models.col.updated")}</th>
                  <th className="px-3 py-2">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.length ? items.map((row) => {
                  const id = toText(row?.id);
                  const name = toText(row?.model_name);
                  const enabled = row?.enabled === true;
                  const isDefault = row?.is_default === true;
                  return (
                    <tr key={id} data-testid={`llm-model-row-${name}`}>
                      <td className="px-3 py-3 align-top font-mono text-xs font-semibold text-slate-800">{name}</td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">{toText(row?.provider) || "—"}</td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">{toText(row?.display_name) || "—"}</td>
                      <td className="px-3 py-3 align-top">
                        {isDefault ? <StatusPill status="default" tone="ok" /> : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
                          disabled={busyId === id || isDefault}
                          title={isDefault ? "default" : ""}
                          onClick={() => void runAction(id, () => apiAdminLlmPatchModel(id, { enabled: !enabled }))}
                          data-testid={`llm-model-toggle-${name}`}
                        >
                          <StatusPill
                            status={enabled ? t("common.enabled") : t("common.disabled")}
                            tone={enabled ? "ok" : "default"}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-slate-500">{formatTs(row?.updated_at)}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2">
                          {!isDefault ? (
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                              disabled={busyId === id}
                              onClick={() => void runAction(id, () => apiAdminLlmSetDefaultModel(id))}
                              data-testid={`llm-model-set-default-${name}`}
                            >
                              {t("models.action.setDefault")}
                            </button>
                          ) : null}
                          {!isDefault ? (
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40"
                              disabled={busyId === id}
                              onClick={() => {
                                if (window.confirm(tf("models.action.deleteConfirm", { name }))) {
                                  void runAction(id, () => apiAdminLlmDeleteModel(id));
                                }
                              }}
                              data-testid={`llm-model-delete-${name}`}
                            >
                              {t("common.delete")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>{t("models.empty")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
        {!loading && !error ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
            onSubmit={(event) => void createModel(event)}
            data-testid="llm-model-create-form"
          >
            <span className="w-full text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {t("models.form.createTitle")}
            </span>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              {t("models.form.provider")}
              <input
                name="provider"
                className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                data-testid="llm-model-form-provider"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              {t("models.form.modelName")}
              <input
                name="model_name"
                className="w-44 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                value={form.model_name}
                onChange={(event) => setForm((current) => ({ ...current, model_name: event.target.value }))}
                required
                data-testid="llm-model-form-model-name"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              {t("models.form.displayName")}
              <input
                name="display_name"
                className="w-44 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                value={form.display_name}
                onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
                data-testid="llm-model-form-display-name"
              />
            </label>
            <label className="flex items-center gap-1 pb-1 text-xs text-slate-600">
              <input
                name="is_default"
                type="checkbox"
                checked={form.is_default === true}
                onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))}
                data-testid="llm-model-form-is-default"
              />
              {t("models.form.isDefault")}
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
              disabled={creating}
              data-testid="llm-model-form-submit"
            >
              {creating ? t("common.saving") : t("models.form.submit")}
            </button>
          </form>
        ) : null}
      </SectionCard>

      {!loading && !error ? (
        <SectionCard title={t("models.overrides.title")} subtitle={t("models.overrides.subtitle")}>
          <div className="space-y-2" data-testid="llm-feature-models-table">
            {LLM_KNOWN_FEATURES.map((feature) => {
              const override = overrideByFeature.get(feature);
              const selected = toText(override?.model_id);
              return (
                <div key={feature} className="flex items-center gap-3" data-testid={`llm-feature-model-row-${feature}`}>
                  <span className="w-48 font-mono text-xs font-semibold text-slate-800">{feature}</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={selected}
                    disabled={busyId === `feature:${feature}`}
                    onChange={(event) => void runAction(
                      `feature:${feature}`,
                      () => apiAdminLlmPutFeatureModel(feature, event.target.value),
                    )}
                    data-testid={`llm-feature-model-select-${feature}`}
                  >
                    <option value="">{t("models.overrides.useDefault")}</option>
                    {enabledItems.map((row) => (
                      <option key={toText(row?.id)} value={toText(row?.id)}>
                        {toText(row?.display_name) || toText(row?.model_name)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
