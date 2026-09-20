import { useEffect, useState } from "react";
import SectionCard from "../common/SectionCard";
import { apiGetFeatureFlagsCatalog, apiPatchFeatureFlags } from "../../../../lib/apiModules/featureFlagsApi";
import { asArray, toText } from "../../utils/adminFormat";
import { dashboardDict } from "./dashboardI18n";

export default function FeatureFlagsCatalogSection() {
  const d = dashboardDict();
  const [groups, setGroups] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toggleError, setToggleError] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [expanded, setExpanded] = useState({});

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

  function toggleExpanded(key) {
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
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
        <div className="space-y-3">
          {groups.map((group) => {
            const flags = asArray(group?.flags);
            if (!flags.length) return null;
            const gLabel = groupLabel(group);
            return (
              <div key={toText(group?.id) || gLabel}>
                <div className="mb-1 flex items-baseline justify-between gap-2" data-testid={`flags-group-${toText(group?.id) || "unknown"}`}>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{gLabel}</span>
                  <span className="text-[11px] text-slate-300">{flags.length}</span>
                </div>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {flags.map((flag) => {
                    const key = toText(flag?.key);
                    const readOnly = flag?.editable === false;
                    const maturity = toText(flag?.maturity) || "experimental";
                    const open = Boolean(expanded[key]);
                    return (
                      <div key={key} data-flag-row="" data-testid={`flag-row-${key}`}>
                        <div className="flex items-center gap-2 pr-2">
                          <label className="flex min-h-[44px] shrink-0 items-center pl-3 pr-1" title={readOnly ? d.flagsEnvHint : undefined}>
                            <input
                              type="checkbox"
                              data-testid={`flag-toggle-${key}`}
                              className="h-4 w-4 rounded border-border"
                              checked={Boolean(values[key])}
                              disabled={readOnly || savingKey === key}
                              onChange={() => toggle(flag)}
                            />
                          </label>
                          <button
                            type="button"
                            data-testid={`flag-expand-${key}`}
                            aria-expanded={open}
                            aria-controls={`flag-panel-${key}`}
                            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 py-1 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            onClick={() => toggleExpanded(key)}
                          >
                            <span className="min-w-0 truncate text-sm text-slate-800">{toText(flag?.label) || key}</span>
                            <span data-testid={`flag-maturity-${key}`} className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {d.maturity[maturity] || maturity}
                            </span>
                            {readOnly ? (
                              <span className="hidden min-w-0 truncate text-xs text-slate-400 2xl:inline" data-testid={`flag-env-hint-${key}`}>{d.flagsEnvHint}</span>
                            ) : null}
                            <span aria-hidden="true" className={`ml-auto shrink-0 text-xs text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                          </button>
                        </div>
                        {open ? (
                          <div id={`flag-panel-${key}`} className="space-y-1 border-t border-slate-100 px-3 py-2 pl-11 text-xs text-slate-500">
                            {readOnly ? <div className="text-slate-400" data-testid={`flag-env-hint-panel-${key}`}>{d.flagsEnvHint}</div> : null}
                            {toText(flag?.description) ? <div data-testid={`flag-description-${key}`}>{toText(flag?.description)}</div> : null}
                            {toText(flag?.owner_contour) ? (
                              <div data-testid={`flag-owner-${key}`}>
                                <span className="text-slate-400">{d.featureFlags.ownerContour}:</span> {toText(flag?.owner_contour)}
                              </div>
                            ) : null}
                            {toText(flag?.removal_criterion) ? (
                              <div data-testid={`flag-removal-${key}`}>
                                <span className="text-slate-400">{d.featureFlags.removalCriterion}:</span> {toText(flag?.removal_criterion)}
                              </div>
                            ) : null}
                          </div>
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
