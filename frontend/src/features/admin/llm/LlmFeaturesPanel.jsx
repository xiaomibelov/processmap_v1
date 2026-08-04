import { useCallback, useEffect, useState } from "react";

import { apiAdminLlmListFeatures, apiAdminLlmPatchFeature } from "../api/adminApi";
import ErrorState from "../components/common/ErrorState";
import LoadingBlock from "../components/common/LoadingBlock";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, formatTs, toInt, toText } from "../adminUtils";
import { t } from "./i18n";
import { LLM_KNOWN_FEATURES } from "./llmConstants";

function errorMessage(res, fallback) {
  const err = res?.error;
  if (err && typeof err === "object") return toText(err.message || err.code || fallback);
  return toText(err || fallback);
}

export default function LlmFeaturesPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [limitDrafts, setLimitDrafts] = useState({});
  const [busyFeature, setBusyFeature] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await apiAdminLlmListFeatures();
    if (!res?.ok) {
      setError(errorMessage(res, "llm_features_failed"));
      setItems([]);
    } else {
      const rows = asArray(asObject(res.data).items);
      setItems(rows);
      setLimitDrafts((current) => {
        const next = { ...current };
        rows.forEach((row) => {
          const name = toText(row?.feature);
          if (name && next[name] === undefined) next[name] = String(toInt(row?.daily_token_limit, 0));
        });
        return next;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchFeature(featureName, payload) {
    const name = toText(featureName);
    if (!name) return;
    setBusyFeature(name);
    setActionError("");
    const res = await apiAdminLlmPatchFeature(name, payload);
    if (!res?.ok) {
      setActionError(errorMessage(res, "llm_feature_patch_failed"));
    } else {
      await load();
    }
    setBusyFeature("");
  }

  const orderedItems = (() => {
    const byName = new Map(items.map((row) => [toText(row?.feature), row]));
    const known = LLM_KNOWN_FEATURES.filter((name) => byName.has(name)).map((name) => byName.get(name));
    const rest = items.filter((row) => !LLM_KNOWN_FEATURES.includes(toText(row?.feature)));
    return [...known, ...rest];
  })();

  return (
    <SectionCard title={t("features.title")} subtitle={t("features.subtitle")}>
      {loading ? <LoadingBlock label={t("common.loading")} /> : null}
      {error ? <ErrorState title={t("common.error")} message={error} /> : null}
      {actionError ? <ErrorState title={t("common.error")} message={actionError} /> : null}
      {!loading && !error ? (
        <div className="overflow-x-auto" data-testid="llm-features-table">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("features.col.feature")}</th>
                <th className="px-3 py-2">{t("features.col.enabled")}</th>
                <th className="px-3 py-2">{t("features.col.limit")}</th>
                <th className="px-3 py-2">{t("features.col.used")}</th>
                <th className="px-3 py-2">{t("features.col.updated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {orderedItems.length ? orderedItems.map((row) => {
                const name = toText(row?.feature);
                const enabled = row?.enabled === true;
                const limit = toInt(row?.daily_token_limit, 0);
                const used = toInt(row?.used_tokens_24h, 0);
                const overLimit = limit > 0 && used >= limit;
                return (
                  <tr key={name} data-testid={`llm-feature-row-${name}`}>
                    <td className="px-3 py-3 align-top font-mono text-xs font-semibold text-slate-800">{name}</td>
                    <td className="px-3 py-3 align-top">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
                        disabled={busyFeature === name}
                        onClick={() => void patchFeature(name, { enabled: !enabled })}
                        data-testid={`llm-feature-toggle-${name}`}
                      >
                        <StatusPill
                          status={enabled ? t("common.enabled") : t("common.disabled")}
                          tone={enabled ? "ok" : "default"}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <input
                          className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          type="number"
                          min="0"
                          value={limitDrafts[name] ?? String(limit)}
                          onChange={(event) => setLimitDrafts((current) => ({ ...current, [name]: event.target.value }))}
                          onBlur={() => {
                            const draft = toInt(limitDrafts[name], limit);
                            if (draft !== limit) void patchFeature(name, { daily_token_limit: draft });
                          }}
                          data-testid={`llm-feature-limit-${name}`}
                        />
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                          disabled={busyFeature === name}
                          onClick={() => void patchFeature(name, { daily_token_limit: toInt(limitDrafts[name], limit) })}
                          data-testid={`llm-feature-limit-save-${name}`}
                        >
                          {t("common.save")}
                        </button>
                      </div>
                    </td>
                    <td className={`px-3 py-3 align-top text-xs font-semibold ${overLimit ? "text-rose-700" : "text-slate-700"}`}>
                      {used} / {limit}
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-slate-500">{formatTs(row?.updated_at)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-500" colSpan={5}>{t("features.empty")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </SectionCard>
  );
}
