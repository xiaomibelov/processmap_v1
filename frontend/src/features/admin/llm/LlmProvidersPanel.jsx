import { useCallback, useEffect, useState } from "react";

import {
  apiAdminLlmCreateProvider,
  apiAdminLlmDeleteProvider,
  apiAdminLlmListProviders,
  apiAdminLlmPatchProvider,
  apiAdminLlmTestProvider,
} from "../api/adminApi";
import { apiLlmStatus } from "../../../lib/api";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, formatTs, toInt, toText } from "../adminUtils";
import { t, tf } from "./i18n";

const EMPTY_FORM = {
  name: "",
  base_url: "",
  model: "",
  priority: "0",
  enabled: true,
  api_key: "",
};

function errorMessage(res, fallback) {
  const err = res?.error;
  if (err && typeof err === "object") return toText(err.message || err.code || fallback);
  return toText(err || fallback);
}

export default function LlmProvidersPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [testingId, setTestingId] = useState("");
  const [effectiveProvider, setEffectiveProvider] = useState(null);
  const [effectiveConfigured, setEffectiveConfigured] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [providersRes, statusRes] = await Promise.all([
      apiAdminLlmListProviders(),
      apiLlmStatus(),
    ]);
    if (!providersRes?.ok) {
      setError(errorMessage(providersRes, "llm_providers_failed"));
      setItems([]);
    } else {
      setItems(asArray(asObject(providersRes.data).items));
    }
    if (statusRes?.ok) {
      const statusData = asObject(statusRes.result || statusRes.data);
      setEffectiveConfigured(!!statusData.configured);
      setEffectiveProvider(asObject(statusData.effective_provider) || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(provider) {
    const item = asObject(provider);
    setEditingId(toText(item.id));
    setForm({
      name: toText(item.name),
      base_url: toText(item.base_url),
      model: toText(item.model),
      priority: String(toInt(item.priority, 0)),
      enabled: item.enabled !== false,
      api_key: "",
    });
    setActionError("");
  }

  function resetForm() {
    setEditingId("");
    setForm(EMPTY_FORM);
  }

  async function submitForm(event) {
    event.preventDefault();
    // Values are read from the form elements (not only React state) so that
    // programmatic input events (tests, autofill) are honoured as well.
    const elements = event.currentTarget?.elements;
    const fieldValue = (field, fallback) => {
      const node = elements?.namedItem?.(field);
      return node && typeof node.value === "string" ? node.value : fallback;
    };
    const enabledNode = elements?.namedItem?.("enabled");
    const values = {
      name: toText(fieldValue("name", form.name)),
      base_url: toText(fieldValue("base_url", form.base_url)),
      model: toText(fieldValue("model", form.model)),
      priority: toInt(fieldValue("priority", form.priority), 0),
      enabled: enabledNode ? enabledNode.checked === true : form.enabled === true,
      api_key: String(fieldValue("api_key", form.api_key) || ""),
    };
    setSaving(true);
    setActionError("");
    const payload = {
      name: values.name,
      base_url: values.base_url,
      model: values.model,
      priority: values.priority,
      enabled: values.enabled,
    };
    if (toText(values.api_key)) payload.api_key = values.api_key;
    const res = editingId
      ? await apiAdminLlmPatchProvider(editingId, payload)
      : await apiAdminLlmCreateProvider(payload);
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_provider_save_failed"));
    } else {
      resetForm();
      await load();
    }
    setSaving(false);
  }

  async function toggleEnabled(provider) {
    const id = toText(provider?.id);
    if (!id) return;
    setActionError("");
    const res = await apiAdminLlmPatchProvider(id, { enabled: provider?.enabled !== true });
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_provider_toggle_failed"));
      return;
    }
    await load();
  }

  async function removeProvider(provider) {
    const id = toText(provider?.id);
    if (!id) return;
    const name = toText(provider?.name || id);
    if (typeof window !== "undefined" && !window.confirm(tf("providers.action.deleteConfirm", { name }))) return;
    setActionError("");
    const res = await apiAdminLlmDeleteProvider(id);
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_provider_delete_failed"));
      return;
    }
    await load();
  }

  async function testProvider(provider) {
    const id = toText(provider?.id);
    if (!id) return;
    setTestingId(id);
    setActionError("");
    const res = await apiAdminLlmTestProvider(id);
    if (!res?.ok) {
      setTestResults((current) => ({ ...current, [id]: { ok: false, error: errorMessage(res, "llm_provider_test_failed") } }));
    } else {
      setTestResults((current) => ({ ...current, [id]: asObject(asObject(res.data).item) }));
    }
    setTestingId("");
  }

  return (
    <SectionCard title={t("providers.title")} subtitle={t("providers.subtitle")}>
      {loading ? <LoadingBlock label={t("common.loading")} /> : null}
      {error ? <ErrorState title={t("common.error")} message={error} /> : null}
      {actionError ? <ErrorState title={t("common.error")} message={actionError} /> : null}
      {!loading && !error ? (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" data-testid="llm-effective-provider">
          {effectiveConfigured && effectiveProvider ? (
            <span className="font-semibold text-slate-700">
              {tf("providers.effectiveProvider", { name: toText(effectiveProvider.name || effectiveProvider.id || "—") })}
            </span>
          ) : (
            <span className="text-slate-500">{t("providers.effectiveProvider.none")}</span>
          )}
        </div>
      ) : null}
      {!loading && !error ? (
        <div className="overflow-x-auto" data-testid="llm-providers-table">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("providers.col.name")}</th>
                <th className="px-3 py-2">{t("providers.col.baseUrl")}</th>
                <th className="px-3 py-2">{t("providers.col.model")}</th>
                <th className="px-3 py-2">{t("providers.col.priority")}</th>
                <th className="px-3 py-2">{t("providers.col.enabled")}</th>
                <th className="px-3 py-2">Org</th>
                <th className="px-3 py-2">{t("providers.col.key")}</th>
                <th className="px-3 py-2">{t("providers.col.updated")}</th>
                <th className="px-3 py-2">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length ? items.map((provider) => {
                const id = toText(provider?.id);
                const enabled = provider?.enabled === true;
                const hasKey = provider?.has_api_key === true;
                const last4 = toText(provider?.key_last4);
                const test = testResults[id];
                return (
                  <tr key={id} data-testid={`llm-provider-row-${id}`}>
                    <td className="max-w-[200px] px-3 py-3 align-top font-semibold text-slate-800">{toText(provider?.name || "—")}</td>
                    <td className="max-w-[240px] break-all px-3 py-3 align-top font-mono text-xs text-slate-600">{toText(provider?.base_url || "—")}</td>
                    <td className="px-3 py-3 align-top font-mono text-xs text-slate-600">{toText(provider?.model || "—")}</td>
                    <td className="px-3 py-3 align-top text-xs text-slate-700">{toInt(provider?.priority, 0)}</td>
                    <td className="px-3 py-3 align-top">
                      <StatusPill
                        status={enabled ? t("common.enabled") : t("common.disabled")}
                        tone={enabled ? "ok" : "default"}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          toText(provider?.org_id) === "org_default"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                        data-testid={`llm-provider-org-${id}`}
                      >
                        {toText(provider?.org_id) === "org_default"
                          ? t("providers.orgBadge.shared")
                          : tf("providers.orgBadge.orgOnly", { org: toText(provider?.org_id || "—") })}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top font-mono text-xs text-slate-600">
                      {hasKey && last4 ? tf("providers.keyMasked", { last4 }) : "—"}
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-slate-500">{formatTs(provider?.updated_at)}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                          onClick={() => startEdit(provider)}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                          disabled={testingId === id}
                          onClick={() => void testProvider(provider)}
                          data-testid={`llm-provider-test-${id}`}
                        >
                          {testingId === id ? t("providers.action.testing") : t("providers.action.test")}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                          onClick={() => void toggleEnabled(provider)}
                        >
                          {enabled ? t("providers.action.disable") : t("providers.action.enable")}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
                          onClick={() => void removeProvider(provider)}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                      {test ? (
                        <div className={`mt-2 text-xs ${test.ok ? "text-emerald-700" : "text-rose-700"}`}>
                          {test.ok
                            ? tf("providers.test.ok", { latency: toInt(test.latency_ms, 0), preview: toText(test.preview || test.model || "OK") })
                            : tf("providers.test.fail", { error: toText(test.error || "unknown") })}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={8}>{t("providers.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      <form
        className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
        onSubmit={(event) => void submitForm(event)}
        data-testid="llm-provider-form"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {editingId ? t("providers.form.editTitle") : t("providers.form.createTitle")}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-700">
            {t("providers.form.name")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              name="name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              data-testid="llm-provider-form-name"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            {t("providers.form.baseUrl")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              name="base_url"
              value={form.base_url}
              onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
              placeholder="https://api.example.com/v1"
              data-testid="llm-provider-form-base-url"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            {t("providers.form.model")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              name="model"
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              data-testid="llm-provider-form-model"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            {t("providers.form.priority")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="number"
              name="priority"
              value={form.priority}
              onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              data-testid="llm-provider-form-priority"
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold text-slate-700">
            {t("providers.form.apiKey")}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="password"
              name="api_key"
              autoComplete="new-password"
              value={form.api_key}
              onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
              placeholder={editingId ? t("providers.form.apiKeyEditPlaceholder") : t("providers.form.apiKeyCreatePlaceholder")}
              data-testid="llm-provider-form-api-key"
            />
          </label>
          <label className="flex items-end gap-2 pb-1 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              name="enabled"
              checked={form.enabled === true}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              data-testid="llm-provider-form-enabled"
            />
            {t("providers.form.enabled")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={saving || !toText(form.name) || !toText(form.base_url) || !toText(form.model)}
            data-testid="llm-provider-form-submit"
          >
            {saving ? t("common.saving") : (editingId ? t("common.save") : t("common.create"))}
          </button>
          {editingId ? (
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={resetForm}
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}
