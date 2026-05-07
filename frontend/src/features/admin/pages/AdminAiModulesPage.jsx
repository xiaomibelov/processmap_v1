import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiAdminActivateAiPrompt,
  apiAdminArchiveAiPrompt,
  apiAdminCreateAiPrompt,
  apiAdminGetAiModules,
  apiAdminGetAiPrompt,
  apiAdminListAiExecutions,
  apiAdminListAiPrompts,
  apiAdminSaveAiProviderSettings,
  apiAdminVerifyAiProviderSettings,
} from "../api/adminApi";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, formatTs, toText } from "../adminUtils";

const EXECUTION_STATUSES = ["", "queued", "running", "success", "error", "cancelled"];

function statusTone(status = "") {
  const value = toText(status).toLowerCase();
  if (value === "active" || value === "success") return "ok";
  if (value === "legacy" || value === "running" || value === "queued") return "warn";
  if (value === "future" || value === "draft" || value === "archived") return "default";
  if (value === "error" || value === "cancelled" || value === "disabled") return "danger";
  return "default";
}

function jsonPreview(value) {
  const obj = asObject(value);
  const keys = Object.keys(obj);
  if (!keys.length) return "{}";
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return "{}";
  }
}

function parseJsonObject(raw, fallback = {}) {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON должен быть объектом");
  }
  return parsed;
}

function providerLabel(provider = {}) {
  const item = asObject(provider);
  const source = toText(item.source || "default");
  return `${toText(item.provider || "DeepSeek")} · ${source}`;
}

