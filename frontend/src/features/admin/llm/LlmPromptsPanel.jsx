import { useCallback, useEffect, useState } from "react";

import {
  apiAdminLlmActivatePrompt,
  apiAdminLlmCreatePrompt,
  apiAdminLlmListPrompts,
  apiAdminLlmRollbackPrompt,
} from "../api/adminApi";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, formatTs, toInt, toText } from "../adminUtils";
import { t } from "./i18n";
import { LLM_KNOWN_FEATURES, LLM_MODEL_CLASSES } from "./llmConstants";

function promptStatusTone(status = "") {
  const value = toText(status).toLowerCase();
  if (value === "active") return "ok";
  if (value === "archive" || value === "archived") return "default";
  if (value === "draft") return "warn";
  return "default";
}

function errorMessage(res, fallback) {
  const err = res?.error;
  if (err && typeof err === "object") return toText(err.message || err.code || fallback);
  return toText(err || fallback);
}

export default function LlmPromptsPanel() {
  const [feature, setFeature] = useState(LLM_KNOWN_FEATURES[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState({ system: "", template: "", max_tokens: "1024", model_class: "primary" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (featureName = feature) => {
    setLoading(true);
    setError("");
    const res = await apiAdminLlmListPrompts({ feature: featureName, limit: 100 });
    if (!res?.ok) {
      setError(errorMessage(res, "llm_prompts_failed"));
      setItems([]);
    } else {
      setItems(asArray(asObject(res.data).items));
    }
    setLoading(false);
  }, [feature]);

  useEffect(() => {
    void load(feature);
  }, [feature, load]);

  async function activate(promptId) {
    const id = toText(promptId);
    if (!id) return;
    setBusyId(id);
    setActionError("");
    const res = await apiAdminLlmActivatePrompt(id);
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_prompt_activate_failed"));
    } else {
      await load();
    }
    setBusyId("");
  }

  async function rollback(promptId) {
    const id = toText(promptId);
    if (!id) return;
    setBusyId(id);
    setActionError("");
    const res = await apiAdminLlmRollbackPrompt(id);
    if (!res?.ok) {
      const msg = errorMessage(res, "llm_prompt_rollback_failed");
      setActionError(msg === "no_rollback_target" ? t("prompts.error.noRollbackTarget") : msg);
    } else {
      await load();
    }
    setBusyId("");
  }

  async function submitDraft(event) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    const res = await apiAdminLlmCreatePrompt({
      feature,
      system: String(form.system || ""),
      template: String(form.template || ""),
      max_tokens: toInt(form.max_tokens, 0),
      model_class: toText(form.model_class || "primary"),
    });
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_prompt_create_failed"));
    } else {
      setForm((current) => ({ ...current, system: "", template: "" }));
      await load();
    }
    setSaving(false);
  }

  return (
    <SectionCard title={t("prompts.title")} subtitle={t("prompts.subtitle")}>
      <div className="mb-3 flex flex-wrap gap-3">
        <label className="text-xs font-semibold text-slate-700">
          {t("prompts.feature")}
          <select
            className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={feature}
            onChange={(event) => setFeature(event.target.value)}
            data-testid="llm-prompt-feature-select"
          >
            {LLM_KNOWN_FEATURES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>
      {loading ? <LoadingBlock label={t("common.loading")} /> : null}
      {error ? <ErrorState title={t("common.error")} message={error} /> : null}
      {actionError ? <ErrorState title={t("common.error")} message={actionError} /> : null}
      {!loading && !error ? (
        <div className="overflow-x-auto" data-testid="llm-prompts-table">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("prompts.col.version")}</th>
                <th className="px-3 py-2">{t("prompts.col.status")}</th>
                <th className="px-3 py-2">{t("prompts.col.maxTokens")}</th>
                <th className="px-3 py-2">{t("prompts.col.modelClass")}</th>
                <th className="px-3 py-2">{t("prompts.col.updatedBy")}</th>
                <th className="px-3 py-2">{t("prompts.col.updatedAt")}</th>
                <th className="px-3 py-2">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length ? items.map((prompt) => {
                const id = toText(prompt?.id);
                const status = toText(prompt?.status || "draft");
                return (
                  <tr key={id} data-testid={`llm-prompt-row-${id}`}>
                    <td className="px-3 py-3 align-top font-mono text-xs font-semibold text-slate-800">v{toInt(prompt?.version, 0)}</td>
                    <td className="px-3 py-3 align-top"><StatusPill status={status} tone={promptStatusTone(status)} /></td>
                    <td className="px-3 py-3 align-top text-xs text-slate-700">{toInt(prompt?.max_tokens, 0)}</td>
                    <td className="px-3 py-3 align-top font-mono text-xs text-slate-600">{toText(prompt?.model_class || "primary")}</td>
                    <td className="px-3 py-3 align-top text-xs text-slate-600">{toText(prompt?.updated_by || "—")}</td>
                    <td className="px-3 py-3 align-top text-xs text-slate-500">{formatTs(prompt?.updated_at)}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                          disabled={status === "active" || busyId === id}
                          onClick={() => void activate(id)}
                          data-testid={`llm-prompt-activate-${id}`}
                        >
                          {t("prompts.action.activate")}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                          disabled={busyId === id}
                          onClick={() => void rollback(id)}
                          data-testid={`llm-prompt-rollback-${id}`}
                        >
                          {t("prompts.action.rollback")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>{t("prompts.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      <form
        className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
        onSubmit={(event) => void submitDraft(event)}
        data-testid="llm-prompt-create-form"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("prompts.form.title")}</div>
        <label className="block text-xs font-semibold text-slate-700">
          {t("prompts.form.system")}
          <textarea
            className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
            value={form.system}
            onChange={(event) => setForm((current) => ({ ...current, system: event.target.value }))}
            data-testid="llm-prompt-create-system"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          {t("prompts.form.template")}
          <textarea
            className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
            value={form.template}
            onChange={(event) => setForm((current) => ({ ...current, template: event.target.value }))}
            data-testid="llm-prompt-create-template"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            {t("prompts.form.maxTokens")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="number"
              min="0"
              value={form.max_tokens}
              onChange={(event) => setForm((current) => ({ ...current, max_tokens: event.target.value }))}
              data-testid="llm-prompt-create-max-tokens"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            {t("prompts.form.modelClass")}
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.model_class}
              onChange={(event) => setForm((current) => ({ ...current, model_class: event.target.value }))}
              data-testid="llm-prompt-create-model-class"
            >
              {LLM_MODEL_CLASSES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving || !toText(form.template)}
          data-testid="llm-prompt-create-submit"
        >
          {saving ? t("common.saving") : t("prompts.form.submit")}
        </button>
      </form>
    </SectionCard>
  );
}
