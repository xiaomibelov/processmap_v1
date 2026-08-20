import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiAdminLlmGetModules,
  apiAdminLlmListExecutions,
} from "../api/adminApi";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, formatTs, toText } from "../adminUtils";
import { t } from "./i18n";

const EXECUTION_STATUSES = ["", "queued", "running", "success", "error", "cancelled"];

function statusTone(status = "") {
  const value = toText(status).toLowerCase();
  if (value === "active" || value === "success") return "ok";
  if (value === "legacy" || value === "running" || value === "queued") return "warn";
  if (value === "future" || value === "draft" || value === "archived" || value === "archive") return "default";
  if (value === "error" || value === "cancelled" || value === "disabled") return "danger";
  return "default";
}

export default function LlmModulesPanel() {
  const [catalog, setCatalog] = useState({ modules: [], provider_settings: {}, summary: {} });
  const [executions, setExecutions] = useState({ items: [], count: 0, page: {} });
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [filters, setFilters] = useState({ module_id: "", status: "" });

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError("");
    const res = await apiAdminLlmGetModules();
    if (!res?.ok) {
      setCatalogError(toText(res?.error || "llm_modules_failed"));
      setCatalog({ modules: [], provider_settings: {}, summary: {} });
    } else {
      setCatalog(asObject(res.data));
    }
    setLoadingCatalog(false);
  }, []);

  const loadExecutions = useCallback(async (currentFilters = filters) => {
    setLoadingExecutions(true);
    setExecutionError("");
    const res = await apiAdminLlmListExecutions({ ...currentFilters, limit: 50 });
    if (!res?.ok) {
      setExecutionError(toText(res?.error || "llm_executions_failed"));
      setExecutions({ items: [], count: 0, page: {} });
    } else {
      setExecutions(asObject(res.data));
    }
    setLoadingExecutions(false);
  }, [filters]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadExecutions(filters);
  }, [filters, loadExecutions]);

  const modules = asArray(catalog.modules);

  const activeByModule = useMemo(() => {
    const out = {};
    modules.forEach((m) => {
      if (toText(m?.status) === "active") out[toText(m?.module_id)] = m;
    });
    return out;
  }, [modules]);

  return (
    <div className="space-y-5" data-testid="llm-modules-panel">
      <SectionCard title={t("modules.title")} subtitle={t("modules.subtitle")}>
        {loadingCatalog ? <LoadingBlock label={t("common.loading")} /> : null}
        {catalogError ? <ErrorState title={t("common.error")} message={catalogError} /> : null}
        {!loadingCatalog && !catalogError ? (
          <div className="overflow-x-auto" data-testid="llm-modules-list">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t("modules.col.moduleId")}</th>
                  <th className="px-3 py-2">{t("modules.col.name")}</th>
                  <th className="px-3 py-2">{t("modules.col.status")}</th>
                  <th className="px-3 py-2">{t("modules.col.scope")}</th>
                  <th className="px-3 py-2">{t("modules.col.providerModel")}</th>
                  <th className="px-3 py-2">{t("modules.col.promptSource")}</th>
                  <th className="px-3 py-2">{t("modules.col.logLimits")}</th>
                  <th className="px-3 py-2">{t("modules.col.priority")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {modules.length ? modules.map((module) => {
                  const id = toText(module?.module_id);
                  return (
                    <tr
                      key={id}
                      className="hover:bg-slate-50"
                      data-testid={`llm-module-row-${id}`}
                    >
                      <td className="px-3 py-3 align-top font-mono text-xs font-semibold text-emerald-700">{id}</td>
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
                        {toText(module?.prompt_source || "—")}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-slate-600">
                        <div>log: {module?.has_execution_log ? "yes" : "no"}</div>
                        <div>limits: {module?.has_rate_limits ? "yes" : "no"}</div>
                      </td>
                      <td className="px-3 py-3 align-top text-xs font-semibold text-slate-700">{toText(module?.migration_priority || "—")}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={8}>{t("modules.empty")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t("modules.executions.title")} subtitle={t("modules.executions.subtitle")}>
        <div className="mb-3 flex flex-wrap gap-3">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filters.module_id || ""}
            onChange={(event) => setFilters((current) => ({ ...current, module_id: event.target.value }))}
            data-testid="llm-execution-filter-module"
          >
            <option value="">{t("modules.executions.filter.module")}: all</option>
            {modules.map((module) => (
              <option key={module.module_id} value={module.module_id}>{module.module_id}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filters.status || ""}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            data-testid="llm-execution-filter-status"
          >
            {EXECUTION_STATUSES.map((status) => (
              <option key={status || "all"} value={status}>
                {status ? `${t("modules.executions.filter.status")}: ${status}` : `${t("modules.executions.filter.status")}: all`}
              </option>
            ))}
          </select>
        </div>
        {loadingExecutions ? <LoadingBlock label={t("common.loading")} /> : null}
        {executionError ? <ErrorState title={t("common.error")} message={executionError} /> : null}
        {!loadingExecutions && !executionError ? (
          <div className="overflow-x-auto" data-testid="llm-execution-log">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t("modules.executions.col.execution")}</th>
                  <th className="px-3 py-2">{t("modules.executions.col.module")}</th>
                  <th className="px-3 py-2">{t("modules.executions.col.status")}</th>
                  <th className="px-3 py-2">{t("modules.executions.col.prompt")}</th>
                  <th className="px-3 py-2">{t("modules.executions.col.inputHash")}</th>
                  <th className="px-3 py-2">{t("modules.executions.col.summary")}</th>
                  <th className="px-3 py-2">{t("modules.executions.col.latency")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {asArray(executions.items).length ? asArray(executions.items).map((row) => (
                  <tr key={toText(row?.execution_id)} data-testid={`llm-execution-row-${toText(row?.execution_id)}`}>
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
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>{t("modules.executions.empty")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