function AiProviderSummary({ provider = {}, summary = {}, saving = false, verifying = false, verifyResult = null, actionError = "", onSave, onVerify }) {
  const settings = asObject(provider);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState(toText(settings.base_url || "https://api.deepseek.com"));

  useEffect(() => {
    setBaseUrlDraft(toText(settings.base_url || "https://api.deepseek.com"));
  }, [settings.base_url]);

  const verify = asObject(verifyResult?.result || verifyResult);
  const verifyOk = verifyResult ? Boolean(verify.ok) : null;
  const verifyStatusText = verifyResult
    ? (verifyOk ? "проверка успешна" : `ошибка проверки: ${toText(verify.error || verify.error_code || "AI_PROVIDER_VERIFY_FAILED")}`)
    : "проверка ещё не выполнялась";
  const data = [
    ["Провайдер", toText(settings.provider || "DeepSeek")],
    ["API key сохранён", settings.has_api_key ? "да" : "нет"],
    ["Base URL", toText(settings.base_url || "—")],
    ["Источник", toText(settings.source || "default")],
    ["Verify", settings.verify_supported ? "supported" : "not supported"],
    ["Admin managed", settings.admin_managed ? "yes" : "no"],
  ];
  return (
    <SectionCard title="DeepSeek provider" subtitle={providerLabel(settings)}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="ai-provider-summary">
        {data.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
            <div className="mt-1 min-w-0 break-words text-sm font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      <form
        className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        data-testid="ai-provider-settings-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSave?.({ api_key: apiKeyDraft, base_url: baseUrlDraft });
          setApiKeyDraft("");
        }}
      >
        <label className="text-xs font-semibold text-slate-700">
          DeepSeek API key
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            type="password"
            autoComplete="new-password"
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
            placeholder={settings.has_api_key ? "ключ сохранён, можно заменить" : "вставьте API key"}
            data-testid="ai-provider-api-key"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Base URL
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={baseUrlDraft}
            onChange={(event) => setBaseUrlDraft(event.target.value)}
            placeholder="https://api.deepseek.com"
            data-testid="ai-provider-base-url"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={saving}
            data-testid="ai-provider-save"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50"
            disabled={verifying}
            onClick={() => onVerify?.({ api_key: apiKeyDraft, base_url: baseUrlDraft })}
            data-testid="ai-provider-verify"
          >
            {verifying ? "Проверка…" : "Проверить доступность"}
          </button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={settings.has_api_key ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
          {settings.has_api_key ? "API key сохранён" : "не настроен"}
        </span>
        <span className={verifyOk === true ? "text-emerald-700" : (verifyOk === false ? "text-rose-700" : "text-slate-500")}>{verifyStatusText}</span>
        {actionError ? <span className="text-rose-700">{actionError}</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        <span>modules: {Number(asObject(summary).modules_total || 0)}</span>
        <span>legacy: {Number(asObject(summary).legacy || 0)}</span>
        <span>future: {Number(asObject(summary).future || 0)}</span>
      </div>
    </SectionCard>
  );
}

function ModulesTable({ modules = [], activeByModule = {}, selectedModuleId = "", onSelect }) {
  return (
    <SectionCard title="Каталог AI modules" subtitle="Read-only module registry projection">
      <div className="overflow-x-auto" data-testid="ai-modules-list">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-2">module_id</th>
              <th className="px-3 py-2">name</th>
              <th className="px-3 py-2">status</th>
              <th className="px-3 py-2">scope</th>
              <th className="px-3 py-2">provider/model</th>
              <th className="px-3 py-2">prompt</th>
              <th className="px-3 py-2">log/limits</th>
              <th className="px-3 py-2">priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {modules.map((module) => {
              const id = toText(module?.module_id);
              const activePrompt = asObject(activeByModule[id]);
              return (
                <tr
                  key={id}
                  className={id === selectedModuleId ? "bg-emerald-50/70" : "hover:bg-slate-50"}
                  data-testid={`ai-module-row-${id}`}
                >
                  <td className="px-3 py-3 align-top">
                    <button
                      type="button"
                      className="text-left font-mono text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
                      onClick={() => onSelect?.(id)}
                    >
                      {id}
                    </button>
                  </td>
                  <td className="max-w-[240px] px-3 py-3 align-top text-slate-800">{toText(module?.name || "—")}</td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <StatusPill status={toText(module?.status || "—")} tone={statusTone(module?.status)} />
                      <span className="text-xs text-slate-500">{module?.enabled ? "enabled" : "disabled"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-slate-600">{asArray(module?.scope).join(", ") || "—"}</td>
                  <td className="px-3 py-3 align-top text-xs text-slate-600">
                    {toText(module?.provider || "—")} / {toText(module?.model || "—")}
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-slate-600">
                    <div>{toText(module?.prompt_source || "—")}</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500">
                      active: {toText(activePrompt.version || "—")}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-slate-600">
                    <div>log: {module?.has_execution_log ? "yes" : "no"}</div>
                    <div>limits: {module?.has_rate_limits ? "yes" : "no"}</div>
                  </td>
                  <td className="px-3 py-3 align-top text-xs font-semibold text-slate-700">{toText(module?.migration_priority || "—")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function PromptRegistryPanel({
  moduleId = "",
  prompts = [],
  detail = null,
  loading = false,
  error = "",
  actionError = "",
  onSelectPrompt,
  onCreateDraft,
  onActivate,
  onArchive,
}) {
  const [form, setForm] = useState({
    version: "",
    scope_level: "global",
    scope_id: "",
    template: "",
    variables_schema: "{}",
    output_schema: "{}",
  });
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setForm((current) => ({ ...current, version: "", template: "" }));
    setLocalError("");
  }, [moduleId]);

  async function submitDraft(event) {
    event.preventDefault();
    setLocalError("");
    try {
      const payload = {
        module_id: moduleId,
        version: form.version,
        scope_level: form.scope_level,
        scope_id: form.scope_id,
        template: form.template,
        variables_schema: parseJsonObject(form.variables_schema, {}),
        output_schema: parseJsonObject(form.output_schema, {}),
      };
      await onCreateDraft?.(payload);
      setForm((current) => ({ ...current, version: "", template: "" }));
    } catch (err) {
      setLocalError(toText(err?.message || err || "draft_create_failed"));
    }
  }

  const detailItem = asObject(detail?.item || detail);
  return (
    <SectionCard title="Prompt registry" subtitle={moduleId || "module not selected"}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <div className="space-y-3">
          {loading ? <LoadingBlock label="Загрузка prompt versions…" /> : null}
          {error ? <ErrorState title="Ошибка prompt registry" message={error} /> : null}
          {actionError || localError ? <ErrorState title="Prompt action failed" message={actionError || localError} /> : null}
          <div className="overflow-x-auto" data-testid="ai-prompt-versions">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">version</th>
                  <th className="px-3 py-2">status</th>
                  <th className="px-3 py-2">scope</th>
                  <th className="px-3 py-2">updated</th>
                  <th className="px-3 py-2">actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {prompts.length ? prompts.map((prompt) => {
                  const id = toText(prompt?.prompt_id);
                  const status = toText(prompt?.status);
                  return (
                    <tr key={id} data-testid={`ai-prompt-row-${id}`}>
                      <td className="px-3 py-3 align-top">
                        <button
                          type="button"
                          className="font-mono text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
                          onClick={() => onSelectPrompt?.(id)}
                        >
                          {toText(prompt?.version || "—")}
                        </button>
                        {status === "active" ? <div className="mt-1 text-[11px] font-semibold text-emerald-700">active prompt</div> : null}
                      </td>
                      <td className="px-3 py-3 align-top"><StatusPill status={status || "—"} tone={statusTone(status)} /></td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">
                        {toText(prompt?.scope_level || "global")} {toText(prompt?.scope_id) ? `· ${toText(prompt.scope_id)}` : ""}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">{formatTs(prompt?.updated_at || prompt?.created_at)}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                            disabled={status === "active" || status === "archived"}
                            onClick={() => onActivate?.(id)}
                            data-testid={`ai-prompt-activate-${id}`}
                          >
                            Activate
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                            disabled={status === "archived"}
                            onClick={() => onArchive?.(id)}
                            data-testid={`ai-prompt-archive-${id}`}
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={5}>Prompt versions отсутствуют.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" onSubmit={submitDraft} data-testid="ai-prompt-create-form">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700">
                Version
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.version}
                  onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
                  placeholder="v1"
                  data-testid="ai-prompt-create-version"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Scope
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.scope_level}
                  onChange={(event) => setForm((current) => ({ ...current, scope_level: event.target.value }))}
                >
                  <option value="global">global</option>
                  <option value="org">org</option>
                  <option value="workspace">workspace</option>
                  <option value="project">project</option>
                  <option value="session">session</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Scope id
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.scope_id}
                  onChange={(event) => setForm((current) => ({ ...current, scope_id: event.target.value }))}
                  placeholder="optional"
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Template
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                value={form.template}
                onChange={(event) => setForm((current) => ({ ...current, template: event.target.value }))}
                data-testid="ai-prompt-create-template"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700">
                Variables schema
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                  value={form.variables_schema}
                  onChange={(event) => setForm((current) => ({ ...current, variables_schema: event.target.value }))}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Output schema
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                  value={form.output_schema}
                  onChange={(event) => setForm((current) => ({ ...current, output_schema: event.target.value }))}
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!toText(moduleId) || !toText(form.version) || !toText(form.template)}
              data-testid="ai-prompt-create-submit"
            >
              Create draft
            </button>
          </form>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3" data-testid="ai-prompt-detail">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Prompt detail</div>
          {toText(detailItem.prompt_id) ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="font-mono text-xs font-semibold text-slate-800">{detailItem.prompt_id}</div>
              <div className="flex flex-wrap gap-2">
                <StatusPill status={toText(detailItem.status || "—")} tone={statusTone(detailItem.status)} />
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">{toText(detailItem.version || "—")}</span>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-xs text-slate-700">{toText(detailItem.template || "—")}</pre>
              <div className="grid gap-2 md:grid-cols-2">
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-[11px] text-slate-600">{jsonPreview(detailItem.variables_schema)}</pre>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-mono text-[11px] text-slate-600">{jsonPreview(detailItem.output_schema)}</pre>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">Prompt не выбран.</div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function ExecutionLogPanel({ modules = [], filters = {}, executions = {}, loading = false, error = "", onFiltersChange }) {
  const rows = asArray(executions?.items);
  return (
    <SectionCard title="Execution log" subtitle="Read-only execution records without raw input">
      <div className="mb-3 flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={filters.module_id || ""}
          onChange={(event) => onFiltersChange?.({ ...filters, module_id: event.target.value })}
          data-testid="ai-execution-filter-module"
        >
          <option value="">module_id: all</option>
          {modules.map((module) => <option key={module.module_id} value={module.module_id}>{module.module_id}</option>)}
        </select>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={filters.status || ""}
          onChange={(event) => onFiltersChange?.({ ...filters, status: event.target.value })}
          data-testid="ai-execution-filter-status"
        >
          {EXECUTION_STATUSES.map((status) => <option key={status || "all"} value={status}>{status || "status: all"}</option>)}
        </select>
      </div>
      {loading ? <LoadingBlock label="Загрузка execution log…" /> : null}
      {error ? <ErrorState title="Ошибка execution log" message={error} /> : null}
      <div className="overflow-x-auto" data-testid="ai-execution-log">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-2">execution</th>
              <th className="px-3 py-2">module</th>
              <th className="px-3 py-2">status</th>
              <th className="px-3 py-2">prompt</th>
              <th className="px-3 py-2">input_hash</th>
              <th className="px-3 py-2">summary</th>
              <th className="px-3 py-2">latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length ? rows.map((row) => (
              <tr key={toText(row?.execution_id)} data-testid={`ai-execution-row-${toText(row?.execution_id)}`}>
                <td className="px-3 py-3 align-top font-mono text-xs text-slate-700">{toText(row?.execution_id || "—")}</td>
                <td className="px-3 py-3 align-top font-mono text-xs text-slate-700">{toText(row?.module_id || "—")}</td>
                <td className="px-3 py-3 align-top"><StatusPill status={toText(row?.status || "—")} tone={statusTone(row?.status)} /></td>
                <td className="px-3 py-3 align-top text-xs text-slate-600">{toText(row?.prompt_version || row?.prompt_id || "—")}</td>
                <td className="px-3 py-3 align-top font-mono text-[11px] text-slate-600">{toText(row?.input_hash || "—")}</td>
                <td className="max-w-[320px] px-3 py-3 align-top text-xs text-slate-600">{toText(row?.output_summary || "—")}</td>
                <td className="px-3 py-3 align-top text-xs text-slate-600">{Number(row?.latency_ms || 0)} ms</td>
              </tr>
            )) : (
              <tr>
                <td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>Execution log пуст.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export default function AdminAiModulesPage() {
  const [catalog, setCatalog] = useState({ modules: [], provider_settings: {}, summary: {} });
  const [prompts, setPrompts] = useState({ items: [], count: 0, page: {} });
  const [executions, setExecutions] = useState({ items: [], count: 0, page: {} });
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [verifyingProvider, setVerifyingProvider] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [promptError, setPromptError] = useState("");
  const [promptActionError, setPromptActionError] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [providerActionError, setProviderActionError] = useState("");
  const [providerVerifyResult, setProviderVerifyResult] = useState(null);
  const [executionFilters, setExecutionFilters] = useState({ module_id: "", status: "" });

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError("");
    const res = await apiAdminGetAiModules();
    if (!res?.ok) {
      setCatalogError(toText(res?.error || "ai_modules_failed"));
      setCatalog({ modules: [], provider_settings: {}, summary: {} });
    } else {
      const data = asObject(res.data);
      setCatalog(data);
      const first = toText(asArray(data.modules)[0]?.module_id);
      setSelectedModuleId((current) => current || first);
    }
    setLoadingCatalog(false);
  }, []);

  const loadPrompts = useCallback(async () => {
    setLoadingPrompts(true);
    setPromptError("");
    const res = await apiAdminListAiPrompts({ limit: 200 });
    if (!res?.ok) {
      setPromptError(toText(res?.error || "ai_prompts_failed"));
      setPrompts({ items: [], count: 0, page: {} });
    } else {
      setPrompts(asObject(res.data));
    }
    setLoadingPrompts(false);
  }, []);

  const loadExecutions = useCallback(async (filters = executionFilters) => {
    setLoadingExecutions(true);
    setExecutionError("");
    const res = await apiAdminListAiExecutions({ ...filters, limit: 50 });
    if (!res?.ok) {
      setExecutionError(toText(res?.error || "ai_executions_failed"));
      setExecutions({ items: [], count: 0, page: {} });
    } else {
      setExecutions(asObject(res.data));
    }
    setLoadingExecutions(false);
  }, [executionFilters]);

  useEffect(() => {
    void loadCatalog();
    void loadPrompts();
  }, [loadCatalog, loadPrompts]);

  useEffect(() => {
    void loadExecutions(executionFilters);
  }, [executionFilters, loadExecutions]);

  const modules = asArray(catalog.modules);
  const promptItems = asArray(prompts.items);
  const selectedPrompts = promptItems.filter((item) => toText(item?.module_id) === toText(selectedModuleId));
  const activeByModule = useMemo(() => {
    const out = {};
    promptItems.forEach((item) => {
      if (toText(item?.status) === "active") out[toText(item?.module_id)] = item;
    });
    return out;
  }, [promptItems]);

  async function selectPrompt(promptId) {
    const id = toText(promptId);
    if (!id) return;
    setPromptActionError("");
    const res = await apiAdminGetAiPrompt(id);
    if (!res?.ok) {
      setPromptActionError(toText(res?.error || "prompt_detail_failed"));
      return;
    }
    setSelectedPrompt(asObject(res.data));
  }

  async function createDraft(payload) {
    setPromptActionError("");
    const res = await apiAdminCreateAiPrompt(payload);
    if (!res?.ok) {
      setPromptActionError(toText(res?.error || "prompt_create_failed"));
      return;
    }
    setSelectedPrompt(asObject(res.data));
    await loadPrompts();
  }

  async function activatePrompt(promptId) {
    setPromptActionError("");
    const res = await apiAdminActivateAiPrompt(promptId);
    if (!res?.ok) {
      setPromptActionError(toText(res?.error || "prompt_activate_failed"));
      return;
    }
    setSelectedPrompt(asObject(res.data));
    await loadPrompts();
  }

  async function archivePrompt(promptId) {
    setPromptActionError("");
    const res = await apiAdminArchiveAiPrompt(promptId);
    if (!res?.ok) {
      setPromptActionError(toText(res?.error || "prompt_archive_failed"));
      return;
    }
    setSelectedPrompt(asObject(res.data));
    await loadPrompts();
  }

  async function saveProviderSettings(payload) {
    setSavingProvider(true);
    setProviderActionError("");
    const res = await apiAdminSaveAiProviderSettings(payload);
    if (!res?.ok) {
      setProviderActionError(toText(res?.error || "provider_save_failed"));
    } else {
      const data = asObject(res.data);
      const providerSettings = asObject(data.provider_settings);
      setCatalog((current) => ({ ...current, provider_settings: providerSettings }));
      setProviderVerifyResult(null);
    }
    setSavingProvider(false);
  }

  async function verifyProviderSettings(payload) {
    setVerifyingProvider(true);
    setProviderActionError("");
    const res = await apiAdminVerifyAiProviderSettings(payload);
    if (!res?.ok) {
      setProviderActionError(toText(res?.error || "provider_verify_failed"));
      setProviderVerifyResult({ ok: false, error: toText(res?.error || "provider_verify_failed") });
    } else {
      setProviderVerifyResult(asObject(res.data).result || asObject(res.data));
    }
    setVerifyingProvider(false);
  }

  if (loadingCatalog) return <LoadingBlock label="Загрузка AI modules…" />;
  if (catalogError) return <ErrorState title="Ошибка AI modules" message={catalogError} />;

  return (
    <div className="space-y-5" data-testid="admin-ai-modules-page">
      <AiProviderSummary
        provider={catalog.provider_settings}
        summary={catalog.summary}
        saving={savingProvider}
        verifying={verifyingProvider}
        verifyResult={providerVerifyResult}
        actionError={providerActionError}
        onSave={saveProviderSettings}
        onVerify={verifyProviderSettings}
      />
      <ModulesTable
        modules={modules}
        activeByModule={activeByModule}
        selectedModuleId={selectedModuleId}
        onSelect={(moduleId) => {
          setSelectedModuleId(moduleId);
          setSelectedPrompt(null);
          setExecutionFilters((current) => ({ ...current, module_id: moduleId }));
        }}
      />
      <PromptRegistryPanel
        moduleId={selectedModuleId}
        prompts={selectedPrompts}
        detail={selectedPrompt}
        loading={loadingPrompts}
        error={promptError}
        actionError={promptActionError}
        onSelectPrompt={selectPrompt}
        onCreateDraft={createDraft}
        onActivate={activatePrompt}
        onArchive={archivePrompt}
      />
      <ExecutionLogPanel
        modules={modules}
        filters={executionFilters}
        executions={executions}
        loading={loadingExecutions}
        error={executionError}
        onFiltersChange={setExecutionFilters}
      />
    </div>
  );
}
