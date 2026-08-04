import { useCallback, useEffect, useState } from "react";

import { apiAdminLlmUsage } from "../api/adminApi";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import { asArray, asObject, toInt, toText } from "../adminUtils";
import { t } from "./i18n";
import { LLM_KNOWN_FEATURES } from "./llmConstants";

function dateToDayString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return { from: dateToDayString(from), to: dateToDayString(to) };
}

function dayToTs(day, endOfDay = false) {
  const text = toText(day);
  if (!text) return 0;
  const ms = Date.parse(`${text}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 1000);
}

function errorMessage(res, fallback) {
  const err = res?.error;
  if (err && typeof err === "object") return toText(err.message || err.code || fallback);
  return toText(err || fallback);
}

export default function LlmUsagePanel() {
  const initial = defaultRange();
  const [filters, setFilters] = useState({ from: initial.from, to: initial.to, feature: "", model: "" });
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (current = filters) => {
    setLoading(true);
    setError("");
    const res = await apiAdminLlmUsage({
      from_ts: dayToTs(current.from, false) || "",
      to_ts: dayToTs(current.to, true) || "",
      feature: toText(current.feature),
      model: toText(current.model),
    });
    if (!res?.ok) {
      setError(errorMessage(res, "llm_usage_failed"));
      setItems([]);
      setTotals({});
    } else {
      const data = asObject(res.data);
      setItems(asArray(data.items));
      setTotals(asObject(data.totals));
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    void load(filters);
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitFilters(event) {
    event.preventDefault();
    void load(filters);
  }

  const totalsRow = {
    calls: toInt(totals.calls, 0),
    prompt_tokens: toInt(totals.prompt_tokens, 0),
    completion_tokens: toInt(totals.completion_tokens, 0),
    cached_hits: toInt(totals.cached_hits, 0),
    errors: toInt(totals.errors, 0),
  };

  return (
    <SectionCard title={t("usage.title")} subtitle={t("usage.subtitle")}>
      <form className="mb-3 flex flex-wrap items-end gap-3" onSubmit={submitFilters} data-testid="llm-usage-filters">
        <label className="text-xs font-semibold text-slate-700">
          {t("usage.filter.from")}
          <input
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            type="date"
            value={filters.from}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            data-testid="llm-usage-from"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          {t("usage.filter.to")}
          <input
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            type="date"
            value={filters.to}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            data-testid="llm-usage-to"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          {t("usage.filter.feature")}
          <select
            className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filters.feature}
            onChange={(event) => setFilters((current) => ({ ...current, feature: event.target.value }))}
            data-testid="llm-usage-feature"
          >
            <option value="">{t("usage.filter.featureAll")}</option>
            {LLM_KNOWN_FEATURES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          {t("usage.filter.model")}
          <input
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.model}
            onChange={(event) => setFilters((current) => ({ ...current, model: event.target.value }))}
            placeholder={t("usage.filter.modelPlaceholder")}
            data-testid="llm-usage-model"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          data-testid="llm-usage-apply"
        >
          {t("usage.filter.apply")}
        </button>
      </form>
      {loading ? <LoadingBlock label={t("common.loading")} /> : null}
      {error ? <ErrorState title={t("common.error")} message={error} /> : null}
      {!loading && !error ? (
        <div className="overflow-x-auto" data-testid="llm-usage-table">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("usage.col.day")}</th>
                <th className="px-3 py-2">{t("usage.col.feature")}</th>
                <th className="px-3 py-2">{t("usage.col.model")}</th>
                <th className="px-3 py-2">{t("usage.col.calls")}</th>
                <th className="px-3 py-2">{t("usage.col.promptTokens")}</th>
                <th className="px-3 py-2">{t("usage.col.completionTokens")}</th>
                <th className="px-3 py-2">{t("usage.col.cached")}</th>
                <th className="px-3 py-2">{t("usage.col.errors")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length ? items.map((row, index) => (
                <tr key={`${toText(row?.day)}_${toText(row?.feature)}_${toText(row?.model)}_${index}`}>
                  <td className="px-3 py-3 align-top font-mono text-xs text-slate-700">{toText(row?.day || "—")}</td>
                  <td className="px-3 py-3 align-top font-mono text-xs text-slate-700">{toText(row?.feature || "—")}</td>
                  <td className="px-3 py-3 align-top font-mono text-xs text-slate-700">{toText(row?.model || "—")}</td>
                  <td className="px-3 py-3 align-top text-xs text-slate-700">{toInt(row?.calls, 0)}</td>
                  <td className="px-3 py-3 align-top text-xs text-slate-700">{toInt(row?.prompt_tokens, 0)}</td>
                  <td className="px-3 py-3 align-top text-xs text-slate-700">{toInt(row?.completion_tokens, 0)}</td>
                  <td className="px-3 py-3 align-top text-xs text-slate-700">{toInt(row?.cached_hits, 0)}</td>
                  <td className="px-3 py-3 align-top text-xs text-slate-700">{toInt(row?.errors, 0)}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={8}>{t("usage.empty")}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold" data-testid="llm-usage-totals">
                <td className="px-3 py-2 text-xs text-slate-800" colSpan={3}>{t("usage.totals")}</td>
                <td className="px-3 py-2 text-xs text-slate-800" data-testid="llm-usage-total-calls">{totalsRow.calls}</td>
                <td className="px-3 py-2 text-xs text-slate-800">{totalsRow.prompt_tokens}</td>
                <td className="px-3 py-2 text-xs text-slate-800">{totalsRow.completion_tokens}</td>
                <td className="px-3 py-2 text-xs text-slate-800">{totalsRow.cached_hits}</td>
                <td className="px-3 py-2 text-xs text-slate-800">{totalsRow.errors}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </SectionCard>
  );
}
