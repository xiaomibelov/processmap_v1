import { useEffect, useState } from "react";
import ChartCard from "../common/ChartCard";
import { apiGetFeatureFlags, apiPatchFeatureFlags } from "../../../../lib/apiModules/featureFlagsApi";

const DEFAULT_FLAGS = {
  bpmn_fps_meter_enabled: false,
  canvas_profiler_enabled: false,
  lightweightOverlays: false,
  __FPC_OVERLAY_V2__: false,
};

const FLAG_LABELS = {
  bpmn_fps_meter_enabled: "Bpmn FPS Meter (visible overlay)",
  canvas_profiler_enabled: "Canvas Profiler (console metrics)",
  lightweightOverlays: "Lightweight Overlays (JSON instead of XML)",
  __FPC_OVERLAY_V2__: "Hybrid Overlay V2 (Variant F)",
};

export default function FeatureFlagsWidget() {
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGetFeatureFlags().then((r) => {
      if (r.ok && r.flags) {
        setFlags((prev) => ({ ...prev, ...r.flags }));
      }
      setLoading(false);
    });
  }, []);

  const toggle = async (key) => {
    if (saving) return;
    setError(null);
    setSaving(true);
    const previous = flags[key];
    const next = { ...flags, [key]: !previous };
    setFlags(next);

    const r = await apiPatchFeatureFlags({ [key]: next[key] });
    if (r.ok) {
      setFlags((prev) => ({ ...prev, ...(r.flags || {}) }));
    } else {
      setFlags((prev) => ({ ...prev, [key]: previous }));
      setError(r.error || r.detail || "Failed to update flag. Admin required?");
    }
    setSaving(false);
  };

  return (
    <ChartCard title="Feature Flags" subtitle="Runtime toggles for canvas profiling and FPS meter" eyebrow="Settings">
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <>
            {Object.entries(FLAG_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={!!flags[key]}
                  onChange={() => toggle(key)}
                  disabled={saving}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </>
        )}
      </div>
    </ChartCard>
  );
}
