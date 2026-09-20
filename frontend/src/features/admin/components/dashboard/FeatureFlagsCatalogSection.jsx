import { useEffect, useState } from "react";
import SectionCard from "../common/SectionCard";
import { apiGetFeatureFlagsCatalog, apiPatchFeatureFlags } from "../../../../lib/apiModules/featureFlagsApi";
import { asArray, toText } from "../../utils/adminFormat";
import { ru } from "../../../../shared/i18n/ru";

export default function FeatureFlagsCatalogSection() {
  const d = ru.admin.dashboardPage;
  const [groups, setGroups] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toggleError, setToggleError] = useState("");
  const [savingKey, setSavingKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiGetFeatureFlagsCatalog().then((r) => {
      if (cancelled) return;
      if (r.ok) {
        const nextGroups = asArray(r.groups);
        setGroups(nextGroups);
        const nextValues = {};
        nextGroups.forEach((group) => {
          asArray(group?.flags).forEach((flag) => {
            nextValues[toText(flag?.key)] = Boolean(flag?.value);
          });
        });
        setValues(nextValues);
      } else {
        setLoadError(toText(r.error) || d.flagsLoadError);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(flag) {
    const key = toText(flag?.key);
    if (!key || flag?.editable === false || savingKey) return;
    const prev = Boolean(values[key]);
    const next = !prev;
    setToggleError("");
    setValues((current) => ({ ...current, [key]: next }));
    setSavingKey(key);
    const r = await apiPatchFeatureFlags({ [key]: next });
    if (!r.ok) {
      setValues((current) => ({ ...current, [key]: prev }));
      setToggleError(d.flagsToggleError);
    }
    setSavingKey("");
  }

  function groupLabel(group) {
    const label = toText(group?.label);
    if (label) return label;
    if (toText(group?.id) === "other") return d.otherGroup;
    return toText(group?.id) || d.otherGroup;
  }

  return (
    <SectionCard eyebrow={d.flagsEyebrow} title={d.flagsTitle} subtitle={d.flagsSubtitle}>
      {toggleError ? (
        <div role="alert" data-testid="flags-toggle-error" className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {toggleError}
        </div>
      ) : null}
      {loading ? (
        <div className="text-sm text-slate-500" data-testid="flags-loading">{d.flagsLoading}</div>
      ) : loadError ? (
        <div role="alert" data-testid="flags-load-error" className="text-sm text-rose-700">{loadError}</div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="flags-empty">{d.flagsEmpty}</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const flags = asArray(group?.flags);
            if (!flags.length) return null;
            const gLabel = groupLabel(group);
            return (
              <div key={toText(group?.id) || gLabel}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400" data-testid={`flags-group-${toText(group?.id) || "unknown"}`}>
                  {gLabel}
                </div>
                <div className="space-y-2">
                  {flags.map((flag) => {
                    const key = toText(flag?.key);
                    const readOnly = flag?.editable === false;
                    const maturity = toText(flag?.maturity) || "experimental";
                    return (
                      <div key={key} data-flag-row="" data-testid={`flag-row-${key}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2">
                        <label className="flex min-w-0 flex-1 items-center gap-3">
                          <input
                            type="checkbox"
                            data-testid={`flag-toggle-${key}`}
                            className="h-4 w-4 rounded border-border"
                            checked={Boolean(values[key])}
                            disabled={readOnly || savingKey === key}
                            title={readOnly ? d.flagsEnvHint : undefined}
                            onChange={() => toggle(flag)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-slate-800">{toText(flag?.label) || key}</span>
                            {toText(flag?.description) ? (
                              <span className="block truncate text-xs text-slate-400">{toText(flag?.description)}</span>
                            ) : null}
                          </span>
                        </label>
                        <span data-testid={`flag-maturity-${key}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {d.maturity[maturity] || maturity}
                        </span>
                        {readOnly ? (
                          <span className="text-xs text-slate-400" data-testid={`flag-env-hint-${key}`}>{d.flagsEnvHint}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
